import React, { useId } from "react";
import styles from "./FlowchartDiagram.module.css";

export interface FlowchartDiagramProps {
  compact?: boolean;
}

export default function FlowchartDiagram({ compact = false }: FlowchartDiagramProps): React.JSX.Element {
  const arrowId = `flow-arrow-${useId().replaceAll(":", "")}`;

  return (
    <div className={`${styles.frame} ${compact ? styles.compactFrame : ""}`}>
      <div
        className={styles.diagram}
        role="img"
        aria-label="Age eligibility flowchart: enter an age, check whether it is at least 18, then show the matching voting eligibility message"
      >
        <svg className={styles.wires} viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id={arrowId} viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M1 1 6 4 1 7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </marker>
          </defs>
          <path d="M145 210H200" markerEnd={`url(#${arrowId})`} />
          <path d="M360 210H390" markerEnd={`url(#${arrowId})`} />
          <path d="M540 210H590V92H620" markerEnd={`url(#${arrowId})`} />
          <path d="M540 210H590V328H620" markerEnd={`url(#${arrowId})`} />
          <path d="M820 92H850V210H870" markerEnd={`url(#${arrowId})`} />
          <path d="M820 328H850V210H870" markerEnd={`url(#${arrowId})`} />
        </svg>
        <div className={`${styles.node} ${styles.start}`}>
          <span className={styles.nodeKind}>BEGIN</span>
          <strong>Start</strong>
        </div>
        <div className={`${styles.node} ${styles.input}`}>
          <span className={styles.nodeIcon}>↳</span>
          <span>
            <span className={styles.nodeKind}>INPUT</span>
            <strong>Ask for age</strong>
          </span>
        </div>
        <div className={`${styles.node} ${styles.decision}`}>
          <span>
            <span className={styles.nodeKind}>DECISION</span>
            <strong>age ≥ 18?</strong>
          </span>
        </div>
        <span className={`${styles.branch} ${styles.yes}`}>YES</span>
        <span className={`${styles.branch} ${styles.no}`}>NO</span>
        <div className={`${styles.node} ${styles.outputAdult}`}>
          <span className={styles.nodeIcon}>⌁</span>
          <span>
            <span className={styles.nodeKind}>OUTPUT · YES</span>
            <strong>Eligible to vote</strong>
          </span>
        </div>
        <div className={`${styles.node} ${styles.outputMinor}`}>
          <span className={styles.nodeIcon}>⌁</span>
          <span>
            <span className={styles.nodeKind}>OUTPUT · NO</span>
            <strong>Not eligible yet</strong>
          </span>
        </div>
        <div className={`${styles.node} ${styles.end}`}>
          <span className={styles.nodeKind}>FINISH</span>
          <strong>End</strong>
        </div>
      </div>
    </div>
  );
}
