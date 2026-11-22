// app/chat/layout.tsx — Logos 5 is a client component, so how it introduces itself lives here.
//
// It is the product, not a page about it: a guest's line of thinking, or a person's own conversations once they are
// signed in. Never a search result. robots.txt lets crawlers fetch it on purpose: every "Start a conversation" on the
// site leads here, and a page a crawler is not allowed to read can still be listed from those links, while one it reads
// and finds noindex is dropped. The same noindex rides on the response's X-Robots-Tag (next.config.js).
import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

// the tab says Socria, as it did; the app sets no title of its own
export const metadata: Metadata = { title: { absolute: 'Socria' }, ...NOINDEX };

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
