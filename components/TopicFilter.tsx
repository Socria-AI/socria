'use client';

import { useState } from 'react';

export interface TopicOption {
  slug: string;
  name: string;
  count: number;
}

export function TopicFilter({
  topics,
  totalCount,
}: {
  topics: TopicOption[];
  totalCount: number;
}) {
  // Hide-by-data-topic filter: matches the original blog.js behavior — every
  // card in the grid carries a data-topic attribute, and we toggle their
  // display when the active chip changes. Pure client side; no router push.
  const [active, setActive] = useState<string>('all');

  function pick(slug: string) {
    setActive(slug);
    const cards = document.querySelectorAll<HTMLElement>('.posts .card');
    cards.forEach((c) => {
      const t = c.dataset.topic;
      const show = slug === 'all' || t === slug;
      c.style.display = show ? '' : 'none';
    });
  }

  return (
    <div className="inner reveal">
      <button
        type="button"
        className={`topic${active === 'all' ? ' on' : ''}`}
        onClick={() => pick('all')}
      >
        All <span className="ct">{totalCount}</span>
      </button>
      {topics.map((t) => (
        <button
          type="button"
          key={t.slug}
          className={`topic${active === t.slug ? ' on' : ''}`}
          onClick={() => pick(t.slug)}
        >
          {t.name} <span className="ct">{t.count}</span>
        </button>
      ))}
    </div>
  );
}
