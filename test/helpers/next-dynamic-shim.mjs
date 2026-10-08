// next/dynamic, under test.
//
// What next/dynamic loads is a browser-only piece — a WebGL canvas, say — and
// under test there is no browser to load it into. So the shim renders what
// next/dynamic itself renders before the piece arrives: the `loading`
// component, or nothing.
import { createElement } from 'react';

export default function dynamic(_load, opts = {}) {
  const Loading = opts.loading;
  return function DynamicShim() {
    return Loading ? createElement(Loading, { isLoading: true, pastDelay: true, error: null }) : null;
  };
}
