"use client";

import { useState, useEffect } from "react";

type CountdownTimerProps = {
  releaseDate: string;
  accentColor: string;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export default function CountdownTimer({ releaseDate, accentColor }: CountdownTimerProps) {
  const target = new Date(releaseDate).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = Math.max(0, target - now);
  const isLive = diff <= 0;

  if (isLive) {
    return (
      <div
        className="rounded-xl border-2 px-6 py-4 font-bold uppercase tracking-widest"
        style={{ borderColor: accentColor, color: accentColor }}
      >
        Out Now
      </div>
    );
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const units = [
    { value: days, label: "Days" },
    { value: hours, label: "Hours" },
    { value: minutes, label: "Min" },
    { value: seconds, label: "Sec" },
  ];

  return (
    <div className="flex gap-2 md:gap-4">
      {units.map(({ value, label }) => (
        <div
          key={label}
          className="flex flex-1 flex-col rounded-xl border px-3 py-3 md:px-4 md:py-4"
          style={{ borderColor: `${accentColor}50`, backgroundColor: `${accentColor}10` }}
        >
          <span className="font-mono text-2xl font-bold md:text-3xl" style={{ color: accentColor }}>
            {pad(value)}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-white/60 md:text-xs">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
