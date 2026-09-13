// @ts-nocheck
'use client';
// components/journal/ds-bundle.ts
//
// The Socria design system's components, exactly as the design project ships
// them. MACHINE-EXTRACTED — DO NOT HAND-EDIT.
//
// These are lifted verbatim from the compiled bundle the Claude Design
// prototype renders against. They arrive as `React.createElement` calls
// because that is the form the bundle is in, and transcribing four hundred
// lines of inline style objects into JSX by hand would buy nothing but a new
// class of silent typo: a wrong hex, a dropped `var(--…)`, a transposed
// radius. None of those throw. They just make the page subtly not-the-design,
// in a way no reviewer catches by reading.
//
// `@ts-nocheck` is deliberate and is confined to THIS file. The bodies are
// untyped by construction; the contract callers are actually checked against
// lives next door in ds.ts, written from each component's own parameter list.
// Splitting them is what keeps "the port is unchecked" from quietly becoming
// "the journal is unchecked".
//
// Upstream is the design project. To change a component, change it there and
// re-port; to change how the journal USES one, wrap it in parts.tsx.
//
// Self-styling via inline styles and the custom properties in
// app/journal.css, so there is no stylesheet to keep in step.

import React from 'react';



const MARK = {
  sm: 22,
  md: 28,
  lg: 44,
  xl: 80
};
const WORD = {
  sm: '1.25rem',
  md: '1.5rem',
  lg: '1.875rem',
  xl: '3rem'
};
const BASE = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  border: '1px solid transparent',
  borderRadius: 'var(--radius-pill)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.55em',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  transition: 'background .25s, color .25s, border-color .25s, transform .25s'
};
const SIZES = {
  sm: {
    height: 42,
    padding: '0 20px',
    fontSize: '.9rem'
  },
  md: {
    height: 50,
    padding: '0 26px',
    fontSize: '.98rem'
  },
  lg: {
    height: 56,
    padding: '0 32px',
    fontSize: '1.02rem'
  },
  xl: {
    height: 60,
    padding: '0 36px',
    fontSize: '1.1rem'
  }
};
const SHAPES = {
  circle: {
    viewBox: '0 0 100 42',
    d: 'M8,21 C6,9 30,4 52,5 C79,6 96,11 95,22 C94,34 69,39 45,38 C23,37 7,32 9,23',
    box: {
      left: '-6%',
      top: '-16%',
      width: '112%',
      height: '132%'
    }
  },
  underline: {
    viewBox: '0 0 100 10',
    d: 'M1,5 C24,2 48,8 68,4 C82,2 93,5 99,4',
    box: {
      left: '-1%',
      bottom: '-0.16em',
      width: '102%',
      height: '0.2em'
    }
  },
  strike: {
    viewBox: '0 0 100 12',
    d: 'M1,7 C22,3 46,10 66,5 C80,2 92,7 99,5',
    box: {
      left: '-1%',
      top: '52%',
      width: '102%',
      height: '0.5em'
    }
  }
};
const TITLE = {
  supported: 'Backed by evidence you gave',
  resolved: 'You resolved this',
  revised: 'Replaced by a later version'
};
const TONE = {
  supported: 'var(--lg-primary)',
  resolved: 'var(--lg-primary)',
  revised: 'var(--lg-ink-40)'
};
const PATHS = {
  goal: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "2.4"
  })),
  decision: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M8 14V9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 9 3.5 4.5M8 9l4.5-4.5"
  })),
  value: /*#__PURE__*/React.createElement("path", {
    d: "M8 2.4 13.6 8 8 13.6 2.4 8Z"
  }),
  belief: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 5v6M7 5v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.5 8h3"
  })),
  idea: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "7",
    r: "3.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.4 12.6h3.2"
  })),
  assumption: /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "5.6",
    strokeDasharray: "2.6 2.4"
  }),
  evidence: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 2.8h6l2.2 2.2v8.2H4Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.2 8.4h4M6.2 10.8h2.6"
  })),
  question: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5.9 6.1a2.1 2.1 0 1 1 2.9 1.95c-.6.28-.8.7-.8 1.25v.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 12.4h.01"
  })),
  tension: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6.4 5.2 3.2 8l3.2 2.8M9.6 5.2 12.8 8l-3.2 2.8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 3.6v8.8",
    strokeDasharray: "1.6 1.8"
  })),
  consequence: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3.4 4v4.2a2.4 2.4 0 0 0 2.4 2.4h6.8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.4 8.4l2.4 2.2-2.4 2.2"
  })),
  claim: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4.6 13.4V3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4.6 3.4h7.2l-1.7 2.4 1.7 2.4H4.6"
  })),
  counterpoint: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M13 6H5.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7.6 3.6 5 6l2.6 2.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 12h8",
    strokeDasharray: "1.8 1.8"
  })),
  source: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M2.8 3.6h4.2c.6 0 1 .4 1 1v8c0-.6-.4-1-1-1H2.8Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13.2 3.6H9c-.6 0-1 .4-1 1v8c0-.6.4-1 1-1h4.2Z"
  })),
  concept: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "2.2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 5.8V3.2M8 10.2v2.6M5.8 8H3.2M10.2 8h2.6",
    strokeDasharray: "1.4 1.6"
  })),
  misconception: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "5.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
  })),
  theme: /*#__PURE__*/React.createElement("path", {
    d: "M2.6 10.4c1.6-4.4 3.2-4.4 4.8 0s3.2 4.4 4.8 0"
  }),
  character: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "5.6",
    r: "2.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.6 13.4a4.4 4.4 0 0 1 8.8 0"
  })),
  constraint: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3.2 3v10M12.8 3v10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5.8 8h4.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.4 6.2 10.6 8l-2.2 1.8"
  })),
  milestone: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 13.4V2.8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 3.4h6.6l-1.2 2.2 1.2 2.2H5",
    fill: "currentColor",
    fillOpacity: "0.14"
  })),
  given: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 3H4.2v10H6M10 3h1.8v10H10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 7.6v.8"
  })),
  unknown: /*#__PURE__*/React.createElement("path", {
    d: "M4.5 4.5l7 7M11.5 4.5l-7 7"
  }),
  equation: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 6.4h10M3 9.6h10"
  })),
  definition: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 6h10M3 9h10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 3.4v.6M8 11.4v.6"
  })),
  transformation: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 8h8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.4 5.4 11 8l-2.6 2.6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "8",
    r: "0.6",
    fill: "currentColor"
  })),
  theorem: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "5.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5.6 8.2 7.2 9.8 10.4 6.4"
  })),
  step: /*#__PURE__*/React.createElement("path", {
    d: "M3 4.5h3.5V8H10v3.5h3",
    strokeLinejoin: "round"
  }),
  inference: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "4.6",
    r: "0.7",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5.4",
    cy: "10",
    r: "0.7",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "10.6",
    cy: "10",
    r: "0.7",
    fill: "currentColor"
  })),
  verification: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3.2",
    y: "3.6",
    width: "9.6",
    height: "8.8",
    rx: "1.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5.6 8.2 7.2 9.8 10.6 6"
  })),
  result: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "2.8",
    y: "4",
    width: "10.4",
    height: "8",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.4",
    y: "5.6",
    width: "7.2",
    height: "4.8",
    rx: "0.6",
    opacity: "0.5"
  })),
  error: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M8 2.8 14 12.6H2Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 6.4v3M8 11h.01"
  }))
};
const T = {
  goal: {
    bg: '#22374F',
    ink: '#fff',
    r: 12,
    extra: {
      boxShadow: '0 1px 2px rgba(35,36,31,0.06), 0 0 0 3px rgba(34,55,79,0.07)',
      borderColor: 'transparent'
    }
  },
  decision: {
    bg: 'var(--lg-primary)',
    ink: '#fff',
    r: 10,
    extra: {
      borderColor: 'transparent',
      borderLeft: '3px solid #91A97A'
    }
  },
  value: {
    bg: '#EDF3E8',
    line: '#CFE0C0',
    type: '#5A7247',
    r: 16
  },
  belief: {
    bg: '#F0F1EA',
    line: '#D6D8C8',
    type: '#6B705C',
    r: 8,
    extra: {
      borderLeft: '3px double #A8AB94',
      paddingLeft: 11
    }
  },
  idea: {
    bg: '#EBF2F8',
    line: '#C9DBE8',
    type: 'var(--lg-accent)',
    r: 11,
    extra: {
      boxShadow: '0 2px 3px rgba(38,70,83,0.07), 0 6px 14px -10px rgba(38,70,83,0.4)'
    }
  },
  assumption: {
    bg: '#FAF3E3',
    line: '#E8D9B0',
    type: '#8A7742',
    r: 10,
    extra: {
      borderStyle: 'dashed'
    }
  },
  evidence: {
    bg: '#fff',
    line: '#DDE3E8',
    type: '#5A7247',
    r: 3,
    extra: {
      borderLeft: '2px solid #A9BC96'
    }
  },
  question: {
    bg: '#EEF2F5',
    line: '#D2DCE4',
    type: '#3E6B7A',
    r: 10,
    extra: {
      borderBottomStyle: 'dashed'
    }
  },
  tension: {
    bg: '#FBEEE9',
    line: '#EBC8B8',
    type: 'var(--lg-tension)',
    r: 10,
    extra: {
      backgroundImage: 'repeating-linear-gradient(-45deg, rgba(156,91,60,0.06) 0 5px, transparent 5px 11px)'
    }
  },
  consequence: {
    bg: '#F7F4EC',
    line: '#E2DAC6',
    type: '#7A6A4A',
    r: 10,
    italic: true,
    extra: {
      borderTopLeftRadius: 3,
      borderLeft: '2px solid #CFC2A2'
    }
  },
  claim: {
    bg: '#FFFDF7',
    line: '#DCD3B8',
    type: '#7A6A3A',
    r: '4px 10px 10px 4px',
    extra: {
      borderLeft: '2px solid #C4B482'
    }
  },
  counterpoint: {
    bg: '#FAF0EC',
    line: '#E4C6B8',
    type: 'var(--lg-tension)',
    r: '10px 4px 4px 10px',
    italic: true,
    extra: {
      borderRight: '2px solid #D8A992'
    }
  },
  source: {
    bg: '#fff',
    line: '#D3DCE2',
    type: 'var(--lg-accent)',
    r: 3,
    extra: {
      borderLeft: '3px double var(--lg-accent)'
    }
  },
  concept: {
    bg: '#F2F4F0',
    line: '#D2DACB',
    type: '#4F6247',
    r: 999,
    extra: {
      paddingLeft: 15,
      paddingRight: 15
    }
  },
  misconception: {
    bg: '#FAF1EF',
    line: '#E6C9C2',
    type: '#9C5B4C',
    r: 10,
    extra: {
      borderStyle: 'dashed',
      backgroundImage: 'repeating-linear-gradient(45deg, rgba(156,91,76,0.05) 0 5px, transparent 5px 11px)'
    }
  },
  theme: {
    bg: '#F4F1F6',
    line: '#DAD2E0',
    type: '#6B5F7A',
    r: 14,
    italic: true,
    extra: {
      borderTop: '2px solid #C4B6D0'
    }
  },
  character: {
    bg: '#FBF3EC',
    line: '#E6D2BE',
    type: '#8A6B4A',
    r: '16px 16px 8px 8px'
  },
  constraint: {
    bg: '#F2F2EE',
    line: '#D6D6CB',
    type: '#6B6B5C',
    r: 2,
    extra: {
      borderWidth: '1px 3px'
    }
  },
  milestone: {
    bg: '#EDF3E8',
    line: '#C7D9BA',
    type: '#4F6B3C',
    r: 4,
    extra: {
      clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)',
      paddingRight: 20
    }
  }
};
function renderEmphasis(text) {
  const out = [];
  const re = /\*([^*\n]+)\*/g;
  let last = 0,
    m,
    key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(/*#__PURE__*/React.createElement("em", {
      key: key++,
      style: {
        fontFamily: 'var(--font-serif)',
        fontStyle: 'italic',
        color: 'var(--moss-700)',
        fontSize: '1.18em',
        lineHeight: 1
      }
    }, m[1]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function sectionIcon(label) {
  const l = (label || '').toLowerCase();
  const p = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  };
  if (l.includes('theme')) return /*#__PURE__*/React.createElement("svg", p, /*#__PURE__*/React.createElement("path", {
    d: "M4 7h16M4 12h16M4 17h10"
  }));
  if (l.includes('tension') || l.includes('contradiction')) return /*#__PURE__*/React.createElement("svg", p, /*#__PURE__*/React.createElement("path", {
    d: "M7 7l10 10M17 7L7 17"
  }));
  if (l.includes('assumption')) return /*#__PURE__*/React.createElement("svg", p, /*#__PURE__*/React.createElement("path", {
    d: "M12 3l9 16H3z"
  }));
  if (l.includes('clarity') || l.includes('clear')) return /*#__PURE__*/React.createElement("svg", p, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
  }));
  if (l.includes('reframe') || l.includes('perspective') || l.includes('shift')) return /*#__PURE__*/React.createElement("svg", p, /*#__PURE__*/React.createElement("path", {
    d: "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"
  }));
  return /*#__PURE__*/React.createElement("svg", p, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }));
}
function StatusMark({
  status = 'resolved'
}) {
  if (status === 'open') return null;
  return /*#__PURE__*/React.createElement("span", {
    title: TITLE[status],
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontSize: 8.5,
      fontWeight: 600,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: TONE[status] || 'var(--lg-ink-40)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    "aria-hidden": "true"
  }, status === 'resolved' && /*#__PURE__*/React.createElement("path", {
    d: "M2.5 6.3 5 8.6 9.5 3.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), status === 'supported' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M2 9.5h8",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 8.6V3.2M3.8 5.2 6 3l2.2 2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), status === 'revised' && /*#__PURE__*/React.createElement("path", {
    d: "M9.4 4.2H4.6a2.4 2.4 0 0 0 0 4.8h1.2M7.6 2.4l1.9 1.8-1.9 1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), /*#__PURE__*/React.createElement("span", null, status));
}



/* The Insight Card. When a conversation reaches something worth keeping,
   Socria writes it down — in serif, at reading size, on paper rather than in
   a bubble. Two actions: keep talking, or share it. */

function NodeGlyph({
  type = 'idea',
  size = 11
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.3",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    style: {
      flex: '0 0 auto',
      opacity: 0.85
    }
  }, PATHS[type] || PATHS.idea);
}



/* One card on the Thinking Map. Each type gets its own silhouette, not just
   its own colour: the shape and border carry meaning — an assumption is
   dashed because it hasn't been examined, evidence is square-cornered because
   it's grounded, a concept is a pill because it's held rather than argued.
   Fills, borders and radii are verbatim from .lg-node-* in globals.css. */

function _Logo({
  size = 'md',
  showWordmark = true,
  onDark = false,
  markSrc = '../../assets/socria-mark.png',
  href
}) {
  const px = MARK[size] || MARK.md;
  const inner = /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5em'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: markSrc,
    alt: "",
    style: {
      width: px,
      height: 'auto',
      display: 'block',
      objectFit: 'contain',
      filter: onDark ? 'invert(1) brightness(1.7)' : 'none'
    }
  }), showWordmark && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: WORD[size] || WORD.md,
      lineHeight: 1,
      letterSpacing: '0.01em',
      color: onDark ? 'var(--paper)' : 'var(--ink)'
    }
  }, "Socria"));
  if (!href) return inner;
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    style: {
      textDecoration: 'none'
    }
  }, inner);
}



