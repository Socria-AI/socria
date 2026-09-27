'use client';

// components/SourceCards.tsx
//
// What a search actually found, as things you can see.
//
// WHAT WAS WRONG. "Searched the web for 'ai articles'" followed by four lines
// of blue-grey URL was a correct disclosure and an unreadable one. A URL is an
// address, not a description: nobody reads
// `https://pmc.ncbi.nlm.nih.gov/articles/PMC7605294/` and knows whether they
// want it. The cards below give each source the three things that decide that
// — the cover the publisher itself declares, its own name for itself, and a
// title set to be read — while keeping the citation number, because the reply
// above points at it with [2].
//
// COVERS ARE FETCHED, NOT INVENTED. Each card asks /api/preview for the page's
// og:image, which is the picture the publisher nominated for exactly this
// purpose. A page that declares none gets a typographic cover: its initial in
// the Socria register. Nothing is generated, matched by resemblance, or
// borrowed from elsewhere — a wrong cover would be a small lie about what was
// read, and the entire point of a disclosure is that it can be trusted.
//
// AFTER THE ANSWER, NEVER BEFORE IT. The reply has already been written by the
// time any of this runs, so a slow publisher costs a picture and not a turn.

import { useEffect, useState } from 'react';

export interface SourceItem {
  n: number;
  title: string;
  url: string;
}

interface Preview {
  image: string | null;
  title: string | null;
  site: string | null;
}

/**
 * One request per URL per page load, however many cards show it.
 *
 * A conversation is scrolled through, re-rendered and reopened; without this
 * the same four pages would be read again on every pass. The promise itself is
 * cached, so two cards mounting in the same frame make one request.
 */
const asked = new Map<string, Promise<Preview>>();

function preview(url: string): Promise<Preview> {
  const hit = asked.get(url);
  if (hit) return hit;
  const p = fetch(`/api/preview?url=${encodeURIComponent(url)}`, { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: Preview | null) => ({
      image: typeof j?.image === 'string' ? j.image : null,
      title: typeof j?.title === 'string' ? j.title : null,
      site: typeof j?.site === 'string' ? j.site : null,
    }))
    .catch(() => ({ image: null, title: null, site: null }));
  asked.set(url, p);
  return p;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

function Card({ item }: { item: SourceItem }) {
  const [cover, setCover] = useState<Preview | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let live = true;
    preview(item.url).then((p) => {
      if (live) setCover(p);
    });
    return () => {
      live = false;
    };
  }, [item.url]);

  const site = cover?.site || host(item.url);
  const image = !broken ? cover?.image : null;

  return (
    <a
      className="src-card"
      href={item.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      // The title is already on the card; this is for the address, which is
      // the thing a careful reader checks before clicking.
      title={item.url}
    >
      <span className="src-cover">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a third-party
          // cover has no known dimensions and must not be run through the image
          // optimiser, which would fetch it server-side on every render.
          <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          // No cover, said in type rather than with a grey rectangle: the
          // publication's initial, which is at least a fact about the source.
          <span className="src-initial" aria-hidden="true">
            {site.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="src-n" aria-hidden="true">
          {item.n}
        </span>
      </span>
      <span className="src-meta">
        <span className="src-site">{site}</span>
        <span className="src-title">{item.title}</span>
      </span>
    </a>
  );
}

export function SourceCards({ query, items }: { query: string | null; items: SourceItem[] }) {
  if (!items.length) return null;
  return (
    <div className="src-block">
      {query && (
        <p className="src-head">
          Searched the web for <em>{query}</em>
        </p>
      )}
      {/* A row that scrolls rather than a grid that reflows: four sources in a
          narrow column would otherwise stack into a wall as tall as the reply
          they are supporting. */}
      <div className="src-row">
        {items.map((it) => (
          <Card key={`${it.n}-${it.url}`} item={it} />
        ))}
      </div>
    </div>
  );
}
