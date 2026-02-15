"use client";

import { useState } from "react";
import { campaign } from "@/config/campaign";

const EMAIL_SUBMITTED_KEY = "yvsh_email_captured";

type EmailCaptureProps = {
  accentColor?: string;
};

export default function EmailCapture({ accentColor = campaign.accentColor }: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const submitted = typeof window !== "undefined" && localStorage.getItem(EMAIL_SUBMITTED_KEY) === "true";
  if (submitted) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <p className="text-sm text-white/80">You&apos;re in 🔥</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/email-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        localStorage.setItem(EMAIL_SUBMITTED_KEY, "true");
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
      <p className="mb-3 text-xs uppercase tracking-wider text-white/50">Get updates</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          disabled={status === "loading" || status === "success"}
          className="flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/50 focus:border-white/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50"
          style={{
            backgroundColor: accentColor,
          }}
        >
          {status === "loading" ? "..." : status === "success" ? "You're in 🔥" : "Submit"}
        </button>
      </form>
      {status === "error" && (
        <p className="mt-2 text-xs text-red-400">Something went wrong. Try again.</p>
      )}
    </div>
  );
}