/* The Logos mark: a brain seen from above, drawn as separated strokes rather
   than one closed outline — the gaps are the point, since the thing it stands
   for is thinking in pieces that haven't joined up yet. Traced in the original
   artwork's 1080 coordinate space and cropped by viewBox, so proportions and
   stroke weight stay exactly as drawn. The two mid-branches are deliberately
   not mirrored. Paths are verbatim from components/LogosMark.tsx. */

function _Label({
  children,
  tone = 'faint',
  tick = false,
  as = 'span'
}) {
  const color = tone === 'moss' ? 'var(--moss-700)' : tone === 'paper' ? 'rgba(244,241,232,.5)' : 'var(--ink-45-journal)';
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.7em',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--type-label)',
      fontWeight: 600,
      letterSpacing: 'var(--tracking-label)',
      textTransform: 'uppercase',
      color
    }
  }, tick && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'currentColor'
    }
  }), children);
}



/* Every position in the document states the strongest argument against itself
   and then answers it. The block sits behind a moss hairline — the same
   treatment the journal gives Socria's own turn in a transcript, because it is
   the same move: the document asking the reader's objection out loud before
   the reader has to.

   State the objection at full strength and concede in the first clause
   ("That case is half right", "Fair", "Correct"). A chapter with no case
   against it is not a position; it is a slogan. */

