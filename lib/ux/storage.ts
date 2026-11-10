// lib/ux/storage.ts — SocriaUX projects in the browser.
//
// Every project lives in localStorage first, signed in or not: the workspace
// must never wait on the network to show a designer their own work, and must
// never lose an edit because a request failed. A signed-in designer's projects
// are also pushed to /api/ux/projects (lib/ux/sync in the workspace), and the
// newer copy wins when the two meet.
//
// The index is small (names and dates) and read on the home screen; each
// project is its own key so saving one never rewrites the others.

import { normalizeProject, summarize, type ProjectSummary, type UXProject } from './model';

export const INDEX_KEY = 'socria.ux.index.v1';
export const PROJECT_KEY = (id: string) => `socria.ux.project.v1:${id}`;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const browser = (): KV | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function readIndex(kv: KV | null = browser()): ProjectSummary[] {
  if (!kv) return [];
  try {
    const raw = JSON.parse(kv.getItem(INDEX_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => s && typeof s.id === 'string')
      .map((s) => ({
        id: String(s.id),
        name: typeof s.name === 'string' ? s.name : 'Untitled project',
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
        artboards: typeof s.artboards === 'number' ? s.artboards : 0,
        problem: typeof s.problem === 'string' ? s.problem : '',
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeIndex(list: ProjectSummary[], kv: KV): void {
  kv.setItem(INDEX_KEY, JSON.stringify(list.sort((a, b) => b.updatedAt - a.updatedAt)));
}

export function loadProject(id: string, kv: KV | null = browser()): UXProject | null {
  if (!kv) return null;
  try {
    return normalizeProject(JSON.parse(kv.getItem(PROJECT_KEY(id)) || 'null'));
  } catch {
    return null;
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

/**
 * Save one project and its line in the index. A full quota is reported, not
 * thrown: the usual cause is an uploaded screenshot, and the workspace says so.
 */
export function saveProject(p: UXProject, kv: KV | null = browser()): SaveResult {
  if (!kv) return { ok: false, reason: 'unavailable' };
  try {
    kv.setItem(PROJECT_KEY(p.id), JSON.stringify(p));
    const list = readIndex(kv).filter((s) => s.id !== p.id);
    list.push(summarize(p));
    writeIndex(list, kv);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'quota' };
  }
}

export function deleteProject(id: string, kv: KV | null = browser()): void {
  if (!kv) return;
  try {
    kv.removeItem(PROJECT_KEY(id));
    writeIndex(readIndex(kv).filter((s) => s.id !== id), kv);
  } catch {
    /* nothing to undo */
  }
}

/** Of two copies of one project, the one edited last. */
export function newer(a: UXProject | null, b: UXProject | null): UXProject | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}
