import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        care: {
          critical: '#b42318',
          high: '#b54708',
          medium: '#175cd3',
          low: '#027a48',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Segoe UI',
          'Source Sans 3',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
