"use client";

import React from "react";

export interface NarrativeStep {
  id?: string;
  isDecision?: boolean;
  isBranchLabel?: boolean;
  branch?: string;
  depth?: number;
  text: string;
}

export interface ConceptItem {
  term: string;
  description: string;
}

export interface FlowchartExplanation {
  summary: string;
  narrativeSteps: NarrativeStep[];
  concepts?: ConceptItem[];
  pseudocode: string;
}

interface ExplanationCardProps {
  workflow: string;
  flowchartExplanation: FlowchartExplanation | null;
  copiedPseudocode: boolean;
  onCopyPseudocode: () => void;
  onEditFlowchart: () => void;
  onSave: () => void;
  onNext: () => void;
  styles: Record<string, string>;
}

export default function ExplanationCard({
  workflow,
  flowchartExplanation,
  copiedPseudocode,
  onCopyPseudocode,
  onEditFlowchart,
  onSave,
  onNext,
  styles,
}: ExplanationCardProps): React.JSX.Element {
  return (
    <section className={styles.explainLayout} aria-label="Explain and Learn">
      <div className={styles.explainHeader}>
        <div className={styles.explainHeaderTitle}>
          <h2>
            <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 2 : "•"}</span>
            Explain &amp; Learn: Understand How It Works
          </h2>
          <p className={styles.explainHeaderSubtitle}>
            Step-by-step plain English explanation and readable pseudocode generated from your visual flowchart.
          </p>
        </div>
        <div className={styles.explainHeaderActions}>
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onEditFlowchart}
          >
            ✏️ Edit Flowchart
          </button>
        </div>
      </div>

      {/* Pedagogical Disclaimer Callout Banner */}
      <div className={styles.learningAidBanner} role="note">
        <span className={styles.learningAidIcon}>🎓</span>
        <div className={styles.learningAidBody}>
          <strong>Pedagogical Learning Aid — Not an Algorithm Specification</strong>
          <p>
            This plain-English walkthrough and readable pseudocode are automatically generated from your visual flowchart blocks to help you learn and understand how the algorithm behaves.
            They are strictly an educational learning aid and do <em>not</em> substitute for an independently authored algorithm specification.
            In the next step, you will author or review your separate Algorithm Specification. Comparing your independently authored specification against your flowchart ensures your logic is sound.
          </p>
        </div>
      </div>

      {/* High-Level Overview Card */}
      {flowchartExplanation && (
        <div className={styles.explainSummaryCard}>
          <div className={styles.summaryCardIcon}>💡</div>
          <div className={styles.summaryCardContent}>
            <strong>High-Level Overview</strong>
            <p>{flowchartExplanation.summary}</p>
          </div>
        </div>
      )}

      {/* Grid: Plain English Narrative (Left) vs Readable Pseudocode (Right) */}
      {flowchartExplanation && (
        <div className={styles.explainGrid}>
          {/* Left: Narrative Steps */}
          <div className={styles.narrativePanel}>
            <div className={styles.panelHeader}>
              <h3>📖 Plain English Walkthrough</h3>
              <span className={styles.panelBadge}>Execution Trace</span>
            </div>
            <div className={styles.narrativeList}>
              {flowchartExplanation.narrativeSteps.length === 0 ? (
                <p className={styles.emptyNarrative}>No steps to trace. Go back to Step 1 and connect your flowchart blocks.</p>
              ) : (
                flowchartExplanation.narrativeSteps.map((step, idx) => (
                  <div
                    key={step.id || idx}
                    className={`${styles.narrativeStepItem} ${step.isDecision ? styles.narrativeDecision : ""} ${step.isBranchLabel ? styles.narrativeBranch : ""}`}
                    style={{ marginLeft: `${(step.depth || 0) * 16}px` }}
                  >
                    <div className={styles.stepBullet}>
                      {step.isDecision ? "❓" : step.isBranchLabel ? (step.branch === "true" ? "✓" : "✗") : (idx + 1)}
                    </div>
                    <div className={styles.stepText}>{step.text}</div>
                  </div>
                ))
              )}
            </div>

            {/* Concept Definitions */}
            {flowchartExplanation.concepts && flowchartExplanation.concepts.length > 0 && (
              <div className={styles.conceptsBox}>
                <h4>📚 Flowchart Concepts in This Diagram</h4>
                <div className={styles.conceptList}>
                  {flowchartExplanation.concepts.map((concept, idx) => (
                    <div key={idx} className={styles.conceptItem}>
                      <strong>{concept.term}</strong>
                      <p>{concept.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Readable Pseudocode */}
          <div className={styles.pseudocodePanel}>
            <div className={styles.panelHeader}>
              <h3>📝 Readable Pseudocode</h3>
              <button
                type="button"
                className={styles.copyPseudocodeBtn}
                onClick={onCopyPseudocode}
                title="Copy pseudocode to clipboard"
              >
                {copiedPseudocode ? "✓ Copied!" : "📋 Copy"}
              </button>
            </div>
            <p className={styles.pseudocodeIntro}>
              Structured, language-neutral pseudocode representing the sequence of blocks on the canvas:
            </p>
            <pre className={styles.pseudocodeBlock}>
              <code>{flowchartExplanation.pseudocode}</code>
            </pre>
            <div className={styles.pseudocodeHelpTip}>
              <span>💡 <strong>Tip:</strong> Notice how decisions map to <code>IF ... THEN ... ELSE</code> structures. In Step 3, you will describe these same steps in your own algorithm specification!</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 Footer */}
      <div className={styles.stageFooter}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={onEditFlowchart}
        >
          ← Back to Flowchart
        </button>
        <div className={styles.stageFooterRight}>
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onSave}
          >
            💾 Save Progress
          </button>
          <button
            type="button"
            className={styles.primaryActionBtn}
            onClick={onNext}
          >
            Next: Author Algorithm Specification →
          </button>
        </div>
      </div>
    </section>
  );
}
