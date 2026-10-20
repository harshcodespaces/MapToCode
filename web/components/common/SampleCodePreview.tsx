"use client";

import React, { useEffect, useState } from "react";
import { createEligibilityExample } from "@/core/examples.js";
import { approveCurrentProject, generatePythonForProject } from "@/core/generation-gate.js";
import styles from "@/app/page.module.css";

interface GenerationResult {
  status: string;
  code?: string;
  diagnostics?: any[];
}

export default function SampleCodePreview(): React.JSX.Element {
  const [result, setResult] = useState<GenerationResult | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const project = createEligibilityExample();
      const approval = approveCurrentProject(project);
      const generated: GenerationResult | null = approval.approval
        ? generatePythonForProject({ ...project, generationApproval: approval.approval })
        : null;
      setResult(generated);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (result === null) {
    return <div className={styles.previewBlocked || "preview-blocked"}>Preparing the checked sample code…</div>;
  }
  if (result.status !== "ready") {
    return (
      <div className={styles.previewBlocked || "preview-blocked"}>
        This sample preview could not pass the current generation checks.
      </div>
    );
  }
  return <pre>{result.code}</pre>;
}
