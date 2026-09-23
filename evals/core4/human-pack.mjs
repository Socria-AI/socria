#!/usr/bin/env node
// Build a blind human-evaluation pack from a graded run.
//
//   node evals/core4/human-pack.mjs --run <dir> [--n 40] [--rater <name>]
//
// Writes <run>/human/<rater>.html: one self-contained page (no network, no
// build) showing, per scenario, the two transcripts as A and B — the SAME
// blinding as the model judge (grade.mjs's key.json, which is not in the
// page) — with a preference and four 1–5 ratings per scenario and a
// preference per turn. "Download ratings" saves JSON in the judgment format;
// drop it into <run>/judgments-human/<rater>/ and grade.mjs reads it with
// --judgments judgments-human/<rater>.
//
// Human judgment is the check on the model judge, not a decoration: the
// report states agreement between the two, and a result that holds only for
// the model judge is reported as such (docs/CORE-4-EVALS.md).
//
// Scenarios are sampled stratified by category, deterministically per rater,
// so two raters can be given overlapping or disjoint sets on purpose.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), [])
);
const run = resolve(args.run || 'evals/core4/runs/scratch');
const n = Number(args.n || 40);
const rater = String(args.rater || 'rater-1').replace(/[^a-z0-9-]/gi, '');
const dir = join(run, 'judging');
if (!existsSync(dir)) {
  console.error('no judging packets — run grade.mjs first');
  process.exit(1);
}
const packets = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