function _Button({
  children,
  variant = 'primary',
  size = 'md',
  arrow = false,
  onDark = false,
  disabled = false,
  as = 'button',
  href,
  onClick
}) {
  const [hover, setHover] = React.useState(false);
  let style = {
    ...BASE,
    ...(SIZES[size] || SIZES.md)
  };
  if (variant === 'primary') {
    style.background = onDark ? 'var(--paper)' : hover ? 'var(--moss)' : 'var(--ink)';
    style.color = onDark ? 'var(--forest-2)' : 'var(--paper)';
    if (onDark && hover) style.background = '#fff';
    if (hover) style.transform = 'translateY(-2px)';
  } else if (variant === 'line') {
    style.background = hover ? 'currentColor' : 'transparent';
    style.borderColor = 'currentColor';
    style.color = onDark ? 'var(--paper)' : 'var(--ink)';
  } else if (variant === 'quiet') {
    style.background = 'transparent';
    style.borderColor = onDark ? 'var(--line-dark)' : 'var(--ink-16)';
    style.color = onDark ? 'var(--paper)' : 'var(--ink-60)';
    if (hover) style.borderColor = onDark ? 'var(--paper)' : 'var(--ink)';
  } else if (variant === 'link') {
    style = {
      fontFamily: 'var(--font-serif)',
      fontStyle: 'italic',
      fontSize: '1.2rem',
      color: onDark ? 'var(--sage)' : hover ? 'var(--moss)' : 'var(--moss-700)',
      borderBottom: `1px solid ${onDark ? 'var(--sage)' : 'var(--moss)'}`,
      paddingBottom: 2,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      borderBottomWidth: 1,
      borderBottomStyle: 'solid',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.4em',
      textDecoration: 'none'
    };
  }
  if (disabled) {
    style.opacity = 0.4;
    style.cursor = 'default';
    style.transform = 'none';
  }
  const Tag = as === 'a' ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, {
    href: as === 'a' ? href : undefined,
    type: as === 'a' ? undefined : 'button',
    disabled: as === 'a' ? undefined : disabled,
    onClick: disabled ? undefined : onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: style
  }, /*#__PURE__*/React.createElement("span", null, children), arrow && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      transform: hover ? 'translateX(3px)' : 'none',
      transition: 'transform .2s'
    }
  }, "\u2192"));
}



