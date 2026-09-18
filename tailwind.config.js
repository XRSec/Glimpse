/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mac: {
          bg: '#1e1e1e',
          card: '#252526',
          border: '#333333',
          accent: '#007acc',
          hover: '#2a2d2e'
        }
      }
    },
  },
  plugins: [],
}
