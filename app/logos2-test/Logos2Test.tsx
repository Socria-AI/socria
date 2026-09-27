'use client';

// app/logos2-test/Logos2Test.tsx
//
// A bench, not a feature: move a thinking map with your hands.
//
// WHAT IT IS FOR. The Thinking Map is the one surface in Socria where the
// thinking is a THING — nodes with positions, relations between them — and it
// is the obvious candidate for direct manipulation. This is where that gets
// tried honestly: pinch to pick a node up, aim at one and hold two fingers to
// research it, three to challenge it, close your hand to delete it. Whether it
// is actually better than a pointer is the question the bench exists to
// answer, and it is not settled by building it.
//
// NOTHING LEAVES THE DEVICE. MediaPipe runs in the browser, the video is never
// uploaded and never recorded, and the page holds no frame longer than it
// takes to find the hands in it. The library is fetched from jsDelivr at
// runtime rather than installed, so trying this adds nothing to the bundle.
//
// IT WORKS WITHOUT A CAMERA. Every action is on the pointer too, and the page
// says what it would do with hands. A bench that is unusable when permission
// is refused teaches nothing about whether the idea is any good.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { drawHands, loadHandLandmarker, openCamera, type Landmarker } from '@/lib/hand-tracking';
import {
  ACTIONS,
  GESTURE,
  GestureTracker,
  TwoHandTracker,
  aimedAt,
  readHand,
  type Action,
  type HandRead,
} from '@/lib/hand-gestures';

interface Node {
  id: string;
  label: string;
  kind: 'goal' | 'belief' | 'assumption' | 'question' | 'idea' | 'evidence';
  /** 0…1 of the stage */
  x: number;
  y: number;
  /** what has been done to it, so the bench shows the action landed */
  state?: 'researched' | 'challenged';
  note?: string;
}

const START: Node[] = [
  { id: 'g', kind: 'goal', label: 'Take the Berlin role?', x: 0.5, y: 0.26 },
  { id: 'b1', kind: 'belief', label: 'I have felt unchallenged for a year', x: 0.25, y: 0.5 },
  { id: 'a1', kind: 'assumption', label: 'The offer opened the question', x: 0.75, y: 0.48 },
  { id: 'i1', kind: 'idea', label: 'More money, smaller team', x: 0.32, y: 0.74 },
  { id: 'q1', kind: 'question', label: 'Which one is deciding?', x: 0.68, y: 0.76 },
];

const EDGES: [string, string][] = [
  ['b1', 'g'],
  ['a1', 'g'],
  ['i1', 'g'],
  ['q1', 'a1'],
];

/** What each action does to a node. Deliberately small: the bench is about the
 *  gesture, not about inventing a research engine behind it. */
const RESULT: Record<Exclude<Action, 'grab' | 'delete'>, (n: Node) => Partial<Node>> = {
  research: (n) => ({
    state: 'researched',
    note:
      n.kind === 'assumption'
        ? 'Nothing here rests on evidence yet — that is what makes it an assumption.'
        : 'Looked at. What would have to be true for this to hold?',
  }),
  challenge: (n) => ({
    state: 'challenged',
    note:
      n.kind === 'belief'
        ? 'Held for a year and never tested. What would change it?'
        : 'Pressed. What is the strongest case against it?',
  }),
};

type Status = 'off' | 'loading' | 'on' | 'error';

