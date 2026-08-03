import { NextRequest, NextResponse } from "next/server";
import {
  SiteConfig,
  getSiteConfig,
  saveSiteConfig
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

const authorized = (request: NextRequest) => {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = request.nextUrl.searchParams.get("key") || "";
  return bearer === secret || key === secret;
};

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ config: await getSiteConfig() });
}

const isHttpUrl = (value: string) => /^https?:\/\/.+/.test(value);

export async function PUT(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | Partial<SiteConfig>
    | null;
  if (!body) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const patch: Partial<SiteConfig> = {};
  if (typeof body.artistName === "string" && body.artistName.trim()) {
    patch.artistName = body.artistName.trim().slice(0, 60);
  }
  if (typeof body.bio === "string") {
    patch.bio = body.bio.trim().slice(0, 400);
  }
  if (typeof body.nowPlayingUrl === "string") {
    const url = body.nowPlayingUrl.trim();
    if (!/^https?:\/\/(www\.|on\.|m\.)?soundcloud\.com\/.+/.test(url)) {
      return NextResponse.json(
        { error: "Now Playing must be a soundcloud.com link." },
        { status: 400 }
      );
    }
    patch.nowPlayingUrl = url.split(/[?#]/)[0];
  }
  if (body.socials && typeof body.socials === "object") {
    const socials: Partial<SiteConfig["socials"]> = {};
    for (const key of ["soundcloud", "spotify", "instagram", "tiktok"] as const) {
      const value = body.socials[key];
      if (typeof value === "string" && value.trim()) {
        if (!isHttpUrl(value.trim())) {
          return NextResponse.json(
            { error: `The ${key} link must start with https://` },
            { status: 400 }
          );
        }
        socials[key] = value.trim();
      }
    }
    patch.socials = socials as SiteConfig["socials"];
  }

  try {
    const config = await saveSiteConfig(patch);
    return NextResponse.json({ saved: true, config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed." },
      { status: 500 }
    );
  }
}
