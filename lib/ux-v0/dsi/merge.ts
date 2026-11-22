// lib/ux-v0/dsi/merge.ts — bringing one system's content into another: what is new, what is the same, and what
// conflicts, each conflict with its choices (keep, replace, rename, merge, skip) and a suggestion with its reason.
// Nothing is decided silently: an approved logo or a confirmed role is never replaced unless the owner says so, and
// a rename rewrites the incoming references so nothing breaks.

import { isAlias, refsIn } from './tokens';
import { normalizePath, PRODUCT_ROLES, type BrandAsset, type ProductRole, type SystemContent, type Token, type TokenValue } from './schema';

export type Resolution = 'keep' | 'replace' | 'rename' | 'merge' | 'skip';

export interface Conflict {
  id: string;
  kind: 'token' | 'role' | 'asset' | 'identity' | 'mode';
  key: string;
  current: unknown;
  incoming: unknown;
  summary: string;
  options: Resolution[];
  suggested: Resolution;
  reason: string;
}

export interface MergePlan {
  conflicts: Conflict[];
  added: { tokens: string[]; assets: string[]; components: string[]; rules: string[]; modes: string[] };
  unchanged: number;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const short = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 60);

/** What bringing `incoming` into `current` would add, leave alone and conflict over. */
export function planMerge(current: SystemContent, incoming: SystemContent): MergePlan {
  const conflicts: Conflict[] = [];
  const added: MergePlan['added'] = { tokens: [], assets: [], components: [], rules: [], modes: [] };
  let unchanged = 0;
  for (const [p, t] of Object.entries(incoming.tokens)) {
    const c = current.tokens[p];
    if (!c) {
      added.tokens.push(p);
      continue;
    }
    if (same(c.value, t.value) && same(c.modes ?? {}, t.modes ?? {}) && c.type === t.type) {
      unchanged++;
      continue;
    }
    const edited = c.provenance.status === 'edited' || c.provenance.status === 'confirmed';
    const modesOnly = same(c.value, t.value) && c.type === t.type;
    conflicts.push({
      id: `token:${p}`,
      kind: 'token',
      key: p,
      current: { type: c.type, value: c.value, modes: c.modes },
      incoming: { type: t.type, value: t.value, modes: t.modes },
      summary: c.type !== t.type ? `${p}: a ${c.type} here, a ${t.type} in the import` : `${p}: ${short(c.value)} here, ${short(t.value)} in the import${modesOnly ? ' (modes differ)' : ''}`,
      options: ['keep', 'replace', 'rename', 'merge', 'skip'],
      suggested: edited ? 'keep' : modesOnly ? 'merge' : 'replace',
      reason: edited ? 'you edited or confirmed the current value' : modesOnly ? 'only the modes differ: the import’s modes can be added' : 'the import is newer and the current value was not edited',
    });
  }
  for (const r of PRODUCT_ROLES) {
    const a = current.roles[r];
    const b = incoming.roles[r];
    if (!b || !a || a.path === b.path) continue;
    conflicts.push({ id: `role:${r}`, kind: 'role', key: r, current: a.path, incoming: b.path, summary: `The ${r} role: ${a.path} here, ${b.path} in the import`, options: ['keep', 'replace'], suggested: a.status === 'confirmed' ? 'keep' : b.status === 'confirmed' || b.confidence > a.confidence ? 'replace' : 'keep', reason: a.status === 'confirmed' ? 'you confirmed the current binding' : 'the stronger reading wins' });
  }
  for (const x of incoming.assets) {
    const dup = current.assets.find((y) => y.hash === x.hash);
    if (dup) {
      unchanged++;
      continue;
    }
    const clash = x.kind === 'logo' && x.role ? current.assets.find((y) => y.kind === 'logo' && y.role === x.role) : undefined;
    if (clash) {
      conflicts.push({
        id: `asset:${x.id}`,
        kind: 'asset',
        key: x.id,
        current: { id: clash.id, name: clash.name, approved: clash.approved },
        incoming: { id: x.id, name: x.name },
        summary: `A ${x.role} logo exists (${clash.name}${clash.approved ? ', approved' : ''}); the import brings ${x.name}`,
        options: ['keep', 'replace', 'rename', 'skip'],
        suggested: clash.approved ? 'rename' : 'replace',
        reason: clash.approved ? 'the current logo is approved: it is never replaced unless you choose to; the new one can be kept beside it' : 'the current logo is not approved',
      });
    } else added.assets.push(x.id);
  }
  for (const c of incoming.components) if (!current.components.some((y) => y.name.toLowerCase() === c.name.toLowerCase())) added.components.push(c.id);
  for (const i of incoming.intelligence) if (!current.intelligence.some((y) => y.statement.toLowerCase() === i.statement.toLowerCase())) added.rules.push(i.id);
  for (const m of incoming.modes) if (!current.modes.includes(m)) added.modes.push(m);
  if (incoming.identity.name && current.identity.name && incoming.identity.name !== current.identity.name && !/^untitled/i.test(incoming.identity.name))
    conflicts.push({ id: 'identity:name', kind: 'identity', key: 'name', current: current.identity.name, incoming: incoming.identity.name, summary: `Named ${current.identity.name} here, ${incoming.identity.name} in the import`, options: ['keep', 'replace'], suggested: 'keep', reason: 'the system keeps its name unless you rename it' });
  return { conflicts, added, unchanged };
}

