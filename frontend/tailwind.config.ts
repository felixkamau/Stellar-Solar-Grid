import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        solar: {
          yellow: "#F5A623",
          dark: "#1A1A2E",
          accent: "#16213E",
        },
      },
    },
  },
  plugins: [],
};

export default config;
