"use client";

import React from "react";
import type { AlgorithmSpecification } from "@/types/contracts";

interface CodePreviewPanelProps {
  workflow: string;
  targetLanguage: "c" | "python";
  setTargetLanguage: (lang: "c" | "python") => void;
  codeResult: { code?: string; status: string } | null;
  isApproved: boolean;
  isValid: boolean;
  isEquivalent: boolean;
  semanticRevision: number;
  spec: AlgorithmSpecification;
  onCopy: () => void;
  onDownload: () => void;
  onSyncFlowchartToSpec?: () => void;
  children?: React.ReactNode;
  styles: Record<string, string>;
}

export default function CodePreviewPanel({
  workflow,
  targetLanguage,
  setTargetLanguage,
  codeResult,
  isApproved,
  isValid,
  isEquivalent,
  semanticRevision,
  spec,
  onCopy,
  onDownload,
  onSyncFlowchartToSpec,
  children,
  styles,
}: CodePreviewPanelProps): React.JSX.Element {
  const isReady = isValid && isEquivalent;

  return (
    <section className={styles.step5Layout} aria-label="Step 5: Code Generation">
      <div className={styles.step5Header}>
        <div className={styles.step5HeaderTitle}>
          <h2>
            <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 6 : 5}</span> Generate &amp; Run Code
          </h2>
          <p>Your verified algorithm turned into clean, readable code ready for compilation and testing.</p>
          <div style={{ marginTop: "6px" }}>
            {isReady ? (
              <span className={styles.runGatePassBadge}>
                ✓ Verified &amp; Ready (Semantic Rev {semanticRevision})
              </span>
            ) : (
              <span className={styles.runGateBlockBadge}>
                🔒 Incomplete / Conflicting Logic — Return to Validation to resolve errors before running
              </span>
            )}
          </div>
          {!isEquivalent && onSyncFlowchartToSpec && (
            <div
              style={{
                background: "rgba(234, 88, 12, 0.08)",
                border: "1px solid rgba(234, 88, 12, 0.3)",
                borderRadius: "8px",
                padding: "10px 14px",
                marginTop: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div>
                <strong style={{ color: "#c2410c", display: "block", fontSize: "13px" }}>
                  ⚠️ Differences detected between Algorithm and Flowchart
                </strong>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #71717a)" }}>
                  Click below to auto-sync the algorithm with your flowchart and unlock verified code.
                </span>
              </div>
              <button
                type="button"
                className={styles.primaryActionBtn}
                onClick={onSyncFlowchartToSpec}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                🔄 Auto-Sync Algorithm with Flowchart
              </button>
            </div>
          )}
        </div>

        {/* Language Switcher */}
        <div className={styles.langSelectorRow} role="tablist" aria-label="Target language selection">
          <button
            type="button"
            role="tab"
            aria-selected={targetLanguage === "c"}
            className={`${styles.langSelectBtn} ${
              targetLanguage === "c" ? styles.langSelectActive : ""
            }`}
            onClick={() => setTargetLanguage("c")}
          >
            C Code (Restricted)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={targetLanguage === "python"}
            className={`${styles.langSelectBtn} ${
              targetLanguage === "python" ? styles.langSelectActive : ""
            }`}
            onClick={() => setTargetLanguage("python")}
          >
            Python Code
          </button>
        </div>
      </div>

      {/* Code Viewer Panel */}
      <div className={styles.codeViewerCard}>
        <div className={styles.codeViewerHeader}>
          <span className={styles.codeFileName}>
            {targetLanguage === "python" ? "solution.py" : "solution.c"}
          </span>
          <div className={styles.codeButtonRow}>
            <button type="button" className={styles.copyBtn} onClick={onCopy}>
              📋 Copy Code
            </button>
            <button
              type="button"
              className={styles.downloadBtn}
              onClick={onDownload}
            >
              💾 Download .{targetLanguage === "python" ? "py" : "c"}
            </button>
          </div>
        </div>

        <pre className={styles.codePre}>
          <code>
            {codeResult?.code ||
              (targetLanguage === "python"
                ? `# Approved Python code will appear here.\n`
                : `/* Approved restricted C code will appear here. */\n`)}
          </code>
        </pre>
      </div>

      {/* Logic Explanation Box */}
      <div className={styles.codeExplanationCard}>
        <h4>How this code works:</h4>
        <ul>
          {spec.inputs.length > 0 && (
            <li>
              <strong>Input:</strong> Reads{" "}
              {spec.inputs.map((i, idx) => (
                <code key={idx}>{i.name} ({i.type})</code>
              ))}{" "}
              from the user using {targetLanguage === "python" ? "input()" : "checked scanf"}.
            </li>
          )}
          {spec.steps.filter((s) => s.kind === "conditional").length > 0 && (
            <li>
              <strong>Decision:</strong> Evaluates condition and follows the matching branch (true or false).
            </li>
          )}
          {spec.outputs.length > 0 && (
            <li>
              <strong>Output:</strong> Displays the result —{" "}
              {spec.outputs.map((o) => `"${o.description || o.id}"`).join(" or ")}.
            </li>
          )}
          <li>
            <strong>Language tip:</strong>{" "}
            {targetLanguage === "python"
              ? "Python uses indentation (spaces) to group code inside conditions."
              : "Restricted C uses strict typing, checked scanf, printf, and braces { } without pointers or dynamic memory."}
          </li>
        </ul>
      </div>

      {/* Embedded Execution Sandbox (Console) */}
      {children}
    </section>
  );
}
