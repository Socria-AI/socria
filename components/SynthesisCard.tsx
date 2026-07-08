'use client';

import { useState } from 'react';
import type { SynthesisData } from '@/lib/synthesis';

// Render *emphasis* runs as italic moss serif — same convention as the
// chat bubble.
function renderEmphasis(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <em
        key={key++}
        className="font-serif italic text-moss-700"
        style={{ fontStyle: 'italic' }}
      >
        {m[1]}
      </em>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// A small icon per known section label.
function sectionIcon(label: string) {
  const l = label.toLowerCase();
  const common = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (l.includes('theme'))
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    );
  if (l.includes('tension') || l.includes('contradiction'))
    return (
      <svg {...common}>
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    );
  if (l.includes('assumption'))
    return (
      <svg {...common}>
        <path d="M12 3l9 16H3z" />
      </svg>
    );
  if (l.includes('clarity') || l.includes('clear'))
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
      </svg>
    );
  if (l.includes('reframe') || l.includes('perspective') || l.includes('shift'))
    return (
      <svg {...common}>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function SynthesisCard({ data }: { data: SynthesisData }) {
  const [active, setActive] = useState(0);
  const sections = data.sections;
  if (!sections.length) return null;
  const activeSection = sections[Math.min(active, sections.length - 1)];

  return (
    <div className="synthesis-card">
      <div className="synthesis-card-head">
        <span className="synthesis-card-eyebrow">
          <span className="synthesis-card-mark" aria-hidden>
            <img src="/socria-logo.png" alt="" />
          </span>
          Synthesis
        </span>
        {data.title && (
          <h4 className="synthesis-card-title">{data.title}</h4>
        )}
      </div>

      <div className="synthesis-card-tabs" role="tablist">
        {sections.map((s, i) => (
          <button
            key={s.label + i}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`synthesis-card-tab ${i === active ? 'active' : ''}`}
          >
            <span className="synthesis-card-tab-icon">
              {sectionIcon(s.label)}
            </span>
            <span className="synthesis-card-tab-label">{s.label}</span>
            <span className="synthesis-card-tab-count">{s.items.length}</span>
          </button>
        ))}
      </div>

      <div className="synthesis-card-panel" role="tabpanel">
        <ul className="synthesis-card-list">
          {activeSection.items.map((item, i) => (
            <li
              key={i}
              className="synthesis-card-item"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="synthesis-card-bullet" aria-hidden />
              <span>{renderEmphasis(item)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SynthesisPending() {
  return (
    <div className="synthesis-card synthesis-card--pending" aria-live="polite">
      <div className="synthesis-card-head">
        <span className="synthesis-card-eyebrow">
          <span className="synthesis-card-mark" aria-hidden>
            <img src="/socria-logo.png" alt="" />
          </span>
          Synthesis
        </span>
      </div>
      <div className="synthesis-card-pending-rows">
        <span className="synthesis-card-shimmer" style={{ width: '70%' }} />
        <span className="synthesis-card-shimmer" style={{ width: '90%' }} />
        <span className="synthesis-card-shimmer" style={{ width: '55%' }} />
      </div>
      <p className="synthesis-card-pending-note">Organizing your thinking…</p>
    </div>
  );
}
