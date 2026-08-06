import { ClerkProvider } from "@clerk/nextjs";

import type {
  Metadata,
  Viewport,
} from "next";

import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import HelpSupport from "@/components/HelpSupport";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ULearn",

  description:
    "ULearn is a web-based platform where teachers can create quizzes, correct student answers, deliver scores, and track student progress.",

  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const localization = {
  signIn: {
    start: {
      title: "Welcome to ULearn",
      subtitle: "Enter your credentials",
    },
  },

  signUp: {
    start: {
      title: "Create your account",
      subtitle: "It takes less than a minute",
      formButtonPrimary: "Create",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider localization={localization}>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {children}

          <HelpSupport />
        </body>
      </html>
    </ClerkProvider>
  );
}