/* Suggested answers under an assistant turn. Socria asks before it answers,
   so a chip is a way into a reply — never a substitute for typing one, which
   is why the label says so out loud. */

function _InkMark({
  children,
  shape = 'circle',
  tone = 'moss',
  drawn = true,
  italic = true
}) {
  const s = SHAPES[shape] || SHAPES.circle;
  const stroke = tone === 'sage' ? 'var(--sage)' : 'var(--moss)';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      whiteSpace: 'nowrap',
      fontStyle: italic ? 'italic' : 'normal',
      color: tone === 'sage' ? 'var(--sage)' : 'var(--moss-700)'
    }
  }, children, /*#__PURE__*/React.createElement("svg", {
    viewBox: s.viewBox,
    preserveAspectRatio: "none",
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      overflow: 'visible',
      pointerEvents: 'none',
      ...s.box
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: s.d,
    fill: "none",
    stroke: stroke,
    strokeWidth: shape === 'strike' ? 2.4 : 3,
    strokeLinecap: "round",
    pathLength: "1",
    strokeDasharray: "1",
    strokeDashoffset: drawn ? 0 : 1,
    style: {
      transition: 'stroke-dashoffset var(--dur-ink) ease .15s'
    }
  })));
}



/* The micro-label. Uppercase Inter at .7rem with .28em tracking — it appears
   above almost every section, as a folio number, an issue line, or a panel
   title. Moss when it names the brand's own thing, faint ink otherwise. */

