// lib/ux-v0/dsi/registry.ts — a design system as a record the owner keeps: its draft, its published versions, where
// it came from, how it syncs and what was done to it.
//
//   draft      the working copy: edits land here and never reach a project
//   versions   published, immutable, numbered: what projects read (the latest, or the one they are pinned to)
//   audit      every action, who and when: created, imported, edited, published, rolled back, applied, propagated…
//
// Publishing validates the draft (an error blocks it), says what changed, and — when the system asks for review —
// needs the owner's explicit confirmation. Rolling back publishes an earlier version again as a new one, so history is
// never rewritten. The permission model is the application's own: a system belongs to one owner (their account when
// signed in, this browser otherwise); nothing here shares it with anyone else.

import { diffContent, validate, blocking, type Change, type Issue } from './tokens';
import { arr, clean, normalizeContent, normalizeSource, num, o, pick, SOURCE_KINDS, uid, type SourceRef, type SystemContent, type TokenValue } from './schema';

export const MAX_VERSIONS = 30;
export const MAX_AUDIT = 300;

export interface SystemVersion {
  n: number;
  at: number;
  label: string;
  summary: string;
  changes: Change[];
  content: SystemContent;
  by: string;
}

export const AUDIT_ACTIONS = ['created', 'imported', 'edited', 'published', 'rolled-back', 'draft-discarded', 'archived', 'restored', 'duplicated', 'renamed', 'synced', 'sync-checked', 'applied', 'unlinked', 'propagated', 'propagation-undone', 'exported', 'approved', 'rejected', 'governance', 'default'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  at: number;
  action: AuditAction;
  summary: string;
  by: string;
  version?: number;
  detail?: Record<string, unknown>;
}

export interface ImportRecord {
  id: string;
  kind: SourceRef['kind'];
  ref: string;
  at: number;
  files: string[];
  counts: { tokens: number; assets: number; components: number; rules: number };
  notes: string[];
  issues: number;
  /** what identifies the source's state (a content hash, a commit, a Figma version) */
  upstream?: string;
}

export interface PendingSync {
  at: number;
  upstream: string;
  content: SystemContent;
}

export interface SyncState {
  mode: 'none' | 'manual' | 'managed';
  source: SourceRef | null;
  lastChecked: number;
  lastSynced: number;
  upstream: string;
  /** the upstream system as it was at the last sync: the base a three-way comparison needs */
  base: SystemContent | null;
  /** an upstream change found and not yet applied */
  pending: PendingSync | null;
  intervalMin: number;
  /** changes upstream that nobody changed here are applied without asking (conflicts never are) */
  autoAccept: boolean;
  /** conflicts the owner chose to decide later, by key */
  deferred: string[];
  /** the last check's error, said */
  error?: string;
}

export interface SystemRecord {
  v: 1;
  id: string;
  name: string;
  description: string;
  /** the owner's account id when signed in; null: kept in this browser */
  owner: string | null;
  /** the application's model: a system belongs to its owner's own workspace */
  workspace: 'personal';
  status: 'active' | 'archived';
  isDefault: boolean;
  draft: SystemContent;
  /** the published version the draft started from (0: none yet) */
  draftBase: number;
  versions: SystemVersion[];
  published: number;
  sources: ImportRecord[];
  sync: SyncState;
  audit: AuditEntry[];
  createdAt: number;
  updatedAt: number;
}

export const ID = /^dsys_[A-Za-z0-9_-]{4,64}$/;

export function emptySync(): SyncState {
  return { mode: 'none', source: null, lastChecked: 0, lastSynced: 0, upstream: '', base: null, pending: null, intervalMin: 60, autoAccept: false, deferred: [] };
}

const audit = (r: SystemRecord, e: Omit<AuditEntry, 'at'> & { at?: number }): AuditEntry[] => [...r.audit, { ...e, at: e.at ?? Date.now() }].slice(-MAX_AUDIT);

