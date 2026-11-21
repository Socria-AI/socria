// lib/ux-v0/dsi/sync.ts — keeping a system in step with the source it was imported from.
//
//   one-time   imported once; the source is remembered, nothing is checked again
//   manual     the owner asks: the source is read again and compared before anything changes
//   managed    the source is checked on a schedule while SocriaUX is open (GitHub, Figma and website sources; a file
//              cannot be re-read on its own); a change is never applied silently — it waits as a pending update,
//              except changes nobody made here when the owner turned on accepting those
//
// Comparison is three-way: the source as it was at the last sync (the base), the system as it is (local), the source
// as it is now (upstream). A change only upstream can be accepted as it is; a change only here stays; the same change
// on both sides is no change; different changes on both sides are a conflict, settled by the owner: accept upstream,
// keep local, merge (modes and composite fields), create an override (keep local, deliberately, and stop asking until
// upstream moves again), or defer (decide later). A local edit, a confirmed value or an approved asset is never
// overwritten without the owner's choice. Accepted changes land in the draft: publishing stays a separate step.

import { diffContent } from './tokens';
import { logged, updateDraft, type SystemRecord } from './registry';
import type { BrandAsset, SystemContent, Token, TokenValue } from './schema';

export type SyncChoice = 'upstream' | 'local' | 'merge' | 'override' | 'defer';

export interface SyncItem {
  key: string;
  kind: 'token' | 'asset' | 'component' | 'rule';
  op: 'added' | 'changed' | 'removed';
  base?: unknown;
  local?: unknown;
  upstream?: unknown;
  summary: string;
}

export interface SyncConflict extends SyncItem {
  options: SyncChoice[];
  suggested: SyncChoice;
  reason: string;
  /** the token was deliberately overridden here before */
  overridden?: boolean;
}

export interface SyncDiff {
  /** changed only upstream: can be accepted as they are */
  incoming: SyncItem[];
  /** changed differently on both sides: the owner decides */
  conflicts: SyncConflict[];
  /** changed only here: they stay */
  localOnly: number;
  unchanged: number;
}

const val = (t: Token | undefined) => (t ? { type: t.type, value: t.value, ...(t.modes ? { modes: t.modes } : {}) } : undefined);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const short = (v: unknown) => {
  const x = v as { value?: unknown } | undefined;
  const s = x && typeof x === 'object' && 'value' in x ? x.value : v;
  return (typeof s === 'string' ? s : JSON.stringify(s) ?? '—').slice(0, 50);
};
const isOverride = (t: Token | undefined) => !!(t?.extensions?.['org.socriaux.sync'] as { overridden?: boolean } | undefined)?.overridden;
const localEdit = (t: Token | undefined) => !!t && (t.provenance.status === 'edited' || t.provenance.status === 'confirmed');

/** The three-way comparison (see the head of this file). Without a base, every difference is treated as a conflict to review. */
export function syncDiff(base: SystemContent | null, local: SystemContent, upstream: SystemContent): SyncDiff {
  const out: SyncDiff = { incoming: [], conflicts: [], localOnly: 0, unchanged: 0 };
  const paths = new Set([...Object.keys(local.tokens), ...Object.keys(upstream.tokens), ...Object.keys(base?.tokens ?? {})]);
  for (const p of paths) {
    const b = val(base?.tokens[p]);
    const l = val(local.tokens[p]);
    const u = val(upstream.tokens[p]);
    if (same(l, u)) {
      out.unchanged++;
      continue;
    }
    const upChanged = base ? !same(b, u) : true;
    const localChanged = base ? !same(b, l) : false;
    if (!upChanged) {
      out.localOnly++;
      continue;
    }
    const op: SyncItem['op'] = !l ? 'added' : !u ? 'removed' : 'changed';
    const item: SyncItem = { key: p, kind: 'token', op, ...(b ? { base: b } : {}), ...(l ? { local: l } : {}), ...(u ? { upstream: u } : {}), summary: op === 'added' ? `${p} added upstream (${short(u)})` : op === 'removed' ? `${p} removed upstream` : `${p}: ${short(l)} here, ${short(u)} upstream` };
    const lt = local.tokens[p];
    const protectedLocal = localEdit(lt) || isOverride(lt);
    if (!localChanged && !protectedLocal && base) {
      out.incoming.push(item);
      continue;
    }
    const mergeable = !!l && !!u && (Object.keys(l.modes ?? {}).length > 0 || Object.keys(u.modes ?? {}).length > 0 || (typeof l.value === 'object' && typeof u.value === 'object'));
    out.conflicts.push({
      ...item,
      options: ['upstream', 'local', ...(mergeable ? (['merge'] as SyncChoice[]) : []), 'override', 'defer'],
      suggested: isOverride(lt) ? 'override' : protectedLocal || localChanged ? 'local' : 'upstream',
      reason: isOverride(lt) ? 'you overrode this deliberately; upstream changed again' : protectedLocal ? 'you edited or confirmed it here' : localChanged ? 'it changed here too' : 'no record of the last sync to compare with',
      ...(isOverride(lt) ? { overridden: true } : {}),
    });
  }
  // assets: new ones upstream come in unapproved; an approved asset is never removed or replaced without a choice
  const localAssets = new Map(local.assets.map((a) => [a.hash, a]));
  const upHashes = new Set(upstream.assets.map((a) => a.hash));
  for (const a of upstream.assets) if (!localAssets.has(a.hash)) out.incoming.push({ key: a.id, kind: 'asset', op: 'added', upstream: { name: a.name, role: a.role }, summary: `New ${a.kind} upstream: ${a.name} (arrives unapproved)` });
  const baseHashes = new Set((base?.assets ?? []).map((a) => a.hash));
  for (const a of local.assets) {
    if (upHashes.has(a.hash) || !baseHashes.has(a.hash)) continue;
    const item: SyncItem = { key: a.id, kind: 'asset', op: 'removed', local: { name: a.name, approved: a.approved }, summary: `${a.name} is no longer in the source` };
    if (a.approved) out.conflicts.push({ ...item, options: ['upstream', 'local', 'defer'], suggested: 'local', reason: 'it is an approved logo: it stays unless you remove it' });
    else out.incoming.push(item);
  }
  // components and statements the source added
  for (const c of upstream.components) if (!local.components.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) out.incoming.push({ key: c.id, kind: 'component', op: 'added', summary: `New component upstream: ${c.name}` });
  for (const i of upstream.intelligence) if (!local.intelligence.some((x) => x.statement.toLowerCase() === i.statement.toLowerCase())) out.incoming.push({ key: i.id, kind: 'rule', op: 'added', summary: `New statement upstream (${i.status}): ${i.statement.slice(0, 80)}` });
  return out;
}

