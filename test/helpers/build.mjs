// Bundle the libraries under test into plain ESM.
//
// The suites exercise pure modules — the evaluator, the visualisation
// builders, the entitlement table, the local detectors. None of them touch
// React, the network or the database, which is what makes them fast enough to
// run on every push and worth trusting when they pass.
//
// esbuild rather than a test framework: the project already carries it, it
// strips the types in milliseconds, and a runner this small is easier to read
// than the configuration a framework would need.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const OUT = join(here, '..', '.tmp');

/** Every module a suite may import. Add one here when a suite needs it. */
const MODULES = [
  'lib/logos-math.ts',
  'lib/logos-viz.ts',
  'lib/logos-layout.ts',
  'lib/logos.ts',
  'lib/representation.ts',
  'lib/logos-synthesis.ts',
  'lib/theme.ts',
  'lib/entitlements.ts',
  'lib/usage-scope.ts',
  'lib/logos-flow.ts',
  'lib/onboarding.ts',
  'lib/onboarding-script.ts',
  'lib/pfp.ts',
  'lib/tour.ts',
  'lib/hints.ts',
  'lib/find.ts',
  'lib/socria-one.ts',
  'lib/rich-text.ts',
  'lib/easter-eggs.ts',
  'lib/upstream-error.ts',
  'lib/upstream-health.ts',
  'lib/logos-explore.ts',
  'lib/logos-physics.ts',
  'lib/elements.ts',
  'lib/hand-gestures.ts',
  'lib/socria-model-store.ts',
  'lib/math-context.ts',
  'lib/topic-drift.ts',
  'lib/one-prompt.ts',
  'lib/analytics.ts',
  'lib/tex-split.ts',
  'lib/logos-econ.ts',
  'lib/starters.ts',
  'lib/subscriptions.ts',
  'lib/entitlement-rule.ts',
  'lib/billing-message.ts',
  'lib/stripe-diagnosis.ts',
  'lib/socria-edu.ts',
  'lib/clerk-errors.ts',
  'lib/qr.ts',
  'lib/account-guards.ts',
  'lib/logos-personality.ts',
  'lib/logos-viz3d.ts',
  'lib/viz-model.ts',
  'lib/model/schema.ts',
  'lib/model/primitives.ts',
  'lib/model/sample.ts',
  'lib/model/compile.ts',
  'lib/model/spec.ts',
  'lib/model/state.ts',
  'lib/model/system.ts',
  'lib/model/mechanism.ts',
  'lib/model/estimate.ts',
  'lib/model/solve.ts',
  'lib/model/propose.ts',
  'lib/model/docs.ts',
  'lib/model/gravity.ts',
  'lib/model/ids.ts',
  'lib/model/expr.ts',
  'lib/model/terms.ts',
  'lib/model/derive.ts',
  'lib/model/views.ts',
  'lib/model/viewdata.ts',
  'lib/model/inspect.ts',
  'lib/model/algebra.ts',
  'lib/model/equations.ts',
  'lib/model/deps.ts',
  'lib/model/symbols.ts',
  'lib/model/unpack.ts',
  'lib/model/ask.ts',
  'lib/model/library.ts',
  'lib/model/science.ts',
  'lib/surface-science.ts',
  'lib/workspace/object.ts',
  'lib/workspace/store.ts',
  'lib/workspace/trace.ts',
  'lib/workspace/adapters.ts',
  'lib/workspace/write.ts',
  'lib/workspace/impact.ts',
  'lib/workspace/portable.ts',
  'lib/link-preview.ts',
  'lib/support-faq.ts',
  'lib/model/wants.ts',
  'lib/mind/ar.ts',
  'lib/rooms-flag.ts',
  'lib/workspace/tiling.ts',
  'lib/workspace/surfaces.ts',
  'lib/workspace/focus.ts',
  'lib/model/binding.ts',
  'lib/model/kinds.ts',
  'lib/model/units.ts',
  'lib/collab.ts',
  'lib/collab-transport.ts',
  'lib/conversation-surface.ts',
  'lib/viz-semantics.ts',
  'lib/why-not-answer.ts',
  'lib/wrong-chat.ts',
  'lib/auth-links.ts',
  'lib/auth-flow.ts',
  'lib/session-rail.ts',
  'lib/map-edit.ts',
  'lib/first-run.ts',
  'lib/logos-connect.ts',
  'lib/access-codes-server.ts',
  'lib/local-data.ts',
  'lib/cognition/state.ts',
  'lib/core4/signals.ts',
  'lib/core4/questions.ts',
  'lib/core4/merge.ts',
  'lib/core4/budget.ts',
  'lib/core4/split.ts',
  'lib/core4/activity.ts',
  'lib/core4/limits.ts',
  'lib/core4/allocation.ts',
  'lib/core4/intervene.ts',
  'lib/core4/considered.ts',
  'lib/core4/problem.ts',
  'lib/core4/contribution.ts',
  'lib/core4/guard2.ts',
  'lib/core4/verify.ts',
  'lib/core4/ledger.ts',
  'lib/core4/capability.ts',
  'lib/core4/counterfactual.ts',
  'lib/core4/history.ts',
  'lib/core4/turn.ts',
  'lib/core4/voice.ts',
  'lib/core4/web.ts',
  'lib/core4/trace.ts',
  'lib/core4/stream-gate.ts',
  'lib/cognition/router.ts',
  'lib/cognition/guard.ts',
  'lib/mind/types.ts',
  'lib/mind/layout.ts',
  'lib/mind/projects.ts',
  'lib/mind/resolve.ts',
  'lib/mind/self.ts',
  'lib/mind/gate.ts',
  'lib/mind/apply.ts',
  'lib/mind/activate.ts',
  'lib/mind/serialize.ts',
  'lib/mind/extract.ts',
  'lib/mind/ingest-text.ts',
  'lib/checkout-attribution.ts',
  'lib/person-memory.ts',
  'lib/file-kinds.ts',
  'lib/chat-attachments.ts',
  'lib/file-extract.ts',
  'lib/first-session.ts',
  'components/MapPoster.tsx',
  'components/LogosRail.tsx',
  'components/Logos2Cover.tsx',
  'lib/lifecycle.ts',
  'lib/email.ts',
  'lib/socria-prompt.ts',
  'app/explore/scenarios.ts',
  'app/docs/registry.ts',
];

