'use client';
// components/ux-v0/systems/SystemsApp.tsx — the Design System Manager: every design system the designer keeps, each
// with its tokens, brand, assets, components, governance, the projects that use it, its versions, its sync and its
// exports. Edits land in the draft; publishing makes a version; projects read published versions only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { contrastRatio } from '@/lib/ux/audit';
import { approveAsset, importAsset } from '@/lib/ux-v0/dsi/assets';
import { productPalette } from '@/lib/ux-v0/dsi/adapters';
import { census, colourCategory, topCategory, refreshRoles, TOP_CATEGORIES, type TopCategory } from '@/lib/ux-v0/dsi/classify';
import { hexOf } from '@/lib/ux-v0/dsi/colour';
import { exportAll, exportCss, exportDtcg, exportGuidelinesHtml, svgAssetFiles, type ExportFile } from '@/lib/ux-v0/dsi/exporters';
import { addRule, analyzeBrand, approveIntel, editIntel, enforceIntel, rejectIntel } from '@/lib/ux-v0/dsi/intelligence';
import { importCss } from '@/lib/ux-v0/dsi/import-css';
import { importJson } from '@/lib/ux-v0/dsi/import-json';
import { combineSources } from '@/lib/ux-v0/dsi/merge';
import { applySystem, impactOn, propagateTo, setPin, undoApply, unlinkSystem, type ApplyReport } from '@/lib/ux-v0/dsi/link';
import { archiveRecord, compareVersions, discardDraft, draftChanges, duplicateRecord, logged, newRecord, publish, publishedContent, renameRecord, rollback, setDefault, updateDraft, type SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { emptyContent, normalizeContent, PRODUCT_ROLES, ROLE_LABEL, TOKEN_TYPES, type IntelItem, type OverrideLevel, type ProductRole, type SystemContent, type TokenType, type TokenValue } from '@/lib/ux-v0/dsi/schema';
import { applySync, contentId, recordCheck, syncDiff, syncDue, type SyncChoice } from '@/lib/ux-v0/dsi/sync';
import { RELATION_LABEL, checkParent, childrenOf, deriveSystem, experimentAgainst, ownChanges, parentAhead, parentageOf, promote, type Relation } from '@/lib/ux-v0/dsi/family';
import { addToken, blocking, canOverride, isAlias, removeToken, renameToken, resolveToken, setToken, validate } from '@/lib/ux-v0/dsi/tokens';
import { deleteSystem, listSystems, pullSystems, pushSystem, putSystem, removeFromAccount, getSystem } from '@/lib/ux-v0/dsi/store';
import { getProject, listProjects, putProject } from '@/lib/ux-v0/store';
import type { DesignProject, ProjectSummary } from '@/lib/ux-v0/types';
import { AssetThumb, ImportWizard, type WizardStart } from './ImportWizard';
import './systems.css';

const TABS = ['Overview', 'Tokens', 'Brand', 'Assets', 'Components', 'Governance', 'Usage', 'Versions', 'Sync', 'Export'] as const;
type Tab = (typeof TABS)[number];

const when = (t: number) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const show = (v: TokenValue) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));

