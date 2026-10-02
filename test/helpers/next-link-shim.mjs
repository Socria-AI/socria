// next/link, for a component rendered under test: an anchor and nothing else.
// The real one needs Next's router; the markup a suite checks does not.
import { createElement } from 'react';
export default function Link({ href, children, prefetch, ...rest }) {
  return createElement('a', { href: typeof href === 'string' ? href : String(href?.pathname ?? ''), ...rest }, children);
}