function _InsightCard({
  label,
  text,
  onContinue,
  onShare,
  eyebrow = 'Insight Card'
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "region",
    "aria-label": "Insight",
    style: {
      position: 'relative',
      margin: '24px 0 18px',
      padding: '22px 24px 24px',
      background: 'var(--paper)',
      border: '1px solid var(--moss-200)',
      borderRadius: 'var(--radius-2xl)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      background: 'var(--moss-600)',
      opacity: 0.75
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 10,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: 'var(--moss-700)',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: 12,
      height: 12,
      color: 'var(--moss-600)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    style: {
      width: '100%',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z"
  }))), eyebrow), label && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '12px 0 8px',
      fontFamily: 'var(--font-serif)',
      fontStyle: 'italic',
      fontSize: '1.05rem',
      color: 'var(--moss-700)'
    }
  }, label), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-serif)',
      fontSize: '1.45rem',
      lineHeight: 1.32,
      color: 'var(--ink)',
      maxWidth: '44ch'
    }
  }, text), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22,
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onContinue,
    style: {
      background: 'transparent',
      border: '1px solid var(--ink-16)',
      borderRadius: 'var(--radius-pill)',
      padding: '9px 18px',
      font: 'inherit',
      fontSize: 13,
      color: 'var(--ink-60)',
      cursor: 'pointer'
    }
  }, "Continue conversation"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onShare,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      background: 'var(--moss-600)',
      border: 'none',
      borderRadius: 'var(--radius-pill)',
      padding: '10px 20px',
      font: 'inherit',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--paper)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", null, "Share insight"), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2192"))));
}



