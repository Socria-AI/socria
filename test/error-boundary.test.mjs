// When a page breaks, it says so and offers a way back — instead of Next's
// blank "Application error". The two boundaries are app/error.tsx (any page,
// below the root layout) and app/global-error.tsx (the root layout itself).
//
// Rendered here as Next renders them, with an error and a reset: what they
// say, that they say only what is true, that each way back is a real control,
// and that the error's own message — which can carry anything — never reaches
// the page. That they are wired in where Next looks for them is read from the
// files themselves.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { PageError, GlobalError } from './.tmp/errors-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const SECRET = 'TypeError: cannot read properties of undefined (reading "token=abc123")';
const error = Object.assign(new Error(SECRET), { digest: '2817364591' });
const quietly = (f) => {
  const was = console.error;
  console.error = () => {};
  try {
    return f();
  } finally {
    console.error = was;
  }
};

console.log('\nwhere Next looks for them');
for (const f of ['app/error.tsx', 'app/global-error.tsx']) {
  ok(`${f} exists`, existsSync(join(root, f)));
  ok(`  and is a client component, as Next requires`, /^'use client';/.test(read(f)));
}
ok('the root layout’s net brings its own document', /<html lang="en">/.test(read('app/global-error.tsx')) && /<body/.test(read('app/global-error.tsx')));

for (const [name, C] of [
  ['a page that broke', PageError],
  ['the root layout broke', GlobalError],
]) {
  console.log(`\n${name}`);
  const html = quietly(() => renderToStaticMarkup(h(C, { error, reset: () => {} })));
  ok('says what happened, as an alert', /role="alert"/.test(html) && /stopped working/.test(html));
  ok('claims only what was saved, not what was being typed', /What was saved is still there/.test(html) && /still typing[^<]*may need saying again/.test(html));
  ok('never says nothing was lost', !/nothing (was )?lost|everything is saved|all your work is saved/i.test(html));
  ok('offers "Try again" as a real button', /<button type="button"[^>]*>(<[^>]+>)*Try again/.test(html));
  ok('and a way to the start', /href="\/"/.test(html));
  ok('gives the reference a person can quote', html.includes('2817364591'));
  ok('never shows the error’s own message', !html.includes('token=abc123') && !html.includes('cannot read properties'));
  ok('no emoji', !/\p{Extended_Pictographic}/u.test(html));
}

console.log('\nwithout a reference, none is invented');
{
  const html = quietly(() => renderToStaticMarkup(h(PageError, { error: new Error('x'), reset: () => {} })));
  ok('no "reference" line', !/reference/.test(html));
}

console.log('\nthe ways back do what they say');
{
  // reset is what Next hands the boundary to draw the segment again; it must be the click.
  const src = read('app/error.tsx');
  ok('"Try again" calls reset()', /onClick=\{\(\) => reset\(\)\}[\s\S]{0,80}Try again/.test(src));
  ok('"Reload" reloads the page', /onClick=\{\(\) => window\.location\.reload\(\)\}[\s\S]{0,80}Reload/.test(src));
  ok('the error is logged, for the console and the server’s digest', /console\.error\('\[socria\] a page stopped:', error\)/.test(src));
}

console.log(`\nerror-boundary: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
