import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TeamProfileProvider } from "@/context/TeamProfileContext";
import { ToastProvider } from "@/context/ToastContext";
import { TeamProfileModal } from "@/components/TeamProfileModal";
import { BottomNav } from "@/components/BottomNav";
import { CommandPalette } from "@/components/CommandPalette";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fantasy Gauntlet",
  description: "Multi-sport fantasy sports platform",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="min-h-screen flex flex-col antialiased">
        <AuthProvider>
          <ThemeProvider>
            <TeamProfileProvider>
              <ToastProvider>
                {children}
                <TeamProfileModal />
                <BottomNav />
                <CommandPalette />
              </ToastProvider>
            </TeamProfileProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
