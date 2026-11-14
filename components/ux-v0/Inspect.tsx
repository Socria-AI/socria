'use client';
// components/ux-v0/Inspect.tsx — what is selected, as the browser sees it.
//
// The element's role, name and text, where it sits, the computed styles that
// matter for design, its box, and what was measured — so the designer can
// check exactly what SocriaUX will reason from. A region lists the elements it
// holds, or shows its crop.

import { cssHex } from '@/lib/ux-v0/selection';
import type { SelectionContext } from '@/lib/ux-v0/types';
import type { Step } from './Frame';

const KEY_STYLES = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'padding-top', 'padding-left', 'border-radius', 'display', 'gap', 'max-width'];

export function Inspect({ sel, onStep, onClear, onPickElement }: { sel: SelectionContext | null; onStep?: (dir: Step) => void; onClear: () => void; onPickElement?: (selector: string) => void }) {
  if (!sel) {
    return <p className="v0-empty">Nothing selected. Choose Element and click part of the design, or choose Area and drag across it.</p>;
  }
  const el = sel.element;
  return (
    <div className="v0-inspect">
      <div className="v0-inspect-head">
        <p className="v0-cell-title">{sel.label}</p>
        <p className="v0-quiet">
          {sel.type === 'element' ? 'One element' : 'An area'}
          {sel.viewport ? ` · ${sel.viewport}` : ''}
          {el?.ux ? ` · from section ${el.ux.section}${el.ux.path ? `, ${el.ux.path}` : ''}` : ''}
        </p>
        <div className="v0-inspect-acts" role="group" aria-label="Move the selection">
          {el && onStep && (
            <>
              <button type="button" className="l5-link is-meta is-strong" onClick={() => onStep('parent')}>
                Select its parent
              </button>
              {el.children > 0 && (
                <button type="button" className="l5-link is-meta" onClick={() => onStep('child')}>
                  First inside it
                </button>
              )}
              {el.siblings > 0 && (
                <>
                  <button type="button" className="l5-link is-meta" onClick={() => onStep('prev')}>
                    Previous
                  </button>
                  <button type="button" className="l5-link is-meta" onClick={() => onStep('next')}>
                    Next
                  </button>
                </>
              )}
            </>
          )}
          <button type="button" className="l5-link is-meta" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>

      {sel.measured.length > 0 && (
        <section className="v0-cellset">
          <span className="l5-label">Measured</span>
          <ul className="v0-facts">
            {sel.measured.map((m, i) => (
              <li key={i} className={m.ok ? '' : 'is-fail'}>
                <span className="v0-fact-l">{m.label}</span>
                <span className="v0-fact-v">{m.value}</span>
                <span className="v0-fact-p">
                  {m.ok ? 'Meets' : 'Falls short'} · {m.principle}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {el && (
        <section className="v0-cellset">
          <span className="l5-label">Element</span>
          <dl className="v0-kv">
            <dt>Tag</dt>
            <dd>
              &lt;{el.tag}&gt;{el.role ? ` · ${el.role}` : ''}
            </dd>
            {el.name && (
              <>
                <dt>Name</dt>
                <dd>{el.name}</dd>
              </>
            )}
            {el.text && el.text !== el.name && (
              <>
                <dt>Text</dt>
                <dd>{el.text}</dd>
              </>
            )}
            <dt>Where</dt>
            <dd className="v0-mono">{el.path || el.tag}</dd>
            {el.section && (
              <>
                <dt>Section</dt>
                <dd>{el.section}</dd>
              </>
            )}
            <dt>Box</dt>
            <dd>
              {Math.round(el.box.w)} × {Math.round(el.box.h)} at {Math.round(el.box.x)}, {Math.round(el.box.y)}
            </dd>
            <dt>Behind it</dt>
            <dd>
              <Swatch v={el.background} /> {el.background}
            </dd>
          </dl>
          <span className="l5-label v0-sub">Styles</span>
          <dl className="v0-kv">
            {KEY_STYLES.filter((k) => el.styles[k] && !/^(normal|none|0px|auto)$/.test(el.styles[k])).map((k) => (
              <div key={k} className="v0-kv-row">
                <dt>{k}</dt>
                <dd>
                  {(k === 'color' || k === 'background-color') && <Swatch v={el.styles[k]} />} {el.styles[k]}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {sel.region && (
        <section className="v0-cellset">
          <span className="l5-label">Area</span>
          <p className="v0-quiet">
            {Math.round(sel.region.box.w)} × {Math.round(sel.region.box.h)} at {Math.round(sel.region.box.x)}, {Math.round(sel.region.box.y)}
            {sel.region.container ? ` · inside ${sel.region.container}` : ''}
          </p>
          {sel.crop && <img className="v0-crop" src={sel.crop.dataUrl} alt="The selected area" />}
          {sel.region.elements.length > 0 && (
            <ul className="v0-els">
              {sel.region.elements.map((e, i) => (
                <li key={i}>
                  <button type="button" className="v0-el" onClick={() => onPickElement?.(e.selector)} disabled={!onPickElement}>
                    <span className="v0-mono">&lt;{e.tag}&gt;</span> {e.name || e.text || e.role || '—'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Swatch({ v }: { v: string }) {
  const h = cssHex(v);
  return h ? <span className="v0-swatch" style={{ background: h }} aria-hidden="true" /> : null;
}
