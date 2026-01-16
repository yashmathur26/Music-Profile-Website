import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata = {
  title: "Free Download Gate",
  description: "Secure SoundCloud-gated download."
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
