// app/explore/layout.tsx
//
// docs.css first, then explore.css. The first brings the framed-exhibit
// vocabulary this page is built out of (see the note in page.tsx for why it
// is reused rather than copied); the second adds only what is new. Order
// matters: explore.css overrides a few of the docs rules and must win.

import './../docs/docs.css';
import './explore.css';

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
