import { Suspense } from "react";
import { redirect } from "next/navigation";
import { campaign } from "@/config/campaign";
import { features } from "@/config/features";
import PresaveLanding from "@/components/PresaveLanding";

/**
 * /presave — Presave campaign page (track, countdown, Pre-save on Spotify).
 * Homepage is always / (avatar "Click to Enter").
 */
export default function PresavePage() {
  if (!campaign.isActive || !features.presave) {
    redirect("/home");
  }
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#1a0a2e]" />}>
      <PresaveLanding />
    </Suspense>
  );
}
