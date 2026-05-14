import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Socria palette
        ink: '#1F1F1F',
        paper: '#F5F3EB',
        moss: {
          DEFAULT: '#5e7633',
          50: '#f4f6ee',
          100: '#e4eada',
          200: '#cad5b6',
          300: '#aabd8b',
          400: '#8da564',
          500: '#728c4a',
          600: '#5e7633', // primary
          700: '#475a28',
          800: '#3a4823',
          900: '#323d20',
        },
        sage: '#9CB874',
        muted: '#6b6b66',
        border: '#e7e2d3',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        prose: '64ch',
      },
      animation: {
        'fade-in': 'fadeIn 600ms ease-out both',
        'fade-up': 'fadeUp 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-soft': 'pulseSoft 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.9' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
