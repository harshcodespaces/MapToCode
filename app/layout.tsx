import type { Metadata, Viewport } from "next";
import React from "react";
import "./globals.css";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-loaded", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body-loaded", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-loaded", display: "swap" });
export const metadata: Metadata = {
  title: "MapToCode — Turn flowcharts into Python",
  description: "Write an algorithm, build a matching flowchart, validate the logic, and generate readable Python source.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#142820",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
    return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("maptocode-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