const markOverride = (t: Token, upstreamValue: unknown): Token => ({ ...t, extensions: { ...(t.extensions ?? {}), 'org.socriaux.sync': { overridden: true, upstream: upstreamValue } } });

/**
 * The upstream change brought into the draft by the owner's choices (a conflict without a choice is deferred). The base
 * becomes the upstream as accepted, except for what was deferred, so a deferred conflict is asked again next time.
 */
export function applySync(rec: SystemRecord, upstream: SystemContent, choices: Record<string, SyncChoice> = {}, opts: { upstreamId?: string; now?: number; by?: string; acceptIncoming?: boolean } = {}): { record: SystemRecord; applied: string[]; deferred: string[] } {
  const now = opts.now ?? Date.now();
  const diff = syncDiff(rec.sync.base, rec.draft, upstream);
  const tokens: Record<string, Token> = { ...rec.draft.tokens };
  let assets: BrandAsset[] = [...rec.draft.assets];
  const applied: string[] = [];
  const deferred: string[] = [];
  const baseTokens: Record<string, Token> = { ...(rec.sync.base?.tokens ?? {}) };
  const takeUpstream = (key: string) => {
    const u = upstream.tokens[key];
    if (u) tokens[key] = { ...u, provenance: { ...u.provenance, importedAt: now } };
    else delete tokens[key];
  };
  if (opts.acceptIncoming !== false) {
    for (const it of diff.incoming) {
      if (it.kind === 'token') takeUpstream(it.key);
      else if (it.kind === 'asset' && it.op === 'added') {
        const a = upstream.assets.find((x) => x.id === it.key);
        if (a) assets.push({ ...a, approved: false, protected: false });
      } else if (it.kind === 'asset' && it.op === 'removed') assets = assets.filter((x) => x.id !== it.key);
      applied.push(it.summary);
    }
  }
  for (const c of diff.conflicts) {
    const ch = choices[`${c.kind}:${c.key}`] ?? 'defer';
    if (c.kind === 'asset') {
      if (ch === 'upstream') assets = assets.filter((x) => x.id !== c.key);
      if (ch === 'defer') deferred.push(c.key);
      else applied.push(`${c.summary}: ${ch === 'upstream' ? 'removed' : 'kept'}`);
      continue;
    }
    const lt = tokens[c.key];
    const ut = upstream.tokens[c.key];
    if (ch === 'upstream') {
      takeUpstream(c.key);
      applied.push(`${c.key}: took upstream`);
    } else if (ch === 'merge' && lt && ut) {
      const value: TokenValue = typeof lt.value === 'object' && typeof ut.value === 'object' && !Array.isArray(lt.value) && !Array.isArray(ut.value) ? ({ ...(ut.value as object), ...(lt.value as object) } as TokenValue) : lt.value;
      tokens[c.key] = { ...lt, value, modes: { ...(ut.modes ?? {}), ...(lt.modes ?? {}) } };
      applied.push(`${c.key}: merged (kept here where both set, added upstream’s missing modes and fields)`);
    } else if (ch === 'override' && lt) {
      tokens[c.key] = markOverride(lt, ut?.value ?? null);
      applied.push(`${c.key}: kept here as a deliberate override of upstream`);
    } else if (ch === 'local') applied.push(`${c.key}: kept as it is here`);
    else {
      deferred.push(`token:${c.key}`);
      continue;
    }
  }
  // the new base: upstream, except deferred tokens keep their old base (so they are asked about again)
  const nextBase: SystemContent = { ...upstream, tokens: { ...upstream.tokens } };
  for (const d of deferred) {
    const key = d.replace(/^token:/, '');
    if (baseTokens[key]) nextBase.tokens[key] = baseTokens[key];
    else delete nextBase.tokens[key];
  }
  const components = [...rec.draft.components, ...upstream.components.filter((c) => !rec.draft.components.some((x) => x.name.toLowerCase() === c.name.toLowerCase()))];
  const intelligence = [...rec.draft.intelligence, ...upstream.intelligence.filter((i) => !rec.draft.intelligence.some((x) => x.statement.toLowerCase() === i.statement.toLowerCase()))];
  const content: SystemContent = { ...rec.draft, tokens, assets, components, intelligence, modes: [...new Set([...rec.draft.modes, ...upstream.modes])] };
  const changes = diffContent(rec.draft, content).length;
  let record = changes ? updateDraft(rec, content, `Synced from ${rec.sync.source?.ref ?? 'the source'}: ${changes} change${changes === 1 ? '' : 's'} in the draft`, { now, by: opts.by, action: 'synced' }) : logged(rec, { at: now, action: 'synced', by: opts.by ?? 'owner', summary: 'Synced: nothing to change' });
  record = { ...record, sync: { ...record.sync, base: nextBase, lastSynced: now, lastChecked: now, upstream: opts.upstreamId ?? record.sync.upstream, pending: null, deferred, error: undefined } };
  return { record, applied, deferred };
}

