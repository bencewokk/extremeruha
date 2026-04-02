/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#fffaf5',
        blush: '#f7e6e6',
        rose: '#f6a6b2',
        'rose-deep': '#e86f86'
      },
      fontFamily: {
        cormorant: ["'Cormorant Garamond'", 'serif'],
        jost: ['Jost', 'ui-sans-serif', 'system-ui']
      }
    },
  },
  plugins: [],
}

