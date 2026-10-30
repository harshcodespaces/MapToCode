import type { Metadata } from "next";
import React, { Suspense } from "react";
import IdeWorkspace from "@/components/workspace/IdeWorkspace";

export const metadata: Metadata = {
  title: "Workspace — MapToCode Flowchart IDE",
  description: "Visual Flowchart IDE for Python — Design flowcharts visually, inspect variables, and run code in real time.",
};

export default function WorkspacePage(): React.JSX.Element {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "#8c92a4", background: "#18191f", height: "100vh" }}>Loading MapToCode IDE…</div>}>
      <IdeWorkspace />
    </Suspense>
  );
}
