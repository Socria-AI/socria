// app/api/health/upstream/route.ts
//
// GET → what this deployment can and cannot reach, in its own words.
//
// Signed in only. Not because the answer is sensitive — it is deliberately
// built not to be — but because an unauthenticated endpoint that pokes the
// provider on request is a free way to burn somebody else's rate limit.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import { enforceRateLimit } from '@/lib/rate-limit';
import { CORE_3_MODEL, CORE_3_FALLBACK_MODEL, CORE_4_MODEL } from '@/lib/socria-prompt';
import { deployedCommit, probeModels, probeSearch, probeStore, summarise } from '@/lib/upstream-health';
import { runSearch, searchConfigured } from '@/lib/logos-explore';
import { storeHealth } from '@/lib/core4/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  const base = {
    commit: deployedCommit(),
    node: process.version,
    hasApiKey: !!apiKey,
  };

  // Whether Core 4 can look things up, asked of this runtime rather than of the
  // dashboard. `images: false` because nothing here displays one, and it is one
  // fewer billed request per check.
  const [search, store] = await Promise.all([
    probeSearch({ configured: searchConfigured, run: (q) => runSearch(q, { images: false }) }),
    // Whether Core 4 can read its own tables. Ahead of the models in the
    // verdict's order, because an unreadable state row takes its memory, its
    // carried-forward reasoning and its lookups with it.
    probeStore(storeHealth),
  ]);

  if (!apiKey) {
    return NextResponse.json({
      ...base,
      probes: [],
      search,
      store,
      verdict: summarise({ ...base, probes: [], search, store }),
    });
  }

  // The reply models, then the fallback: the fallback answering while the
  // others do not is exactly the "model id is wrong" case, and seeing all
  // three at once is what makes that readable.
  const models = [...new Set([CORE_4_MODEL, CORE_3_MODEL, CORE_3_FALLBACK_MODEL])];
  const probes = await probeModels(new OpenAI({ apiKey, maxRetries: 0 }), models);
  return NextResponse.json({ ...base, probes, search, store, verdict: summarise({ ...base, probes, search, store }) });
}
