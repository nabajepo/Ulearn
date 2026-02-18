import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Ulearn",
  description: "Ulearn is a web-based platform where teachers can create quizzes, correct student answers, deliver scores, and track student progress.",
  
  viewport: {
    width: "device-width",
    initialScale: 1,
  },

  icons:{
    icon:"/iconImage.png", //browser
    apple:"/iconImage.png", //apple
    shortcut:"/iconImage.png" 
  }
};

const localization = {
  signIn: {
    start: {
      title: "Welcome to Ulearn",
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
      </body>
    </html>
    </ClerkProvider>
  );
}
