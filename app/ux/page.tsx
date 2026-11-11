// app/ux/page.tsx — SocriaUX (socria.app/ux).
//
// A design environment built around human judgement: the design at the centre,
// SocriaUX's reasoning beside it. Everything is in components/ux and lib/ux;
// this page only learns whether someone is signed in, and does not wait for
// it — the workspace runs from the browser's own copy from the first frame,
// and sync starts when the session is known.

'use client';

import { useUser } from '@clerk/nextjs';
import { UXStudio } from '@/components/ux/UXStudio';

export default function UXPage() {
  const { isSignedIn } = useUser();
  return <UXStudio signedIn={!!isSignedIn} />;
}