/** A new system record from imported (or empty) content: a draft, nothing published yet. */
export function newRecord(content: SystemContent, opts: { owner?: string | null; by?: string; now?: number; source?: SourceRef | null; importRecord?: ImportRecord; id?: string } = {}): SystemRecord {
  const now = opts.now ?? Date.now();
  const c = normalizeContent(content);
  const rec: SystemRecord = {
    v: 1,
    id: opts.id && ID.test(opts.id) ? opts.id : `dsys_${uid('')}`,
    name: c.identity.name,
    description: c.identity.description,
    owner: opts.owner ?? null,
    workspace: 'personal',
    status: 'active',
    isDefault: false,
    draft: c,
    draftBase: 0,
    versions: [],
    published: 0,
    sources: opts.importRecord ? [opts.importRecord] : [],
    sync: { ...emptySync(), source: opts.source ?? null, mode: opts.source && opts.source.kind !== 'manual' ? 'manual' : 'none', base: opts.source ? c : null, upstream: opts.importRecord?.upstream ?? '', lastSynced: opts.source ? now : 0 },
    audit: [],
    createdAt: now,
    updatedAt: now,
  };
  rec.audit = audit(rec, { at: now, action: opts.importRecord ? 'imported' : 'created', by: opts.by ?? 'owner', summary: opts.importRecord ? `Imported from ${opts.importRecord.kind} (${opts.importRecord.ref}): ${opts.importRecord.counts.tokens} tokens, ${opts.importRecord.counts.assets} assets, ${opts.importRecord.counts.components} components` : 'Created' });
  return rec;
}

function normalizeChange(v: unknown): Change | null {
  const r = o(v);
  const kind = pick(r.kind, ['token', 'role', 'asset', 'rule', 'governance', 'identity', 'component', 'mode'] as const, 'token');
  const key = clean(r.key, 200);
  if (!key) return null;
  return { kind, op: pick(r.op, ['added', 'removed', 'changed'] as const, 'changed'), key, summary: clean(r.summary, 300) };
}

function normalizeImport(v: unknown): ImportRecord | null {
  const r = o(v);
  const ref = clean(r.ref, 300);
  if (!ref) return null;
  const c = o(r.counts);
  return {
    id: clean(r.id, 60) || uid('im'),
    kind: pick(r.kind, SOURCE_KINDS, 'manual'),
    ref,
    at: num(r.at, 0, 9e15, 0),
    files: arr(r.files).map((x) => clean(x, 200)).filter(Boolean).slice(0, 30),
    counts: { tokens: num(c.tokens, 0, 1e6, 0), assets: num(c.assets, 0, 1e6, 0), components: num(c.components, 0, 1e6, 0), rules: num(c.rules, 0, 1e6, 0) },
    notes: arr(r.notes).map((x) => clean(x, 300)).filter(Boolean).slice(0, 20),
    issues: num(r.issues, 0, 1e6, 0),
    ...(clean(r.upstream, 200) ? { upstream: clean(r.upstream, 200) } : {}),
  };
}