export async function buildAll() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const root = join(here, '..', '..');
  // ONE NAME PER MODULE, AND A COLLISION IS A SILENT DISASTER.
  //
  // The output was the basename alone, so lib/model/state.ts and
  // lib/cognition/state.ts both wrote .tmp/state.mjs and whichever finished
  // last won — a suite importing one of them got the other's exports, and the
  // error it produced pointed at the import rather than at the overwrite.
  // Where two modules share a basename, both take their folder with them; the
  // rest keep the name every existing suite already imports.
  const seen = new Map();
  for (const m of MODULES) {
    const base = m.split('/').pop().replace(/\.tsx?$/, '');
    seen.set(base, (seen.get(base) ?? 0) + 1);
  }
  const outName = (m) => {
    const parts = m.replace(/\.tsx?$/, '').split('/');
    const base = parts[parts.length - 1];
    if ((seen.get(base) ?? 0) < 2) return `${base}.mjs`;
    const dir = parts[parts.length - 2] ?? 'lib';
    return `${dir}-${base}.mjs`;
  };

  await Promise.all(
    MODULES.map((m) =>
      build({
        entryPoints: [join(root, m)],
        bundle: true,
        format: 'esm',
        platform: 'node',
        outfile: join(OUT, outName(m)),
        // tsconfig says jsx: preserve, which Node cannot load; the one .tsx
        // module under test (the poster) is bundled with the automatic runtime.
        jsx: 'automatic',
        // A component carries its stylesheet (the rail imports app-shell.css);
        // under test the markup is what is checked, so the sheet is nothing.
        loader: { '.css': 'empty' },
        // `server-only` is a guard, not code: its whole job is to throw when
        // resolved for a browser. esbuild picks the browser condition by
        // default even at platform:'node', so a server-only module under test
        // would explode on import. Resolving it as Next.js does on the server
        // gives the no-op, and the guard still does its real job at build time
        // — test/no-client-secrets asserts separately that no client component
        // imports one of these modules.
        // See test/helpers/server-only-shim.mjs: the marker package throws
        // when resolved outside a server component, which would stop a
        // server-only module being tested at all.
        alias: {
          'server-only': join(here, 'server-only-shim.mjs'),
          // Next's link and image need Next's runtime; a component under test
          // needs an anchor and an img. See the two shims beside this file.
          'next/link': join(here, 'next-link-shim.mjs'),
          'next/image': join(here, 'next-image-shim.mjs'),
        },
        // undici uses dynamic require() internally, which does not survive
        // being bundled into ESM. It is a real dependency at runtime, so let
        // Node resolve it there instead of inlining it.
        // Both use dynamic require() internally, which does not survive
        // being bundled into ESM. They are real dependencies at runtime, so
        // Node resolves them there.
        // React itself stays external too: a component bundled WITH its own
        // copy of React cannot be rendered by the react-dom in node_modules —
        // two Reacts, and every hook throws. The same for Next's primitives.
        external: ['undici', 'openai', 'unpdf', 'react', 'react/jsx-runtime', 'react-dom'],
        logLevel: 'error',
      })
    )
  );
}
