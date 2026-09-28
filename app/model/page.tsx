// app/model/page.tsx — the engine's bench.
//
// Ten models, one renderer, and a page whose only job is to make that visible.
// Every entry here is DATA (lib/model/library.ts) handed to the same component
// (components/model/ModelView.tsx): if one of them ever needs its own code,
// the architecture has stopped being general and this page is where it shows.
//
// Not linked from the product. It is the place to look at a primitive on its
// own, the way /surfaces is for the working surfaces.

import type { Metadata } from 'next';
import { Bench } from './Bench';
import './model.css';

export const metadata: Metadata = {
  title: 'Socria · the representation engine',
  description: 'Ten models, one renderer.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <Bench />;
}
