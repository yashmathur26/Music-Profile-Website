import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import type { Metadata } from "next";
import StarfieldCanvas from "@/components/StarfieldCanvas";

export const metadata: Metadata = {
  title: "yvsh music",
  description: "yvsh music - Free downloads and exclusive tracks",
  icons: {
    icon: "/avatar.png",
    apple: "/avatar.png",
  },
  openGraph: {
    title: "yvsh music",
    description: "yvsh music - Free downloads and exclusive tracks",
    url: "https://yvshmusic.com",
    siteName: "yvsh music",
    images: [
      {
        url: "https://yvshmusic.com/avatar.png",
        width: 1200,
        height: 1200,
        alt: "yvsh music",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "yvsh music",
    description: "yvsh music - Free downloads and exclusive tracks",
    images: ["https://yvshmusic.com/avatar.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <div className="min-h-screen bg-surface relative">
            <div className="pointer-events-none fixed inset-0 z-0">
              <StarfieldCanvas density={1.0} seed={1337} className="opacity-100" />
            </div>
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
