import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1020",
        surface: "#11172a",
        accent: "#6366f1",
      },
    },
  },
  plugins: [],
} satisfies Config;
