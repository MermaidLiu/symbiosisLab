import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        thu: {
          DEFAULT: "#660874",
          light: "#82318E",
          dark: "#4a0654",
          muted: "#f5eef7",
          subtle: "#ebe0f0",
        },
        tsinghua: {
          purple: "#660874",
          yellow: "#FFC72C",
          "yellow-light": "#FFF4CC",
          "yellow-dark": "#E6A800",
        },
        lab: {
          bg: "#ffffff",
          surface: "#ffffff",
          panel: "#ffffff",
          border: "#e8dce9",
          text: "#1f2937",
          muted: "#6b7280",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-noto-sc)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgb(102 8 116 / 0.08)",
        fluent: "0 8px 32px 0 rgba(0, 0, 0, 0.08)",
        "fluent-lg": "0 12px 40px 0 rgba(0, 0, 0, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
