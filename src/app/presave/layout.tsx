import type { Metadata } from "next";
import { campaign } from "@/config/campaign";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://yvshmusic.com";

export const metadata: Metadata = {
  title: campaign.isActive ? `Pre-save ${campaign.trackTitle} | ${campaign.trackArtist}` : "Pre-save | YVSH",
  description: campaign.isActive ? campaign.trackDescription : "Pre-save the next release.",
  openGraph: campaign.isActive
    ? {
        title: `${campaign.trackTitle} — ${campaign.trackArtist}`,
        description: campaign.trackDescription,
        images: [{ url: `${baseUrl}${campaign.coverArt}`, width: 1200, height: 1200, alt: campaign.trackTitle }],
      }
    : undefined,
};

export default function PresaveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