export function Logos2Test() {
  const [nodes, setNodes] = useState<Node[]>(START);
  const [status, setStatus] = useState<Status>('off');
  const [error, setError] = useState('');
  const [pose, setPose] = useState('none');
  const [aim, setAim] = useState({ x: 0.5, y: 0.5 });
  const [over, setOver] = useState<string | null>(null);
  const [held, setHeld] = useState<{ action: Action; at: number } | null>(null);
  const [held2, setHeld2] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);

  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const marker = useRef<Landmarker | null>(null);
  const raf = useRef(0);
  const tracker = useRef(new GestureTracker());
  const two = useRef(new TwoHandTracker());
  // The node in hand. A ref, not state: it is read inside the animation loop
  // sixty times a second and setting state there would re-render as often.
  const carrying = useRef<string | null>(null);
  // THE LOOP MUST NOT READ STATE IT CLOSED OVER.
  //
  // `tick` is created once, when the camera starts, and runs sixty times a
  // second for as long as it is on — so the `nodes` it captured are the ones
  // from that render, frozen. Aiming would have used the positions the nodes
  // had when the camera was switched on: drag one across the board and the
  // gestures still land where it used to be, and delete one and it is still
  // there to be aimed at. A ref is the live copy the loop reads.
  const live = useRef<Node[]>(START);
  useEffect(() => {
    live.current = nodes;
  }, [nodes]);

  const say = useCallback((line: string) => {
    setLog((l) => [line, ...l].slice(0, 6));
  }, []);

  // Reads the live list, never a captured one, so it is stable for the life of
  // the component and the camera loop can hold it safely.
  const act = useCallback(
    (action: Action, id: string | null) => {
      if (!id) return;
      const label = live.current.find((n) => n.id === id)?.label ?? id;
      if (action === 'delete') {
        setNodes((ns) => ns.filter((n) => n.id !== id));
        say(`Deleted "${label}".`);
        return;
      }
      if (action === 'research' || action === 'challenge') {
        setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...RESULT[action](n) } : n)));
        say(`${action === 'research' ? 'Researched' : 'Challenged'} "${label}".`);
      }
    },
    [say]
  );

  // ── the camera loop ──
  const start = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const [s, m] = await Promise.all([openCamera(), loadHandLandmarker(2)]);
      stream.current = s;
      marker.current = m;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setStatus('on');

      const tick = () => {
        const vid = video.current;
        const cv = canvas.current;
        const mk = marker.current;
        if (!vid || !cv || !mk || vid.readyState < 2) {
          raf.current = requestAnimationFrame(tick);
          return;
        }
        cv.width = vid.videoWidth || 640;
        cv.height = vid.videoHeight || 480;
        const res = mk.detectForVideo(vid, performance.now());
        const ctx = cv.getContext('2d');
        if (ctx) drawHands(ctx, cv.width, cv.height, res.landmarks ?? []);

        // MIRRORED, because the picture is. The video is flipped so moving
        // right moves right on screen; the landmarks are not, so x is flipped
        // here and everything downstream is in screen coordinates.
        const hands: (HandRead | null)[] = (res.landmarks ?? [])
          .slice(0, 2)
          .map((pts, i) =>
            readHand(
              pts.map((p) => ({ ...p, x: 1 - p.x })),
              (res.handedness?.[i]?.[0]?.categoryName?.toLowerCase() as 'left' | 'right') ?? 'unknown'
            )
          );

        const out = tracker.current.read(hands[0] ?? null, performance.now());
        setPose(out.pose);
        setAim(out.aim);
        setHeld(out.holding);

        // Two hands scale the board, which is the one thing that genuinely
        // wants two: it is the gesture everyone already knows.
        const t2 = two.current.read(hands[0] ?? null, hands[1] ?? null);
        if (t2 && Math.abs(t2.scale - 1) > 0.002) {
          setZoom((z) => Math.min(2.2, Math.max(0.55, z * t2.scale)));
        }

        // Read the live list, decide, then set — rather than deciding inside a
        // state updater, which React may run twice.
        const near = aimedAt(live.current, out.aim, 0.1);
        setOver(near?.id ?? null);
        if (out.grabbing) {
          if (!carrying.current && near) carrying.current = near.id;
          const id = carrying.current;
          if (id) {
            const x = Math.min(0.96, Math.max(0.04, out.aim.x));
            const y = Math.min(0.94, Math.max(0.06, out.aim.y));
            setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)));
          }
        } else {
          carrying.current = null;
        }

        if (out.fired) act(out.fired, near?.id ?? null);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [act]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    marker.current?.close();
    marker.current = null;
    tracker.current.reset();
    setStatus('off');
    setPose('none');
    setHeld(null);
  }, []);

  useEffect(() => stop, [stop]);

  // ── the pointer fallback, so the bench works without a camera ──
  const pointerDown = (id: string) => (e: React.PointerEvent) => {
    carrying.current = id;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: React.PointerEvent) => {
    if (!carrying.current || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const x = Math.min(0.96, Math.max(0.04, (e.clientX - r.left) / r.width));
    const y = Math.min(0.94, Math.max(0.06, (e.clientY - r.top) / r.height));
    const id = carrying.current;
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };
  const pointerUp = () => {
    carrying.current = null;
  };

  // Holding a button is the pointer's version of holding a pose, so the
  // confirmation is the same on both and the bench tests one idea, not two.
  const holdRef = useRef<{ id: string; action: Action; from: number; raf: number } | null>(null);
  const beginHold = (action: Action, id: string) => () => {
    const from = performance.now();
    const step = () => {
      const h = holdRef.current;
      if (!h) return;
      const at = Math.min(1, (performance.now() - h.from) / GESTURE[h.action].hold);
      setHeld({ action: h.action, at });
      setHeld2(h.id);
      if (at >= 1) {
        act(h.action, h.id);
        endHold();
        return;
      }
      h.raf = requestAnimationFrame(step);
    };
    holdRef.current = { id, action, from, raf: requestAnimationFrame(step) };
  };
  const endHold = () => {
    if (holdRef.current) cancelAnimationFrame(holdRef.current.raf);
    holdRef.current = null;
    setHeld(null);
    setHeld2(null);
  };

  const target = over ?? held2;

  return (
    <div className="l2t">
      <header className="l2t-top">
        <div>
          <p className="k">Socria · Logos 2 · bench</p>
          <h1>Move the map with your hands</h1>
        </div>
        <div className="l2t-actions">
          {status === 'on' ? (
            <button type="button" className="l2t-btn on" onClick={stop}>
              Stop the camera
            </button>
          ) : (
            <button type="button" className="l2t-btn" onClick={start} disabled={status === 'loading'}>
              {status === 'loading' ? 'Starting…' : 'Use the camera'}
            </button>
          )}
          <button type="button" className="l2t-btn" onClick={() => { setNodes(START); setLog([]); setZoom(1); }}>
            Reset
          </button>
          <Link className="l2t-btn" href="/logos2">
            Logos 2 →
          </Link>
        </div>
      </header>

      <p className="l2t-lede">
        Pinch to pick a node up. Aim at one and hold two fingers to research it, three to
        challenge it, or close your hand to delete it — that one counts down, so you can stop.
        Two hands apart or together zoom the board. Everything works with a pointer as well:
        drag a node, or press and hold one of its buttons.
      </p>

      <div className="l2t-body">
        <div
          className="l2t-stage"
          ref={stage}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerLeave={pointerUp}
          style={{ ['--z' as string]: zoom }}
        >
          <svg className="l2t-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {EDGES.map(([a, b]) => {
              const na = nodes.find((n) => n.id === a);
              const nb = nodes.find((n) => n.id === b);
              if (!na || !nb) return null;
              return (
                <line
                  key={`${a}-${b}`}
                  x1={na.x * 100}
                  y1={na.y * 100}
                  x2={nb.x * 100}
                  y2={nb.y * 100}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {nodes.map((n) => (
            <div
              key={n.id}
              className={`l2t-node k-${n.kind}${target === n.id ? ' is-aimed' : ''}${n.state ? ` is-${n.state}` : ''}`}
              style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
              onPointerDown={pointerDown(n.id)}
            >
              <b>{n.kind}</b>
              <span>{n.label}</span>
              {n.note && <em>{n.note}</em>}
              <div className="l2t-node-acts">
                {(['research', 'challenge', 'delete'] as Action[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`l2t-mini${a === 'delete' ? ' del' : ''}`}
                    onPointerDown={beginHold(a, n.id)}
                    onPointerUp={endHold}
                    onPointerLeave={endHold}
                    title={GESTURE[a].says}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Where the hand is aiming, and how far through a held gesture it is. */}
          {status === 'on' && (
            <div className="l2t-aim" style={{ left: `${aim.x * 100}%`, top: `${aim.y * 100}%` }}>
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <circle className="ring" cx="20" cy="20" r="17" />
                {held && (
                  <circle
                    className={`fill${held.action === 'delete' ? ' del' : ''}`}
                    cx="20"
                    cy="20"
                    r="17"
                    strokeDasharray={`${held.at * 107} 107`}
                  />
                )}
              </svg>
            </div>
          )}
          {held && held2 && (
            <div className="l2t-holdbar">
              <i style={{ width: `${held.at * 100}%` }} className={held.action === 'delete' ? 'del' : ''} />
            </div>
          )}
        </div>

        <aside className="l2t-side">
          <div className="l2t-cam">
            <video ref={video} playsInline muted />
            <canvas ref={canvas} />
            {status !== 'on' && (
              <div className="l2t-camoff">
                {status === 'error' ? error : 'The camera is off. Nothing is being recorded.'}
              </div>
            )}
            {status === 'on' && <span className="l2t-pose">{pose}</span>}
          </div>

          <h2>The gestures</h2>
          <ul className="l2t-keys">
            {ACTIONS.map((a) => (
              <li key={a}>
                <b>{GESTURE[a].label}</b>
                <span>{GESTURE[a].says}</span>
              </li>
            ))}
            <li>
              <b>Two hands</b>
              <span>Move them apart or together to zoom the board.</span>
            </li>
          </ul>

          <h2>What happened</h2>
          {log.length === 0 ? (
            <p className="l2t-empty">Nothing yet.</p>
          ) : (
            <ol className="l2t-log">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          )}

          <p className="l2t-privacy">
            The video never leaves this device. MediaPipe runs in the browser, no frame is
            uploaded or stored, and stopping the camera releases it.
          </p>
        </aside>
      </div>
    </div>
  );
}
