import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TeamProfileProvider } from "@/context/TeamProfileContext";
import { TeamProfileModal } from "@/components/TeamProfileModal";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fantasy Gauntlet",
  description: "Multi-sport fantasy sports platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
      <body className="min-h-screen flex flex-col antialiased">
        <AuthProvider>
          <ThemeProvider>
            <TeamProfileProvider>
              {children}
              <TeamProfileModal />
            </TeamProfileProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
