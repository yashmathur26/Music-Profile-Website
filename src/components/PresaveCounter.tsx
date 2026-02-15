"use client";

import { useState, useEffect } from "react";

export default function PresaveCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchCount = () => {
      fetch("/api/presave-count")
        .then((r) => r.json())
        .then((data) => setCount(data.count ?? 0))
        .catch(() => setCount(0));
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, []);

  if (count === null) return null;
  return (
    <p className="text-sm text-white/70">
      <span className="font-semibold text-white">{count}</span> fans presaved
    </p>
  );
}