/** A check of the source found it unchanged, changed (kept as a pending update) or failing (said). */
export function recordCheck(rec: SystemRecord, r: { ok: true; upstreamId: string; content?: SystemContent } | { ok: false; error: string }, opts: { now?: number } = {}): { record: SystemRecord; changed: boolean; diff?: SyncDiff } {
  const now = opts.now ?? Date.now();
  if (!r.ok) return { record: { ...rec, sync: { ...rec.sync, lastChecked: now, error: r.error } }, changed: false };
  if (r.upstreamId && r.upstreamId === rec.sync.upstream) return { record: { ...rec, sync: { ...rec.sync, lastChecked: now, error: undefined } }, changed: false };
  if (!r.content) return { record: { ...rec, sync: { ...rec.sync, lastChecked: now } }, changed: true };
  const diff = syncDiff(rec.sync.base, rec.draft, r.content);
  const changed = diff.incoming.length + diff.conflicts.length > 0;
  let record: SystemRecord = { ...rec, sync: { ...rec.sync, lastChecked: now, error: undefined, ...(changed ? { pending: { at: now, upstream: r.upstreamId, content: r.content } } : { upstream: r.upstreamId }) } };
  record = logged(record, { at: now, action: 'sync-checked', by: 'SocriaUX', summary: changed ? `The source changed: ${diff.incoming.length} incoming, ${diff.conflicts.length} conflict${diff.conflicts.length === 1 ? '' : 's'}` : 'The source was checked: no change' });
  // managed with auto-accept: what nobody changed here comes in (into the draft); conflicts always wait
  if (changed && rec.sync.mode === 'managed' && rec.sync.autoAccept && !diff.conflicts.length) {
    const a = applySync(record, r.content, {}, { upstreamId: r.upstreamId, now, by: 'SocriaUX (managed sync)' });
    return { record: a.record, changed, diff };
  }
  return { record, changed, diff };
}

/** Whether a managed system is due for a check. */
export const syncDue = (rec: SystemRecord, now = Date.now()) => rec.sync.mode === 'managed' && !!rec.sync.source && ['github', 'figma', 'website'].includes(rec.sync.source.kind) && now - rec.sync.lastChecked >= rec.sync.intervalMin * 60_000;

/** A content hash of a system's tokens and assets: what identifies an upstream state for sources without versions. */
export function contentId(c: SystemContent): string {
  const s = JSON.stringify([Object.values(c.tokens).map((t) => [t.path, t.type, t.value, t.modes ?? null]), c.assets.map((a) => a.hash)]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `h${(h >>> 0).toString(36)}${s.length.toString(36)}`;
}
