// app/api/ux-v0/design-system/route.ts
// POST { url } → { system } read from a public GitHub repository's design tokens, CSS variables and guidelines
//
// Uploaded files never come here: the browser reads them itself (lib/ux-v0/design-system.ts parseDesignSystem).
// This route only reaches GitHub, which a browser cannot do for a whole repository in one go: two fixed hosts,
// a checked owner, repository, branch and folder, at most eight capped files, nothing run
// (lib/ux-v0/design-system-server.ts). No model is asked, so nothing is spent.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseDesignSystem } from '@/lib/ux-v0/design-system';
import { fetchSystemFiles, repoTarget } from '@/lib/ux-v0/design-system-server';
import { bad, readBody, signInFirst } from '@/lib/ux-v0/route-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const body = await readBody(req, 4000);
  const target = repoTarget(body?.url);
  if (!target) return bad('Give a public GitHub repository, like github.com/owner/repo (a branch and folder may follow).');
  try {
    const got = await fetchSystemFiles(target);
    if ('error' in got) return NextResponse.json({ error: got.error }, { status: got.status });
    const r = parseDesignSystem(got.files, { kind: 'github', ref: `${target.owner}/${target.repo}${target.dir ? `/${target.dir}` : ''}`, files: [] });
    if (!r.system) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json({ system: r.system });
  } catch (e) {
    console.error('ux-v0 design-system import failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'GitHub could not be reached just now. Try again, or upload the files instead.' }, { status: 502 });
  }
}
