"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeColor = "purple" | "pink" | "blue" | "green" | "lightblue" | "red";

interface ThemeContextType {
  theme: ThemeColor;
  setTheme: (theme: ThemeColor) => void;
  cycleTheme: () => void;
  getThemeClasses: (baseClasses: string) => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themeOrder: ThemeColor[] = ["purple", "pink", "blue", "green", "lightblue", "red"];

const colorMap: Record<ThemeColor, Record<string, string>> = {
  purple: {
    primary: "purple",
    primaryLight: "purple-400",
    primaryDark: "purple-600",
    accent: "purple-500",
    border: "purple-400",
    bg: "purple-900",
    text: "purple-200",
    glow: "purple-500",
  },
  pink: {
    primary: "pink",
    primaryLight: "pink-400",
    primaryDark: "pink-600",
    accent: "pink-500",
    border: "pink-400",
    bg: "pink-900",
    text: "pink-200",
    glow: "pink-500",
  },
  blue: {
    primary: "blue",
    primaryLight: "blue-400",
    primaryDark: "blue-600",
    accent: "blue-500",
    border: "blue-400",
    bg: "blue-900",
    text: "blue-200",
    glow: "blue-500",
  },
  green: {
    primary: "green",
    primaryLight: "green-400",
    primaryDark: "green-600",
    accent: "green-500",
    border: "green-400",
    bg: "green-900",
    text: "green-200",
    glow: "green-500",
  },
  lightblue: {
    primary: "cyan",
    primaryLight: "cyan-400",
    primaryDark: "cyan-600",
    accent: "cyan-500",
    border: "cyan-400",
    bg: "cyan-900",
    text: "cyan-200",
    glow: "cyan-500",
  },
  red: {
    primary: "red",
    primaryLight: "red-400",
    primaryDark: "red-600",
    accent: "red-500",
    border: "red-400",
    bg: "red-900",
    text: "red-200",
    glow: "red-500",
  },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeColor>("purple");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as ThemeColor;
    if (saved && themeOrder.includes(saved)) {
      setThemeState(saved);
    }
  }, []);

  const setTheme = (newTheme: ThemeColor) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const cycleTheme = () => {
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  };

  const getThemeClasses = (baseClasses: string) => {
    const colors = colorMap[theme];
    return baseClasses
      .replace(/purple-/g, `${colors.primary}-`)
      .replace(/purple/g, colors.primary);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        cycleTheme,
        getThemeClasses,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
