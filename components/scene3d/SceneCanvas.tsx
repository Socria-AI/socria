'use client';

// THE SCENE, IN 3D — a view of one scene object (lib/objects/scene.ts), never
// a store of its own. What is drawn is computed from the parts' dimensions;
// what a hand does to it — selecting a part, dragging the gizmo — goes back up
// as a selection or as one `transform` operation, computed by the scene kind
// and returned as the next state. While a description is being read, the
// reader's preview is drawn instead, with what it would add or change ghosted
// and what it would remove in red wire, so the person sees the result before
// committing to it.
//
// Loaded only in the browser (ScenePanel imports it with ssr: false).

import { Canvas, useThree } from '@react-three/fiber';
import { Edges, GizmoHelper, GizmoViewport, Html, OrbitControls, TransformControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sceneBox, sizeOf, type SceneNode, type SceneState } from '@/lib/objects/scene';
import { worldBox, type Vec3 } from '@/lib/objects/scene-geometry';
import { geometryOf, twoSided } from './geometry';

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface SceneCanvasProps {
  /** what is drawn: the preview while a description is being read, else the scene */
  scene: SceneState;
  /** the committed scene, to tell what the preview would change */
  base: SceneState;
  changes?: { added: string[]; changed: string[]; removed: string[] } | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  mode: GizmoMode;
  snap: boolean;
  /** a gizmo drag, ended: the part's new transform. False when the scene refused it. */
  onTransform?: (id: string, t: { pos: Vec3; rot: Vec3; scale: Vec3 }) => boolean;
  /** bump to frame the whole scene again */
  fitKey: number;
  dark?: boolean;
}

const RAD = Math.PI / 180;
const ACCENT = '#3a6fd4';
const round = (v: number, q: number) => Math.round(v / q) * q;

function materialOf(n: SceneNode, ghost: boolean, removed: boolean): THREE.Material {
  if (removed) return new THREE.MeshBasicMaterial({ color: '#d43f3a', wireframe: true, transparent: true, opacity: 0.55 });
  const color = new THREE.Color(n.color);
  if (n.mat === 'wire') return new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: ghost, opacity: ghost ? 0.75 : 1 });
  const opacity = ghost ? Math.min(n.opacity, 0.8) : n.opacity;
  const transparent = opacity < 1;
  const common = {
    color,
    side: twoSided(n.shape) ? THREE.DoubleSide : THREE.FrontSide,
    transparent,
    opacity,
    depthWrite: !transparent,
    emissive: new THREE.Color(ghost ? ACCENT : '#000000'),
    emissiveIntensity: ghost ? 0.28 : 0,
  };
  if (n.mat === 'metal') return new THREE.MeshStandardMaterial({ ...common, metalness: 0.85, roughness: 0.3 });
  if (n.mat === 'plastic') return new THREE.MeshStandardMaterial({ ...common, metalness: 0, roughness: 0.32 });
  if (n.mat === 'glass') return new THREE.MeshStandardMaterial({ ...common, metalness: 0, roughness: 0.05 });
  return new THREE.MeshStandardMaterial({ ...common, metalness: 0, roughness: 0.85 });
}

interface PartProps {
  node: SceneNode;
  ghost: boolean;
  removed: boolean;
  selected: boolean;
  onPick: (id: string) => void;
  bind: (id: string, g: THREE.Group | null) => void;
}

function Part({ node, ghost, removed, selected, onPick, bind }: PartProps) {
  // the geometry follows the shape and its sizes, not where the part stands
  const shapeKey = `${node.shape}|${JSON.stringify(node.dims)}|${JSON.stringify(node.exprs ?? {})}`;
  const geom = useMemo(() => geometryOf(node), [shapeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geom?.dispose(), [geom]);
  const lookKey = `${node.color}|${node.mat}|${node.opacity}|${node.shape}|${ghost}|${removed}`;
  const mat = useMemo(() => materialOf(node, ghost, removed), [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => mat.dispose(), [mat]);
  if (!geom) return null;
  return (
    <group
      ref={(g) => bind(node.id, g)}
      position={node.pos}
      rotation={[node.rot[0] * RAD, node.rot[1] * RAD, node.rot[2] * RAD]}
      scale={node.scale}
    >
      <mesh
        geometry={geom}
        material={mat}
        onClick={(e) => {
          e.stopPropagation();
          if (!removed) onPick(node.id);
        }}
      >
        {(selected || ghost) && !removed && node.mat !== 'wire' && <Edges threshold={25} color={selected ? ACCENT : '#7f9be0'} />}
      </mesh>
    </group>
  );
}

/** Light the scene from a room, so metal and glass have something to reflect — made here, nothing fetched. */
function Room() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/**
 * Where the scene is and how big — its own size, however small. A floor of 1 m
 * here framed a 110 mm bearing as a speck in a ten-metre room.
 */
function frameOf(s: SceneState) {
  const b = sceneBox(s) ?? { min: [-1, 0, -1] as Vec3, max: [1, 1, 1] as Vec3 };
  const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2], 1e-3);
  return { c, size };
}

/** The largest of 1, 2 or 5 × a power of ten that is at most v. */
function roundStep(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  return v >= 5 * p ? 5 * p : v >= 2 * p ? 2 * p : p;
}

