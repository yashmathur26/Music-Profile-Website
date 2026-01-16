import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import type { Metadata } from "next";

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
        url: "/avatar.png",
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
    images: ["/avatar.png"],
  },
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <div className="min-h-screen bg-surface">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
