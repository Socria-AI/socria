import type { Config } from 'tailwindcss';

// The palette is the design system's, and the handoff's rule about it is the
// part that matters most: THE FOUR-COLOUR CODE MEANS ONE THING EACH, FOREVER.
// A red line, a red panel and a red word all say *the machine*. None of them
// is ever used to decorate. Prussian is the membership boundary and nothing
// else — the colour IS the boundary.
//
// Secondary text is ink at an opacity, four steps only: 100 / 70 / 45 / 25.
// Never a grey, never a tinted green. The steps are named here so that
// `text-ink-45` is available and `text-ink/38` looks like the mistake it is.
//
// Measured, and the reason moss has two entries: ink on paper 14.5:1 · moss
// on paper 4.5:1, which is 16px and up ONLY · moss-700 on paper 6.8:1, which
// is the one to use for small text · sage on paper fails at every size, so it
// is emphasis on forest and nowhere else.
//
// These mirror the custom properties in app/globals.css rather than replacing
// them: the ported stylesheets read var(--moss-700), the React written here
// reads `text-moss-700`, and both have to mean the same colour.

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── the ground ────────────────────────────────────────────
        // The app runs a step cooler than the page. Both are warm; neither
        // is ever pure white.
        paper: {
          DEFAULT: '#F5F3EB', // the chat
          2: '#ece8da',
          journal: '#F4F1E8', // the page
        },

        // ── ink, in four steps and no others ──────────────────────
        ink: {
          DEFAULT: '#1F1F1F',
          70: 'rgba(31, 31, 31, 0.7)',
          45: 'rgba(31, 31, 31, 0.45)',
          25: 'rgba(31, 31, 31, 0.25)',
          12: 'rgba(31, 31, 31, 0.12)', // hairlines only, never text
        },

        // ── the person ────────────────────────────────────────────
        // Your thinking, your call. 600 above 16px; 700 for anything smaller.
        moss: {
          DEFAULT: '#5e7633',
          50: '#f4f6ee',
          100: '#e4eada',
          200: '#cad5b6',
          600: '#5e7633',
          700: '#475a28',
          800: '#38481f',
        },
        // Emphasis on forest only — it fails on paper at every size.
        sage: {
          DEFAULT: '#9CB874',
          bright: '#aecb86',
        },
        forest: {
          DEFAULT: '#2c3b18',
          2: '#1d2710', // the quieter, heavier dark
        },
        // One ornament per piece.
        gold: '#b8a26b',

        // ── the code: one meaning each, forever ───────────────────
        /** the machine — capability, the answer arriving too fast */
        vermilion: '#D8402F',
        /** evidence — sources, what can be checked */
        slate: '#3A6EA5',
        /** the question — the open question, the unexamined assumption */
        mustard: {
          DEFAULT: '#E8B62C',
          // The ink that clears AA on a mustard pill at 9.5px. The pill is
          // small by design, so the text colour is not the fill.
          ink: '#6b520b',
        },

        // ── Socria One ────────────────────────────────────────────
        // The membership boundary, and the ground it stands on. Prussian is
        // never borrowed for anything that is not that boundary.
        prussian: '#26485A',
        one: {
          0: '#0f2430',
          1: '#16303d',
          2: '#1d3a4a',
          pblue: '#26485a',
          cream: '#f0ead8', // body on One
          pale: '#b8cdd9', // emphasis on One
        },

        border: '#e7e2d3',
      },
      fontFamily: {
        // Anything *said*. 400 only — emphasis is italic, moss, one step
        // larger, never bold.
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        // Anything *operated*. Never above 22px in marketing.
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        // The Board, and nowhere else.
        hand: ['var(--font-hand)', 'cursive'],
        math: ['var(--font-stix)', 'Georgia', 'serif'],
      },
      spacing: {
        edge: 'clamp(24px, 6vw, 120px)',
      },
      maxWidth: {
        measure: 'min(1080px, 92vw)',
      },
      borderRadius: {
        // 0 on editorial; these are the operated ones.
        node: '9px',
        composer: '16px',
        insight: '18px',
      },
      letterSpacing: {
        label: '0.28em',
      },
      transitionTimingFunction: {
        // One curve does nearly everything.
        socria: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        // Rare, long, low-opacity, under a floating frame.
        float: '0 40px 90px -50px rgba(31, 31, 31, 0.55)',
      },
      animation: {
        'fade-up': 'fadeUp 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