/* A turn in Socria chat. The visitor's words sit in a moss-50 bubble with one
   corner squared off; Socria's reply is unboxed prose — a page, not a chat
   bubble — with its emphasis rendered as italic moss serif at 1.18em.
   Emphasis is written in the model's output as *asterisks*. */

function _Message({
  role = 'assistant',
  children,
  text
}) {
  const body = text ? renderEmphasis(text) : children;
  if (role === 'user') {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'flex-end',
        margin: '18px 0'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: '85%',
        background: 'var(--moss-50)',
        border: '1px solid rgba(202,213,182,0.6)',
        borderRadius: '16px 16px 6px 16px',
        padding: '12px 20px',
        fontSize: 15,
        lineHeight: 1.6,
        color: 'var(--ink)'
      }
    }, body));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '18px 0',
      maxWidth: 'var(--measure-answer)',
      fontSize: 'var(--type-body-app)',
      lineHeight: 'var(--leading-prose)',
      color: 'var(--ink)',
      whiteSpace: 'pre-wrap'
    }
  }, body);
}
function _SynthesisCard({
  title,
  sections = [],
  markSrc = '../../assets/socria-logo.png'
}) {
  const [active, setActive] = React.useState(0);
  if (!sections.length) return null;
  const s = sections[Math.min(active, sections.length - 1)];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '14px 0',
      borderRadius: 'var(--radius-2xl)',
      border: '1px solid var(--border)',
      background: '#fff',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 18px 12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 10,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      fontWeight: 600,
      color: 'var(--moss-700)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: 15,
      height: 15,
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: markSrc,
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'contain'
    }
  })), "Synthesis"), title && /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: '8px 0 0',
      fontFamily: 'var(--font-serif)',
      fontWeight: 400,
      fontSize: '1.4rem',
      lineHeight: 1.1,
      color: 'var(--ink)'
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: 'flex',
      gap: 4,
      padding: '0 18px',
      overflowX: 'auto',
      borderBottom: '1px solid rgba(94,118,51,0.14)'
    }
  }, sections.map((sec, i) => /*#__PURE__*/React.createElement("button", {
    key: sec.label + i,
    type: "button",
    role: "tab",
    "aria-selected": i === active,
    onClick: () => setActive(i),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '9px 4px',
      marginBottom: -1,
      border: 'none',
      borderBottom: `2px solid ${i === active ? 'var(--moss-600)' : 'transparent'}`,
      background: 'transparent',
      font: 'inherit',
      fontSize: 12.5,
      whiteSpace: 'nowrap',
      color: i === active ? 'var(--moss-700)' : 'var(--ink-60)',
      cursor: 'pointer',
      marginRight: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      opacity: 0.8
    }
  }, sectionIcon(sec.label)), /*#__PURE__*/React.createElement("span", null, sec.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 999,
      lineHeight: 1.4,
      background: i === active ? 'rgba(94,118,51,0.14)' : 'rgba(31,31,31,0.05)',
      color: i === active ? 'var(--moss-700)' : 'var(--ink-40)'
    }
  }, sec.items.length)))), /*#__PURE__*/React.createElement("div", {
    role: "tabpanel",
    style: {
      padding: '16px 18px 18px'
    }
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, s.items.map((item, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 11,
      fontSize: 14,
      lineHeight: 1.55,
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      flex: '0 0 auto',
      width: 7,
      height: 7,
      marginTop: 7,
      borderRadius: '50%',
      background: 'var(--moss-600)',
      boxShadow: '0 0 0 3px rgba(94,118,51,0.14)'
    }
  }), /*#__PURE__*/React.createElement("span", null, item))))));
}



/* Buttons, as the site defines them in CSS (.cta-primary, .cta-secondary,
   .btn-line, .lg-send). Two shapes only: a pill for actions, and a
   serif-italic link with a moss rule under it for anything optional.
   Primary pills go ink → moss on hover and rise 2px; nothing scales. */

