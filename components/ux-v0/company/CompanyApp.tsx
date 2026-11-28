'use client';
// components/ux-v0/company/CompanyApp.tsx — the company: what it is, what it makes, its brand and its library.
//
// One page, apart from any project. Everything on it is the company's own and stays until the person changes it:
// what it is (each statement with where it came from, and told to the designer only once confirmed), its products,
// the design system that is its brand (kept and versioned in the Design System Manager), its library of real assets
// (searched in plain words; a logo approved here is protected everywhere), and what it is known not to have.
// At the foot, exactly what the designer is told about the company on every request — nothing more is said.
//
// Projects are made FOR a company: they read this page, and never write to it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { approveAsset, assetHref, importAsset } from '@/lib/ux-v0/dsi/assets';
import { listSystems } from '@/lib/ux-v0/dsi/store';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { getArtifact, listProjects, putArtifact } from '@/lib/ux-v0/store';
import { fileId, type ProjectSummary } from '@/lib/ux-v0/types';
import { FACT_KINDS, FACT_LABEL, ITEM_WHATS, PRODUCT_STATUSES, WHAT_LABEL, addFact, addItem, editFact, emptyCompany, putProduct, removeFact, removeItem, removeProduct, setItem, setMissing, type Company, type FactKind, type ItemWhat, type LibraryItem } from '@/lib/ux-v0/company/schema';
import { candidatesFrom } from '@/lib/ux-v0/company/read';
import { currentCompanyId, deleteCompany, getCompany, listCompanies, pullCompanies, pushCompany, putCompany, setCurrentCompany } from '@/lib/ux-v0/company/store';
import { companyTold, findItems, knownMissing } from '@/lib/ux-v0/company/told';
import './company.css';