/** Frame the whole scene — on first sight, and when asked. Never on its own while someone is looking. */
function Fit({ scene, fitKey }: { scene: SceneState; fitKey: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useEffect(() => {
    const { c, size } = frameOf(sceneRef.current);
    const dist = size * 2.1;
    camera.position.set(c.x + dist * 0.75, c.y + dist * 0.55, c.z + dist);
    (camera as THREE.PerspectiveCamera).near = Math.max(0.001, size / 200);
    (camera as THREE.PerspectiveCamera).far = size * 200;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    if (controls) {
      controls.target.copy(c);
      controls.update();
    } else camera.lookAt(c);
    invalidate();
  }, [fitKey, camera, controls, invalidate]);
  return null;
}

/** The floor: a grid at y = 0, sized to the scene, in a round step — 1, 2 or 5 × a power of ten of a metre. */
function Floor({ scene, dark }: { scene: SceneState; dark?: boolean }) {
  const { size } = frameOf(scene);
  const step = roundStep(size / 4);
  const cells = Math.max(10, Math.ceil((size * 2.5) / step));
  const span = cells * step;
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(span, cells, dark ? '#5a5f68' : '#a9a397', dark ? '#373b42' : '#ddd8cc');
    (g.material as THREE.Material).transparent = true;
    (g.material as THREE.Material).opacity = 0.9;
    return g;
  }, [span, cells, dark]);
  useEffect(() => () => {
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
  }, [grid]);
  return <primitive object={grid} />;
}

export function SceneCanvas(p: SceneCanvasProps) {
  const groups = useRef(new Map<string, THREE.Group>());
  const [target, setTarget] = useState<THREE.Group | null>(null);
  const dragEnded = useRef(0);
  const previewing = !!p.changes;
  const bind = (id: string, g: THREE.Group | null) => {
    if (g) groups.current.set(id, g);
    else groups.current.delete(id);
  };
  // the gizmo holds the selected part — of the committed scene, never of a preview
  useEffect(() => {
    setTarget(p.selected && !previewing ? groups.current.get(p.selected) ?? null : null);
  }, [p.selected, previewing, p.scene]);

  const removed = useMemo(() => (p.changes ? p.base.nodes.filter((n) => p.changes!.removed.includes(n.id)) : []), [p.changes, p.base]);
  const ghostIds = useMemo(() => new Set([...(p.changes?.added ?? []), ...(p.changes?.changed ?? [])]), [p.changes]);
  const sel = p.selected ? p.scene.nodes.find((n) => n.id === p.selected) ?? null : null;
  const selBox = sel ? worldBox(sel) : null;
  const span = frameOf(p.scene).size;

  const endDrag = () => {
    dragEnded.current = Date.now();
    const g = target;
    const id = p.selected;
    if (!g || !id || !p.onTransform) return;
    const node = p.base.nodes.find((n) => n.id === id);
    if (!node) return;
    const q = 1e-4;
    const pos: Vec3 = [round(g.position.x, q), round(g.position.y, q), round(g.position.z, q)];
    const rot: Vec3 = [round(g.rotation.x / RAD, 1e-3), round(g.rotation.y / RAD, 1e-3), round(g.rotation.z / RAD, 1e-3)];
    const scale: Vec3 = [round(g.scale.x, q), round(g.scale.y, q), round(g.scale.z, q)];
    const ok = p.onTransform(id, { pos, rot, scale });
    if (!ok) {
      // refused: the part goes back to where the scene says it is
      g.position.set(...node.pos);
      g.rotation.set(node.rot[0] * RAD, node.rot[1] * RAD, node.rot[2] * RAD);
      g.scale.set(...node.scale);
    }
  };

  return (
    <Canvas
      className="s3-canvas"
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 42, position: [6, 4.5, 7.5], near: 0.01, far: 2000 }}
      gl={{ antialias: true }}
      onPointerMissed={() => {
        // a gizmo drag ends in a click on nothing; that is not a deselection
        if (Date.now() - dragEnded.current > 250) p.onSelect(null);
      }}
    >
      <color attach="background" args={[p.dark ? '#1d2026' : '#f6f3ec']} />
      <Room />
      <hemisphereLight args={[p.dark ? '#c8d0dc' : '#ffffff', p.dark ? '#2a2d33' : '#c9c2b0', 0.55]} />
      <directionalLight position={[5, 9, 6]} intensity={1.1} />
      <directionalLight position={[-6, 4, -5]} intensity={0.35} />
      <Floor scene={p.scene} dark={p.dark} />
      {p.scene.nodes.map((n) => (
        <Part key={n.id} node={n} ghost={ghostIds.has(n.id)} removed={false} selected={n.id === p.selected} onPick={p.onSelect} bind={bind} />
      ))}
      {removed.map((n) => (
        <Part key={`gone:${n.id}`} node={n} ghost={false} removed selected={false} onPick={() => {}} bind={() => {}} />
      ))}
      {sel && selBox && (
        <Html position={[(selBox.min[0] + selBox.max[0]) / 2, selBox.max[1] + span * 0.04, (selBox.min[2] + selBox.max[2]) / 2]} center zIndexRange={[20, 0]}>
          <div className="s3-tag">
            <strong>{sel.name}</strong> {sizeOf(sel, p.scene.unit)}
          </div>
        </Html>
      )}
      {target && p.onTransform && (
        <TransformControls
          object={target}
          mode={p.mode}
          size={0.8}
          translationSnap={p.snap ? 0.05 : null}
          rotationSnap={p.snap ? 15 * RAD : null}
          scaleSnap={p.snap ? 0.05 : null}
          onMouseUp={endDrag}
        />
      )}
      <OrbitControls makeDefault enableDamping={false} />
      <Fit scene={p.scene} fitKey={p.fitKey} />
      <GizmoHelper alignment="bottom-right" margin={[56, 56]}>
        <GizmoViewport axisColors={['#d43f3a', '#3a9a52', '#3a6fd4']} labelColor={p.dark ? '#f4f4f0' : '#1e1e1e'} />
      </GizmoHelper>
    </Canvas>
  );
}

export default SceneCanvas;
