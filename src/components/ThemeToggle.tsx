"use client";

import { useTheme } from "@/contexts/ThemeContext";
import clsx from "clsx";

export default function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();

  const themeConfig = {
    purple: { icon: "💜", color: "purple" },
    pink: { icon: "💗", color: "pink" },
    blue: { icon: "💙", color: "blue" },
    green: { icon: "💚", color: "green" },
    lightblue: { icon: "💠", color: "cyan" },
    red: { icon: "❤️", color: "red" },
  };

  const config = themeConfig[theme];

  return (
    <button
      onClick={cycleTheme}
      className={clsx(
        "fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border-2 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-xl",
        `border-${config.color}-400/50 bg-${config.color}-500/20 text-${config.color}-200`,
        `hover:bg-${config.color}-500/30 hover:border-${config.color}-400/80`,
        `shadow-${config.color}-500/20`
      )}
      title={`Current theme: ${theme}. Click to cycle themes.`}
    >
      <span className="text-2xl">{config.icon}</span>
    </button>
  );
}
