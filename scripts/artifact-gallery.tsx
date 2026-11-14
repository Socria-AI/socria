// scripts/artifact-gallery.tsx — EVERY KIND OF ARTIFACT, DRAWN BY THE REAL COMPONENTS, ON ONE PAGE.
//
// Bundled and opened in a real browser by scripts/verify-artifacts.mjs, which measures what is drawn (text overlap,
// clipping, overflow, the smallest type, contrast) at desktop and phone widths and tries the interactions. Each block
// carries data-qa with its name. The specs go through the same validator the conversation's go through.

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InlineBlock, InlineEdit, type InlineHost } from '@/components/inline/InlineUI';
import { sanitizeInlineSpec, type InlineSpec, type InlineState } from '@/lib/inline-ui';
import { applyEdits } from '@/lib/artifact-edit';
import { ObjectFigure } from '@/components/objects/ObjectFigure';
import { apply as applyStep, EMPTY_SPACE, keptFrom, makeDisplay, seek, type ObjectSpace } from '@/lib/objects';
import '@/app/globals.css';
import '@/components/logos5/l5-controls.css';

const S = (o: unknown): InlineSpec => {
  const s = sanitizeInlineSpec(o);
  if (!s) throw new Error(`not a valid spec: ${JSON.stringify(o).slice(0, 120)}`);
  return s;
};

const IMMUNE = S({
  type: 'diagram',
  view: 'mind',
  title: 'The immune system',
  nodes: [
    { id: 'r', label: 'The immune system' },
    { id: 'k1', label: 'Innate immunity', detail: 'Fast, general, there from birth.' },
    { id: 'k2', label: 'Adaptive immunity', detail: 'Slower, specific, remembers.' },
    { id: 'k3', label: 'Barriers' },
    { id: 'k4', label: 'Skin and mucus' },
    { id: 'k5', label: 'Stomach acid' },
    { id: 'k6', label: 'B cells' },
    { id: 'k7', label: 'T cells' },
    { id: 'k8', label: 'Plasma cells make antibodies at scale' },
    { id: 'k9', label: 'Memory B cells' },
    { id: 'k10', label: 'Helper T cells' },
    { id: 'k11', label: 'Killer T cells' },
    { id: 'k12', label: 'Phagocytes' },
    { id: 'k13', label: 'Inflammation' },
    { id: 'k14', label: 'Fever' },
    { id: 'k15', label: 'Vaccines' },
    { id: 'k16', label: 'Natural killer cells' },
    { id: 'k17', label: 'Complement' },
    { id: 'k18', label: 'Antibodies' },
  ],
  edges: [
    ['r', 'k1'], ['r', 'k2'], ['r', 'k15'], ['k1', 'k3'], ['k3', 'k4'], ['k3', 'k5'], ['k1', 'k12'], ['k1', 'k13'], ['k13', 'k14'], ['k1', 'k16'], ['k1', 'k17'],
    ['k2', 'k6'], ['k2', 'k7'], ['k6', 'k8'], ['k6', 'k9'], ['k7', 'k10'], ['k7', 'k11'], ['k8', 'k18'],
    ['k10', 'k6', 'needs'], ['k15', 'k9', 'causes'], ['k13', 'k12', 'relates'],
  ],
});
const BUSINESS = S({ type: 'diagram', view: 'mind', title: 'A small business', nodes: [{ id: 'r', label: 'A small business' }, { id: 'a', label: 'Product' }, { id: 'b', label: 'Marketing' }, { id: 'c', label: 'Pricing' }, { id: 'd', label: 'Operations' }, { id: 'e', label: 'Suppliers' }], edges: [['r', 'a'], ['r', 'b'], ['r', 'c'], ['r', 'd'], ['d', 'e'], ['c', 'a', 'needs'], ['b', 'c', 'leads']] });
const MARKET = S({ type: 'graph', title: 'A tax on sellers', expr: '10-x', label: 'demand', curves: [{ expr: '2+x+t', label: 'supply' }], x: [0, 10], params: [{ name: 't', label: 'tax', value: 1, min: 0, max: 4, step: 0.5 }], features: ['crossings'] });
const RIEMANN = S({ type: 'graph', title: 'Area under x² from 0 to 2', expr: 'x^2', x: [-0.5, 2.5], params: [], area: { from: 0, to: 2, rects: { n: 6, rule: 'left' } } });
const LIMIT = S({ type: 'graph', title: 'A hole at x = 1', expr: '(x^2-1)/(x-1)', x: [-1, 3], params: [], points: [{ x: 1, y: 2, open: true }] });
const VECTORS = S({ type: 'vectors', title: 'A box on a slope', body: 'box', vectors: [{ label: 'weight', mag: 50, angle: 270 }, { label: 'normal', mag: 43, angle: 60 }, { label: 'friction', mag: 25, angle: 150 }] });
const TREE = S({ type: 'diagram', view: 'tree', title: 'Classification of matter', nodes: [{ id: 'm', label: 'Matter' }, { id: 'p', label: 'Pure substances' }, { id: 'x', label: 'Mixtures' }, { id: 'e', label: 'Elements' }, { id: 'c', label: 'Compounds' }, { id: 'h', label: 'Homogeneous' }, { id: 'g', label: 'Heterogeneous' }], edges: [['m', 'p'], ['m', 'x'], ['p', 'e'], ['p', 'c'], ['x', 'h'], ['x', 'g']] });
const FLOW = S({ type: 'diagram', view: 'flow', title: 'From order to delivery', nodes: ['Order placed', 'Payment checked', 'Picked in the warehouse', 'Packed and labelled', 'Handed to the courier', 'Delivered'].map((label, i) => ({ id: `s${i}`, label })), edges: Array.from({ length: 5 }, (_, i) => [`s${i}`, `s${i + 1}`]) });
const CYCLE = S({ type: 'diagram', view: 'cycle', title: 'The water cycle', nodes: ['Evaporation', 'Condensation', 'Precipitation', 'Collection'].map((label, i) => ({ id: `w${i}`, label })), edges: [['w0', 'w1'], ['w1', 'w2'], ['w2', 'w3'], ['w3', 'w0']] });
const SEQUENCE = S({ type: 'sequence', kind: 'timeline', title: 'The French Revolution', items: [{ label: 'Estates-General meets', when: 'May 1789' }, { label: 'Storming of the Bastille', when: 'July 1789' }, { label: 'Declaration of the Rights of Man', when: 'August 1789' }, { label: 'The Terror', when: '1793–94' }] });
const CLAIM = S({ type: 'claim', claim: 'We only use 10% of our brains', verdict: 'fails', parts: [{ text: 'Imaging shows activity across the whole brain', holds: 'yes' }, { text: 'The figure comes from research', holds: 'no' }] });
const BALANCE = S({ type: 'balance', title: 'Renting or buying', for: [{ text: 'Builds equity over time', weight: 3 }, { text: 'Freedom to change the home', weight: 2 }], against: [{ text: 'A large deposit up front', weight: 3 }, { text: 'Harder to move for work', weight: 2 }] });