function download(f: ExportFile | { name: string; blob: Blob }) {
  const blob = 'blob' in f ? f.blob : new Blob([f.text], { type: f.mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function svgToPng(svg: string, width: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = width / Math.max(1, img.naturalWidth || width);
      const c = document.createElement('canvas');
      c.width = Math.round((img.naturalWidth || width) * k);
      c.height = Math.round((img.naturalHeight || width / 3) * k);
      const ctx = c.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(b), 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export function SystemsApp(p: { signedIn: boolean; initialId?: string | null; onExit: () => void; onOpenProject: (id: string) => void; onNewProject: (kind: 'graphic' | 'board' | 'website' | 'guidelines' | 'guidelines-draft', rec: SystemRecord) => void; startImport?: (WizardStart & { next?: string }) | null; onImportTaken?: () => void }) {
  const [records, setRecords] = useState<SystemRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(p.initialId ?? null);
  const [tab, setTab] = useState<Tab>('Overview');
  // an import begun in the studio's conversation opens at once, with what the conversation settled
  const [wizard, setWizard] = useState<{ intoId?: string; initial?: WizardStart; next?: string } | null>(() => (p.startImport ? { initial: p.startImport, next: p.startImport.next } : null));
  useEffect(() => {
    if (p.startImport) p.onImportTaken?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [archived, setArchived] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setRecords(await listSystems());
    setProjects(await listProjects());
  }, []);

  useEffect(() => {
    (async () => {
      if (p.signedIn) await pullSystems();
      await refresh();
      setReady(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(
    async (rec: SystemRecord, say?: string) => {
      // shown at once, then kept (a controlled control never waits on storage)
      setRecords((xs) => [rec, ...xs.filter((x) => x.id !== rec.id)].sort((a, b) => b.updatedAt - a.updatedAt));
      const r = await putSystem(rec);
      if (!r.ok) setNotice(r.reason === 'quota' ? 'This browser is out of space: the change is held for this session only.' : 'This browser does not keep data here: the change lasts for this session.');
      else if (say) setNotice(say);
      if (p.signedIn) {
        const pushed = await pushSystem(rec);
        if (!pushed.ok && pushed.error) setNotice(pushed.error);
      }
    },
    [p.signedIn],
  );

  // managed sync: checked while the manager is open, never applied silently
  useEffect(() => {
    const tick = async () => {
      for (const r of records) if (syncDue(r)) await checkSource(r, null).then((x) => x && save(x.record));
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [records, save]);

  const rec = records.find((r) => r.id === selected) ?? null;
  const visible = records.filter((r) => (archived ? r.status === 'archived' : r.status === 'active'));

  return (
    <div className="v0 sb ds">
      <header className="v0-head">
        <div className="v0-head-l">
          <button type="button" className="v0-home" onClick={p.onExit} aria-label="All designs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socria-mark.png" alt="" width={20} height={20} />
            <span className="v0-brand">
              Socria<em>UX</em>
            </span>
            <span className="v0-tag">Design systems</span>
          </button>
        </div>
        <div className="v0-head-r">
          <span className="gx-free" title="Importing, validating, applying and exporting run without a model.">
            No model calls · $0
          </span>
          <button type="button" className="sb-btn is-sm is-primary" onClick={() => setWizard({})}>
            Import a design system
          </button>
          <button
            type="button"
            className="sb-btn is-sm"
            onClick={async () => {
              const r = newRecord(emptyContent('Untitled system'));
              await save(r, 'A new, empty design system.');
              setSelected(r.id);
              setTab('Tokens');
            }}
          >
            New empty system
          </button>
        </div>
      </header>
      {notice && (
        <p className="ds-notice" role="status">
          {notice}{' '}
          <button type="button" className="sb-link is-meta" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </p>
      )}
      <div className="ds-body">
        <nav className="ds-rail" aria-label="Design systems">
          <div className="ds-rail-head">
            <span className="sb-label">{archived ? 'Archived' : 'Your design systems'}</span>
            <button type="button" className="sb-link is-meta" onClick={() => setArchived((a) => !a)}>
              {archived ? 'Active' : 'Archived'}
            </button>
          </div>
          {!ready && <p className="ds-note">Reading this browser…</p>}
          {ready && !visible.length && <p className="ds-note">{archived ? 'Nothing archived.' : 'No design systems yet. Import one: tokens, CSS, brand guidelines, a website, Figma, logos or a project.'}</p>}
          <ul>
            {visible.map((r) => (
              <li key={r.id}>
                <button type="button" className={`ds-rail-item${r.id === selected ? ' is-on' : ''}`} onClick={() => setSelected(r.id)} aria-current={r.id === selected ? 'true' : undefined}>
                  <span className="ds-rail-sw" aria-hidden="true">
                    {(['background', 'text', 'accent'] as ProductRole[]).map((k) => (
                      <i key={k} style={{ background: productPalette(publishedContent(r) ?? r.draft).colors[k as 'background'] }} />
                    ))}
                  </span>
                  <span className="ds-rail-n">{r.name}</span>
                  <span className="ds-rail-m">
                    {r.published ? `v${r.published}` : 'draft'}
                    {r.isDefault ? ' · default' : ''}
                    {r.sync.pending ? ' · update waiting' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="ds-main">
          {!rec && ready && (
            <section className="ds-empty">
              <h1>Design systems</h1>
              <p>A design system defines identity: colours, type, spacing, logos and rules. SocriaUX keeps it, versions it and carries it into graphics, boards and websites — while every composition stays its own.</p>
              <button type="button" className="sb-btn is-primary" onClick={() => setWizard({})}>
                Import a design system
              </button>
            </section>
          )}
          {rec && (
            <>
              <header className="ds-sys-head">
                <input className="ds-sys-name" aria-label="System name" value={rec.name} onChange={(e) => setRecords((xs) => xs.map((x) => (x.id === rec.id ? { ...x, name: e.target.value.slice(0, 80) } : x)))} onBlur={(e) => save(renameRecord({ ...rec, name: records.find((x) => x.id === rec.id)!.draft.identity.name }, e.target.value))} />
                <span className="ds-sys-status">
                  {rec.published ? `Published v${rec.published}` : 'Not published yet'} · {draftChanges(rec).length} draft change{draftChanges(rec).length === 1 ? '' : 's'} · {rec.sources[0] ? `from ${rec.sources[0].kind}` : 'made here'}
                </span>
              </header>
              <nav className="sb-seg ds-tabs" aria-label="Sections">
                {TABS.map((t) => (
                  <button key={t} type="button" className={`sb-seg-item${tab === t ? ' is-on' : ''}`} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </nav>
              <div className="ds-panel">
                {tab === 'Overview' && <Overview rec={rec} save={save} records={records} onSelect={setSelected} onAll={(rs) => Promise.all(rs.map((r) => save(r)))} onImportInto={() => setWizard({ intoId: rec.id })} onDeleted={async () => { await deleteSystem(rec.id); if (p.signedIn) await removeFromAccount(rec.id); setSelected(null); refresh(); }} />}
                {tab === 'Tokens' && <TokensTab rec={rec} save={save} />}
                {tab === 'Brand' && <BrandTab rec={rec} save={save} />}
                {tab === 'Assets' && <AssetsTab rec={rec} save={save} />}
                {tab === 'Components' && <ComponentsTab rec={rec} />}
                {tab === 'Governance' && <GovernanceTab rec={rec} save={save} />}
                {tab === 'Usage' && <UsageTab rec={rec} save={save} signedIn={p.signedIn} projects={projects} onOpenProject={p.onOpenProject} onNewProject={p.onNewProject} onChanged={refresh} />}
                {tab === 'Versions' && <VersionsTab rec={rec} save={save} />}
                {tab === 'Sync' && <SyncTab rec={rec} save={save} />}
                {tab === 'Export' && <ExportTab rec={rec} save={save} />}
              </div>
            </>
          )}
        </main>
      </div>
      {wizard && (
        <ImportWizard
          signedIn={p.signedIn}
          records={records}
          projects={projects}
          intoId={wizard.intoId}
          initial={wizard.initial ?? null}
          onCancel={() => setWizard(null)}
          onDone={async (d) => {
            await save(d.record, d.created ? `${d.record.name} created.` : `Imported into ${d.record.name}’s draft.`);
            setSelected(d.record.id);
          }}
          onApply={(r) => {
            const next = wizard.next;
            setWizard(null);
            setSelected(r.id);
            setTab('Usage');
            // what the conversation said would be made first, begun in the new system
            if (next === 'graphic' || next === 'board' || next === 'website') p.onNewProject(next, r);
          }}
        />
      )}
    </div>
  );
}

type Save = (rec: SystemRecord, say?: string) => Promise<void>;

// ── overview ──

function Overview({ rec, save, records, onSelect, onAll, onImportInto, onDeleted }: { rec: SystemRecord; save: Save; records: SystemRecord[]; onSelect: (id: string) => void; onAll: (rs: SystemRecord[]) => Promise<unknown>; onImportInto: () => void; onDeleted: () => void }) {
  const c = rec.draft;
  const issues = useMemo(() => validate(c), [c]);
  const changes = useMemo(() => draftChanges(rec), [rec]);
  const pal = productPalette(c);
  const cen = census(c);
  const [review, setReview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');
  const edit = (next: SystemContent, say: string) => save(updateDraft(rec, next, say));
  const bind = (role: ProductRole, path: string) => {
    const roles = { ...c.roles };
    if (!path) delete roles[role];
    else roles[role] = { path, status: 'confirmed', confidence: 1, why: 'chosen by the owner' };
    edit({ ...c, roles }, `${ROLE_LABEL[role]} → ${path || 'derived'}`);
  };
  const tokensFor = (role: ProductRole) => Object.values(c.tokens).filter((t) => (['display', 'body', 'mono'].includes(role) ? t.type === 'fontFamily' : t.type === 'color'));
  const doPublish = async () => {
    const r = publish(rec, { confirm: true });
    if (r.error) return setMsg(r.error);
    setReview(false);
    await save(r.record, `Published v${r.record.published}. Projects that follow the latest version can be updated from Usage.`);
  };
  // its family: what it was made from, and what was made from it (lib/ux-v0/dsi/family.ts)
  const parentage = parentageOf(rec);
  const parent = parentage ? records.find((r) => r.id === parentage.id) ?? null : null;
  const children = childrenOf(records, rec.id);
  const own = parentage ? ownChanges(rec) : [];
  const ahead = parentage ? parentAhead(rec, parent) : false;
  return (
    <div className="ds-overview">
      {(parentage || children.length > 0) && (
        <section className="ds-card" aria-label="Family">
          <h2 className="sb-label">Family</h2>
          {parentage && (
            <>
              <p className="ds-note">
                <strong>{RELATION_LABEL[parentage.relation]}</strong> made from{' '}
                {parent ? (
                  <button type="button" className="sb-link" onClick={() => onSelect(parent.id)}>
                    {parent.name}
                  </button>
                ) : (
                  'a system that is not in this browser'
                )}
                {parentage.relation === 'experiment' ? ' as it stood' : parentage.version ? ` v${parentage.version}` : ''}. {own.length ? `${own.length} thing${own.length === 1 ? ' is' : 's are'} its own; the rest is ${parent?.name ?? 'its parent'}’s.` : `Nothing is changed yet: it is ${parent?.name ?? 'its parent'} as it was.`}
              </p>
              {own.length > 0 && (
                <ul className="ds-changes" data-own>
                  {own.slice(0, 12).map((ch, i) => (
                    <li key={i}>{ch.summary}</li>
                  ))}
                </ul>
              )}
              {ahead && parent && (
                <p className="ds-notice" role="status">
                  {parentage.relation === 'experiment' ? `${parent.name} has changed since this experiment was branched.` : `${parent.name} v${parent.published} is published; this was made from v${parentage.version}.`} Nothing here has changed. Bring it in from the Sync tab: what this system changed stays its own.
                </p>
              )}
              {parentage.relation === 'experiment' && parent && (
                <div className="ds-row">
                  <button
                    type="button"
                    className="sb-btn is-primary"
                    disabled={!experimentAgainst(rec, parent).length}
                    onClick={async () => {
                      const n = experimentAgainst(rec, parent).length;
                      if (!window.confirm(`Bring ${n} change${n === 1 ? '' : 's'} from “${rec.name}” into the draft of ${parent.name}? Nothing is published: ${parent.name} v${parent.published || 0} stays as it is until you publish its draft.`)) return;
                      const r = promote(rec, parent);
                      if ('error' in r) return setMsg(r.error);
                      await save(r.record, `Brought into the draft of ${parent.name}. Review and publish it there.`);
                      onSelect(parent.id);
                    }}
                  >
                    Bring it into {parent.name}’s draft
                  </button>
                  <span className="ds-note">{experimentAgainst(rec, parent).length} difference{experimentAgainst(rec, parent).length === 1 ? '' : 's'} from {parent.name} as it is now.</span>
                </div>
              )}
            </>
          )}
          {children.length > 0 && (
            <>
              <p className="ds-note">Made from {rec.name}:</p>
              <ul className="ds-changes" data-children>
                {children.map((ch) => {
                  const rel = parentageOf(ch)!;
                  return (
                    <li key={ch.id}>
                      <button type="button" className="sb-link" onClick={() => onSelect(ch.id)}>
                        {ch.name}
                      </button>{' '}
                      — {RELATION_LABEL[rel.relation].toLowerCase()}
                      {rel.relation !== 'experiment' ? `, on v${rel.version}` : ''}
                      {parentAhead(ch, rec) ? ' · a newer version is waiting there (nothing moves until it is brought in)' : ''}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}
      <section className="ds-card">
        <h2 className="sb-label">Identity</h2>
        <label className="ds-field">
          Description
          <textarea className="v0-field" value={c.identity.description} onChange={(e) => save(updateDraft(rec, { ...c, identity: { ...c.identity, description: e.target.value.slice(0, 1000) } }, 'Description edited'))} rows={3} />
        </label>
        <p className="ds-note">
          {cen.total} tokens · {cen.aliases} references · modes {c.modes.join(', ')} · {cen.components} components · {cen.assets} assets ({cen.logos} logos) · {c.intelligence.length} statements
        </p>
      </section>
      <section className="ds-card">
        <h2 className="sb-label">Roles the products read</h2>
        <table className="ds-table">
          <tbody>
            {PRODUCT_ROLES.map((role) => {
              const b = c.roles[role];
              const colour = !['display', 'body', 'mono'].includes(role);
              const value = colour ? ((pal.colors as Record<string, string>)[role] ?? (role === 'accent2' ? pal.accent2 : '')) : pal.families.find((f) => f.role === role);
              return (
                <tr key={role}>
                  <th scope="row">{ROLE_LABEL[role]}</th>
                  <td>
                    {colour ? value && <span className="ds-chip" style={{ background: value as string }} /> : value && <span>{(value as { family: string; standIn: string }).family}{(value as { family: string; standIn: string }).standIn !== (value as { family: string }).family ? ` (drawn with ${(value as { standIn: string }).standIn})` : ''}</span>}
                    {colour && value ? <code>{value as string}</code> : null}
                  </td>
                  <td>
                    <select aria-label={`Token for ${ROLE_LABEL[role]}`} value={b?.path ?? ''} onChange={(e) => bind(role, e.target.value)}>
                      <option value="">{colour ? 'Derived for products' : 'None'}</option>
                      {tokensFor(role).map((t) => (
                        <option key={t.path} value={t.path}>
                          {t.path}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{b ? <span className={`ds-badge ${b.status === 'confirmed' ? 'is-confirmed' : 'is-inferred'}`} title={b.why}>{b.status}</span> : <span className="ds-note">derived</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {pal.derived.length > 0 && <p className="ds-note">{pal.derived.join('. ')}.</p>}
        <p className="ds-note">
          Text on background {contrastRatio(pal.colors.text, pal.colors.background).toFixed(1)}:1 · text on accent {contrastRatio(pal.colors.accentText, pal.colors.accent).toFixed(1)}:1
        </p>
        <button type="button" className="sb-btn is-sm" onClick={() => edit(refreshRoles({ ...c, roles: Object.fromEntries(Object.entries(c.roles).filter(([, b]) => b?.status === 'confirmed')) }), 'Unconfirmed roles inferred again')}>
          Infer unconfirmed roles again
        </button>
      </section>
      <section className="ds-card">
        <h2 className="sb-label">Status</h2>
        {issues.length ? (
          <ul className="ds-issues-list">
            {issues.slice(0, 20).map((i, n) => (
              <li key={n} className={`is-${i.severity}`}>
                {i.message}
                {i.fix && <em> {i.fix}</em>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ds-note">No problems: every reference resolves, every value is of its type.</p>
        )}
        <div className="ds-actions">
          <button type="button" className="sb-btn is-primary" disabled={!!blocking(issues).length || (rec.published > 0 && !changes.length)} onClick={() => (rec.draft.governance.requireReview ? setReview(true) : doPublish())}>
            {rec.published ? `Publish v${rec.published + 1}` : 'Publish v1'}
          </button>
          {rec.published > 0 && changes.length > 0 && (
            <button type="button" className="sb-btn" onClick={() => save(discardDraft(rec), 'Draft discarded.')}>
              Discard the draft
            </button>
          )}
          <button type="button" className="sb-btn" onClick={onImportInto}>
            Import more into it
          </button>
          <button type="button" className="sb-btn" onClick={() => save(duplicateRecord(rec), 'Duplicated.')}>
            Duplicate
          </button>
          {(['product', 'campaign', 'experiment'] as Relation[]).map((relation) => (
            <button
              key={relation}
              type="button"
              className="sb-btn"
              title={relation === 'experiment' ? 'A copy to rethink freely. It reaches this system only if you bring it back, and then only as a draft.' : `A system of its own within ${rec.name}: what it does not change stays ${rec.name}’s, and a new version of ${rec.name} waits to be brought in.`}
              onClick={async () => {
                const name = window.prompt(relation === 'experiment' ? `Name the experiment (a copy of ${rec.name} to rethink)` : `Name the ${relation}’s system (made within ${rec.name})`);
                if (!name?.trim()) return;
                const d = deriveSystem(rec, { name, relation });
                if ('error' in d) return void save(rec, d.error);
                await save(d.record, `${RELATION_LABEL[relation]} “${d.record.name}” made from ${rec.name}.`);
                onSelect(d.record.id);
              }}
            >
              {relation === 'experiment' ? 'Branch an experiment' : `Make a ${relation} system`}
            </button>
          ))}
          <button type="button" className="sb-btn" onClick={() => onAll(setDefault(records, rec.isDefault ? null : rec.id))}>
            {rec.isDefault ? 'Not the workspace default' : 'Make it the workspace default'}
          </button>
          <button type="button" className="sb-btn" onClick={() => save(archiveRecord(rec, rec.status !== 'archived'))}>
            {rec.status === 'archived' ? 'Restore' : 'Archive'}
          </button>
          {rec.status === 'archived' && !deleting && (
            <button type="button" className="sb-btn is-danger" onClick={() => setDeleting(true)}>
              Delete…
            </button>
          )}
        </div>
        {deleting && (
          <div className="ds-confirm" role="group" aria-label={`Delete ${rec.name}?`}>
            <p>Delete {rec.name} for good? Its versions and history go with it; projects keep what they already have.</p>
            <button type="button" className="sb-btn is-sm is-danger" onClick={onDeleted}>
              Delete it
            </button>
            <button type="button" className="sb-btn is-sm" autoFocus onClick={() => setDeleting(false)}>
              Keep it
            </button>
          </div>
        )}
        {msg && (
          <p className="ds-error" role="alert">
            {msg}
          </p>
        )}
      </section>
      {review && (
        <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="ds-rev-t">
          <div className="ds-modal-in">
            <h2 id="ds-rev-t">Review before publishing v{rec.published + 1}</h2>
            <ul className="ds-log">
              {changes.slice(0, 60).map((ch, i) => (
                <li key={i}>{ch.summary}</li>
              ))}
            </ul>
            {issues.filter((i) => i.severity === 'warning').length > 0 && <p className="ds-note">{issues.filter((i) => i.severity === 'warning').length} warnings stay (they do not block).</p>}
            <p className="ds-note">Publishing makes a version. Projects that follow the latest version change only when you update them from Usage; pinned projects stay where they are.</p>
            <div className="ds-actions">
              <button type="button" className="sb-btn" onClick={() => setReview(false)}>
                Not yet
              </button>
              <button type="button" className="sb-btn is-primary" onClick={doPublish}>
                Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── tokens ──

function TokensTab({ rec, save }: { rec: SystemRecord; save: Save }) {
  const c = rec.draft;
  const [cat, setCat] = useState<TopCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<{ path: string; type: TokenType; value: string }>({ path: '', type: 'color', value: '' });
  // the token being renamed, in its own row (references follow the new name)
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const issues = useMemo(() => validate(c), [c]);
  const byPath = new Map(issues.filter((i) => i.path).map((i) => [i.path!, i]));
  const rows = Object.values(c.tokens).filter((t) => (cat === 'all' || topCategory(t) === cat) && (!q || t.path.toLowerCase().includes(q.toLowerCase())));
  const apply = (r: { content: SystemContent; error?: string }, say: string) => {
    if (r.error) return setErr(r.error);
    setErr('');
    save(updateDraft(rec, r.content, say));
  };
  const parse = (type: TokenType, s: string): TokenValue => {
    const v = s.trim();
    if (type === 'number' || type === 'fontWeight') return /^-?[\d.]+$/.test(v) ? Number(v) : v;
    if (type === 'boolean') return v === 'true';
    if (['shadow', 'typography', 'border', 'transition', 'gradient', 'cubicBezier'].includes(type) && /^[[{]/.test(v) && !isAlias(v)) {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  };
  const locked = (path: string) => c.governance.locked.includes(path);
  return (
    <div>
      <div className="ds-toolbar">
        <div className="sb-seg" role="tablist" aria-label="Category">
          {(['all', ...TOP_CATEGORIES] as const).map((k) => (
            <button key={k} type="button" className={`sb-seg-item${cat === k ? ' is-on' : ''}`} onClick={() => setCat(k)}>
              {k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <input className="v0-field ds-search" placeholder="Find a token" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a token" />
      </div>
      {err && (
        <p className="ds-error" role="alert">
          {err}
        </p>
      )}
      <div className="ds-table-wrap">
        <table className="ds-table ds-tokens">
          <thead>
            <tr>
              <th>Token</th>
              <th>Type</th>
              <th>Value ({c.modes[0]})</th>
              {c.modes.slice(1).map((m) => (
                <th key={m}>{m}</th>
              ))}
              <th>Resolves to</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 400).map((t) => {
              const r = resolveToken(c, t.path);
              const hex = t.type === 'color' && r.ok ? hexOf(r.value) : null;
              const issue = byPath.get(t.path);
              return (
                <tr key={t.path} className={issue?.severity === 'error' ? 'is-bad' : ''}>
                  <td>
                    <code>{t.path}</code>
                    {t.description && <span className="ds-desc">{t.description}</span>}
                    {issue && <span className="ds-desc is-bad">{issue.message}</span>}
                  </td>
                  <td>
                    <select aria-label={`Type of ${t.path}`} value={t.type} onChange={(e) => apply(setToken(c, t.path, { type: e.target.value as TokenType }), `${t.path} type → ${e.target.value}`)}>
                      {TOKEN_TYPES.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="ds-val">
                      {t.type === 'color' && !isAlias(t.value) && hex && <input type="color" aria-label={`Pick ${t.path}`} value={hex} onChange={(e) => apply(setToken(c, t.path, { value: e.target.value }), `${t.path} → ${e.target.value}`)} />}
                      <input className="v0-field" aria-label={`Value of ${t.path}`} defaultValue={show(t.value)} key={show(t.value)} onBlur={(e) => e.target.value !== show(t.value) && apply(setToken(c, t.path, { value: parse(t.type, e.target.value) }), `${t.path} → ${e.target.value}`)} />
                    </span>
                  </td>
                  {c.modes.slice(1).map((m) => (
                    <td key={m}>
                      <input className="v0-field" aria-label={`${m} value of ${t.path}`} placeholder="—" defaultValue={t.modes?.[m] !== undefined ? show(t.modes[m]) : ''} key={`${m}${show(t.modes?.[m] ?? '')}`} onBlur={(e) => e.target.value !== (t.modes?.[m] !== undefined ? show(t.modes[m]) : '') && apply(setToken(c, t.path, { modes: { [m]: e.target.value.trim() ? parse(t.type, e.target.value) : null } }), `${t.path} (${m}) → ${e.target.value || 'removed'}`)} />
                    </td>
                  ))}
                  <td>
                    {hex && <span className="ds-chip" style={{ background: hex }} />}
                    <span className="ds-desc">{r.ok ? `${show(r.value as TokenValue).slice(0, 40)}${r.chain.length > 1 ? ` via ${r.chain.slice(1).join(' → ')}` : ''}` : r.error?.kind}</span>
                  </td>
                  <td>
                    <span className={`ds-badge is-${t.provenance.status}`} title={`${t.provenance.source.kind}: ${t.provenance.source.ref}${t.provenance.source.file ? ` · ${t.provenance.source.file}` : ''}${t.provenance.source.line ? `:${t.provenance.source.line}` : ''}${t.provenance.source.page ? ` · page ${t.provenance.source.page}` : ''}${t.provenance.source.property ? ` · ${t.provenance.source.property}` : ''} · confidence ${t.provenance.confidence}${t.provenance.note ? ` — ${t.provenance.note}` : ''}`}>
                      {t.provenance.status}
                    </span>
                    <span className="ds-desc">{t.provenance.source.kind}</span>
                  </td>
                  <td className="ds-row-acts">
                    <button type="button" className="sb-link is-meta" title={locked(t.path) ? 'Locked: no project, material or object may override it' : 'Lock it against overrides'} onClick={() => save(updateDraft(rec, { ...c, governance: { ...c.governance, locked: locked(t.path) ? c.governance.locked.filter((g) => g !== t.path) : [...c.governance.locked, t.path] } }, `${t.path} ${locked(t.path) ? 'unlocked' : 'locked'}`, { action: 'governance' }))}>
                      {locked(t.path) ? 'Unlock' : 'Lock'}
                    </button>
                    {renaming?.from === t.path ? (
                      <form
                        className="ds-inline"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const to = renaming.to.trim();
                          setRenaming(null);
                          if (to && to !== t.path) apply(renameToken(c, t.path, to), `${t.path} renamed ${to}`);
                        }}
                      >
                        <input className="v0-field" aria-label={`New name for ${t.path} (references follow)`} value={renaming.to} autoFocus onChange={(e) => setRenaming({ from: t.path, to: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} />
                        <button type="submit" className="sb-link is-meta">
                          Rename
                        </button>
                        <button type="button" className="sb-link is-meta" onClick={() => setRenaming(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button type="button" className="sb-link is-meta" onClick={() => setRenaming({ from: t.path, to: t.path })}>
                        Rename
                      </button>
                    )}
                    <button type="button" className="sb-link is-meta" onClick={() => apply(removeToken(c, t.path), `${t.path} removed`)}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 400 && <p className="ds-note">Showing 400 of {rows.length}: find a token to narrow the list.</p>}
      <form
        className="ds-add"
        onSubmit={(e) => {
          e.preventDefault();
          apply(addToken(c, draft.path, draft.type, parse(draft.type, draft.value)), `Added ${draft.path}`);
          setDraft({ path: '', type: draft.type, value: '' });
        }}
      >
        <span className="sb-label">Add a token</span>
        <input className="v0-field" placeholder="color.brand.primary" value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} aria-label="New token path" />
        <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TokenType })} aria-label="New token type">
          {TOKEN_TYPES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input className="v0-field" placeholder="#0f62fe or {color.brand.base}" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} aria-label="New token value" />
        <button type="submit" className="sb-btn is-sm" disabled={!draft.path || !draft.value}>
          Add
        </button>
      </form>
      <form
        className="ds-add"
        onSubmit={(e) => {
          e.preventDefault();
          const m = (new FormData(e.currentTarget).get('mode') as string).trim().toLowerCase().replace(/\s+/g, '-');
          if (m && !c.modes.includes(m)) save(updateDraft(rec, { ...c, modes: [...c.modes, m] }, `Mode ${m} added`));
          e.currentTarget.reset();
        }}
      >
        <span className="sb-label">Add a mode</span>
        <input className="v0-field" name="mode" placeholder="dark, high-contrast…" aria-label="New mode" />
        <button type="submit" className="sb-btn is-sm">
          Add mode
        </button>
      </form>
    </div>
  );
}

// ── brand ──

function BrandTab({ rec, save }: { rec: SystemRecord; save: Save }) {
  const c = rec.draft;
  const [err, setErr] = useState('');
  const [rule, setRule] = useState('');
  // the statement being reworded, in its own row (it becomes the owner's)
  const [rewording, setRewording] = useState<{ id: string; text: string } | null>(null);
  const act = (r: { content: SystemContent; error?: string }, say: string, action: 'approved' | 'rejected' | 'edited' | 'governance' = 'edited') => {
    if (r.error) return setErr(r.error);
    setErr('');
    save(updateDraft(rec, r.content, say, { action }));
  };
  const groups: [string, IntelItem['status']][] = [
    ['Confirmed — stated by the source or by you', 'confirmed'],
    ['Approved interpretations', 'approved'],
    ['SocriaUX inferences — suggestions, never enforced until you approve them', 'inferred'],
    ['Set aside', 'rejected'],
  ];
  return (
    <div>
      <div className="ds-toolbar">
        <button type="button" className="sb-btn is-sm" onClick={() => act({ content: analyzeBrand(c) }, 'Brand read again')}>
          Read the system again
        </button>
      </div>
      {err && (
        <p className="ds-error" role="alert">
          {err}
        </p>
      )}
      {groups.map(([title, status]) => {
        const items = c.intelligence.filter((i) => i.status === status);
        if (!items.length) return null;
        return (
          <section key={status} className="ds-card">
            <h2 className="sb-label">{title}</h2>
            <ul className="ds-intel-list">
              {items.map((i) => (
                <li key={i.id}>
                  <span className="ds-kind">{i.kind}</span>
                  <span className="ds-stmt">
                    {i.statement}
                    {i.evidence[0]?.quote && i.evidence[0].quote !== i.statement && <em className="ds-desc">“{i.evidence[0].quote}”</em>}
                    {i.evidence[0]?.source.page ? <em className="ds-desc">page {i.evidence[0].source.page}</em> : null}
                    {i.check && <em className="ds-desc">checked: {i.check.kind}</em>}
                  </span>
                  <span className="ds-intel-acts">
                    {status === 'inferred' || status === 'rejected' ? (
                      <button type="button" className="sb-btn is-sm" onClick={() => act(approveIntel(c, i.id), `Approved: ${i.statement}`, 'approved')}>
                        Approve
                      </button>
                    ) : (
                      <select aria-label="How strictly it holds" value={i.enforce} onChange={(e) => act(enforceIntel(c, i.id, e.target.value as IntelItem['enforce']), `${i.statement}: ${e.target.value}`, 'governance')}>
                        <option value="hard">Rule</option>
                        <option value="soft">Preference</option>
                        <option value="none">Note only</option>
                      </select>
                    )}
                    {status !== 'rejected' && (
                      <button type="button" className="sb-link is-meta" onClick={() => act(rejectIntel(c, i.id), `Set aside: ${i.statement}`, 'rejected')}>
                        Set aside
                      </button>
                    )}
                    {rewording?.id !== i.id && (
                      <button type="button" className="sb-link is-meta" onClick={() => setRewording({ id: i.id, text: i.statement })}>
                        Reword
                      </button>
                    )}
                  </span>
                  {rewording?.id === i.id && (
                    <form
                      className="ds-inline is-wide"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const text = rewording.text.trim();
                        setRewording(null);
                        if (text && text !== i.statement) act(editIntel(c, i.id, text), `Reworded: ${text}`);
                      }}
                    >
                      <input className="v0-field" aria-label="Reword it (it becomes yours)" value={rewording.text} autoFocus onChange={(e) => setRewording({ id: i.id, text: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setRewording(null)} />
                      <button type="submit" className="sb-btn is-sm">
                        Save
                      </button>
                      <button type="button" className="sb-link is-meta" onClick={() => setRewording(null)}>
                        Cancel
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <form
        className="ds-add"
        onSubmit={(e) => {
          e.preventDefault();
          act(addRule(c, rule, 'restriction', 'hard'), `Rule added: ${rule}`, 'governance');
          setRule('');
        }}
      >
        <span className="sb-label">State a rule</span>
        <input className="v0-field" placeholder="Never set the logo smaller than 24px" value={rule} onChange={(e) => setRule(e.target.value)} aria-label="New rule" />
        <button type="submit" className="sb-btn is-sm" disabled={rule.trim().length < 4}>
          Add rule
        </button>
      </form>
    </div>
  );
}

// ── assets ──

function AssetsTab({ rec, save }: { rec: SystemRecord; save: Save }) {
  const c = rec.draft;
  const [msg, setMsg] = useState('');
  // an approved logo is removed only once asked again, in its own row
  const [removing, setRemoving] = useState<string | null>(null);
  const set = (assets: typeof c.assets, say: string) => save(updateDraft(rec, { ...c, assets }, say));
  return (
    <div>
      <div className="ds-toolbar">
        <input
          type="file"
          id="ds-more"
          className="v0-sr"
          multiple
          accept=".svg,.png,.jpg,.jpeg,.webp,.ttf,.otf,.woff,.woff2"
          onChange={async (e) => {
            const fs = [...(e.target.files ?? [])].slice(0, 12);
            const added = [];
            const notes: string[] = [];
            for (const f of fs) {
              const r = await importAsset({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type });
              if (r.asset) added.push(r.asset);
              notes.push(...r.notes, ...(r.error ? [r.error] : []));
            }
            setMsg(notes.join(' '));
            if (added.length) set([...c.assets, ...added], `Added ${added.length} asset${added.length === 1 ? '' : 's'}`);
            e.target.value = '';
          }}
        />
        <label htmlFor="ds-more" className="sb-btn is-sm">
          Add logos, icons or fonts
        </label>
      </div>
      {msg && <p className="ds-note">{msg}</p>}
      {!c.assets.length && <p className="ds-note">No assets yet.</p>}
      <ul className="ds-asset-grid">
        {c.assets.map((a) => (
          <li key={a.id} className={a.approved ? 'is-approved' : ''}>
            <AssetThumb a={a} />
            <strong>{a.name}</strong>
            <span className="ds-desc">
              {a.kind} · {a.format.toUpperCase()}
              {a.width ? ` · ${Math.round(a.width)}×${Math.round(a.height ?? 0)}` : ''} · {Math.round(a.bytes / 1024)} KB · v{a.version}
            </span>
            {a.font && (
              <span className="ds-desc">
                {a.font.family} {a.font.subfamily} · {a.font.licence ? `licence: ${a.font.licence.slice(0, 80)}` : 'no licence in the file'}
              </span>
            )}
            {a.notes.map((n) => (
              <span key={n} className="ds-desc">
                {n}
              </span>
            ))}
            {a.kind === 'logo' && (
              <>
                <label className="ds-check">
                  <input type="checkbox" checked={a.approved} disabled={!!a.lowRes} onChange={(e) => set(c.assets.map((x) => (x.id === a.id ? approveAsset(x, e.target.checked) : x)), `${a.name} ${e.target.checked ? 'approved (protected)' : 'no longer approved'}`)} /> {a.approved ? 'Approved — protected' : 'Approve as a logo'}
                </label>
                <select aria-label={`Role of ${a.name}`} value={a.role ?? 'primary'} onChange={(e) => set(c.assets.map((x) => (x.id === a.id ? { ...x, role: e.target.value } : x)), `${a.name} role → ${e.target.value}`)}>
                  {['primary', 'reversed', 'mark', 'wordmark', 'mono', 'favicon', 'secondary'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </>
            )}
            <label className="ds-check">
              <input type="checkbox" checked={c.governance.restrictedAssets.includes(a.id)} onChange={(e) => save(updateDraft(rec, { ...c, governance: { ...c.governance, restrictedAssets: e.target.checked ? [...c.governance.restrictedAssets, a.id] : c.governance.restrictedAssets.filter((x) => x !== a.id) } }, `${a.name} ${e.target.checked ? 'restricted' : 'allowed'}`, { action: 'governance' }))} /> Restricted (never placed in designs)
            </label>
            {removing === a.id ? (
              <span className="ds-confirm" role="group" aria-label={`Remove ${a.name}?`}>
                <span>{a.name} is an approved logo. Remove it from the system?</span>
                <button type="button" className="sb-btn is-sm is-danger" onClick={() => (setRemoving(null), set(c.assets.filter((x) => x.id !== a.id), `${a.name} removed`))}>
                  Remove it
                </button>
                <button type="button" className="sb-btn is-sm" autoFocus onClick={() => setRemoving(null)}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" className="sb-link is-meta" onClick={() => (a.approved ? setRemoving(a.id) : set(c.assets.filter((x) => x.id !== a.id), `${a.name} removed`))}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComponentsTab({ rec }: { rec: SystemRecord }) {
  const c = rec.draft;
  return (
    <div>
      <p className="ds-note">Component definitions as the source describes them: names, variants, properties and the tokens they use. They guide composition; they are not code, and SocriaUX does not turn them into working components.</p>
      {!c.components.length && <p className="ds-note">No components in this system.</p>}
      <ul className="ds-components">
        {c.components.map((x) => (
          <li key={x.id} className="ds-card">
            <strong>{x.name}</strong>
            {x.description && <p>{x.description}</p>}
            {x.properties.length > 0 && <p className="ds-desc">{x.properties.map((pr) => `${pr.name}: ${(pr.options ?? []).join(' / ') || pr.type}`).join(' · ')}</p>}
            {x.variants.length > 0 && <p className="ds-desc">{x.variants.length} variants</p>}
            <p className="ds-desc">
              From {x.source.kind}
              {x.source.nodeId ? ` (node ${x.source.nodeId})` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GovernanceTab({ rec, save }: { rec: SystemRecord; save: Save }) {
  const c = rec.draft;
  const g = c.governance;
  const setG = (next: typeof g, say: string) => save(updateDraft(rec, { ...c, governance: next }, say, { action: 'governance' }));
  const globs = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="ds-overview">
      <section className="ds-card">
        <h2 className="sb-label">Locked tokens</h2>
        <p className="ds-note">No project, material or object may override these. A group ends in .* (color.brand.*).</p>
        <textarea className="v0-field" rows={3} defaultValue={g.locked.join(', ')} key={g.locked.join(',')} onBlur={(e) => setG({ ...g, locked: globs(e.target.value) }, 'Locks changed')} aria-label="Locked tokens" />
      </section>
      <section className="ds-card">
        <h2 className="sb-label">Where overrides are allowed</h2>
        {(['project', 'material', 'object'] as OverrideLevel[]).map((lvl) => (
          <label key={lvl} className="ds-field">
            A {lvl} may override
            <input className="v0-field" defaultValue={g.overridable[lvl].join(', ')} key={`${lvl}${g.overridable[lvl].join(',')}`} onBlur={(e) => setG({ ...g, overridable: { ...g.overridable, [lvl]: globs(e.target.value) } }, `${lvl} overrides changed`)} />
          </label>
        ))}
      </section>
      <section className="ds-card">
        <h2 className="sb-label">Rules every design is held to</h2>
        <ul>
          {c.intelligence
            .filter((i) => i.enforce === 'hard' && (i.status === 'confirmed' || i.status === 'approved'))
            .map((i) => (
              <li key={i.id}>{i.statement}</li>
            ))}
        </ul>
        <label className="ds-check">
          <input type="checkbox" checked={g.requireReview} onChange={(e) => setG({ ...g, requireReview: e.target.checked }, e.target.checked ? 'Publishing needs review' : 'Publishing without review')} /> Publishing shows every change and needs confirmation
        </label>
        <p className="ds-note">Owner: {rec.owner ? 'your account' : 'this browser'} · Workspace: personal. SocriaUX systems have one owner; they are never shared with another account.</p>
      </section>
    </div>
  );
}

// ── usage: the projects it reaches ──

function UsageTab({ rec, save, signedIn, projects, onOpenProject, onNewProject, onChanged }: { rec: SystemRecord; save: Save; signedIn: boolean; projects: ProjectSummary[]; onOpenProject: (id: string) => void; onNewProject: (kind: 'graphic' | 'board' | 'website' | 'guidelines' | 'guidelines-draft', rec: SystemRecord) => void; onChanged: () => void }) {
  const [full, setFull] = useState<DesignProject[]>([]);
  const [reports, setReports] = useState<Record<string, ApplyReport & { previous?: DesignProject['systemLink'] }>>({});
  const [preview, setPreview] = useState<Record<string, ApplyReport>>({});
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all(projects.map((s) => getProject(s.id))).then((ps) => setFull(ps.filter((x): x is DesignProject => !!x)));
  }, [projects, rec.id]);
  const linked = full.filter((x) => x.systemLink?.id === rec.id);
  const others = full.filter((x) => x.systemLink?.id !== rec.id);
  const latest = publishedContent(rec);
  const keep = async (proj: DesignProject) => {
    await putProject(proj);
    if (signedIn) await fetch('/api/ux-v0/projects', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: proj }) }).catch(() => undefined);
    setFull((xs) => xs.map((x) => (x.id === proj.id ? proj : x)));
  };
  const run = async (proj: DesignProject, how: 'apply' | 'propagate') => {
    setBusy(true);
    const previous = proj.systemLink;
    const r = how === 'apply' ? applySystem(proj, rec) : propagateTo(proj, rec);
    if (r.report.outcome !== 'error' && r.project !== proj) await keep(r.project);
    setReports((x) => ({ ...x, [proj.id]: { ...r.report, previous } }));
    await save(logged(rec, { action: how === 'apply' ? 'applied' : 'propagated', by: 'owner', summary: `${proj.name}: ${r.report.summary}`.slice(0, 400), version: r.report.version, detail: { project: proj.id, before: r.report.before ?? '' } }));
    setBusy(false);
    onChanged();
  };
  const all = async () => {
    for (const proj of linked) if (proj.systemLink?.pin === 'latest' && proj.systemLink.version !== rec.published) await run(proj, 'propagate');
  };
  if (!latest) return <p className="ds-note">Publish the system first: projects only read published versions, never the draft.</p>;
  return (
    <div>
      <section className="ds-card">
        <h2 className="sb-label">Projects in {rec.name}</h2>
        {!linked.length && <p className="ds-note">No project uses it yet.</p>}
        <ul className="ds-usage">
          {linked.map((proj) => {
            const link = proj.systemLink!;
            const rep = reports[proj.id];
            const pv = preview[proj.id];
            return (
              <li key={proj.id}>
                <div className="ds-usage-head">
                  <button type="button" className="sb-link" onClick={() => onOpenProject(proj.id)}>
                    {proj.name || 'Untitled'}
                  </button>
                  <span className="ds-desc">
                    {proj.medium ?? 'website'} · on v{link.version}
                    {link.pin === 'latest' ? ' · follows the latest' : ` · pinned to v${link.pin}`}
                    {link.version !== rec.published && link.pin === 'latest' ? ` · v${rec.published} available` : ''}
                  </span>
                  <select aria-label={`Version for ${proj.name}`} value={String(link.pin)} onChange={(e) => keep(setPin(proj, e.target.value === 'latest' ? 'latest' : Number(e.target.value)))}>
                    <option value="latest">Follow the latest</option>
                    {rec.versions.map((v) => (
                      <option key={v.n} value={v.n}>
                        Pin to v{v.n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ds-actions">
                  <button type="button" className="sb-btn is-sm" onClick={() => setPreview((x) => ({ ...x, [proj.id]: impactOn(proj, rec, link.pin === 'latest' ? latest : (publishedContent(rec, link.pin) ?? latest), link.pin === 'latest' ? rec.published : (link.pin as number)) }))}>
                    Preview the impact
                  </button>
                  <button type="button" className="sb-btn is-sm is-primary" disabled={busy} onClick={() => run(proj, link.pin === 'latest' ? 'propagate' : 'apply')}>
                    {link.pin === 'latest' ? 'Update to the latest' : `Apply v${link.pin}`}
                  </button>
                  {rep?.before && (
                    <button
                      type="button"
                      className="sb-btn is-sm"
                      onClick={async () => {
                        const u = undoApply(proj, rep);
                        if (u.ok) {
                          await keep(u.project);
                          await save(logged(rec, { action: 'propagation-undone', by: 'owner', summary: `${proj.name}: put back to ${rep.before}` }));
                          setReports((x) => ({ ...x, [proj.id]: { ...rep, before: undefined, summary: 'Put back as it was.' } }));
                        }
                      }}
                    >
                      Undo
                    </button>
                  )}
                  <button type="button" className="sb-link is-meta" onClick={() => keep(unlinkSystem(proj))}>
                    Unlink
                  </button>
                </div>
                <OverrideForm
                  rec={rec}
                  proj={proj}
                  onApply={async (overrides) => {
                    const r = applySystem(proj, rec, { overrides });
                    if (r.report.outcome !== 'error') await keep(r.project);
                    setReports((x) => ({ ...x, [proj.id]: { ...r.report, previous: proj.systemLink } }));
                  }}
                />
                {pv && <ReportView r={pv} />}
                {rep && <ReportView r={rep} />}
              </li>
            );
          })}
        </ul>
        {linked.some((x) => x.systemLink?.pin === 'latest' && x.systemLink.version !== rec.published) && (
          <button type="button" className="sb-btn is-primary" disabled={busy} onClick={all}>
            Update every project that follows the latest
          </button>
        )}
      </section>
      <section className="ds-card">
        <h2 className="sb-label">Apply it</h2>
        <div className="ds-actions">
          <select aria-label="A project to apply it to" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">An existing project…</option>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name || 'Untitled'} · {x.medium ?? 'website'}
              </option>
            ))}
          </select>
          <button type="button" className="sb-btn is-sm is-primary" disabled={!target || busy} onClick={() => run(others.find((x) => x.id === target)!, 'apply')}>
            Apply
          </button>
          <button type="button" className="sb-btn is-sm" onClick={() => onNewProject('graphic', rec)}>
            New graphic in it
          </button>
          <button type="button" className="sb-btn is-sm" onClick={() => onNewProject('board', rec)}>
            New board in it
          </button>
          <button type="button" className="sb-btn is-sm" disabled={!rec.published} title={rec.published ? 'Pages that state what this version holds: its colours, typefaces, logo and rules. No model is asked.' : 'Publish a version first: guidelines are written from what is approved'} onClick={() => onNewProject('guidelines', rec)}>
            Brand guidelines{rec.published ? ` (v${rec.published})` : ''}
          </button>
          <button type="button" className="sb-btn is-sm" title="A preview from the draft, marked DRAFT — NOT APPROVED on every page" onClick={() => onNewProject('guidelines-draft', rec)}>
            Preview guidelines from the draft
          </button>
          <button type="button" className="sb-btn is-sm" onClick={() => onNewProject('website', rec)}>
            New website in it
          </button>
        </div>
        <p className="ds-note">A project takes the system’s identity — colours, faces, the approved logo, its rules. Its compositions stay its own.</p>
        {target && reports[target] && <ReportView r={reports[target]} />}
      </section>
    </div>
  );
}

/** A project's own overrides of the system: only tokens governance lets a project override; references allowed. */
function OverrideForm({ rec, proj, onApply }: { rec: SystemRecord; proj: DesignProject; onApply: (overrides: Record<string, TokenValue>) => void }) {
  const c = publishedContent(rec) ?? rec.draft;
  const link = proj.systemLink!;
  const [path, setPath] = useState('');
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const allowed = Object.keys(c.tokens).filter((p0) => canOverride(c, 'project', p0).ok);
  const current = Object.entries(link.overrides);
  return (
    <details className="ds-overrides">
      <summary>
        Overrides for this project{current.length ? ` (${current.length})` : ''}
      </summary>
      {current.length > 0 && (
        <ul>
          {current.map(([k, v]) => (
            <li key={k}>
              <code>{k}</code> → {show(v)}{' '}
              <button
                type="button"
                className="sb-link is-meta"
                onClick={() => {
                  const next = { ...link.overrides };
                  delete next[k];
                  onApply(next);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="ds-add"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = canOverride(c, 'project', path);
          if (!ok.ok) return setErr(ok.why ?? 'Not allowed.');
          setErr('');
          onApply({ ...link.overrides, [path]: value.trim() });
          setValue('');
        }}
      >
        <select aria-label="Token to override" value={path} onChange={(e) => setPath(e.target.value)}>
          <option value="">A token this project may override…</option>
          {allowed.map((p0) => (
            <option key={p0}>{p0}</option>
          ))}
        </select>
        <input className="v0-field" aria-label="Override value" placeholder="#c8401c or {color.brand.roast}" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="submit" className="sb-btn is-sm" disabled={!path || !value.trim()}>
          Override
        </button>
      </form>
      {err && (
        <p className="ds-error" role="alert">
          {err}
        </p>
      )}
      <p className="ds-note">Locked tokens and tokens governance keeps for the system never appear here. The override reaches whatever refers to the token in this project only.</p>
    </details>
  );
}

function ReportView({ r }: { r: ApplyReport }) {
  return (
    <div className="ds-report" role="status">
      <p>{r.summary}</p>
      {r.changed.length > 0 && (
        <ul>
          {r.changed.slice(0, 12).map((c) => (
            <li key={c.slot}>
              {c.slot}: {String(c.from ?? '—')} → {String(c.to)}
            </li>
          ))}
        </ul>
      )}
      {r.kept.length > 0 && (
        <ul className="ds-kept">
          {r.kept.slice(0, 8).map((k, i) => (
            <li key={i}>
              Kept {k.what}: {k.why}
            </li>
          ))}
        </ul>
      )}
      {r.materials && (
        <p className="ds-desc">
          {r.materials.filter((m) => m.outcome === 'updated').length} of {r.materials.length} materials {r.outcome === 'updated' ? 'changed' : 'would change'}; {r.materials.reduce((s, m) => s + m.kept.length, 0)} local overrides kept.
        </p>
      )}
    </div>
  );
}

// ── versions ──

function VersionsTab({ rec, save }: { rec: SystemRecord; save: Save }) {
  const [open, setOpen] = useState<number | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="ds-overview">
      <section className="ds-card">
        <h2 className="sb-label">Published versions</h2>
        {!rec.versions.length && <p className="ds-note">Nothing published yet.</p>}
        <ul className="ds-versions">
          {[...rec.versions].reverse().map((v) => (
            <li key={v.n}>
              <div className="ds-usage-head">
                <strong>v{v.n}</strong> <span>{v.label}</span> <span className="ds-desc">{when(v.at)}</span>
                <button type="button" className="sb-link is-meta" onClick={() => setOpen(open === v.n ? null : v.n)}>
                  {open === v.n ? 'Hide changes' : 'Changes'}
                </button>
                {v.n !== rec.published && (
                  <button
                    type="button"
                    className="sb-btn is-sm"
                    onClick={() => {
                      const r = rollback(rec, v.n);
                      if (r.error) return setErr(r.error);
                      save(r.record, `Rolled back to v${v.n}, published as v${r.record.published}. Update projects from Usage.`);
                    }}
                  >
                    Roll back to v{v.n}
                  </button>
                )}
              </div>
              <p className="ds-desc">{v.summary}</p>
              {open === v.n && (
                <ul className="ds-log">
                  {(v.n > 1 ? compareVersions(rec, v.n - 1, v.n) ?? v.changes : v.changes).slice(0, 80).map((c, i) => (
                    <li key={i}>{c.summary}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {err && (
          <p className="ds-error" role="alert">
            {err}
          </p>
        )}
      </section>
      <section className="ds-card">
        <h2 className="sb-label">History</h2>
        <ul className="ds-audit">
          {[...rec.audit].reverse().slice(0, 120).map((a, i) => (
            <li key={i}>
              <span className="ds-desc">{when(a.at)}</span> <span className="ds-kind">{a.action}</span> {a.summary} <span className="ds-desc">— {a.by}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ── sync ──

/** The source read again, as content (GitHub, a website or Figma through the routes; files re-uploaded). */
async function readSource(rec: SystemRecord, files: File[] | null, token?: string): Promise<{ ok: true; upstreamId: string; content: SystemContent } | { ok: false; error: string }> {
  const src = rec.sync.source;
  if (!src) return { ok: false, error: 'This system has no source to sync with.' };
  try {
    if (src.kind === 'socriaux') {
      // made from another system here: its parent's published version (an experiment: its origin as it stands)
      const parent = await getSystem(src.ref);
      const r = checkParent(rec, parent);
      const content = parent ? (parentageOf(rec)?.relation === 'experiment' ? parent.draft : publishedContent(parent)) : null;
      if (!parent || !content) return { ok: false, error: r.error ?? 'The system it was made from has no published version.' };
      return { ok: true, upstreamId: parentageOf(rec)?.relation === 'experiment' ? `draft@${parent.updatedAt}` : `v${parent.published}`, content: JSON.parse(JSON.stringify(content)) };
    }
    if (src.kind === 'github') {
      const res = await fetch('/api/ux-v0/design-system', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: src.ref, raw: true }) });
      const j = await res.json();
      if (!res.ok) return { ok: false, error: j.error ?? 'GitHub could not be read.' };
      const texts = j.files.map((f: { path: string; text: string }) => ({ name: f.path, text: f.text }));
      const parts = [importJson(texts.filter((t: { name: string }) => /\.json$/i.test(t.name)), { ref: src.ref }).content, importCss(texts.filter((t: { name: string }) => /\.(css|scss)$/i.test(t.name)), { ref: src.ref }).content].filter((c) => Object.keys(c.tokens).length);
      if (!parts.length) return { ok: false, error: 'No tokens in the repository any more.' };
      const content = combineSources(parts).content;
      return { ok: true, upstreamId: contentId(content), content };
    }
    if (src.kind === 'website') {
      const res = await fetch('/api/ux-v0/design-system/site', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: src.ref }) });
      const j = await res.json();
      if (!res.ok) return { ok: false, error: j.error ?? 'The site could not be read.' };
      const content = normalizeContent(j.result.content);
      return { ok: true, upstreamId: contentId(content), content };
    }
    if (src.kind === 'figma') {
      const res = await fetch('/api/ux-v0/design-system/figma', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: src.ref, ...(token ? { token } : {}) }) });
      const j = await res.json();
      if (!res.ok) return { ok: false, error: `${j.error ?? 'Figma could not be read.'}${j.setup ? ` ${j.setup}` : ''}` };
      const content = normalizeContent(j.result.content);
      return { ok: true, upstreamId: j.file?.version ?? contentId(content), content };
    }
    if (!files?.length) return { ok: false, error: `Choose the source file again (${src.ref}) to compare it.` };
    const texts = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    let content: SystemContent;
    if (/\.pdf$/i.test(files[0].name)) {
      const { importPdf } = await import('@/lib/ux-v0/dsi/import-pdf');
      content = (await importPdf({ name: files[0].name, bytes: new Uint8Array(await files[0].arrayBuffer()) })).content;
    } else {
      const parts = [importJson(texts.filter((t) => /\.json$/i.test(t.name)), { ref: src.ref }).content, importCss(texts.filter((t) => /\.(css|scss|less)$/i.test(t.name)), { ref: src.ref }).content].filter((c) => Object.keys(c.tokens).length);
      if (!parts.length) return { ok: false, error: 'No tokens in those files.' };
      content = combineSources(parts).content;
    }
    return { ok: true, upstreamId: contentId(content), content };
  } catch {
    return { ok: false, error: 'The source could not be read just now.' };
  }
}

async function checkSource(rec: SystemRecord, files: File[] | null, token?: string) {
  const r = await readSource(rec, files, token);
  return recordCheck(rec, r);
}

function SyncTab({ rec, save }: { rec: SystemRecord; save: Save }) {
  const s = rec.sync;
  const [files, setFiles] = useState<File[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Record<string, SyncChoice>>({});
  const [msg, setMsg] = useState('');
  const diff = useMemo(() => (s.pending ? syncDiff(s.base, rec.draft, s.pending.content) : null), [s.pending, s.base, rec.draft]);
  const canRemote = s.source && ['github', 'website', 'figma'].includes(s.source.kind);
  const setSync = (next: Partial<typeof s>, say: string) => save({ ...rec, sync: { ...s, ...next }, updatedAt: Date.now() }, say);
  return (
    <div className="ds-overview">
      <section className="ds-card">
        <h2 className="sb-label">Source</h2>
        {s.source ? (
          <p>
            {s.source.kind}: <code>{s.source.ref}</code> · last synced {when(s.lastSynced)} · last checked {when(s.lastChecked)}
          </p>
        ) : (
          <p className="ds-note">Made here or imported without a source to come back to.</p>
        )}
        {s.error && (
          <p className="ds-error" role="alert">
            {s.error}
          </p>
        )}
        <fieldset className="ds-cats" disabled={!s.source}>
          <legend>How it syncs</legend>
          <label className="ds-check">
            <input type="radio" checked={s.mode === 'none'} onChange={() => setSync({ mode: 'none' }, 'One-time import: the source is not checked again')} /> One-time: imported once
          </label>
          <label className="ds-check">
            <input type="radio" checked={s.mode === 'manual'} onChange={() => setSync({ mode: 'manual' }, 'Manual sync')} /> Manual: you check, and compare before anything changes
          </label>
          <label className="ds-check">
            <input type="radio" checked={s.mode === 'managed'} disabled={!canRemote} onChange={() => setSync({ mode: 'managed' }, 'Managed sync: checked while SocriaUX is open')} /> Managed: checked every{' '}
            <input type="number" min={5} max={1440} value={s.intervalMin} onChange={(e) => setSync({ intervalMin: Math.max(5, Math.min(1440, Number(e.target.value) || 60)) }, 'Interval changed')} aria-label="Minutes between checks" /> minutes while SocriaUX is open{!canRemote ? ' (needs a GitHub, website or Figma source)' : ''}
          </label>
          <label className="ds-check">
            <input type="checkbox" checked={s.autoAccept} disabled={s.mode !== 'managed'} onChange={(e) => setSync({ autoAccept: e.target.checked }, e.target.checked ? 'Changes nobody made here come in on their own (into the draft)' : 'Every change waits for you')} /> Let changes nobody made here come into the draft on their own (conflicts always wait)
          </label>
        </fieldset>
        <div className="ds-actions">
          {s.source && !canRemote && <input type="file" multiple aria-label="The source file again" onChange={(e) => setFiles([...(e.target.files ?? [])])} />}
          {s.source?.kind === 'figma' && <input className="v0-field" type="password" autoComplete="off" placeholder="Figma token (used once)" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Figma token" />}
          <button
            type="button"
            className="sb-btn is-sm is-primary"
            disabled={!s.source || busy}
            onClick={async () => {
              setBusy(true);
              const r = await checkSource(rec, files, token || undefined);
              setToken('');
              await save(r.record, r.changed ? 'The source changed: review the update below.' : r.record.sync.error ? r.record.sync.error : 'The source has not changed.');
              setBusy(false);
            }}
          >
            {busy ? 'Checking…' : 'Check the source now'}
          </button>
        </div>
      </section>
      {s.pending && diff && (
        <section className="ds-card">
          <h2 className="sb-label">Update waiting (found {when(s.pending.at)})</h2>
          {diff.incoming.length > 0 && (
            <>
              <p>Changed only in the source ({diff.incoming.length}): these come in as they are.</p>
              <ul className="ds-log">
                {diff.incoming.slice(0, 60).map((i) => (
                  <li key={`${i.kind}${i.key}`}>{i.summary}</li>
                ))}
              </ul>
            </>
          )}
          {diff.conflicts.length > 0 && (
            <>
              <p>Changed on both sides ({diff.conflicts.length}): yours to settle.</p>
              <ul className="ds-conflicts">
                {diff.conflicts.map((c) => (
                  <li key={`${c.kind}${c.key}`}>
                    <p>
                      {c.summary} <em>— suggested: {c.suggested} ({c.reason})</em>
                    </p>
                    <div className="ds-choice" role="radiogroup" aria-label={`Settle ${c.key}`}>
                      {c.options.map((o) => (
                        <label key={o} className="ds-check">
                          <input type="radio" name={`sync-${c.key}`} checked={(choices[`${c.kind}:${c.key}`] ?? c.suggested) === o} onChange={() => setChoices((x) => ({ ...x, [`${c.kind}:${c.key}`]: o }))} /> {o === 'upstream' ? 'accept upstream' : o === 'local' ? 'keep local' : o === 'override' ? 'create override' : o}
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="ds-note">{diff.localOnly} change{diff.localOnly === 1 ? '' : 's'} made only here stay as they are. Everything lands in the draft: publish it when you are ready.</p>
          <button
            type="button"
            className="sb-btn is-primary"
            onClick={() => {
              const full = Object.fromEntries(diff.conflicts.map((c) => [`${c.kind}:${c.key}`, choices[`${c.kind}:${c.key}`] ?? c.suggested]));
              const r = applySync(rec, s.pending!.content, full, { upstreamId: s.pending!.upstream });
              setMsg(`${r.applied.length} applied${r.deferred.length ? `, ${r.deferred.length} deferred` : ''}.`);
              save(r.record, 'Synced into the draft.');
            }}
          >
            Bring it into the draft
          </button>
          {msg && <p className="ds-note">{msg}</p>}
        </section>
      )}
    </div>
  );
}

// ── export ──

function ExportTab({ rec, save }: { rec: SystemRecord; save: Save }) {
  const c = publishedContent(rec) ?? rec.draft;
  const which = rec.published ? `v${rec.published}` : 'the draft';
  const [busy, setBusy] = useState(false);
  const files = useMemo(() => exportAll(c, rec), [c, rec]);
  const note = (name: string) => save(logged(rec, { action: 'exported', by: 'owner', summary: `Exported ${name} (${which})` }));
  return (
    <div className="ds-overview">
      <section className="ds-card">
        <h2 className="sb-label">Export {which}</h2>
        <ul className="ds-exports">
          {files.map((f) => (
            <li key={f.name}>
              <button type="button" className="sb-btn is-sm" onClick={() => (download(f), note(f.name))}>
                {f.name}
              </button>
              <span className="ds-desc">{Math.max(1, Math.round(f.text.length / 1024))} KB</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="sb-btn is-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            for (const f of [...files, ...svgAssetFiles(c)]) zip.file(f.name, f.text);
            for (const a of c.assets) {
              if (a.svg && a.kind === 'logo') for (const w of [512, 1024]) {
                const png = await svgToPng(a.svg, w);
                if (png) zip.file(`assets/${a.name.replace(/[^\w-]+/g, '-')}${a.role ? `-${a.role}` : ''}-${w}.png`, png);
              }
              if (a.src?.startsWith('data:')) zip.file(`assets/${a.name.replace(/[^\w-]+/g, '-')}.${a.format === 'jpeg' ? 'jpg' : a.format}`, a.src.split(',')[1], { base64: true });
            }
            download({ name: `${c.identity.name.replace(/[^\w-]+/g, '-').toLowerCase()}-design-system.zip`, blob: await zip.generateAsync({ type: 'blob' }) });
            note('everything (.zip)');
            setBusy(false);
          }}
        >
          {busy ? 'Packing…' : 'Download everything (.zip)'}
        </button>
        <p className="ds-note">Tokens as W3C DTCG (with modes), Style Dictionary, CSS custom properties and SCSS; SocriaUX’s own JSON (reads back exactly); the guideline summary as Markdown and a printable page; logos as SVG and PNG. Exporting to a Figma library is not available.</p>
      </section>
      <section className="ds-card">
        <h2 className="sb-label">Preview: CSS</h2>
        <pre className="ds-pre">{exportCss(c).text.slice(0, 3000)}</pre>
        <h2 className="sb-label">Preview: DTCG</h2>
        <pre className="ds-pre">{exportDtcg(c)[0].text.slice(0, 2000)}</pre>
        <button type="button" className="sb-link" onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(exportGuidelinesHtml(c, rec).text); w.document.close(); } }}>
          Open the guideline summary
        </button>
      </section>
    </div>
  );
}

export { colourCategory };
