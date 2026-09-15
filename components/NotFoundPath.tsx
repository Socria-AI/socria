'use client';
// components/NotFoundPath.tsx
//
// The path they actually asked for, shown back to them.
//
// Client-side because a server component cannot see the URL of a page that
// did not match a route. Two things it deliberately does NOT do: it never
// shows the query string, which is where tokens and email addresses end up
// and which has no business being rendered into a page; and it clips a long
// path to its last segment, because a 300-character URL pasted across a
// 404 is not information, it is a layout accident.
import { useEffect, useState } from 'react';

export function NotFoundPath() {
  const [path, setPath] = useState('');

  useEffect(() => {
    try {
      // pathname only — never location.search.
      const raw = window.location.pathname.replace(/\/+$/, '');
      const seg = raw.split('/').filter(Boolean).pop() || '';
      const shown = raw.length > 0 && raw.length <= 48 ? raw : '/' + decodeURIComponent(seg);
      setPath(shown.slice(0, 64));
    } catch {
      setPath('');
    }
  }, []);

  if (!path) return null;
  return (
    <span className="path" title={path}>
      {path}
    </span>
  );
}