function _Transcript({
  lines = []
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720
    }
  }, lines.map((l, i) => {
    const ai = l.who !== 'you';
    return /*#__PURE__*/React.createElement("p", {
      key: i,
      style: {
        margin: '0 0 22px',
        fontSize: 'clamp(1.15rem,1.7vw,1.4rem)',
        lineHeight: 1.5,
        paddingLeft: ai ? 'clamp(16px,3vw,40px)' : 0,
        borderLeft: ai ? '1px solid var(--border-journal)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontFamily: 'var(--font-sans)',
        fontSize: '.66rem',
        letterSpacing: '.2em',
        textTransform: 'uppercase',
        color: 'var(--ink-45-journal)',
        marginBottom: 5,
        fontWeight: 600
      }
    }, l.label || (ai ? 'Socria' : 'The visitor')), /*#__PURE__*/React.createElement("span", {
      style: ai ? {
        fontFamily: 'var(--font-serif)',
        fontStyle: 'italic',
        fontSize: '1.14em',
        color: 'var(--moss-700)'
      } : {
        color: 'var(--ink-journal)'
      }
    }, l.text));
  }));
}



/* The Logos composer. A white card on paper, 16px radius, with a moss focus
   ring at 6% and a round send button in the app's primary green. The note
   underneath is set in italic — the app talking about itself quietly. */

function _DefinitionEntry({
  word,
  pronunciation,
  pos = 'noun',
  gloss,
  coda
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '52ch'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 18,
      flexWrap: 'wrap',
      borderBottom: '1px solid var(--ink-12-journal)',
      paddingBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: 'clamp(2.6rem,6vw,4.6rem)',
      letterSpacing: '-.02em',
      color: 'var(--ink-journal)'
    }
  }, word), pronunciation && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontStyle: 'italic',
      fontSize: '1.3rem',
      color: 'var(--ink-45-journal)'
    }
  }, pronunciation), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '.72rem',
      letterSpacing: '.2em',
      textTransform: 'uppercase',
      color: 'var(--moss-700)',
      fontWeight: 600
    }
  }, pos)), gloss && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '26px 0 0',
      fontSize: 'clamp(1.2rem,1.7vw,1.55rem)',
      lineHeight: 1.55,
      color: 'var(--ink-70-journal)'
    }
  }, gloss), coda && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '34px 0 0',
      fontFamily: 'var(--font-serif)',
      fontSize: 'clamp(1.5rem,2.6vw,2.2rem)',
      lineHeight: 1.2,
      color: 'var(--ink-journal)'
    }
  }, coda));
}



/* One item in the "In This Issue" well. A roman numeral, a serif headline,
   and a paragraph that describes a shipped behaviour rather than promising
   one. Dispatches tile two-up with hairline rules between them. */

function _Composer({
  placeholder = 'Say what you actually think.',
  note = 'Logos reads what you write; it never writes for you.',
  value,
  onChange,
  onSend,
  disabled = false,
  showAttach = true
}) {
  const [focus, setFocus] = React.useState(false);
  const [text, setText] = React.useState('');
  const v = value !== undefined ? value : text;
  const set = next => {
    onChange ? onChange(next) : setText(next);
  };
  const send = () => {
    if (!v.trim() || disabled) return;
    onSend && onSend(v);
    if (value === undefined) setText('');
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 40px 30px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      background: '#fff',
      border: `1px solid ${focus ? 'rgba(53,70,32,0.38)' : 'var(--lg-line)'}`,
      borderRadius: 'var(--radius-xl)',
      padding: '10px 10px 10px 12px',
      boxShadow: focus ? '0 0 0 4px rgba(53,70,32,0.06)' : 'none',
      transition: 'border-color .25s, box-shadow .25s'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    rows: 1,
    value: v,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    onChange: e => set(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      resize: 'none',
      background: 'transparent',
      font: 'inherit',
      fontFamily: 'var(--font-sans)',
      fontSize: 15,
      lineHeight: 1.55,
      padding: '6px 0',
      color: 'var(--lg-ink)'
    }
  }), showAttach && /*#__PURE__*/React.createElement("button", {
    type: "button",
    title: "Attach a note or an image",
    style: {
      flex: '0 0 auto',
      width: 32,
      height: 32,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      borderRadius: '50%',
      background: 'transparent',
      color: 'var(--lg-ink-40)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21.4 11.05 12.3 20.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"
  }))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: send,
    disabled: !v.trim() || disabled,
    style: {
      flex: '0 0 auto',
      width: 34,
      height: 34,
      border: 'none',
      borderRadius: '50%',
      background: 'var(--lg-primary)',
      color: 'var(--lg-paper)',
      display: 'grid',
      placeItems: 'center',
      cursor: v.trim() && !disabled ? 'pointer' : 'default',
      opacity: v.trim() && !disabled ? 1 : 0.25,
      transition: 'opacity .2s, transform .2s'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 19V5M5 12l7-7 7 7"
  }))))), note && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '7px 4px 0',
      fontSize: 11.5,
      fontStyle: 'italic',
      color: 'var(--lg-ink-40)'
    }
  }, note));
}



