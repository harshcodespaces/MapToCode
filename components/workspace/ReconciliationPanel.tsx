"use client";

import React, { useState } from "react";
import type { AlgorithmSpecification, FlowchartGraph } from "@/types/contracts";
import type { ReconciliationResult } from "@/types/reconciliation";

interface ReconciliationPanelProps {
  workflow: string;
  spec: AlgorithmSpecification;
  graph: FlowchartGraph;
  reconciliation: ReconciliationResult;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  onSyncFlowchartToSpec?: () => void;
  renderAlgoStepsPreview: (steps: any[], spec: any) => React.ReactNode;
  renderFlowchartPreview: (graph: any, styles: any) => React.ReactNode;
  styles: Record<string, string>;
}

export default function ReconciliationPanel({
  workflow,
  spec,
  graph,
  reconciliation,
  onPrev,
  onNext,
  onSave,
  onSyncFlowchartToSpec,
  renderAlgoStepsPreview,
  renderFlowchartPreview,
  styles,
}: ReconciliationPanelProps): React.JSX.Element {
  const [previewTab, setPreviewTab] = useState<"text" | "diagram">("text");

  return (
    <section className={styles.step3Layout} aria-label="Step 3: Check & Compare">
      <div className={styles.step3Header}>
        <h2>
          <span className={styles.compareIcon}>🔄</span>
          <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 4 : 3}</span> Check &amp; Compare
        </h2>
        <p>We compare your algorithm and flowchart to find differences.</p>
      </div>

      <div className={styles.compareGrid}>
        {/* Left Comparison Results */}
        <div className={styles.compareResultsList}>
          {reconciliation.status === "equivalent" ? (
            <>
              <div className={styles.matchCard}>
                <span className={styles.matchIconCheck} aria-hidden="true">✓</span>
                <div>
                  <strong>Input variables match</strong>
                  <p>
                    Both have: {spec.inputs.length > 0 ? spec.inputs.map((i) => `${i.name} (${i.type})`).join(", ") : "no inputs"}
                  </p>
                </div>
              </div>

              <div className={styles.matchCard}>
                <span className={styles.matchIconCheck} aria-hidden="true">✓</span>
                <div>
                  <strong>Processing steps match</strong>
                  <p>Both representations execute identical operations and branch conditions.</p>
                </div>
              </div>

              <div className={styles.matchCard}>
                <span className={styles.matchIconCheck} aria-hidden="true">✓</span>
                <div>
                  <strong>Output matches</strong>
                  <p>
                    Both display:{" "}
                    {spec.outputs.length > 0
                      ? spec.outputs.map((o) => `"${o.description || o.id}"`).join(" or ")
                      : "consistent results"}
                  </p>
                </div>
              </div>

              <div className={styles.infoMatchCard}>
                <span className={styles.matchIconInfo} aria-hidden="true">ℹ️</span>
                <div>
                  <strong>Logic Equivalent</strong>
                  <p>Your algorithm specification and visual flowchart describe the exact same execution model.</p>
                </div>
              </div>
            </>
          ) : reconciliation.status === "conflict" ? (
            <>
              <div className={styles.conflictCard}>
                <span className={styles.conflictIcon} aria-hidden="true">⚠️</span>
                <div>
                  <strong>Logic Differences Detected</strong>
                  <p>{reconciliation.findings?.length || 0} difference(s) found between the algorithm and flowchart.</p>
                </div>
              </div>

              {onSyncFlowchartToSpec && (
                <div style={{ margin: "10px 0 14px 0", padding: "12px 14px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "8px" }}>
                  <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "var(--foreground, #18181b)" }}>
                    💡 <strong>Quick Fix:</strong> Update the algorithm specification to match your visual flowchart with 1 click:
                  </p>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={onSyncFlowchartToSpec}
                    title="Automatically synchronize the algorithm specification with your flowchart"
                    style={{ fontSize: "13px", padding: "6px 14px" }}
                  >
                    🔄 Auto-Sync Algorithm with Flowchart
                  </button>
                </div>
              )}

              <div className={styles.findingAlertList}>
                <h4>Differences to resolve:</h4>
                {reconciliation.findings && reconciliation.findings.length > 0 ? (
                  reconciliation.findings.map((finding: any, idx: number) => (
                    <div className={styles.findingItem} key={finding.id || idx}>
                      <strong>Location: {finding.path}</strong>
                      <p>{finding.diagnostic?.message || `Difference at ${finding.path}`}</p>
                      {finding.diagnostic?.suggestion && (
                        <small style={{ color: "var(--text-muted, #71717a)", display: "block", marginTop: "4px" }}>
                          💡 {finding.diagnostic.suggestion}
                        </small>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: "13px", color: "var(--text-muted, #71717a)" }}>
                    Review both representations below to align their logic.
                  </p>
                )}
              </div>
            </>
          ) : reconciliation.status === "invalid" ? (
            <div className={styles.conflictCard}>
              <span className={styles.conflictIcon} aria-hidden="true">⚠️</span>
              <div>
                <strong>Invalid Sources</strong>
                <p>One or both sources could not be parsed into a valid AST. Return to Step 1 or Step 2 to resolve structural errors.</p>
                {reconciliation.diagnostics?.map((d, i) => (
                  <small key={i} style={{ display: "block", marginTop: "4px" }}>• {d.message}</small>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.blueHelpCard}>
              <span className={styles.matchIconBlue} aria-hidden="true">ℹ</span>
              <div>
                <strong>Equivalence Unknown</strong>
                <p>Equivalence cannot be established automatically for these constructs.</p>
              </div>
            </div>
          )}

          {/* Explanatory note */}
          <div className={styles.blueHelpCard}>
            <span className={styles.matchIconBlue} aria-hidden="true">ℹ</span>
            <div>
              <strong>How comparison works</strong>
              <p>Both the written algorithm and the visual flowchart are canonicalized into a shared Typed AST before comparison.</p>
            </div>
          </div>
        </div>

        {/* Right Dual Representation Preview */}
        <div className={styles.previewPanel}>
          <div className={styles.previewHeaderRow}>
            <span>Preview of Both Representations</span>
            <div className={styles.tabTogglePill}>
              <button
                type="button"
                className={`${styles.tabToggleBtn} ${previewTab === "text" ? styles.tabToggleActive : ""}`}
                onClick={() => setPreviewTab("text")}
              >
                Algorithm (Text)
              </button>
              <button
                type="button"
                className={`${styles.tabToggleBtn} ${previewTab === "diagram" ? styles.tabToggleActive : ""}`}
                onClick={() => setPreviewTab("diagram")}
              >
                Flowchart (Diagram)
              </button>
            </div>
          </div>

          <div className={styles.previewPaneBody}>
            {previewTab === "text" ? (
              <ol className={styles.previewAlgoList}>
                {renderAlgoStepsPreview(spec.steps, spec)}
              </ol>
            ) : (
              renderFlowchartPreview(graph, styles)
            )}
          </div>
        </div>
      </div>

      {/* Review Footer */}
      <div className={styles.stageFooter}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={onPrev}
        >
          {workflow === "flowchart" ? "← Back to Algorithm" : "← Back to Flowchart"}
        </button>
        <div className={styles.stageFooterRight}>
          <button type="button" className={styles.secondaryActionBtn} onClick={onSave}>
            💾 Save Progress
          </button>
          <button
            type="button"
            className={styles.primaryActionBtn}
            onClick={onNext}
          >
            Next: Validation →
          </button>
        </div>
      </div>
    </section>
  );
}