export type Choice = Resolution | { rename: string };

const rewriteRefs = (v: unknown, from: string, to: string): unknown => {
  if (typeof v === 'string') return v.replace(/\{([^{}]+)\}/g, (m, ref: string) => (ref === from ? `{${to}}` : m));
  if (Array.isArray(v)) return v.map((x) => rewriteRefs(x, from, to));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, rewriteRefs(x, from, to)]));
  return v;
};

const mergeValues = (a: TokenValue, b: TokenValue): TokenValue => {
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) return { ...(b as object), ...(a as object) } as TokenValue;
  return a;
};

/**
 * The merged content: additions brought in (except what `skip` names), conflicts settled by the owner's choices (a
 * conflict without a choice takes its suggestion). Returns what was done, line by line.
 */
export function applyMerge(current: SystemContent, incoming: SystemContent, choices: Record<string, Choice> = {}, opts: { skip?: ReadonlySet<string> } = {}): { content: SystemContent; log: string[] } {
  const plan = planMerge(current, incoming);
  const log: string[] = [];
  const skip = opts.skip ?? new Set<string>();
  const tokens: Record<string, Token> = { ...current.tokens };
  const renames = new Map<string, string>();
  const choiceOf = (c: Conflict): Choice => choices[c.id] ?? c.suggested;
  // renames first, so incoming references can follow them
  for (const c of plan.conflicts.filter((x) => x.kind === 'token')) {
    const ch = choiceOf(c);
    if (ch === 'rename' || (typeof ch === 'object' && 'rename' in ch)) {
      let to = typeof ch === 'object' ? normalizePath(ch.rename) : null;
      if (!to || tokens[to] || incoming.tokens[to]) {
        let k = 2;
        do to = normalizePath(`${c.key}-imported${k > 2 ? `-${k}` : ''}`) ?? `${c.key}-imported`;
        while ((tokens[to] || incoming.tokens[to]) && k++ < 50);
      }
      renames.set(c.key, to);
    }
  }
  const incomingTokens: Record<string, Token> = {};
  for (const [p, t] of Object.entries(incoming.tokens)) {
    let nt: Token = t;
    for (const [from, to] of renames) nt = { ...nt, value: rewriteRefs(nt.value, from, to) as TokenValue, ...(nt.modes ? { modes: rewriteRefs(nt.modes, from, to) as Record<string, TokenValue> } : {}) };
    const np = renames.get(p) ?? p;
    incomingTokens[np] = { ...nt, path: np };
  }
  for (const p of plan.added.tokens) {
    if (skip.has(`token:${p}`)) continue;
    tokens[p] = incomingTokens[p];
  }
  if (plan.added.tokens.length) log.push(`Added ${plan.added.tokens.filter((p) => !skip.has(`token:${p}`)).length} tokens.`);
  for (const c of plan.conflicts) {
    const ch = choiceOf(c);
    if (c.kind === 'token') {
      const inc = incomingTokens[renames.get(c.key) ?? c.key];
      if (ch === 'replace') {
        tokens[c.key] = { ...inc, path: c.key };
        log.push(`${c.key}: replaced with the import’s value.`);
      } else if (ch === 'merge') {
        const cur = tokens[c.key];
        tokens[c.key] = { ...cur, value: mergeValues(cur.value, inc.value), modes: { ...(inc.modes ?? {}), ...(cur.modes ?? {}) } };
        if (!Object.keys(tokens[c.key].modes ?? {}).length) delete tokens[c.key].modes;
        log.push(`${c.key}: merged (current values kept, the import’s missing modes and fields added).`);
      } else if (ch === 'rename' || typeof ch === 'object') {
        const to = renames.get(c.key)!;
        tokens[to] = inc;
        log.push(`${c.key}: the import’s value kept beside it as ${to}.`);
      } else log.push(`${c.key}: kept as it is.`);
    }
  }
  // references in added tokens that point at incoming tokens that were renamed are already rewritten; refs to skipped
  // tokens stay and show as missing references in validation
  const roles = { ...current.roles };
  for (const r of PRODUCT_ROLES as readonly ProductRole[]) {
    const inc = incoming.roles[r];
    if (!inc) continue;
    const conflict = plan.conflicts.find((c) => c.id === `role:${r}`);
    if (!roles[r]) {
      if (tokens[inc.path]) roles[r] = inc;
    } else if (conflict && choiceOf(conflict) === 'replace' && tokens[inc.path]) {
      roles[r] = inc;
      log.push(`The ${r} role now uses ${inc.path}.`);
    }
  }
  let assets: BrandAsset[] = [...current.assets];
  for (const x of incoming.assets) {
    if (current.assets.some((y) => y.hash === x.hash)) continue;
    const conflict = plan.conflicts.find((c) => c.id === `asset:${x.id}`);
    if (!conflict) {
      if (!skip.has(`asset:${x.id}`)) assets.push(x);
      continue;
    }
    const ch = choiceOf(conflict);
    const cur = conflict.current as { id: string };
    if (ch === 'replace') {
      assets = assets.filter((y) => y.id !== cur.id).concat({ ...x, version: (current.assets.find((y) => y.id === cur.id)?.version ?? 0) + 1 });
      log.push(`${x.name} replaces the current ${x.role} logo.`);
    } else if (ch === 'rename') {
      assets.push({ ...x, role: 'secondary' });
      log.push(`${x.name} kept beside the current logo, as a secondary logo.`);
    } else log.push(`${x.name} not brought in.`);
  }
  const components = [...current.components, ...incoming.components.filter((c) => plan.added.components.includes(c.id) && !skip.has(`component:${c.id}`))];
  const intelligence = [...current.intelligence, ...incoming.intelligence.filter((i) => plan.added.rules.includes(i.id) && !skip.has(`rule:${i.id}`))];
  const nameConflict = plan.conflicts.find((c) => c.id === 'identity:name');
  const identity = nameConflict && choiceOf(nameConflict) === 'replace' ? { ...current.identity, name: incoming.identity.name } : { ...current.identity, ...(current.identity.description ? {} : { description: incoming.identity.description }) };
  const unknown = { ...incoming.unknown, ...current.unknown };
  return { content: { ...current, identity, modes: [...current.modes, ...plan.added.modes], tokens, roles, assets, components, intelligence, unknown, groups: { ...incoming.groups, ...current.groups } }, log };
}

