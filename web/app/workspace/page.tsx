import type { Metadata } from "next";
import React, { Suspense } from "react";
import WorkspaceClient from "@/components/workspace/WorkspaceClient";

export const metadata: Metadata = {
  title: "Workspace — MapToCode",
  description: "Author an algorithm as a structured specification and flowchart, compare both, and generate restricted C or Python.",
};

export default function WorkspacePage(): React.JSX.Element {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading workspace…</div>}>
      <WorkspaceClient />
    </Suspense>
  );
}