const urls = new Map<string, string>();
/** A library item's picture as an address this page can show (a file kept in this browser is read once). */
function useItemUrl(i: LibraryItem): string | null {
  const href = assetHref(i.asset);
  const [url, setUrl] = useState<string | null>(href && !href.startsWith('upload:') ? href : urls.get(href ?? '') ?? null);
  useEffect(() => {
    if (!href) return setUrl(null);
    if (!href.startsWith('upload:')) return setUrl(href);
    if (urls.has(href)) return setUrl(urls.get(href)!);
    let live = true;
    void getArtifact(href.slice('upload:'.length)).then((rec) => {
      if (!rec) return;
      const u = URL.createObjectURL(rec.data);
      urls.set(href, u);
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [href]);
  return url;
}

function Thumb({ item }: { item: LibraryItem }) {
  const url = useItemUrl(item);
  if (item.asset.kind === 'font') return <span className="co-thumb is-font">{item.asset.font?.family?.slice(0, 2) || 'Aa'}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="co-thumb">{url ? <img src={url} alt="" /> : <em>not in this browser</em>}</span>;
}

/** One line of text edited in place: committed on blur or Enter. */
function Line({ value, onCommit, placeholder, label, multiline }: { value: string; onCommit: (v: string) => void; placeholder?: string; label: string; multiline?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v.trim() !== value && onCommit(v.trim());
  return multiline ? (
    <textarea className="co-in" aria-label={label} value={v} rows={Math.min(5, Math.max(1, Math.ceil(v.length / 70)))} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  ) : (
    <input className="co-in" aria-label={label} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

export function CompanyApp({ signedIn, initialId, onExit, onOpenProject, onOpenSystems }: { signedIn: boolean; initialId: string | null; onExit: () => void; onOpenProject: (id: string) => void; onOpenSystems: (id?: string | null) => void }) {
  const [all, setAll] = useState<Company[]>([]);
  const [c, setC] = useState<Company | null>(null);
  const [ready, setReady] = useState(false);
  const [systems, setSystems] = useState<SystemRecord[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [account, setAccount] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      if (signedIn) await pullCompanies().catch(() => undefined);
      const list = await listCompanies();
      if (!live) return;
      setAll(list);
      setCurrent(currentCompanyId());
      const pick = (initialId && list.find((x) => x.id === initialId)) || list.find((x) => x.id === currentCompanyId()) || list[0] || null;
      setC(pick);
      setReady(true);
      setSystems((await listSystems().catch(() => [])).filter((r) => r.status === 'active'));
      setProjects(await listProjects().catch(() => []));
    })();
    return () => {
      live = false;
    };
  }, [initialId, signedIn]);

  // kept at once in this browser; the account's copy follows a moment later
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = useCallback(
    (fn: (x: Company) => Company) => {
      setC((x) => {
        if (!x) return x;
        const next = fn(x);
        if (next === x) return x;
        void putCompany(next);
        setAll((list) => list.map((y) => (y.id === next.id ? next : y)));
        if (signedIn) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void pushCompany(next).then((r) => setAccount(r.ok ? 'Kept in your account.' : r.stale ? 'A newer copy is in your account: reload to see it.' : r.error ?? '')), 1500);
        }
        return next;
      });
    },
    [signedIn]
  );

  const create = async (name: string) => {
    const made = emptyCompany(name);
    await putCompany(made);
    setAll((l) => [made, ...l]);
    setC(made);
    if (!currentCompanyId()) {
      setCurrentCompany(made.id);
      setCurrent(made.id);
    }
  };

  // ── the library ──
  const [query, setQuery] = useState('');
  const found = useMemo(() => (c ? (query.trim() ? findItems(c, query, { includeRetired: true }).map((f) => f.item) : c.library) : []), [c, query]);
  const addFiles = async (files: FileList) => {
    if (!c) return;
    const notes: string[] = [];
    let next = c;
    let n = 0;
    for (const f of Array.from(files).slice(0, 24)) {
      const r = await importAsset(
        { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type },
        {
          source: { kind: 'asset', ref: f.name, file: f.name },
          store: async (bytes, mime) => {
            const id = fileId();
            const kept = await putArtifact({ id, name: f.name, type: mime, data: new Blob([bytes as BlobPart], { type: mime }), bytes: bytes.length, createdAt: Date.now() });
            return kept.ok ? `upload:${id}` : null;
          },
        }
      );
      notes.push(...r.notes, ...(r.error ? [r.error] : []));
      if (!r.asset) continue;
      const a = addItem(next, r.asset);
      if (!a.added) notes.push(`${f.name} is already in the library.`);
      else n++;
      next = a.company;
    }
    if (n) change(() => next);
    setMsg([n ? `Added ${n} file${n === 1 ? '' : 's'}. Nothing is approved until you approve it.` : '', ...notes].filter(Boolean).join(' '));
  };

  // ── something it has written, read for what it says about itself ──
  const [paste, setPaste] = useState('');
  const [from, setFrom] = useState('');
  const read = (text: string, where: string) => {
    const cands = candidatesFrom(text);
    if (!cands.length) return setMsg('Nothing in that text reads as a statement about what the company is. Add what matters by hand above.');
    change((x) => cands.reduce((acc, k) => addFact(acc, { kind: k.kind, text: k.text, source: 'imported', from: where || 'pasted text' }), x));
    setMsg(`Found ${cands.length} statement${cands.length === 1 ? '' : 's'} in ${where || 'the pasted text'}, quoted as written. None is used until you confirm it.`);
    setPaste('');
  };

  if (!ready) return <div className="co sb" />;
  const told = c ? companyTold(c) : null;
  const mine = c ? projects.filter((p) => p.companyId === c.id) : [];
  const waiting = c ? c.facts.filter((f) => !f.confirmed).length : 0;

  return (
    <div className="co sb">
      <header className="v0-head">
        <div className="v0-head-l">
          <button type="button" className="v0-home" onClick={onExit} aria-label="Back to SocriaUX">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socria-mark.png" alt="" width={20} height={20} />
            <span className="v0-brand">
              Socria<em>UX</em>
            </span>
            <span className="v0-tag">Company</span>
          </button>
        </div>
        <div className="v0-head-r">
          {all.length > 1 && (
            <select className="co-pick" aria-label="Company" value={c?.id ?? ''} onChange={(e) => setC(all.find((x) => x.id === e.target.value) ?? null)}>
              {all.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          <span className="gx-free" title="Nothing on this page asks a model for anything.">
            No model calls · $0
          </span>
          <button
            type="button"
            className="sb-btn is-sm"
            onClick={() => {
              const name = window.prompt('The company’s name');
              if (name?.trim()) void create(name);
            }}
          >
            Add a company
          </button>
        </div>
      </header>

      {!c ? (
        <main className="co-main">
          <section className="co-empty">
            <h1>Your company</h1>
            <p>What a company is outlives any one project. Keep it here — what it is for, what it makes, its brand, its real logos and pictures — and everything made for it is made within it. Nothing here is ever changed by a project, and nothing about the company is invented.</p>
            <form
              className="co-row"
              onSubmit={(e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get('name') ?? '');
                if (name.trim()) void create(name);
              }}
            >
              <input className="co-in" name="name" placeholder="The company’s name" aria-label="The company’s name" />
              <button type="submit" className="sb-btn is-primary">
                Begin
              </button>
            </form>
          </section>
        </main>
      ) : (
        <main className="co-main">
          <section className="co-card co-top">
            <Line label="Company name" value={c.name} onCommit={(v) => v && change((x) => ({ ...x, name: v.slice(0, 80), updatedAt: Date.now() }))} />
            <label className="co-check">
              <input
                type="checkbox"
                checked={current === c.id}
                onChange={(e) => {
                  setCurrentCompany(e.target.checked ? c.id : null);
                  setCurrent(e.target.checked ? c.id : null);
                }}
              />
              <span>New work in this browser is made for {c.name}</span>
            </label>
            <p className="co-note">
              {signedIn ? account || 'Kept in this browser and in your account. The library’s files stay in this browser.' : 'Kept in this browser. Sign in to keep it in your account too.'}
              {waiting ? ` ${waiting} statement${waiting === 1 ? ' is' : 's are'} waiting to be confirmed.` : ''}
            </p>
            {msg && (
              <p className="co-msg" role="status">
                {msg}{' '}
                <button type="button" className="sb-link is-meta" onClick={() => setMsg('')}>
                  Dismiss
                </button>
              </p>
            )}
          </section>

          <section className="co-card" aria-label="What the company is">
            <h2>What it is</h2>
            <p className="co-note">Each statement says where it came from. Only what you have confirmed is told to the designer.</p>
            {FACT_KINDS.map((k) => (
              <FactGroup key={k} kind={k} company={c} change={change} />
            ))}
            <details className="co-read">
              <summary>Read something the company has written</summary>
              <p className="co-note">A page of its site, its charter, a brand note. SocriaUX quotes the sentences that say what the company is; it does not summarize or infer. You confirm each one.</p>
              <input className="co-in" aria-label="Where this text is from" placeholder="Where it is from (a file’s name, an address)" value={from} onChange={(e) => setFrom(e.target.value)} />
              <textarea className="co-in" aria-label="Text to read" rows={5} placeholder="Paste the text here" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <div className="co-row">
                <button type="button" className="sb-btn is-sm" disabled={!paste.trim()} onClick={() => read(paste, from.trim())}>
                  Read it
                </button>
                <label className="sb-btn is-sm">
                  Read a text file
                  <input
                    type="file"
                    accept=".txt,.md,text/plain,text/markdown"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) read((await f.text()).slice(0, 200_000), f.name);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </details>
          </section>

          <section className="co-card" aria-label="Products">
            <h2>Products</h2>
            <p className="co-note">What each is, in the company’s own words. A product with nothing written beside it is named and nothing more — the designer is told not to describe it.</p>
            <ul className="co-products">
              {c.products.map((p) => (
                <li key={p.id}>
                  <Line label="Product name" value={p.name} onCommit={(v) => v && change((x) => putProduct(x, { ...p, name: v }))} />
                  <Line label={`What ${p.name} is`} value={p.what} placeholder="What it is (not supplied)" onCommit={(v) => change((x) => putProduct(x, { ...p, what: v }))} multiline />
                  <Line label={`Who ${p.name} is for`} value={p.audience} placeholder="Who it is for" onCommit={(v) => change((x) => putProduct(x, { ...p, audience: v }))} />
                  <select aria-label={`${p.name} status`} value={p.status} onChange={(e) => change((x) => putProduct(x, { ...p, status: e.target.value as (typeof PRODUCT_STATUSES)[number] }))}>
                    {PRODUCT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select aria-label={`${p.name} design system`} value={p.systemId ?? ''} onChange={(e) => change((x) => putProduct(x, { ...p, systemId: e.target.value || null }))} title="A product’s own design system, within the company’s">
                    <option value="">Uses the company’s brand</option>
                    {systems.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.published ? ` v${r.published}` : ' (draft)'}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="sb-link is-meta" onClick={() => change((x) => removeProduct(x, p.id))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <AddLine label="Add a product" placeholder="A product’s name" onAdd={(v) => change((x) => putProduct(x, { name: v }))} />
          </section>

          <section className="co-card" aria-label="Brand">
            <h2>Brand</h2>
            <p className="co-note">The company’s identity as a design system: its colours, type, logos and rules, with drafts, versions and approvals. It changes only when a new version is published there — never from a project.</p>
            <div className="co-row">
              <select aria-label="The company’s design system" value={c.systemId ?? ''} onChange={(e) => change((x) => ({ ...x, systemId: e.target.value || null, updatedAt: Date.now() }))}>
                <option value="">No design system yet</option>
                {systems.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.published ? ` — v${r.published} published` : ' — draft, not published'}
                  </option>
                ))}
              </select>
              <button type="button" className="sb-btn is-sm" onClick={() => onOpenSystems(c.systemId)}>
                {c.systemId ? 'Open it' : 'Import or build one'}
              </button>
            </div>
            {c.systemId && !systems.find((r) => r.id === c.systemId)?.published ? <p className="co-note">It has no published version yet: a draft is never applied to work.</p> : null}
          </section>

          <section className="co-card" aria-label="Library">
            <h2>Library</h2>
            <p className="co-note">The company’s real files. A design uses them as they are or not at all: SocriaUX never draws something to stand in for a logo, a photograph or a screenshot it does not have.</p>
            <div className="co-row">
              <input className="co-in co-search" type="search" aria-label="Find in the library" placeholder="Find in plain words: “the approved logo”, “screenshots of Logos”" value={query} onChange={(e) => setQuery(e.target.value)} />
              <label className="sb-btn is-sm is-primary">
                Add files
                <input type="file" multiple hidden accept=".svg,.png,.jpg,.jpeg,.webp,.ttf,.otf,.woff,.woff2" onChange={(e) => e.target.files?.length && (void addFiles(e.target.files), (e.target.value = ''))} />
              </label>
            </div>
            {query.trim() && !found.length ? (
              <p className="co-msg" role="status">
                Nothing in the library matches “{query.trim()}”. It is not there, and nothing will be made up in its place.
              </p>
            ) : null}
            {!c.library.length ? <p className="co-note">Nothing yet. Add logos (SVG where you have it), product screenshots, photographs, icons, fonts.</p> : null}
            <ul className="co-library">
              {found.map((i) => (
                <li key={i.asset.id} className={`${i.asset.approved ? 'is-approved' : ''}${i.retired ? ' is-retired' : ''}`} data-item={i.asset.name}>
                  <Thumb item={i} />
                  <div className="co-item">
                    <Line label="Name" value={i.asset.name} onCommit={(v) => v && change((x) => setItem(x, i.asset.id, { asset: { ...i.asset, name: v.slice(0, 120) } }))} />
                    <span className="co-meta">
                      {i.asset.format.toUpperCase()}
                      {i.asset.width ? ` · ${Math.round(i.asset.width)}×${Math.round(i.asset.height ?? 0)}` : ''} · {Math.max(1, Math.round(i.asset.bytes / 1024))} KB{i.asset.vector ? ' · vector' : ''}
                      {i.asset.lowRes ? ' · low resolution (a reference, not a master)' : ''}
                      {i.asset.font ? ` · ${i.asset.font.family} ${i.asset.font.subfamily}${i.asset.font.licence ? '' : ' · no licence in the file'}` : ''}
                    </span>
                    <div className="co-row">
                      <select aria-label="What it is" value={i.what} onChange={(e) => change((x) => setItem(x, i.asset.id, { what: e.target.value as ItemWhat }))}>
                        {ITEM_WHATS.map((w) => (
                          <option key={w} value={w}>
                            {WHAT_LABEL[w]}
                          </option>
                        ))}
                      </select>
                      <select aria-label="Product" value={i.product ?? ''} onChange={(e) => change((x) => setItem(x, i.asset.id, { product: e.target.value || null }))}>
                        <option value="">The company</option>
                        {c.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Line label="Description" value={i.description} placeholder="What it shows, in a sentence" onCommit={(v) => change((x) => setItem(x, i.asset.id, { description: v }))} />
                    <Line label="Tags" value={i.tags.join(', ')} placeholder="Tags, separated by commas" onCommit={(v) => change((x) => setItem(x, i.asset.id, { tags: v.split(',') }))} />
                    <Line label="Rights" value={i.rights} placeholder="Rights (ours; licensed from …)" onCommit={(v) => change((x) => setItem(x, i.asset.id, { rights: v }))} />
                    <div className="co-row">
                      <label className="co-check">
                        <input type="checkbox" checked={i.asset.approved} onChange={(e) => change((x) => setItem(x, i.asset.id, { asset: approveAsset(i.asset, e.target.checked) }))} />
                        <span>Approved{i.asset.protected ? ' · protected' : ''}</span>
                      </label>
                      <label className="co-check">
                        <input type="checkbox" checked={i.people} onChange={(e) => change((x) => setItem(x, i.asset.id, { people: e.target.checked }))} />
                        <span>Shows real people</span>
                      </label>
                      <button type="button" className="sb-link is-meta" onClick={() => change((x) => setItem(x, i.asset.id, { retired: !i.retired }))}>
                        {i.retired ? 'Bring back' : 'Retire'}
                      </button>
                      <button type="button" className="sb-link is-meta" onClick={() => window.confirm(`Remove ${i.asset.name} from the library? Designs that use it will show nothing in its place.`) && change((x) => removeItem(x, i.asset.id))}>
                        Remove
                      </button>
                    </div>
                    {i.asset.notes.length ? <span className="co-meta">{i.asset.notes.join(' · ')}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="co-card" aria-label="Not available">
            <h2>Known to be missing</h2>
            <p className="co-note">What the company does not have. The designer is told, so the work says so instead of inventing it.</p>
            <ul className="co-facts">
              {knownMissing({ ...c, missing: [] }).map((m) => (
                <li key={m} className="is-derived">
                  <span>{m}</span>
                  <em>from the library and products above</em>
                </li>
              ))}
              {c.missing.map((m) => (
                <li key={m}>
                  <span>{m}</span>
                  <button type="button" className="sb-link is-meta" onClick={() => change((x) => setMissing(x, x.missing.filter((y) => y !== m)))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <AddLine label="Add something that is missing" placeholder="“Photographs of the team”, “Stratus: nothing has been supplied”" onAdd={(v) => change((x) => setMissing(x, [...x.missing, v]))} />
          </section>

          <section className="co-card" aria-label="Projects">
            <h2>Made for {c.name}</h2>
            {!mine.length ? <p className="co-note">Nothing yet. With “New work is made for {c.name}” on, everything you begin belongs here.</p> : null}
            <ul className="co-projects">
              {mine.map((p) => (
                <li key={p.id}>
                  <button type="button" className="sb-link" onClick={() => onOpenProject(p.id)}>
                    {p.name}
                  </button>
                  <span className="co-meta">
                    {p.graphic ?? p.mode} · {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="co-card co-told" aria-label="What the designer is told">
            <h2>What the designer is told</h2>
            <p className="co-note">Exactly this, on every request made for {c.name} — and nothing else about the company.</p>
            {told && (
              <dl>
                {told.about.length ? (
                  <>
                    <dt>About</dt>
                    {told.about.map((x) => (
                      <dd key={x}>{x}</dd>
                    ))}
                  </>
                ) : null}
                {told.products.length ? (
                  <>
                    <dt>Products</dt>
                    {told.products.map((x) => (
                      <dd key={x}>{x}</dd>
                    ))}
                  </>
                ) : null}
                {told.audiences.length ? (
                  <>
                    <dt>Who it is for</dt>
                    {told.audiences.map((x) => (
                      <dd key={x}>{x}</dd>
                    ))}
                  </>
                ) : null}
                {told.principles.length ? (
                  <>
                    <dt>It holds to</dt>
                    {told.principles.map((x) => (
                      <dd key={x}>{x}</dd>
                    ))}
                  </>
                ) : null}
                {told.avoid.length ? (
                  <>
                    <dt>Turned down, for good</dt>
                    {told.avoid.map((x) => (
                      <dd key={x}>{x}</dd>
                    ))}
                  </>
                ) : null}
                <dt>Not available — say so rather than invent</dt>
                {told.missing.map((x) => (
                  <dd key={x}>{x}</dd>
                ))}
                {!told.missing.length ? <dd>Nothing is recorded as missing.</dd> : null}
              </dl>
            )}
            <button
              type="button"
              className="sb-link is-meta co-danger"
              onClick={async () => {
                if (!window.confirm(`Delete ${c.name} from this browser? Its projects stay; they will no longer be made for a company.`)) return;
                await deleteCompany(c.id);
                if (signedIn) await fetch(`/api/ux-v0/systems?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' }).catch(() => undefined);
                const list = await listCompanies();
                setAll(list);
                setC(list[0] ?? null);
              }}
            >
              Delete this company
            </button>
          </section>
        </main>
      )}
    </div>
  );
}

function AddLine({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const add = () => {
    if (!v.trim()) return;
    onAdd(v.trim());
    setV('');
  };
  return (
    <div className="co-row co-add">
      <input className="co-in" aria-label={label} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      <button type="button" className="sb-btn is-sm" onClick={add} disabled={!v.trim()}>
        Add
      </button>
    </div>
  );
}

const SOURCE: Record<string, string> = { stated: 'you said so', imported: 'found in', inferred: 'inferred from' };

function FactGroup({ kind, company, change }: { kind: FactKind; company: Company; change: (fn: (x: Company) => Company) => void }) {
  const facts = company.facts.filter((f) => f.kind === kind);
  const L = FACT_LABEL[kind];
  return (
    <div className="co-group" data-kind={kind}>
      <h3>
        {L.title} <small>{L.hint}</small>
      </h3>
      <ul className="co-facts">
        {facts.map((f) => (
          <li key={f.id} className={f.confirmed ? '' : 'is-waiting'}>
            <Line label={L.title} value={f.text} multiline onCommit={(v) => v && change((x) => editFact(x, f.id, { text: v }))} />
            <span className="co-meta">
              {SOURCE[f.source]}
              {f.source !== 'stated' && f.from ? ` ${f.from}` : ''}
              {f.confirmed ? '' : ' · not confirmed, not used'}
            </span>
            <span className="co-acts">
              {!f.confirmed ? (
                <button type="button" className="sb-btn is-sm" onClick={() => change((x) => editFact(x, f.id, { confirmed: true }))}>
                  Confirm
                </button>
              ) : f.source !== 'stated' ? (
                <button type="button" className="sb-link is-meta" onClick={() => change((x) => editFact(x, f.id, { confirmed: false }))}>
                  Unconfirm
                </button>
              ) : null}
              <select aria-label="Kind" value={f.kind} onChange={(e) => change((x) => editFact(x, f.id, { kind: e.target.value as FactKind }))}>
                {FACT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {FACT_LABEL[k].title}
                  </option>
                ))}
              </select>
              <button type="button" className="sb-link is-meta" onClick={() => change((x) => removeFact(x, f.id))}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      <AddLine label={`Add: ${L.title}`} placeholder={L.hint} onAdd={(v) => change((x) => addFact(x, { kind, text: v }))} />
    </div>
  );
}
