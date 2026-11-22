'use client';
// components/ux-v0/systems/ImportWizard.tsx — bringing a design system in, step by step, every step real.
//
//   1 source      JSON tokens, CSS variables, brand guidelines (PDF), a website, a Figma file, logos and assets, a
//                 GitHub repository, or a SocriaUX project
//   2 categories  what to bring (colours, typography, layout, effects, components, assets, brand rules) and where
//                 (a new system, or into one that exists)
//   3 analyse     the importer runs; each stage is shown as it completes (nothing is shown before it happens)
//   4 preview     what was found, with where it came from and how sure: inferences marked as such; logos to approve
//   5 conflicts   between sources, or with the system it goes into: keep, replace, rename, merge or skip
//   6 confirm     what will be created; publish it as version 1 now, or keep it as a draft
//   7 apply       to a project, a new graphic, board or website, or as the workspace default
//
// Files are read in this browser; a website, Figma and GitHub go through SocriaUX's routes (signed in). No model.

import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeBrand } from '@/lib/ux-v0/dsi/intelligence';
import { approveAsset, importAsset } from '@/lib/ux-v0/dsi/assets';
import { census, topCategory } from '@/lib/ux-v0/dsi/classify';
import { hexOf } from '@/lib/ux-v0/dsi/colour';
import { guidelinesContent, markdownBlocks, readGuidelines } from '@/lib/ux-v0/dsi/guidelines';
import { importCss } from '@/lib/ux-v0/dsi/import-css';
import { importJson, type ImportIssue } from '@/lib/ux-v0/dsi/import-json';
import { applyMerge, combineSources, planMerge, type Choice, type Conflict, type Resolution } from '@/lib/ux-v0/dsi/merge';
import { extractFromProject } from '@/lib/ux-v0/dsi/project-extract';
import { newRecord, publish, updateDraft, type ImportRecord, type SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { normalizeContent, uid, type BrandAsset, type SourceKind, type SystemContent } from '@/lib/ux-v0/dsi/schema';
import { resolveToken } from '@/lib/ux-v0/dsi/tokens';
import { contentId } from '@/lib/ux-v0/dsi/sync';
import { getProject, putArtifact } from '@/lib/ux-v0/store';
import type { ProjectSummary } from '@/lib/ux-v0/types';

type Kind = 'json' | 'css' | 'pdf' | 'website' | 'figma' | 'assets' | 'github' | 'project';
const SOURCES: { kind: Kind; title: string; what: string }[] = [
  { kind: 'json', title: 'Design tokens (JSON)', what: 'W3C DTCG, Tokens Studio, Style Dictionary, Figma variables JSON, or a SocriaUX export' },
  { kind: 'css', title: 'CSS variables', what: 'A stylesheet that sets custom properties on :root and for themes' },
  { kind: 'pdf', title: 'Brand guidelines (PDF)', what: 'Colours, typefaces, rules and tone, each with its page' },
  { kind: 'website', title: 'A website', what: 'A public page’s CSS, reconstructed — every token marked inferred' },
  { kind: 'figma', title: 'A Figma file', what: 'Variables, styles, components and logos, through Figma’s API' },
  { kind: 'assets', title: 'Logos and assets', what: 'SVG, PNG, JPEG, WebP and font files' },
  { kind: 'github', title: 'A GitHub repository', what: 'Token files, CSS variables and guidelines from a public repository' },
  { kind: 'project', title: 'A SocriaUX project', what: 'The identity of a website, graphic or board you made here' },
];
const CATS = [
  ['colour', 'Colours'],
  ['typography', 'Typography'],
  ['layout', 'Layout (spacing, radius, sizes)'],
  ['effects', 'Effects (shadows, motion)'],
  ['components', 'Components'],
  ['assets', 'Logos and assets'],
  ['rules', 'Brand rules and intelligence'],
] as const;
type Cat = (typeof CATS)[number][0];
const STEPS = ['Source', 'Categories', 'Analyse', 'Preview', 'Conflicts', 'Confirm', 'Apply'] as const;

interface Stage {
  label: string;
  state: 'running' | 'done' | 'failed';
  detail?: string;
}

export interface WizardDone {
  record: SystemRecord;
  created: boolean;
}

const readText = (f: File) => f.text();
const kindOf = (name: string) => (/\.json$/i.test(name) ? 'json' : /\.(css|scss|less)$/i.test(name) ? 'css' : /\.(md|mdx|txt)$/i.test(name) ? 'md' : 'other');

/** The categories kept: tokens, components, assets and statements outside them dropped. */
function filterCategories(c: SystemContent, cats: ReadonlySet<Cat>): SystemContent {
  const tokens = Object.fromEntries(
    Object.entries(c.tokens).filter(([, t]) => {
      const top = topCategory(t);
      return top === 'other' ? cats.has('layout') || cats.has('colour') : cats.has(top as Cat);
    }),
  );
  const roles = Object.fromEntries(Object.entries(c.roles).filter(([, b]) => b && tokens[b.path]));
  return { ...c, tokens, roles, components: cats.has('components') ? c.components : [], assets: cats.has('assets') ? c.assets : [], intelligence: cats.has('rules') ? c.intelligence : [] };
}

/** What the studio's conversation already settled: where the system is, its files or address, the parts wanted. */
export interface WizardStart {
  kind: string;
  files: File[];
  url: string;
  projectId: string;
  parts: string[];
}

const isKind = (k: string): k is Kind => SOURCES.some((x) => x.kind === k);

export function ImportWizard(p: { signedIn: boolean; records: readonly SystemRecord[]; projects: readonly ProjectSummary[]; intoId?: string; onCancel: () => void; onDone: (d: WizardDone) => void; onApply: (rec: SystemRecord) => void; initial?: WizardStart | null }) {
  const given = p.initial && isKind(p.initial.kind) ? p.initial : null;
  const givenReady = !!given && (['json', 'css', 'pdf', 'assets'].includes(given.kind) ? given.files.length > 0 : given.kind === 'project' ? !!given.projectId : given.url.trim().length > 3);
  const [step, setStep] = useState(givenReady ? 1 : 0);
  const [kind, setKind] = useState<Kind | null>(given ? (given.kind as Kind) : null);
  const [files, setFiles] = useState<File[]>(given?.files ?? []);
  const [url, setUrl] = useState(given?.url ?? '');
  const [token, setToken] = useState('');
  const [projectId, setProjectId] = useState(given?.kind === 'project' ? given.projectId : '');
  const [cats, setCats] = useState<Set<Cat>>(() => {
    const wanted = (given?.parts ?? []).filter((x): x is Cat => CATS.some((c) => c[0] === x));
    return new Set(wanted.length ? wanted : CATS.map((c) => c[0]));
  });
  const [into, setInto] = useState<string>(p.intoId ?? 'new');
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState('');
  const [content, setContent] = useState<SystemContent | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [sourceConflicts, setSourceConflicts] = useState<Conflict[]>([]);
  const [parts, setParts] = useState<SystemContent[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [fetched, setFetched] = useState<string[]>([]);
  const [publishNow, setPublishNow] = useState(true);
  const [made, setMade] = useState<SystemRecord | null>(null);
  const [source, setSource] = useState<{ kind: SourceKind; ref: string; files: string[]; upstream?: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const target = p.records.find((r) => r.id === into) ?? null;

  const accept = kind === 'json' ? '.json,.md,.mdx' : kind === 'css' ? '.css,.scss,.less' : kind === 'pdf' ? '.pdf,application/pdf' : kind === 'assets' ? '.svg,.png,.jpg,.jpeg,.webp,.ttf,.otf,.woff,.woff2' : '';
  const ready = !!kind && (['json', 'css', 'pdf', 'assets'].includes(kind) ? files.length > 0 : kind === 'project' ? !!projectId : url.trim().length > 3 && (kind !== 'figma' || true));

  const stage = (label: string) => {
    setStages((s) => [...s, { label, state: 'running' }]);
    return {
      done: (detail?: string) => setStages((s) => s.map((x) => (x.label === label ? { ...x, state: 'done', ...(detail ? { detail } : {}) } : x))),
      fail: (detail: string) => setStages((s) => s.map((x) => (x.label === label ? { ...x, state: 'failed', detail } : x))),
    };
  };

  const analyse = async () => {
    setStep(2);
    setStages([]);
    setError('');
    setSetup('');
    setIssues([]);
    setNotes([]);
    setFetched([]);
    const now = Date.now();
    const contents: SystemContent[] = [];
    const allIssues: ImportIssue[] = [];
    const allNotes: string[] = [];
    try {
      if (kind === 'json' || kind === 'css' || kind === 'github') {
        let texts: { name: string; text: string }[] = [];
        let ref = files.map((f) => f.name).join(', ').slice(0, 200);
        if (kind === 'github') {
          const s = stage('Reading the repository on GitHub');
          const res = await fetch('/api/ux-v0/design-system', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.trim(), raw: true }) });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error ?? 'GitHub could not be read.');
          texts = j.files.map((f: { path: string; text: string }) => ({ name: f.path, text: f.text }));
          ref = j.ref;
          s.done(`${texts.length} files: ${texts.map((t) => t.name).join(', ').slice(0, 160)}`);
          setSource({ kind: 'github', ref: url.trim(), files: texts.map((t) => t.name), upstream: `${j.at}` });
        } else {
          const s = stage(`Reading ${files.length} file${files.length === 1 ? '' : 's'}`);
          texts = await Promise.all(files.map(async (f) => ({ name: f.name, text: await readText(f) })));
          s.done(texts.map((t) => `${t.name} (${Math.round(t.text.length / 1024)} KB)`).join(', '));
        }
        const json = texts.filter((t) => kindOf(t.name) === 'json');
        const css = texts.filter((t) => kindOf(t.name) === 'css');
        const md = texts.filter((t) => kindOf(t.name) === 'md');
        if (json.length) {
          const s = stage('Parsing design tokens');
          const r = importJson(json, { now, ref });
          contents.push(r.content);
          allIssues.push(...r.issues);
          allNotes.push(...r.notes);
          r.issues.some((i) => i.severity === 'error' && !i.path) ? s.fail(r.issues.find((i) => i.severity === 'error')!.message) : s.done(`${r.format}: ${Object.keys(r.content.tokens).length} tokens`);
        }
        if (css.length) {
          const s = stage('Reading CSS custom properties');
          const r = importCss(css, { now, ref });
          contents.push(r.content);
          allIssues.push(...r.issues);
          allNotes.push(...r.notes);
          s.done(`${Object.keys(r.content.tokens).length} variables, modes ${r.content.modes.join(', ')}`);
        }
        if (md.length) {
          const s = stage('Reading the guidelines');
          for (const m of md) {
            const facts = readGuidelines(markdownBlocks(m.text), { kind: 'markdown', ref, file: m.name });
            const g = guidelinesContent(facts, { kind: 'markdown', ref, file: m.name }, { now });
            contents.push(g.content);
            allNotes.push(...g.notes);
          }
          s.done(`${md.length} document${md.length === 1 ? '' : 's'}`);
        }
        if (kind !== 'github') setSource({ kind: json.length ? 'json' : css.length ? 'css' : 'markdown', ref, files: texts.map((t) => t.name) });
      } else if (kind === 'pdf') {
        const f = files[0];
        const s = stage(`Reading ${f.name} with pdf.js (scripts off)`);
        const { importPdf } = await import('@/lib/ux-v0/dsi/import-pdf');
        const r = await importPdf({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }, { now });
        contents.push(r.content);
        allIssues.push(...r.issues);
        allNotes.push(...r.notes);
        const err = r.issues.find((i) => i.severity === 'error' && !i.path);
        if (err) {
          s.fail(err.message);
          throw new Error(err.message);
        }
        s.done(`${Object.keys(r.content.tokens).length} tokens and ${r.content.intelligence.length} statements, each with its page`);
        setSource({ kind: 'pdf', ref: f.name, files: [f.name] });
      } else if (kind === 'website') {
        const s = stage(`Fetching ${url.trim()} and its stylesheets (public addresses only)`);
        const res = await fetch('/api/ux-v0/design-system/site', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) });
        const j = await res.json().catch(() => ({}));
        setFetched((j.fetched ?? []).map((f: { url: string; status: number; bytes: number; error?: string }) => `${f.error ? '✕' : '✓'} ${f.url} ${f.error ? `— ${f.error}` : `(${f.status}, ${Math.round(f.bytes / 1024)} KB)`}`));
        if (!res.ok) {
          s.fail(j.error ?? 'The site could not be read.');
          throw new Error(j.error ?? (res.status === 401 ? 'Sign in to read a website.' : 'The site could not be read.'));
        }
        const c = normalizeContent(j.result.content);
        contents.push(c);
        allIssues.push(...(j.result.issues ?? []));
        allNotes.push(...(j.result.notes ?? []));
        s.done(`${Object.keys(c.tokens).length} tokens reconstructed, all inferred`);
        setSource({ kind: 'website', ref: url.trim(), files: [] });
      } else if (kind === 'figma') {
        const s = stage('Asking Figma’s API for the file’s variables, styles and components');
        const res = await fetch('/api/ux-v0/design-system/figma', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: url.trim(), ...(token.trim() ? { token: token.trim() } : {}) }) });
        const j = await res.json().catch(() => ({}));
        setToken('');
        setFetched((j.calls ?? []).map((c: { endpoint: string; status: number }) => `${c.status >= 200 && c.status < 300 ? '✓' : '✕'} ${c.endpoint} (${c.status || 'unreachable'})`));
        if (!res.ok) {
          s.fail(j.error ?? 'Figma could not be read.');
          if (j.setup) setSetup(j.setup);
          throw new Error(j.error ?? (res.status === 401 ? 'Sign in to import from Figma.' : 'Figma could not be read.'));
        }
        const c = normalizeContent(j.result.content);
        contents.push(c);
        allIssues.push(...(j.result.issues ?? []));
        allNotes.push(...(j.result.notes ?? []));
        s.done(`${j.file?.name ?? 'File'} v${j.file?.version ?? '?'}: ${Object.keys(c.tokens).length} tokens, ${c.components.length} components`);
        setSource({ kind: 'figma', ref: j.file?.key ?? url.trim(), files: [], upstream: j.file?.version });
      } else if (kind === 'assets') {
        const s = stage(`Checking ${files.length} file${files.length === 1 ? '' : 's'} by their bytes`);
        const c = normalizeContent({ identity: { name: target?.name ?? files[0]?.name.replace(/\.[a-z0-9]+$/i, '') ?? 'Assets' } });
        const kept: BrandAsset[] = [];
        for (const f of files) {
          const r = await importAsset(
            { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type },
            {
              now,
              store: async (bytes, mime) => {
                const id = uid('dsa');
                const ok = await putArtifact({ id, name: f.name, type: mime, data: new Blob([bytes as unknown as BlobPart], { type: mime }), bytes: bytes.length, createdAt: now });
                return ok.ok || ok.reason === 'unavailable' ? `upload:${id}` : null;
              },
            },
          );
          if (r.asset) kept.push(r.asset);
          else allIssues.push({ severity: 'error', file: f.name, message: r.error ?? `${f.name} was refused.` });
          allNotes.push(...r.notes);
        }
        c.assets = kept;
        contents.push(c);
        s.done(`${kept.length} kept, ${files.length - kept.length} refused`);
        setSource({ kind: 'asset', ref: files.map((f) => f.name).join(', ').slice(0, 200), files: files.map((f) => f.name) });
      } else if (kind === 'project') {
        const s = stage('Reading the project');
        const proj = await getProject(projectId);
        if (!proj) throw new Error('That project is not in this browser.');
        const r = await extractFromProject(proj, { now });
        contents.push(r.content);
        allIssues.push(...r.issues);
        allNotes.push(...r.notes);
        if (r.issues.some((i) => i.severity === 'error')) {
          s.fail(r.issues[0].message);
          throw new Error(r.issues[0].message);
        }
        s.done(`${Object.keys(r.content.tokens).length} tokens from ${proj.name}`);
        setSource({ kind: 'project', ref: proj.name, files: [] });
      }
      if (!contents.length) throw new Error('Nothing in that source could be read.');
      const s2 = stage('Combining, validating and mapping roles');
      const combined = combineSources(contents);
      setParts(contents);
      setSourceConflicts(combined.conflicts);
      let c = filterCategories(combined.content, cats);
      s2.done(`${Object.keys(c.tokens).length} tokens; ${combined.conflicts.length} disagreement${combined.conflicts.length === 1 ? '' : 's'} between sources`);
      if (cats.has('rules')) {
        const s3 = stage('Reading the brand (SocriaUX inferences, labelled as such)');
        c = analyzeBrand(c);
        s3.done(`${c.intelligence.filter((i) => i.status === 'inferred').length} readings, ${c.intelligence.filter((i) => i.status === 'confirmed').length} confirmed statements`);
      }
      setContent(c);
      setIssues(allIssues);
      setNotes([...new Set(allNotes)]);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That source could not be read.');
    }
  };

  const merged = useMemo(() => {
    if (!content) return null;
    const between = sourceConflicts.length ? filterCategories(combineSources(parts, choices).content, cats) : content;
    const withIntel = cats.has('rules') ? { ...between, intelligence: content.intelligence } : between;
    const withAssets = { ...withIntel, assets: content.assets };
    if (!target) return { content: withAssets, conflicts: [] as Conflict[], log: [] as string[] };
    const plan = planMerge(target.draft, withAssets);
    const r = applyMerge(target.draft, withAssets, choices);
    return { content: r.content, conflicts: plan.conflicts, log: r.log };
  }, [content, parts, choices, target, cats, sourceConflicts.length]);

  const conflicts = [...sourceConflicts.map((c) => ({ ...c, between: true })), ...(merged?.conflicts ?? []).map((c) => ({ ...c, between: false }))];

  const create = () => {
    if (!merged || !source) return;
    const now = Date.now();
    const c = merged.content;
    const imp: ImportRecord = { id: uid('im'), kind: source.kind, ref: source.ref, at: now, files: source.files.slice(0, 30), counts: { tokens: Object.keys(c.tokens).length, assets: c.assets.length, components: c.components.length, rules: c.intelligence.length }, notes: notes.slice(0, 20), issues: issues.length, upstream: source.upstream ?? contentId(c) };
    let rec: SystemRecord;
    if (target) {
      rec = updateDraft(target, c, `Imported from ${source.kind} (${source.ref}): ${merged.log.slice(0, 3).join(' ')}`.slice(0, 380), { now, action: 'imported' });
      rec = { ...rec, sources: [...rec.sources, imp].slice(-40) };
    } else rec = newRecord(c, { source: { kind: source.kind, ref: source.ref }, importRecord: imp, now });
    if (publishNow) {
      const pr = publish(rec, { now, confirm: true, label: target ? undefined : 'Imported' });
      if (pr.error) setError(pr.error);
      rec = pr.record;
    }
    setMade(rec);
    p.onDone({ record: rec, created: !target });
    setStep(6);
  };

  const setAsset = (id: string, approved: boolean) => setContent((c) => (c ? { ...c, assets: c.assets.map((a) => (a.id === id ? approveAsset(a, approved) : a)) } : c));
  const setEnforce = (id: string, enforce: 'hard' | 'soft' | 'none') => setContent((c) => (c ? { ...c, intelligence: c.intelligence.map((i) => (i.id === id && i.status !== 'inferred' ? { ...i, enforce } : i)) } : c));

  const cen = merged ? census(merged.content) : null;
  const colours = merged ? Object.values(merged.content.tokens).filter((t) => t.type === 'color').slice(0, 48) : [];

  // what the conversation settled, the parts already chosen: read at once, without asking the same again
  const auto = useRef(givenReady && (given?.parts.length ?? 0) > 0);
  useEffect(() => {
    if (!auto.current) return;
    auto.current = false;
    void analyse();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ds-wizard" role="dialog" aria-modal="true" aria-labelledby="ds-wiz-t">
      <div className="ds-wizard-in">
        <header className="ds-wizard-head">
          <h2 id="ds-wiz-t">Import a design system</h2>
          <ol className="ds-steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
                <span>{String(i + 1).padStart(2, '0')}</span> {s}
              </li>
            ))}
          </ol>
          <button type="button" className="sb-link is-meta" onClick={p.onCancel}>
            Close
          </button>
        </header>

        {step === 0 && (
          <section className="ds-wstep">
            <div className="ds-sources" role="radiogroup" aria-label="Source">
              {SOURCES.map((s) => (
                <button key={s.kind} type="button" role="radio" aria-checked={kind === s.kind} className={`ds-source${kind === s.kind ? ' is-on' : ''}`} onClick={() => (setKind(s.kind), setFiles([]), setError(''))}>
                  <strong>{s.title}</strong>
                  <span>{s.what}</span>
                </button>
              ))}
            </div>
            {kind && ['json', 'css', 'pdf', 'assets'].includes(kind) && (
              <div className="ds-input">
                <input ref={fileInput} type="file" accept={accept} multiple={kind !== 'pdf'} className="v0-sr" id="ds-files" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, kind === 'pdf' ? 1 : 24))} />
                <label htmlFor="ds-files" className="sb-btn is-sm">
                  Choose {kind === 'pdf' ? 'a PDF' : 'files'}
                </label>
                <span className="ds-files">{files.length ? files.map((f) => f.name).join(', ') : 'Nothing chosen yet. Nothing in the files is run.'}</span>
              </div>
            )}
            {kind && ['website', 'github', 'figma'].includes(kind) && (
              <div className="ds-input">
                <label className="v0-sr" htmlFor="ds-url">
                  {kind === 'figma' ? 'Figma file link' : kind === 'github' ? 'Repository' : 'Website address'}
                </label>
                <input id="ds-url" className="v0-field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === 'figma' ? 'figma.com/design/FILEKEY/…' : kind === 'github' ? 'github.com/owner/design-system' : 'https://example.com'} />
                {kind === 'figma' && (
                  <>
                    <label className="v0-sr" htmlFor="ds-token">
                      Figma personal access token
                    </label>
                    <input id="ds-token" className="v0-field" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Personal access token (used once, never stored)" />
                  </>
                )}
                {!p.signedIn && <p className="ds-note">Sign in to read a {kind === 'figma' ? 'Figma file' : kind === 'github' ? 'repository' : 'website'}: it goes through SocriaUX’s server.</p>}
              </div>
            )}
            {kind === 'project' && (
              <div className="ds-input">
                <label className="v0-sr" htmlFor="ds-proj">
                  Project
                </label>
                <select id="ds-proj" className="v0-field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Choose a project…</option>
                  {p.projects.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name || 'Untitled'} · {x.graphic ? 'graphic' : x.board !== undefined ? 'board' : 'website'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <footer className="ds-wfoot">
              <button type="button" className="sb-btn is-primary" disabled={!ready} onClick={() => setStep(1)}>
                Next: what to bring
              </button>
            </footer>
          </section>
        )}

        {step === 1 && (
          <section className="ds-wstep">
            <fieldset className="ds-cats">
              <legend>What to bring</legend>
              {CATS.map(([k, label]) => (
                <label key={k} className="ds-check">
                  <input type="checkbox" checked={cats.has(k)} onChange={(e) => setCats((s) => (e.target.checked ? new Set([...s, k]) : new Set([...s].filter((x) => x !== k))))} /> {label}
                </label>
              ))}
            </fieldset>
            <fieldset className="ds-cats">
              <legend>Into</legend>
              <label className="ds-check">
                <input type="radio" name="ds-into" checked={into === 'new'} onChange={() => setInto('new')} /> A new design system
              </label>
              {p.records
                .filter((r) => r.status === 'active')
                .map((r) => (
                  <label key={r.id} className="ds-check">
                    <input type="radio" name="ds-into" checked={into === r.id} onChange={() => setInto(r.id)} /> Into {r.name} (its draft; conflicts are yours to settle)
                  </label>
                ))}
            </fieldset>
            <footer className="ds-wfoot">
              <button type="button" className="sb-btn" onClick={() => setStep(0)}>
                Back
              </button>
              <button type="button" className="sb-btn is-primary" disabled={!cats.size} onClick={analyse}>
                Analyse
              </button>
            </footer>
          </section>
        )}

        {step === 2 && (
          <section className="ds-wstep" aria-live="polite">
            <ol className="ds-stages">
              {stages.map((s) => (
                <li key={s.label} className={`is-${s.state}`}>
                  <span className="ds-stage-mark" aria-hidden="true">
                    {s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : '…'}
                  </span>
                  <span>
                    {s.label}
                    {s.detail && <em> — {s.detail}</em>}
                  </span>
                </li>
              ))}
            </ol>
            {fetched.length > 0 && (
              <details className="ds-fetched" open={!!error}>
                <summary>What was fetched ({fetched.length})</summary>
                <ul>
                  {fetched.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </details>
            )}
            {error && (
              <div className="ds-error" role="alert">
                <p>{error}</p>
                {setup && <p className="ds-note">{setup}</p>}
                <button type="button" className="sb-btn is-sm" onClick={() => setStep(0)}>
                  Back to the source
                </button>
              </div>
            )}
          </section>
        )}

        {step === 3 && merged && cen && (
          <section className="ds-wstep">
            <p className="ds-lede">
              <strong>{merged.content.identity.name}</strong>: {cen.total} tokens ({cen.byTop.colour} colour, {cen.byTop.typography} typography, {cen.byTop.layout} layout, {cen.byTop.effects} effects), {cen.aliases} references, modes {merged.content.modes.join(', ')}; {cen.components} components; {cen.assets} assets.
            </p>
            {colours.length > 0 && (
              <ul className="ds-swatches" aria-label="Colours">
                {colours.map((t) => {
                  const r = resolveToken(merged.content, t.path);
                  const hex = r.ok ? hexOf(r.value) : null;
                  return (
                    <li key={t.path} title={`${t.path} — ${t.provenance.status}, confidence ${t.provenance.confidence}`}>
                      <span className="ds-chip" style={{ background: hex ?? 'transparent' }} />
                      <span className="ds-chip-n">{t.path}</span>
                      {t.provenance.status === 'inferred' && <span className="ds-badge is-inferred">inferred</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="ds-roles">
              {Object.entries(merged.content.roles).map(([k, b]) => (
                <span key={k} className="ds-role">
                  {k}: <code>{b!.path}</code> <span className={`ds-badge ${b!.status === 'confirmed' ? 'is-confirmed' : 'is-inferred'}`}>{b!.status}</span>
                </span>
              ))}
            </div>
            {content && content.assets.length > 0 && (
              <ul className="ds-assets">
                {content.assets.map((a) => (
                  <li key={a.id}>
                    <AssetThumb a={a} />
                    <span>
                      {a.name} · {a.kind}
                      {a.role ? ` (${a.role})` : ''} · {a.format.toUpperCase()}
                      {a.width ? ` ${Math.round(a.width)}×${Math.round(a.height ?? 0)}` : ''}
                    </span>
                    {a.kind === 'logo' && (
                      <label className="ds-check">
                        <input type="checkbox" checked={a.approved} disabled={!!a.lowRes} onChange={(e) => setAsset(a.id, e.target.checked)} /> {a.lowRes ? 'Low resolution: a reference only' : 'Approve as the logo (protected from then on)'}
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {content && content.intelligence.length > 0 && (
              <div className="ds-intel">
                <h3>Brand statements</h3>
                <ul>
                  {content.intelligence.slice(0, 40).map((i) => (
                    <li key={i.id}>
                      <span className={`ds-badge is-${i.status}`}>{i.status === 'inferred' ? 'SocriaUX inference' : i.status}</span> {i.statement}
                      {i.evidence[0]?.source.page ? <em> (p. {i.evidence[0].source.page})</em> : null}
                      {i.status === 'inferred' ? (
                        <span className="ds-note"> — a suggestion, not enforced</span>
                      ) : (
                        <select aria-label="How strictly" value={i.enforce} onChange={(e) => setEnforce(i.id, e.target.value as 'hard' | 'soft' | 'none')}>
                          <option value="hard">Rule</option>
                          <option value="soft">Preference</option>
                          <option value="none">Note only</option>
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {issues.length > 0 && (
              <details className="ds-issues" open={issues.some((i) => i.severity === 'error')}>
                <summary>
                  {issues.filter((i) => i.severity === 'error').length} problems, {issues.filter((i) => i.severity === 'warning').length} warnings
                </summary>
                <ul>
                  {issues.slice(0, 60).map((i, n) => (
                    <li key={n} className={`is-${i.severity}`}>
                      {i.message}
                      {i.fix ? <em> {i.fix}</em> : null}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {notes.length > 0 && (
              <details className="ds-notes">
                <summary>How it was read ({notes.length})</summary>
                <ul>
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
            <footer className="ds-wfoot">
              <button type="button" className="sb-btn" onClick={() => setStep(0)}>
                Start again
              </button>
              <button type="button" className="sb-btn is-primary" onClick={() => setStep(conflicts.length ? 4 : 5)}>
                {conflicts.length ? `Next: ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}` : 'Next: confirm'}
              </button>
            </footer>
          </section>
        )}

        {step === 4 && merged && (
          <section className="ds-wstep">
            <ul className="ds-conflicts">
              {conflicts.map((c) => (
                <li key={`${c.between}-${c.id}`}>
                  <p>
                    {c.summary}
                    <em> — {c.between ? 'between the sources' : `with ${target?.name}`}; suggested: {c.suggested} ({c.reason})</em>
                  </p>
                  <div className="ds-choice" role="radiogroup" aria-label={`Settle ${c.key}`}>
                    {(c.options as Resolution[]).map((o) => (
                      <label key={o} className="ds-check">
                        <input type="radio" name={`c-${c.between}-${c.id}`} checked={(choices[c.id] ?? c.suggested) === o} onChange={() => setChoices((x) => ({ ...x, [c.id]: o }))} /> {o}
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <footer className="ds-wfoot">
              <button type="button" className="sb-btn" onClick={() => setStep(3)}>
                Back
              </button>
              <button type="button" className="sb-btn is-primary" onClick={() => setStep(5)}>
                Next: confirm
              </button>
            </footer>
          </section>
        )}

        {step === 5 && merged && cen && (
          <section className="ds-wstep">
            <p className="ds-lede">
              {target ? `Into ${target.name}’s draft` : 'A new design system'}: <strong>{merged.content.identity.name}</strong> with {Object.keys(merged.content.tokens).length} tokens, {merged.content.assets.length} assets ({merged.content.assets.filter((a) => a.approved).length} approved logo
              {merged.content.assets.filter((a) => a.approved).length === 1 ? '' : 's'}), {merged.content.components.length} components and {merged.content.intelligence.length} statements ({merged.content.intelligence.filter((i) => i.status === 'inferred').length} SocriaUX inferences, not enforced).
            </p>
            {merged.log.length > 0 && (
              <ul className="ds-log">
                {merged.log.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            <label className="ds-check">
              <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} /> Publish it now as {target ? 'its next version' : 'version 1'} (projects only ever read published versions)
            </label>
            {error && (
              <p className="ds-error" role="alert">
                {error}
              </p>
            )}
            <footer className="ds-wfoot">
              <button type="button" className="sb-btn" onClick={() => setStep(conflicts.length ? 4 : 3)}>
                Back
              </button>
              <button type="button" className="sb-btn is-primary" onClick={create}>
                {target ? 'Bring it in' : 'Create the design system'}
              </button>
            </footer>
          </section>
        )}

        {step === 6 && made && (
          <section className="ds-wstep">
            <p className="ds-lede">
              <strong>{made.name}</strong> is {made.published ? `published (v${made.published})` : 'saved as a draft'}.{error ? ` ${error}` : ''}
            </p>
            <p className="ds-note">Apply it to a project from the system’s Usage tab, or start a new graphic, board or website in it.</p>
            <footer className="ds-wfoot">
              <button type="button" className="sb-btn" onClick={p.onCancel}>
                Done
              </button>
              <button type="button" className="sb-btn is-primary" disabled={!made.published} onClick={() => p.onApply(made)}>
                Apply it
              </button>
            </footer>
          </section>
        )}
      </div>
    </div>
  );
}

/** A small preview of an asset (SVG through an image, never inlined; fonts as their family name). */
export function AssetThumb({ a }: { a: BrandAsset }) {
  if (a.kind === 'font') return <span className="ds-thumb is-font">{a.font?.family?.slice(0, 2) || 'Aa'}</span>;
  const href = a.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.svg)}` : a.src && a.src.startsWith('data:') ? a.src : '';
  // eslint-disable-next-line @next/next/no-img-element
  return href ? <img className="ds-thumb" src={href} alt="" /> : <span className="ds-thumb">{a.format.toUpperCase()}</span>;
}