/** A stored record held to its shape (from this browser, the account copy, or an export). */
export function normalizeRecord(v: unknown): SystemRecord | null {
  const r = o(v);
  if (!ID.test(String(r.id ?? ''))) return null;
  const draft = normalizeContent(r.draft);
  const versions: SystemVersion[] = arr(r.versions)
    .map((x) => {
      const vr = o(x);
      const n = num(vr.n, 1, 1e6, 0);
      if (!n) return null;
      return { n, at: num(vr.at, 0, 9e15, 0), label: clean(vr.label, 80) || `Version ${n}`, summary: clean(vr.summary, 400), changes: arr(vr.changes).map(normalizeChange).filter((c): c is Change => !!c).slice(0, 200), content: normalizeContent(vr.content), by: clean(vr.by, 80) || 'owner' };
    })
    .filter((x): x is SystemVersion => !!x)
    .sort((a, b) => a.n - b.n)
    .filter((x, i, all) => i === 0 || all[i - 1].n !== x.n)
    .slice(-MAX_VERSIONS * 2);
  const s = o(r.sync);
  const pending = o(s.pending);
  return {
    v: 1,
    id: String(r.id),
    name: clean(r.name, 80) || draft.identity.name,
    description: clean(r.description, 1000),
    owner: typeof r.owner === 'string' && /^[\w-]{1,96}$/.test(r.owner) ? r.owner : null,
    workspace: 'personal',
    status: r.status === 'archived' ? 'archived' : 'active',
    isDefault: r.isDefault === true,
    draft,
    draftBase: num(r.draftBase, 0, 1e6, 0),
    versions,
    published: versions.length ? versions[versions.length - 1].n : 0,
    sources: arr(r.sources).map(normalizeImport).filter((x): x is ImportRecord => !!x).slice(-40),
    sync: {
      mode: pick(s.mode, ['none', 'manual', 'managed'] as const, 'none'),
      source: s.source ? normalizeSource(s.source) : null,
      lastChecked: num(s.lastChecked, 0, 9e15, 0),
      lastSynced: num(s.lastSynced, 0, 9e15, 0),
      upstream: clean(s.upstream, 200),
      base: s.base ? normalizeContent(s.base) : null,
      pending: s.pending && pending.content ? { at: num(pending.at, 0, 9e15, 0), upstream: clean(pending.upstream, 200), content: normalizeContent(pending.content) } : null,
      intervalMin: num(s.intervalMin, 5, 7 * 24 * 60, 60),
      autoAccept: s.autoAccept === true,
      deferred: arr(s.deferred).map((x) => clean(x, 200)).filter(Boolean).slice(0, 500),
      ...(clean(s.error, 300) ? { error: clean(s.error, 300) } : {}),
    },
    audit: arr(r.audit)
      .map((x) => {
        const a = o(x);
        const detail = o(a.detail);
        return { at: num(a.at, 0, 9e15, 0), action: pick(a.action, AUDIT_ACTIONS, 'edited'), summary: clean(a.summary, 400), by: clean(a.by, 80) || 'owner', ...(Number.isFinite(a.version) ? { version: num(a.version, 0, 1e6, 0) } : {}), ...(Object.keys(detail).length ? { detail: JSON.parse(JSON.stringify(detail).slice(0, 20_000).length < 20_000 ? JSON.stringify(detail) : '{}') } : {}) };
      })
      .slice(-MAX_AUDIT),
    createdAt: num(r.createdAt, 0, 9e15, 0),
    updatedAt: num(r.updatedAt, 0, 9e15, 0),
  };
}

/** The content projects read: a published version (the latest, or the one asked for). A draft is never returned here. */
export function publishedContent(r: SystemRecord, n: number | 'latest' = 'latest'): SystemContent | null {
  if (!r.versions.length) return null;
  if (n === 'latest') return r.versions[r.versions.length - 1].content;
  return r.versions.find((v) => v.n === n)?.content ?? null;
}

export const latestVersion = (r: SystemRecord) => r.versions[r.versions.length - 1] ?? null;

/** What the draft changes from the latest published version (everything, before the first publish). */
export function draftChanges(r: SystemRecord): Change[] {
  const base = publishedContent(r);
  if (!base) return diffContent({ ...r.draft, tokens: {}, assets: [], components: [], intelligence: [], roles: {}, governance: r.draft.governance, identity: r.draft.identity, modes: r.draft.modes }, r.draft);
  return diffContent(base, r.draft);
}

export const hasDraftChanges = (r: SystemRecord) => !r.versions.length || draftChanges(r).length > 0;

/** The draft replaced by an edited one, said in the audit. */
export function updateDraft(r: SystemRecord, content: SystemContent, summary: string, opts: { by?: string; now?: number; action?: AuditAction } = {}): SystemRecord {
  const now = opts.now ?? Date.now();
  const draft = normalizeContent(content);
  const next = { ...r, draft, name: draft.identity.name, description: draft.identity.description, updatedAt: now };
  // a run of edits is one audit line, so the log stays readable
  const last = r.audit[r.audit.length - 1];
  if ((opts.action ?? 'edited') === 'edited' && last?.action === 'edited' && now - last.at < 60_000 && last.summary.length < 300) {
    next.audit = [...r.audit.slice(0, -1), { ...last, at: now, summary: last.summary.includes(summary) ? last.summary : `${last.summary}; ${summary}`.slice(0, 400) }];
  } else next.audit = audit(r, { at: now, action: opts.action ?? 'edited', by: opts.by ?? 'owner', summary });
  return next;
}

