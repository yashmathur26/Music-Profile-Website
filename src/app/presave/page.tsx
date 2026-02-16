import { redirect } from "next/navigation";
import { campaign } from "@/config/campaign";

/**
 * Presave is a single button on the landing page that goes straight to Spotify.
 * /presave just sends people to the landing so they see that one button.
 */
export default function PresavePage() {
  if (campaign.isActive) {
    redirect("/");
  }
  redirect("/home");
}
