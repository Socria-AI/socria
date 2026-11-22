// HOOKS IN ORDER — no component calls a hook after it may already have returned.
//
// React requires every render of a component to call the same hooks in the same order. A hook written below an early
// return (`if (!ready) return …`) is skipped by the renders that return early and called by the next one, and React
// throws "Rendered more hooks than during the previous render" (minified error #310). The page's error boundary then
// shows "This page stopped working".
//
// That is what happened in production on 22 November 2026. LogosApp returns early until access has been settled
// (`if (!hasAccess) return …`), and the Omnibox's preview was added below it as a `useMemo`. A first load returned
// early, the next render did not, and /chat broke for signed-out and signed-in people alike until they reloaded.
// Rendering once on the server (which every other suite does) cannot show it, because the hooks only differ between
// two renders. So this reads the code.
//
// The check: in every component (a PascalCase function at the top level of a .tsx file), find the first early
// return in its own body (two-space indentation, `if (…) return …` or `if (…) {` with `return` inside), and fail
// if a hook (`useX(…)` called at that same top level) comes after it.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 1500))));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Hooks called after the first early return, in each component of one file's text. */
export function hooksAfterReturn(text) {
  const lines = text.split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:export\s+(?:default\s+)?)?function\s+([A-Z]\w*)\s*[(<]/);
    if (!m) continue;
    let first = -1;
    for (let j = i + 1; j < lines.length && lines[j] !== '}'; j++) {
      const l = lines[j];
      if (first < 0 && (/^  if \(.*\) return\b/.test(l) || (/^  if \(.*\) \{$/.test(l) && /^    return\b/.test(lines[j + 1] ?? '')))) {
        first = j;
        continue;
      }
      // a hook at the component's own top level: `useX(`, or assigned from one (`const x = useX(`, `const [a, b] = useX(`)
      if (first >= 0 && (/^  use[A-Z]\w*\(/.test(l) || /^  (?:const|let|var)\s+[^=]+=\s*use[A-Z]\w*[(<]/.test(l))) {
        found.push({ component: m[1], line: j + 1, returnLine: first + 1, code: l.trim().slice(0, 100) });
      }
    }
  }
  return found;
}

console.log('\n=== the check finds the fault it is for ===');
{
  const bad = ['export function Thing({ ready }) {', '  const [a] = useState(0);', '  if (!ready) return <div />;', '  const b = useMemo(() => a + 1, [a]);', '  return <p>{b}</p>;', '}'].join('\n');
  const found = hooksAfterReturn(bad);
  ok('a hook below an early return is found', found.length === 1 && found[0].component === 'Thing' && found[0].line === 4, JSON.stringify(found));
  const blockReturn = ['function Other({ ready }) {', '  if (!ready) {', '    return null;', '  }', '  useEffect(() => {}, []);', '  return null;', '}'].join('\n');
  ok('…and below an early return in a block', hooksAfterReturn(blockReturn).length === 1);
  const good = ['export function Fine({ ready }) {', '  const [a] = useState(0);', '  const b = useMemo(() => a + 1, [a]);', '  if (!ready) return <div />;', '  const c = (() => b * 2)();', '  return <p onClick={() => useNothing(c)}>{c}</p>;', '}'].join('\n');
  ok('hooks above the early return, and plain code or a handler below it, are fine', hooksAfterReturn(good).length === 0, JSON.stringify(hooksAfterReturn(good)));
}

console.log('\n=== every component in the repository ===');
{
  const files = execSync('git ls-files -- "*.tsx"', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const all = [];
  for (const f of files) for (const h of hooksAfterReturn(readFileSync(join(root, f), 'utf8'))) all.push(`${f}:${h.line} ${h.component} (early return at ${h.returnLine}): ${h.code}`);
  ok(`no component calls a hook after it may have returned (${files.length} files read)`, files.length > 100 && all.length === 0, all.join('\n'));
  const app = readFileSync(join(root, 'components/LogosApp.tsx'), 'utf8');
  ok('LogosApp still returns early until access is settled, and its Omnibox preview is plain code below that, not a hook', /^  if \(!hasAccess\) return /m.test(app) && /^  const omniPreview = \(\(\): \{ said: string; onInstead\?: \(\) => void \} \| null => \{$/m.test(app) && !/omniPreview = useMemo/.test(app));
}

console.log(`\nhooks order: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