export interface PublishResult {
  record: SystemRecord;
  version?: SystemVersion;
  error?: string;
  issues: Issue[];
  changes: Change[];
  /** the system asks for review and the owner has not confirmed */
  needsConfirmation?: boolean;
}

/**
 * The draft published as the next version: refused while it has errors or nothing changed; when the system asks for
 * review, the owner must have seen the changes and confirmed (`confirm`).
 */
export function publish(r: SystemRecord, opts: { label?: string; by?: string; now?: number; confirm?: boolean } = {}): PublishResult {
  const issues = validate(r.draft);
  const changes = draftChanges(r);
  const errs = blocking(issues);
  if (errs.length) return { record: r, issues, changes, error: `${errs.length} problem${errs.length === 1 ? '' : 's'} must be fixed before publishing: ${errs[0].message}` };
  if (r.versions.length && !changes.length) return { record: r, issues, changes, error: 'Nothing has changed since the last published version.' };
  if (r.draft.governance.requireReview && !opts.confirm) return { record: r, issues, changes, needsConfirmation: true };
  const now = opts.now ?? Date.now();
  const n = (latestVersion(r)?.n ?? 0) + 1;
  const summary = changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'}: ${changes.slice(0, 3).map((c) => c.summary).join('; ')}${changes.length > 3 ? '…' : ''}` : 'First version';
  const version: SystemVersion = { n, at: now, label: (opts.label ?? '').slice(0, 80) || `Version ${n}`, summary: summary.slice(0, 400), changes: changes.slice(0, 200), content: r.draft, by: opts.by ?? 'owner' };
  const record: SystemRecord = { ...r, versions: [...r.versions, version], published: n, draftBase: n, updatedAt: now };
  record.audit = audit(record, { at: now, action: 'published', by: opts.by ?? 'owner', summary: `Published v${n}: ${version.summary}`, version: n });
  return { record, version, issues, changes };
}

/** An earlier version published again as the newest one (history is kept; the draft follows). */
export function rollback(r: SystemRecord, n: number, opts: { by?: string; now?: number } = {}): { record: SystemRecord; error?: string; version?: SystemVersion } {
  const target = r.versions.find((v) => v.n === n);
  if (!target) return { record: r, error: `Version ${n} is not kept any more.` };
  const latest = latestVersion(r)!;
  if (latest.n === n) return { record: r, error: `v${n} is already the published version.` };
  const now = opts.now ?? Date.now();
  const changes = diffContent(latest.content, target.content);
  const next = latest.n + 1;
  const version: SystemVersion = { n: next, at: now, label: `Rollback to v${n}`, summary: `Rolled back to v${n} (${target.label}): ${changes.length} change${changes.length === 1 ? '' : 's'}`, changes: changes.slice(0, 200), content: target.content, by: opts.by ?? 'owner' };
  const record: SystemRecord = { ...r, versions: [...r.versions, version], published: next, draft: target.content, draftBase: next, updatedAt: now };
  record.audit = audit(record, { at: now, action: 'rolled-back', by: opts.by ?? 'owner', summary: `Rolled back to v${n}, published as v${next}`, version: next, detail: { from: latest.n, to: n } });
  return { record, version };
}

/** The draft thrown away: back to the latest published version. */
export function discardDraft(r: SystemRecord, opts: { by?: string; now?: number } = {}): SystemRecord {
  const base = publishedContent(r);
  if (!base) return r;
  const now = opts.now ?? Date.now();
  const next = { ...r, draft: base, draftBase: r.published, updatedAt: now };
  next.audit = audit(r, { at: now, action: 'draft-discarded', by: opts.by ?? 'owner', summary: 'Draft discarded: back to the published version' });
  return next;
}

