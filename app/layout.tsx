import type { Metadata, Viewport } from "next";
import React from "react";
import ServiceWorkerRegistration from "@/components/common/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "MapToCode — Turn flowcharts into Python",
  description: "Write an algorithm, build a matching flowchart, validate the logic, and generate readable Python source.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1e1e1e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
