import type { Metadata } from "next";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MapToCode — Turn flowcharts into Python",
  description: "Write an algorithm, build a matching flowchart, validate the logic, and generate readable Python source.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
