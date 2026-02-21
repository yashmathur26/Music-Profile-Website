"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { campaign } from "@/config/campaign";
import { features } from "@/config/features";

const artistName = "YVSH";

function HomepageContent() {
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const width = mounted && typeof window !== "undefined" ? window.innerWidth : 1920;
  const height = mounted && typeof window !== "undefined" ? window.innerHeight : 1080;
  const hue = width > 0 ? (cursorPos.x / width) * 360 : 270;
  const saturation = height > 0 ? 60 + (cursorPos.y / height) * 20 : 70;
  const lightness = height > 0 ? 50 + (cursorPos.y / height) * 10 : 55;

  return (
    <main
      className={`relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1a0a2e]`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute h-[600px] w-[600px] rounded-full overflow-hidden transition-all duration-700 ease-out"
          style={{
            left: width > 0 ? `${(cursorPos.x / width) * 100}%` : "50%",
            top: height > 0 ? `${(cursorPos.y / height) * 100}%` : "50%",
            transform: "translate(-50%, -50%) translateZ(0)",
            WebkitBackfaceVisibility: "hidden",
            backfaceVisibility: "hidden",
            contain: "paint",
          }}
        >
          <div
            className="absolute inset-0 rounded-full blur-[120px] transition-all duration-700 ease-out"
            style={{
              transform: "translateZ(0)",
              WebkitBackfaceVisibility: "hidden",
              backfaceVisibility: "hidden",
              background: `radial-gradient(circle at center, hsla(${hue}, ${saturation}%, ${lightness}%, 0.35) 0%, hsla(${hue}, ${saturation}%, ${lightness}%, 0.12) 45%, rgba(0,0,0,0) 70%)`,
            }}
          />
        </div>
      </div>

      <div className="relative z-10">
        <Link
          href="/home"
          className="group flex flex-col items-center gap-8 md:gap-12"
        >
          <div className="relative animate-bounce-slow" style={{ animationDuration: "3s" }}>
            <div
              className="absolute -inset-6 rounded-full blur-2xl transition-all duration-500 group-hover:scale-125"
              style={{
                background: `radial-gradient(circle at center, hsla(${hue}, ${saturation}%, ${lightness}%, 0.4) 0%, hsla(${hue}, ${saturation}%, ${lightness}%, 0.1) 50%, rgba(0,0,0,0) 75%)`,
                transform: "translateZ(0)",
                WebkitBackfaceVisibility: "hidden",
                backfaceVisibility: "hidden",
              }}
            />
            <img
              src="/avatar.png"
              alt={artistName}
              className="relative h-28 w-28 rounded-full border-2 border-white/20 object-cover shadow-2xl transition-transform duration-300 group-hover:scale-105 md:h-36 md:w-36"
            />
          </div>
          <span
            className="rounded-full border px-6 py-2 text-xs font-medium uppercase tracking-[0.3em] backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg md:px-8 md:py-3 md:text-sm"
            style={{
              borderColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.4)`,
              backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`,
              color: `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`,
              boxShadow: `0 0 20px hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`,
            }}
          >
            Click to Enter
          </span>
        </Link>
        {campaign.isActive && features.presave && (
          <Link
            href="/presave"
            className="mt-6 rounded-full border px-6 py-2.5 text-sm font-medium uppercase tracking-wider transition hover:opacity-90 md:px-8 md:py-3"
            style={{
              borderColor: campaign.accentColor,
              color: campaign.accentColor,
              backgroundColor: `${campaign.accentColor}15`,
            }}
          >
            Pre-save {campaign.trackTitle}
          </Link>
        )}
      </div>

      <style jsx>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#1a0a2e]" />}>
      <HomepageContent />
    </Suspense>
  );
}
