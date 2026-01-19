"use client";

import { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";

type Star = {
  x: number; // 0..1
  y: number; // 0..1
  r: number; // px radius base
  tw: number; // twinkle speed
  ph: number; // phase
  temp: number; // 0..1 (cool -> warm)
  glow: number; // 0..1
};

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function starColor(temp: number) {
  // temp 0..1 (cool -> warm)
  const cool = { r: 191, g: 233, b: 255 };
  const mid = { r: 255, g: 255, b: 255 };
  const warm = { r: 255, g: 231, b: 194 };
  if (temp < 0.5) {
    const t = temp / 0.5;
    return {
      r: Math.round(lerp(cool.r, mid.r, t)),
      g: Math.round(lerp(cool.g, mid.g, t)),
      b: Math.round(lerp(cool.b, mid.b, t)),
    };
  }
  const t = (temp - 0.5) / 0.5;
  return {
    r: Math.round(lerp(mid.r, warm.r, t)),
    g: Math.round(lerp(mid.g, warm.g, t)),
    b: Math.round(lerp(mid.b, warm.b, t)),
  };
}

export default function StarfieldCanvas({
  className,
  seed = 1337,
  density = 1,
}: {
  className?: string;
  seed?: number;
  density?: number; // scales star count
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<Star[]>([]);
  const dprRef = useRef(1);

  const targetCounts = useMemo(() => {
    // layered starfield: dust, mid, bright
    const d = Math.max(0.6, Math.min(1.8, density));
    return {
      dust: Math.round(900 * d),
      mid: Math.round(380 * d),
      bright: Math.round(60 * d),
    };
  }, [density]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t0 = performance.now();

    const rnd = makeRng(seed);
    const stars: Star[] = [];
    const pushStar = (kind: "dust" | "mid" | "bright") => {
      const x = rnd();
      const y = rnd();
      const temp = rnd(); // color temperature
      const ph = rnd() * Math.PI * 2;

      if (kind === "dust") {
        stars.push({
          x,
          y,
          r: 0.4 + rnd() * 0.9,
          tw: 0.6 + rnd() * 1.2,
          ph,
          temp,
          glow: 0.0,
        });
        return;
      }
      if (kind === "mid") {
        stars.push({
          x,
          y,
          r: 0.9 + rnd() * 1.6,
          tw: 0.35 + rnd() * 0.9,
          ph,
          temp,
          glow: 0.15 + rnd() * 0.25,
        });
        return;
      }
      stars.push({
        x,
        y,
        r: 1.6 + rnd() * 2.6,
        tw: 0.2 + rnd() * 0.55,
        ph,
        temp,
        glow: 0.45 + rnd() * 0.55,
      });
    };

    for (let i = 0; i < targetCounts.dust; i++) pushStar("dust");
    for (let i = 0; i < targetCounts.mid; i++) pushStar("mid");
    for (let i = 0; i < targetCounts.bright; i++) pushStar("bright");

    starsRef.current = stars;

    const resize = () => {
      // Use viewport dimensions instead of parent for fixed positioning
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      dprRef.current = dpr;

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Resize on window resize for fixed positioning
    window.addEventListener('resize', resize);
    resize();

    // Throttle rendering on mobile for better scroll performance
    let lastFrameTime = 0;
    const targetFPS = typeof window !== 'undefined' && window.innerWidth < 768 ? 30 : 60;
    const frameInterval = 1000 / targetFPS;

    const render = (now: number) => {
      const elapsed = now - lastFrameTime;
      if (elapsed < frameInterval) {
        raf = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = now - (elapsed % frameInterval);

      const dt = (now - t0) / 1000;
      t0 = now;

      const w = canvas.width / dprRef.current;
      const h = canvas.height / dprRef.current;

      // clear
      ctx.clearRect(0, 0, w, h);

      // subtle vignette so edges feel deep
      const vignette = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        Math.min(w, h) * 0.2,
        w * 0.5,
        h * 0.45,
        Math.max(w, h) * 0.75
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      // draw stars
      for (const s of starsRef.current) {
        // twinkle is independent
        s.ph += dt * s.tw;
        const tw = 0.55 + 0.45 * Math.sin(s.ph);

        const { r, g, b } = starColor(s.temp);
        const alphaBase = s.glow > 0.4 ? 0.55 : s.glow > 0.1 ? 0.35 : 0.18;
        const alpha = alphaBase * tw;

        const px = s.x * w;
        const py = s.y * h;

        // glow halo for mid/bright
        if (s.glow > 0.01) {
          const halo = ctx.createRadialGradient(px, py, 0, px, py, s.r * (6 + 10 * s.glow));
          halo.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.35})`);
          // purple-ish halo tint for vibe
          halo.addColorStop(0.35, `rgba(139,92,246,${alpha * 0.18})`);
          halo.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(px, py, s.r * (6 + 10 * s.glow), 0, Math.PI * 2);
          ctx.fill();
        }

        // core
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, s.r * (0.9 + 0.25 * tw), 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [seed, targetCounts.bright, targetCounts.dust, targetCounts.mid]);

  return (
    <canvas
      ref={canvasRef}
      className={clsx("inset-0", className)}
      style={{
        willChange: 'transform',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}

