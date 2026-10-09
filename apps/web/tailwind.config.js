/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1b1428',
        plum: '#2a2140',
        cream: '#f6f0e6',
        paper: '#fffaf3',
        coral: '#e3533f',
        teal: '#0f8f86',
        gold: '#e2a52b',
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 24px 60px rgba(18, 10, 28, 0.28)',
      },
    },
  },
  plugins: [],
}
