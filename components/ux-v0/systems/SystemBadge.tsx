'use client';
// components/ux-v0/systems/SystemBadge.tsx — in a workspace's header: the design system the project is built in (its
// version, an update waiting, the design's brand fidelity), and the way to link one, update, unlink or manage them.

import { useState } from 'react';
import { applySystem, propagateTo, unlinkSystem } from '@/lib/ux-v0/dsi/link';
import { listSystems } from '@/lib/ux-v0/dsi/store';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import type { DesignProject } from '@/lib/ux-v0/types';
import type { LinkedSystem } from './useLinkedSystem';
import './systems.css';

export function SystemBadge({ project, linked, fidelity, onApply }: { project: DesignProject; linked: LinkedSystem | null; fidelity?: { score: number; findings: number } | null; onApply: (fn: (p: DesignProject) => { project: DesignProject; say: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<SystemRecord[] | null>(null);
  const link = project.systemLink;
  const toggle = async () => {
    if (!open) setList((await listSystems()).filter((r) => r.status === 'active' && r.published > 0));
    setOpen((o) => !o);
  };
  return (
    <span className="ds-badge-wrap">
      <button type="button" className="sb-btn is-sm ds-sysbadge" aria-expanded={open} onClick={toggle} title={link ? 'The design system this project is built in' : 'Build this project in one of your design systems'}>
        {link ? (
          <>
            {link.name || 'Design system'} v{link.version}
            {linked?.update ? ` · v${linked.update} available` : ''}
            {fidelity ? ` · fidelity ${fidelity.score}` : ''}
          </>
        ) : (
          'Use a design system'
        )}
      </button>
      {open && (
        <span className="ds-pop" role="dialog" aria-label="Design system">
          {link && linked && (
            <span className="ds-pop-sec">
              <strong>{linked.rec.name}</strong>
              <span className="ds-note">
                v{link.version} applied · {link.pin === 'latest' ? 'follows the latest' : `pinned to v${link.pin}`}
                {fidelity ? ` · ${fidelity.findings} finding${fidelity.findings === 1 ? '' : 's'}` : ''}
              </span>
              {linked.update && (
                <button
                  type="button"
                  className="sb-btn is-sm is-primary"
                  onClick={() => {
                    setOpen(false);
                    onApply((p) => {
                      const r = propagateTo(p, linked.rec);
                      return { project: r.project, say: r.report.summary };
                    });
                  }}
                >
                  Update to v{linked.update}
                </button>
              )}
              <button type="button" className="sb-link is-meta" onClick={() => (setOpen(false), onApply((p) => ({ project: unlinkSystem(p), say: 'Unlinked: everything stays, now yours to change.' })))}>
                Unlink
              </button>
            </span>
          )}
          <span className="ds-pop-sec">
            <span className="sb-label">{link ? 'Switch to' : 'Build it in'}</span>
            {list && !list.length && <span className="ds-note">No published design systems yet.</span>}
            {list
              ?.filter((r) => r.id !== link?.id)
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="ds-pop-item"
                  onClick={() => {
                    setOpen(false);
                    onApply((p) => {
                      const a = applySystem(p, r);
                      return { project: a.project, say: `${a.report.summary} The composition stays this project’s.` };
                    });
                  }}
                >
                  {r.name} <span className="ds-note">v{r.published}</span>
                </button>
              ))}
          </span>
          <a className="sb-link is-meta" href={`/ux-v0?ds=${link?.id ?? '1'}`}>
            Manage design systems
          </a>
        </span>
      )}
    </span>
  );
}
