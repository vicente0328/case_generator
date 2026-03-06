/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f0f3f9",
          100: "#dde4f0",
          200: "#b8c7e0",
          300: "#8fa8cc",
          400: "#6688b5",
          500: "#4a6d9e",
          600: "#3a5580",
          700: "#2e4264",
          800: "#1e2e4a",
          900: "#131e32",
          950: "#0a1120",
        },
        gold: {
          50: "#fdf9ee",
          100: "#faf0d0",
          200: "#f4de9c",
          300: "#ecc660",
          400: "#e4ae34",
          500: "#c9941e",
          600: "#a87318",
          700: "#875516",
          800: "#6d4219",
          900: "#5a3618",
        },
      },
      fontFamily: {
        sans: ['"Noto Sans KR"', "sans-serif"],
        serif: ['"Noto Serif KR"', "serif"],
      },
    },
  },
  plugins: [],
};
