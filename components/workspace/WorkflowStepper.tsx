"use client";

import React from "react";

export interface WorkflowStep {
  id: string;
  label: string;
  subtitle: string;
  stepNumber: number;
}

interface WorkflowStepperProps {
  workflow: string;
  stage: string;
  setStage: (stage: string) => void;
  activeWorkflowSteps: WorkflowStep[];
  currentStepIndex: number;
  progressPercentage: number;
  styles: Record<string, string>;
}

export default function WorkflowStepper({
  workflow,
  stage,
  setStage,
  activeWorkflowSteps,
  currentStepIndex,
  progressPercentage,
  styles,
}: WorkflowStepperProps): React.JSX.Element {
  const currentStepObj = activeWorkflowSteps[currentStepIndex] || activeWorkflowSteps[0];
  const totalSteps = activeWorkflowSteps.length;
  const activeStepRef = React.useRef<HTMLButtonElement | null>(null);

  // Auto-scroll active step into view on mobile
  React.useEffect(() => {
    if (activeStepRef.current) {
      activeStepRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [stage, currentStepIndex]);

  return (
    <>
      {/* Progress Bar & Status */}
      <div className={styles.progressRow}>
        <div className={styles.progressStatusText}>
          <span className={styles.workflowStatusText}>
            Active Workflow:{" "}
            <strong>
              {workflow === "flowchart" ? "Option B — Draw Flowchart" : "Option A — Describe Logic"}
            </strong>
          </span>
          <span className={styles.stepProgressText}>
            Step {currentStepIndex + 1} of {totalSteps}: <strong>{currentStepObj.label}</strong> ({progressPercentage}%)
          </span>
        </div>
        <div className={styles.progressBarWrapper} role="progressbar" aria-valuenow={progressPercentage} aria-valuemin={0} aria-valuemax={100}>
          <div className={styles.progressBarFill} style={{ width: `${progressPercentage}%` }} />
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className={styles.stepperContainer}>
        <nav className={styles.stepper} aria-label="Workflow Steps">
          {activeWorkflowSteps.map((step, idx) => {
            const isPast = currentStepIndex > idx;
            const isCurrent = currentStepIndex === idx;

            return (
              <button
                type="button"
                key={step.id}
                ref={isCurrent ? activeStepRef : null}
                onClick={() => setStage(step.id)}
                className={`${styles.stepButton} ${isCurrent ? styles.stepCurrent : ""} ${
                  isPast ? styles.stepCompleted : ""
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <div className={styles.stepCircle} aria-hidden="true">
                  {isPast ? "✓" : step.stepNumber}
                </div>
                <div className={styles.stepInfo}>
                  <span className={styles.stepTitle}>{step.label}</span>
                  <span className={styles.stepSubtitle}>{step.subtitle}</span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
