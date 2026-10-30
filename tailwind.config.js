/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F7F7F4",
        card: "#FFFFFF",
        "primary-text": "#202722",
        "secondary-text": "#69736D",
        accent: "#285943",
        border: "#E3E7E2",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