/** Several sources read into one content, one after another; conflicts between them come back for the owner. */
export function combineSources(contents: readonly SystemContent[], choices: Record<string, Choice> = {}): { content: SystemContent; conflicts: Conflict[]; log: string[] } {
  if (!contents.length) throw new Error('nothing to combine');
  let acc = contents[0];
  const conflicts: Conflict[] = [];
  const log: string[] = [];
  for (const c of contents.slice(1)) {
    const plan = planMerge(acc, c);
    // between sources the first one read leads unless the owner chooses otherwise; the first names the system
    const between = plan.conflicts.filter((x) => x.kind !== 'identity').map((x) => ({ ...x, suggested: (x.kind === 'token' ? 'keep' : x.suggested) as Resolution, reason: x.kind === 'token' ? 'two sources disagree: the first one read leads unless you choose' : x.reason }));
    conflicts.push(...between);
    const r = applyMerge(acc, c, Object.fromEntries(between.map((x) => [x.id, choices[x.id] ?? x.suggested])));
    acc = r.content;
    log.push(...r.log);
  }
  return { content: acc, conflicts, log };
}

/** Whether a token value refers to anything (for showing "follows …" in previews). */
export const refersTo = (v: TokenValue) => (isAlias(v) ? [String(v).trim().slice(1, -1)] : refsIn(v));
