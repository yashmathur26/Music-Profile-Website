import { redirect } from "next/navigation";

/**
 * Root (/) goes straight to the main site — no landing page.
 */
export default function RootPage() {
  redirect("/home");
}
