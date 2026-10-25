// test/helpers/mr-under-test.ts — every pure module of Metacognitive
// Regulation (lib/mr), in one bundle, so the MR suites import one file and no
// lib/mr basename can collide with an existing module's output.
// lib/mr/store.ts is not here: it reaches the database, and its suite builds
// it with its swaps. The deliberative loop is: its model client is injected.
export * from '@/lib/mr/types';
export * from '@/lib/mr/config';
export * from '@/lib/mr/ifr';
export * from '@/lib/mr/outcome';
export * from '@/lib/mr/integrity';
export * from '@/lib/mr/experiment';
export * from '@/lib/mr/adaptation';
export * from '@/lib/mr/research';
export * from '@/lib/mr/policy';
export * from '@/lib/mr/state';
export * from '@/lib/mr/execute';
export * from '@/lib/mr/ledger';
export * from '@/lib/mr/words';
export * from '@/lib/mr/index';
export * from '@/lib/mr/deliberate';
