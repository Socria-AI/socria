// next/image, for a component rendered under test: a plain <img>.
import { createElement } from 'react';
export default function Image({ src, alt = '', priority, fill, ...rest }) {
  return createElement('img', { src: typeof src === 'string' ? src : src?.src ?? '', alt, ...rest });
}