/* The Answer Guard. While you are learning, the answer stays yours to reach —
   so when Logos is holding one back it says so in a bar above the composer,
   offering a hint first and the answer only if you insist. Prussian accent,
   because this is the app being careful rather than being green. */

function _GuardBar({
  text = 'Logos is holding the answer while you work.',
  hintLabel = 'Give me a hint',
  revealLabel = 'Show it anyway',
  onHint,
  onReveal,
  hintsLeft = 2
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: '0 40px',
      padding: '8px 14px',
      border: '1px solid rgba(38,70,83,0.22)',
      borderRadius: 'var(--radius-lg)',
      background: 'rgba(38,70,83,0.05)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      flex: '0 0 auto',
      background: 'var(--lg-accent)',
      boxShadow: '0 0 0 3px rgba(38,70,83,0.14)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 12.5,
      color: 'var(--lg-accent)'
    }
  }, text), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onHint,
    disabled: hintsLeft <= 0,
    style: {
      flex: '0 0 auto',
      padding: '5px 11px',
      borderRadius: 999,
      font: 'inherit',
      fontSize: 11.5,
      cursor: hintsLeft > 0 ? 'pointer' : 'default',
      opacity: hintsLeft > 0 ? 1 : 0.4,
      border: '1px solid rgba(38,70,83,0.3)',
      background: 'transparent',
      color: 'var(--lg-accent)'
    }
  }, hintLabel, hintsLeft > 0 ? ` · ${hintsLeft}` : ''), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onReveal,
    style: {
      flex: '0 0 auto',
      padding: '5px 11px',
      borderRadius: 999,
      font: 'inherit',
      fontSize: 11.5,
      cursor: 'pointer',
      border: 'none',
      background: 'var(--lg-accent)',
      color: 'var(--lg-paper)'
    }
  }, revealLabel));
}



/* A session's map, small enough to sit in a list. Not a preview you can read —
   a shape you can recognise. Layout is a pure function of node ids, so a
   thumbnail never drifts between renders the way the live graph does. */

function _LogosNode({
  type = 'idea',
  label,
  status = 'open',
  state = 'default',
  onClick,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const t = T[type] || {
    bg: '#fff',
    line: 'var(--lg-line)',
    type: 'var(--lg-ink-40)',
    r: 9
  };
  const dark = t.ink === '#fff';
  const radius = typeof t.r === 'number' ? `${t.r}px` : t.r;
  let shadow = 'var(--shadow-node)';
  let transform = 'none';
  if (state === 'lit') shadow = '0 0 0 2px rgba(53,70,32,0.16)';
  if (state === 'focused') {
    shadow = '0 3px 6px rgba(35,36,31,0.05), 0 18px 36px -18px rgba(35,36,31,0.45)';
    transform = 'scale(1.04)';
  }
  if (hover && state === 'default') {
    shadow = 'var(--shadow-node-hover)';
    transform = 'translateY(-2px)';
  }
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'block',
      textAlign: 'left',
      font: 'inherit',
      cursor: 'pointer',
      background: t.bg,
      border: `1px solid ${t.line || 'var(--lg-line)'}`,
      borderRadius: radius,
      padding: '8px 12px 10px',
      boxShadow: shadow,
      transform,
      opacity: state === 'dim' ? 0.28 : 1,
      transition: 'box-shadow .3s, transform .3s, border-color .3s, opacity .35s',
      ...(t.extra || {}),
      ...(style || {})
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      marginBottom: 4,
      color: dark ? 'rgba(255,255,255,0.62)' : t.type
    }
  }, /*#__PURE__*/React.createElement(NodeGlyph, {
    type: type
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 8.5,
      fontWeight: 600,
      letterSpacing: '0.16em',
      textTransform: 'uppercase'
    }
  }, type)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13.5,
      lineHeight: 1.4,
      letterSpacing: '-0.005em',
      color: dark ? '#fff' : 'var(--lg-ink)',
      fontStyle: t.italic ? 'italic' : 'normal'
    }
  }, label), status !== 'open' && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 5
    }
  }, /*#__PURE__*/React.createElement(StatusMark, {
    status: status
  })));
}






export { _Logo, _Label, _Button, _InkMark, _InsightCard, _Message, _SynthesisCard, _Transcript, _DefinitionEntry, _Composer, _GuardBar, _LogosNode };
