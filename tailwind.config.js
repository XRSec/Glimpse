/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#191716',
          header: '#211f1c',
          card: '#262320',
          surface: '#1c1a17',
          border: '#383430',
          'border-hover': '#4c463f',
          terracotta: '#da7756',
          'terracotta-hover': '#e28465',
          'terracotta-active': '#c46241',
          text: '#fbfaf8',
          muted: '#a8a29e',
          subtle: '#78716c'
        },
        mac: {
          bg: '#1e1e1e',
          card: '#252526',
          border: '#333333',
          accent: '#da7756',
          hover: '#2a2d2e'
        }
      }
    },
  },
  plugins: [],
}
