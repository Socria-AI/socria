import { PLANS, COUNTERS, COUNTER_SCOPE, limitsFor, limitOf, isSpent, remaining, boundaryNote } from './.tmp/entitlements.mjs';
let pass=0, fail=0;
const ok=(n,c,x='')=>c?pass++:(fail++,console.log('FAIL',n,x));

console.log('=== the requested free limits ===');
const f = PLANS.free;
ok('2 chats per month', f.counters.chats===2);
ok('1 explore per chat', f.counters.explore===1);
ok('1 research per chat', f.counters.research===1);
ok('1 challenge per chat', f.counters.challenge===1);
ok('1 context per chat', f.counters.context===1);
ok('1 image per chat', f.counters.images===1);
ok('1 file per chat', f.counters.files===1);
ok('map depth limited but usable', f.mapNodes===8, String(f.mapNodes));
ok('map structures limited, not withheld', f.lenses===2, String(f.lenses));
ok('depth limited', f.allDepths===false);
ok('live map evolution limited', f.liveMap===false);
ok('memory limited', typeof f.memoryTurns==='number');

console.log('\n=== One is genuinely unrestricted where it matters ===');
const o = PLANS.one;
ok('One: explore uncapped', o.counters.explore===null);
ok('One: challenge uncapped', o.counters.challenge===null);
ok('One: context uncapped', o.counters.context===null);
ok('One: map nodes uncapped', o.mapNodes===null);
ok('One: all lenses', o.lenses===null);
ok('One: all depths', o.allDepths===true);
ok('One: full live map', o.liveMap===true);
ok('One: full memory', o.memoryTurns===null);
ok('One: chats far above free', (o.counters.chats??0) >= 100);
ok('One: every counter >= free', COUNTERS.every(c => o.counters[c]===null || (f.counters[c]??0) <= (o.counters[c]??0)));

console.log('\n=== try once, THEN the boundary ===');
for (const c of ['explore','research','challenge','context','images','files']) {
  ok(`${c}: first use allowed`, !isSpent('free', c, 0));
  ok(`${c}: second use blocked`, isSpent('free', c, 1));
  ok(`${c}: One never blocked at 50`, !isSpent('one', c, 50));
}
ok('chats: 1st and 2nd allowed, 3rd blocked',
  !isSpent('free','chats',0) && !isSpent('free','chats',1) && isSpent('free','chats',2));

console.log('\n=== remaining, for the panel ===');
ok('2 left at zero used', remaining('free','chats',0)===2);
ok('0 left at two used', remaining('free','chats',2)===0);
ok('never negative', remaining('free','chats',99)===0);
ok('uncapped reads as null', remaining('one','explore',999)===null);

console.log('\n=== scopes ===');
ok('chats reset monthly', COUNTER_SCOPE.chats==='month');
ok('everything else is per chat', COUNTERS.filter(c=>c!=='chats').every(c=>COUNTER_SCOPE[c]==='chat'));

console.log('\n=== the boundary is said calmly ===');
for (const c of COUNTERS) {
  const note = boundaryNote(c);
  ok(`${c}: two sentences, names One`, note.includes('Socria One') && note.length > 40, note);
  ok(`${c}: no pressure words`, !/upgrade now|hurry|only|!|limited time/i.test(note), note);
}
console.log('\n  example:', boundaryNote('explore'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
