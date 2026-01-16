import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#1a0a2e",
        panel: "#150820",
        accent: "#8b5cf6",
        muted: "#9b8ab8"
      }
    }
  },
  plugins: []
};

export default config;
