// app/explore/page.tsx — what Socria is for, shown rather than described.
//
// The wrapper carries `docs-root` deliberately. That class is where the
// framed-product exhibit lives — the chrome, the caption, the rule that puts
// `.logos-root` back into normal flow so a live surface can sit inside a
// figure — and this page mounts exactly those exhibits. Restating sixty lines
// of it under a new name would give two copies to keep in step, and the one
// nobody edits is the one that rots. `exp-root` carries only what is new here.

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ExploreShowcase } from './ExploreShowcase';

export const metadata: Metadata = {
  title: 'Explore Socria — what a reasoning environment is actually for',
  description:
    'Six things people bring to Socria — research, learning, decisions, argument, creative work, and plain conversation — each shown in the running product rather than described.',
};

export default function ExplorePage() {
  return (
    <div className="docs-root exp-root">
      <header className="exp-top">
        <Link href="/" className="exp-home" aria-label="Socria home">
          <Image src="/socria-logo.png" alt="" width={26} height={26} />
          <span>Socria</span>
        </Link>
        <nav className="exp-nav">
          <Link href="/logos">Logos</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/chat">Open Socria</Link>
        </nav>
      </header>

      <main className="exp-main">
        <div className="exp-lede">
          <p className="exp-eyebrow">Explore</p>
          <h1 className="exp-h1">
            Six things people actually bring here.
          </h1>
          <p className="exp-sub">
            Every one below is the running product, not a picture of it — the
            same map component the app mounts, on real reasoning, mid-thought.
            Switch a lens. Drag the parameter. Nothing here is finished, because
            thinking that has been finished for you was never yours.
          </p>
        </div>

        <ExploreShowcase />

        <section className="exp-end">
          <h2>Bring the thing you are stuck on.</h2>
          <p>
            Logos is a model, not a page — it opens inside the chat you already
            have. Core 3.1 is there in the same picker when you want the
            conversation without the apparatus.
          </p>
          <div className="exp-end-actions">
            <Link className="exp-go" href="/chat?model=logos">
              Open Logos <span aria-hidden="true">→</span>
            </Link>
            <Link className="exp-quiet" href="/docs">
              Read the docs
            </Link>
          </div>
        </section>
      </main>

      <footer className="exp-foot">Think for yourself.</footer>
    </div>
  );
}
