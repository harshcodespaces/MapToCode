"use client";

import React from "react";
import type { Diagnostic } from "@/types/diagnostics";

interface ValidationDrawerProps {
  workflow: string;
  isValid: boolean;
  isEquivalent: boolean;
  diagnostics: Diagnostic[];
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  onSyncFlowchartToSpec?: () => void;
  styles: Record<string, string>;
}

export default function ValidationDrawer({
  workflow,
  isValid,
  isEquivalent,
  diagnostics,
  onPrev,
  onNext,
  onSave,
  onSyncFlowchartToSpec,
  styles,
}: ValidationDrawerProps): React.JSX.Element {
  return (
    <section className={styles.step4Layout} aria-label="Step 4: Validation & Verification">
      <div className={styles.step4Header}>
        <h2>
          <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 5 : 4}</span> Validation &amp; Verification
        </h2>
        <p>Check for errors and verify matching logic before code generation.</p>
      </div>

      <div className={styles.validationCardsGrid}>
        <div className={styles.valCheckCard}>
          <div className={styles.valCheckIcon}>{isValid ? "✓" : "⚠️"}</div>
          <div>
            <strong>Structural Integrity</strong>
            <p>Single Start block, valid connections, all paths terminate cleanly at End.</p>
          </div>
        </div>

        <div className={styles.valCheckCard}>
          <div className={styles.valCheckIcon}>{isValid ? "✓" : "⚠️"}</div>
          <div>
            <strong>Type &amp; Expression Safety</strong>
            <p>Safe numeric operations, verified data types, and no unsafe code escapes.</p>
          </div>
        </div>

        <div className={styles.valCheckCard}>
          <div className={styles.valCheckIcon}>{isEquivalent ? "✓" : "⚠️"}</div>
          <div>
            <strong>Equivalence Check</strong>
            <p>Algorithm specification and visual flowchart describe identical execution logic.</p>
          </div>
        </div>
      </div>

      {(!isValid || !isEquivalent) && (
        <div className={styles.validationNoticeBox}>
          <strong>⚠️ Issues requiring attention before generating code:</strong>
          <ul>
            {!isEquivalent && (
              <li>
                Algorithm and flowchart logic do not match. Review Step {workflow === "flowchart" ? 4 : 3} for differences.
                {onSyncFlowchartToSpec && (
                  <span style={{ display: "inline-block", marginLeft: "10px" }}>
                    <button
                      type="button"
                      className={styles.primaryActionBtn}
                      onClick={onSyncFlowchartToSpec}
                      style={{ fontSize: "12px", padding: "3px 10px", verticalAlign: "middle" }}
                      title="Update algorithm specification to match flowchart"
                    >
                      🔄 Auto-Sync Algorithm with Flowchart
                    </button>
                  </span>
                )}
              </li>
            )}
            {diagnostics.map((d, i) => (
              <li key={i}>
                {d.field ? `${d.field}: ` : ""}
                {d.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Verification Status Card */}
      <div className={styles.approvalBox}>
        <div>
          <strong>
            {isValid && isEquivalent ? "✓ Logic Verified for Code Generation" : "Verification Status"}
          </strong>
          <p>
            {isValid && isEquivalent
              ? "Both algorithm and flowchart representations are valid, equivalent, and verified. You can proceed directly to generate code."
              : "Resolve any validation errors or logic differences above to enable code generation."}
          </p>
        </div>
        <span className={isValid && isEquivalent ? styles.verifiedBadge : styles.unapprovedBadge}>
          {isValid && isEquivalent ? "✓ Logic Verified" : "Verification Pending"}
        </span>
      </div>

      {/* Validation Footer */}
      <div className={styles.stageFooter}>
        <button type="button" className={styles.backBtn} onClick={onPrev}>
          ← Back to Check &amp; Compare
        </button>
        <div className={styles.stageFooterRight}>
          <button type="button" className={styles.secondaryActionBtn} onClick={onSave}>
            💾 Save Progress
          </button>
          <button
            type="button"
            className={styles.primaryActionBtn}
            disabled={!isValid || !isEquivalent}
            onClick={onNext}
          >
            Next: Generate Code →
          </button>
        </div>
      </div>
    </section>
  );
}
