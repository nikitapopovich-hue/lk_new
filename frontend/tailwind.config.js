/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Montserrat", "system-ui", "sans-serif"],
      },
      colors: {
        pari: {
          50: "#e7fffc",
          100: "#c7fff8",
          200: "#8ffef0",
          300: "#55f6e5",
          400: "#40ffea",
          500: "#00c7b1",
          600: "#00a392",
          700: "#007a6c",
          800: "#00564c",
          900: "#003a33",
        },
        ink: "#161616",
      },
    },
  },
  plugins: [],
}