export function renameRecord(r: SystemRecord, name: string, opts: { by?: string; now?: number } = {}): SystemRecord {
  const nm = clean(name, 80);
  if (!nm || nm === r.name) return r;
  const now = opts.now ?? Date.now();
  const next = { ...r, name: nm, draft: { ...r.draft, identity: { ...r.draft.identity, name: nm } }, updatedAt: now };
  next.audit = audit(r, { at: now, action: 'renamed', by: opts.by ?? 'owner', summary: `Renamed ${r.name} → ${nm}` });
  return next;
}

export function archiveRecord(r: SystemRecord, archived: boolean, opts: { by?: string; now?: number } = {}): SystemRecord {
  const now = opts.now ?? Date.now();
  const next: SystemRecord = { ...r, status: archived ? 'archived' : 'active', isDefault: archived ? false : r.isDefault, updatedAt: now };
  next.audit = audit(r, { at: now, action: archived ? 'archived' : 'restored', by: opts.by ?? 'owner', summary: archived ? 'Archived: projects keep the version they use' : 'Restored' });
  return next;
}

/** A copy to change freely: the draft (or the latest published content), a new id, no versions, its own history. */
export function duplicateRecord(r: SystemRecord, opts: { by?: string; now?: number; owner?: string | null } = {}): SystemRecord {
  const now = opts.now ?? Date.now();
  const content = { ...r.draft, identity: { ...r.draft.identity, name: `${r.name} copy`.slice(0, 80) } };
  const copy = newRecord(content, { owner: opts.owner ?? r.owner, by: opts.by, now });
  copy.sources = r.sources;
  copy.audit = [{ at: now, action: 'duplicated', by: opts.by ?? 'owner', summary: `Duplicated from ${r.name} (${r.id})` }];
  return copy;
}

/** One system as the workspace default (the others not). */
export function setDefault(records: readonly SystemRecord[], id: string | null, opts: { now?: number } = {}): SystemRecord[] {
  const now = opts.now ?? Date.now();
  return records.map((r) => {
    const on = r.id === id && r.status === 'active';
    if (on === r.isDefault) return r;
    const next = { ...r, isDefault: on, updatedAt: now };
    next.audit = audit(r, { at: now, action: 'default', by: 'owner', summary: on ? 'Set as the workspace default' : 'No longer the workspace default' });
    return next;
  });
}

/** Old versions let go past the limit, never one a project is pinned to, nor the latest. */
export function pruneVersions(r: SystemRecord, pinned: ReadonlySet<number>): SystemRecord {
  if (r.versions.length <= MAX_VERSIONS) return r;
  const latest = latestVersion(r)!.n;
  const keep = r.versions.filter((v, i) => v.n === latest || pinned.has(v.n) || i >= r.versions.length - MAX_VERSIONS);
  return keep.length === r.versions.length ? r : { ...r, versions: keep };
}

/** What changed between two kept versions. */
export function compareVersions(r: SystemRecord, a: number, b: number): Change[] | null {
  const x = r.versions.find((v) => v.n === a)?.content;
  const y = r.versions.find((v) => v.n === b)?.content;
  return x && y ? diffContent(x, y) : null;
}

/** An entry added to the audit (applied, propagated, synced, exported…). */
export function logged(r: SystemRecord, e: Omit<AuditEntry, 'at'> & { at?: number }): SystemRecord {
  return { ...r, audit: audit(r, e), updatedAt: e.at ?? Date.now() };
}

/** Whether this person may change the record: its owner, or anyone on this device for a record kept only here. */
export function canEdit(r: SystemRecord, userId: string | null): boolean {
  return r.owner === null || r.owner === userId;
}

/** The value snapshot of a content's tokens (for sync bases and quick comparison). */
export function tokenSnapshot(c: SystemContent): Record<string, { type: string; value: TokenValue; modes?: Record<string, TokenValue> }> {
  return Object.fromEntries(Object.values(c.tokens).map((t) => [t.path, { type: t.type, value: t.value, ...(t.modes ? { modes: t.modes } : {}) }]));
}
