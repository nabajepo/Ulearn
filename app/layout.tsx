import type {
  Metadata,
  Viewport,
} from "next";

import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import AppProviders from "@/components/AppProviders";

import "./globals.css";

/* =========================================================
   Fonts
   ========================================================= */

const geistSans =
  Geist({
    variable:
      "--font-geist-sans",

    subsets: [
      "latin",
    ],
  });

const geistMono =
  Geist_Mono({
    variable:
      "--font-geist-mono",

    subsets: [
      "latin",
    ],
  });

/* =========================================================
   Metadata
   ========================================================= */

export const metadata:
  Metadata = {
  title:
    "ULearn",

  description:
    "ULearn is a web-based platform where teachers can create quizzes, correct student answers, deliver scores, and track student progress.",

  icons: {
    icon:
      "/logo.png",

    apple:
      "/logo.png",

    shortcut:
      "/logo.png",
  },
};

/* =========================================================
   Viewport
   ========================================================= */

export const viewport:
  Viewport = {
  width:
    "device-width",

  initialScale:
    1,
};

/* =========================================================
   Root layout
   ========================================================= */

export default function RootLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}