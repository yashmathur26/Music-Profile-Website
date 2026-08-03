import HomeContent from "@/components/HomeContent";
import { getSiteConfig } from "@/lib/siteConfig";
import { getAllTracks } from "@/lib/trackStore";

// Admin edits (bio, links, Now Playing) and new gates must show without a
// redeploy.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [config, tracks] = await Promise.all([getSiteConfig(), getAllTracks()]);
  return (
    <HomeContent
      config={config}
      tracks={tracks.map(({ slug, title }) => ({ slug, title }))}
    />
  );
}