const EDITED = (() => {
  const r = applyEdits(BUSINESS, [{ op: 'add', path: '/nodes/-', value: { id: 'n7', label: 'Customers' } }, { op: 'add', path: '/edges/-', value: ['r', 'n7'] }]);
  return r.ok ? r.spec : BUSINESS;
})();

function Block({ name, spec, keep }: { name: string; spec: InlineSpec; keep?: boolean }) {
  const [state, setState] = useState<Record<string, InlineState>>({});
  const host: InlineHost = {
    live: true,
    state,
    onState: (n, s) => setState((m) => ({ ...m, [String(n)]: s })),
    ...(keep ? { onOpen: () => undefined, onEdit: () => undefined } : {}),
  };
  return (
    <section data-qa={name} className="qa-block">
      <InlineBlock spec={spec} open={false} n={0} host={host} renderInline={(t) => t} />
    </section>
  );
}

function EditCard() {
  return (
    <section data-qa="edit-card" className="qa-block">
      <InlineEdit
        edit={{ type: 'edit', of: 'K1', title: 'A small business', ops: [{ op: 'add', path: '/nodes/-', value: {} }], said: 'added “Customers” under “A small business”' }}
        n={0}
        host={{ live: true, resolveEdit: () => ({ spec: EDITED, id: 'K1', made: true, applied: true, undo: true }), onUndoEdit: () => undefined, onOpenArtifact: () => undefined, onArtifactState: () => undefined }}
        renderInline={(t) => t}
      />
    </section>
  );
}

/** A kept map with its editor open, in a box as wide as the place it is opened in (a panel beside the board is ~520px). */
function EditorBlock({ name, width }: { name: string; width?: number }) {
  const [space, setSpace] = useState<ObjectSpace>(() => {
    const k = keptFrom(BUSINESS, undefined, { session: 'sQA_gallery01', message: 'm_qa', said: 'Here is how the parts fit together.', at: Date.now() });
    const made = k ? makeDisplay(EMPTY_SPACE, 'kept', k, 'person') : null;
    if (!made || !made.ok) throw new Error('the map could not be kept');
    // the editor opens as Edit opens it: asked for once, before the figure draws (components/display/KeptFigure.tsx)
    try {
      sessionStorage.setItem(`socria.edit.${made.obj.id}`, '1');
    } catch {
      /* no storage: the editor stays closed and the check says so */
    }
    return made.space;
  });
  const o = space.objs[0];
  return (
    <section data-qa={name} className="qa-block" style={width ? { maxWidth: width, width: '100%' } : undefined}>
      <ObjectFigure
        obj={o}
        at={o.at}
        mode="live"
        onOp={(op, args) => {
          const r = applyStep(space, o.id, op, args, { by: 'person' });
          if (r.ok) setSpace(r.space);
          return r.ok ? { ok: true } : { ok: false, why: r.why };
        }}
        onSeek={(at) => setSpace(seek(space, o.id, at))}
        onWorkspace={() => ({ ok: true })}
        onSend={() => undefined}
      />
    </section>
  );
}

function Gallery() {
  return (
    <div className="logos-root">
      <div className="l5">
        <main className="qa-page">
          <Block name="mind-immune" spec={IMMUNE} keep />
          <Block name="mind-business" spec={BUSINESS} keep />
          <Block name="graph-market" spec={MARKET} keep />
          <Block name="graph-riemann" spec={RIEMANN} />
          <Block name="graph-limit" spec={LIMIT} />
          <Block name="vectors" spec={VECTORS} />
          <Block name="diagram-tree" spec={TREE} />
          <Block name="diagram-flow" spec={FLOW} />
          <Block name="diagram-cycle" spec={CYCLE} />
          <Block name="sequence" spec={SEQUENCE} />
          <Block name="claim" spec={CLAIM} />
          <Block name="balance" spec={BALANCE} />
          <EditCard />
          <EditorBlock name="editor-panel" width={520} />
          <EditorBlock name="editor-wide" />
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