// Stratified, deterministic per rater.
const rank = (id) => createHash('sha256').update(rater + id).digest('hex');
const byCat = new Map();
for (const p of packets.sort((a, b) => rank(a.scenario).localeCompare(rank(b.scenario)))) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
const chosen = [];
while (chosen.length < Math.min(n, packets.length)) {
  for (const [, list] of byCat) if (list.length && chosen.length < n) chosen.push(list.shift());
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const side = (p, k) =>
  p[k]
    .map((sess, si) =>
      `<div class="sess">${p[k].length > 1 ? `<div class="sl">Session ${si + 1}</div>` : ''}${sess
        .map((t, ti) => `<div class="t"><div class="u">${esc(t.user)}</div><div class="r" data-s="${si + 1}" data-t="${ti + 1}">${esc(t.reply)}</div></div>`)
        .join('')}</div>`
    )
    .join('');

const cards = chosen
  .map((p, i) => {
    const turnRows = p.A.flatMap((sess, si) => sess.map((_, ti) => ({ s: si + 1, t: ti + 1 })));
    return `<section class="card" data-id="${esc(p.scenario)}">
<h2>${i + 1}. <span class="cat">${esc(p.category)}</span></h2>
<p class="persona"><b>Who this person is:</b> ${esc(p.persona)}${p.project ? `<br><b>Their Project:</b> ${esc(p.project.name)} — ${esc(p.project.instructions ?? '')}` : ''}</p>
<div class="pair"><div class="col"><h3>A</h3>${side(p, 'A')}</div><div class="col"><h3>B</h3>${side(p, 'B')}</div></div>
<div class="rate">
${turnRows.map((r) => `<div class="tr">Turn ${r.s > 1 ? `${r.s}.` : ''}${r.t}: better reply is <label><input type="radio" name="${esc(p.scenario)}-t-${r.s}-${r.t}" value="A">A</label><label><input type="radio" name="${esc(p.scenario)}-t-${r.s}-${r.t}" value="B">B</label><label><input type="radio" name="${esc(p.scenario)}-t-${r.s}-${r.t}" value="tie">no difference</label></div>`).join('')}
<div class="tr"><b>Overall, which would you rather have talked to?</b> <label><input type="radio" name="${esc(p.scenario)}-o" value="A">A</label><label><input type="radio" name="${esc(p.scenario)}-o" value="B">B</label><label><input type="radio" name="${esc(p.scenario)}-o" value="tie">no difference</label>
 · by <select name="${esc(p.scenario)}-m"><option value="1">a little</option><option value="2">clearly</option><option value="3">a lot</option></select></div>
${['A', 'B'].map((k) => `<div class="tr scores">${k}: ${[['helpfulness', 'helped me'], ['agency', 'left me in charge'], ['peer', 'felt like a peer'], ['friction', 'wasted my time (5 = a lot)']].map(([f, l]) => `<label>${l} <select name="${esc(p.scenario)}-${k}-${f}"><option></option>${[1, 2, 3, 4, 5].map((v) => `<option>${v}</option>`).join('')}</select></label>`).join(' ')}</div>`).join('')}
<textarea name="${esc(p.scenario)}-why" placeholder="Why? (one or two sentences)"></textarea>
</div></section>`;
  })
  .join('\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Socria — blind comparison</title>
<style>
:root{--paper:#faf8f3;--ink:#1d1c1a;--muted:#6b675f;--line:#e2ddd2}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Georgia,serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 80px}
h1{font-weight:400;font-size:1.9rem;margin:0 0 6px}.intro{color:var(--muted);max-width:70ch}
.card{border-top:1px solid var(--line);padding:22px 0}.cat{font:12px system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
h2{font-weight:400;font-size:1.2rem;margin:0}.persona{color:var(--muted);font-size:14px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:760px){.pair{grid-template-columns:1fr}}
.col{background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px}.col h3{margin:0 0 8px;font:600 13px system-ui}
.sl{font:12px system-ui;color:var(--muted);margin:10px 0 4px}.t{margin-bottom:12px}
.u{font:14px system-ui;background:#f1eee6;border-radius:6px;padding:8px 10px;white-space:pre-wrap}
.r{padding:8px 2px;white-space:pre-wrap;overflow-wrap:anywhere}
.rate{font:14px system-ui;margin-top:10px;display:grid;gap:6px}.tr label{margin-left:10px}.scores label{margin-right:12px;margin-left:0}
textarea{width:100%;box-sizing:border-box;min-height:48px;font:14px system-ui;padding:6px}
button{font:14px system-ui;padding:10px 18px;border-radius:999px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);cursor:pointer}
.bar{position:sticky;bottom:0;background:var(--paper);border-top:1px solid var(--line);padding:10px 0;display:flex;gap:12px;align-items:center}
</style></head><body><main>
<h1>Which would you rather think with?</h1>
<p class="intro">Each case shows the same person, saying the same things, to two assistants (A and B). Which is which changes from case to case and is not recorded here. Rate the replies as if you were that person: did it help, did it leave the decisions that were yours with you, did it treat you as a capable adult, did it waste your time? There are no right answers.</p>
${cards}
<div class="bar"><button id="dl">Download ratings</button><span id="st"></span></div>
</main>
<script>
const KEY='socria-blind-${rater}';
const form=()=>document.querySelectorAll('input,select,textarea');
try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');form().forEach(el=>{if(!(el.name in saved))return;if(el.type==='radio')el.checked=saved[el.name]===el.value;else el.value=saved[el.name];});}catch{}
document.addEventListener('change',()=>{const o={};form().forEach(el=>{if(el.type==='radio'){if(el.checked)o[el.name]=el.value}else o[el.name]=el.value});try{localStorage.setItem(KEY,JSON.stringify(o))}catch{}});
document.getElementById('dl').onclick=()=>{
  const out=[];let missing=0;
  document.querySelectorAll('.card').forEach(c=>{
    const id=c.dataset.id;const v=n=>{const el=c.querySelector('[name="'+id+'-'+n+'"]');if(!el)return null;if(el.type==='radio'){const x=c.querySelector('[name="'+id+'-'+n+'"]:checked');return x?x.value:null}return el.value||null};
    const turns=[...c.querySelectorAll('.r')].filter(r=>r.closest('.col').querySelector('h3').textContent==='A').map(r=>({session:+r.dataset.s,turn:+r.dataset.t,better:v('t-'+r.dataset.s+'-'+r.dataset.t),margin:1,why:'',A:{},B:{}}));
    const sc=k=>Object.fromEntries(['helpfulness','agency','peer','friction'].map(f=>[f,v(k+'-'+f)?+v(k+'-'+f):null]));
    const better=v('o');if(!better)missing++;
    out.push({scenario:id,rater:'${rater}',turns,overall:{better,margin:+(v('m')||1),scores:{A:sc('A'),B:sc('B')},why:v('why')||''}});
  });
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ratings-${rater}.json';a.click();
  document.getElementById('st').textContent=missing?missing+' case(s) have no overall preference yet.':'Saved.';
};
</script></body></html>`;

mkdirSync(join(run, 'human'), { recursive: true });
const file = join(run, 'human', `${rater}.html`);
writeFileSync(file, html);
process.stdout.write(JSON.stringify({ file, scenarios: chosen.length }) + '\n');
