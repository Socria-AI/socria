// app/ux-v0/page.tsx — SocriaUX v0 (socria.app/ux-v0).
//
// A Human-First design environment: Socratic design generation, design import
// and inspection, and Socratic critique (docs/SOCRIAUX-V0.md). Behind its
// switch (lib/ux-v0/switch.ts): open on dev, previews and a local server;
// a 404 in production until NEXT_PUBLIC_SOCRIAUX_V0=on is set there.

import { notFound } from 'next/navigation';
import { socriauxV0On } from '@/lib/ux-v0/switch';
import { V0Client } from './V0Client';

export default function UXV0Page() {
  if (!socriauxV0On()) notFound();
  return <V0Client />;
}
