"use client";

import React from "react";
import type { ApiExecuteResponse } from "@/types/api";

interface ExecutionConsoleProps {
  targetLanguage: "c" | "python";
  workflow: string;
  isReady: boolean;
  isRunning: boolean;
  programInput: string;
  setProgramInput: (val: string) => void;
  onRunProgram: () => void;
  executionResult: ApiExecuteResponse | null;
  isEquivalent?: boolean;
  onSyncFlowchartToSpec?: () => void;
  styles: Record<string, string>;
}

export default function ExecutionConsole({
  targetLanguage,
  workflow,
  isReady,
  isRunning,
  programInput,
  setProgramInput,
  onRunProgram,
  executionResult,
  isEquivalent,
  onSyncFlowchartToSpec,
  styles,
}: ExecutionConsoleProps): React.JSX.Element {
  return (
    <div className={styles.runTestCard}>
      <div className={styles.runTestHeader}>
        <div className={styles.runTestTitle}>
          <h3>▶ Run &amp; Test (Interactive Sandbox)</h3>
          <span className={styles.sandboxBadge}>Isolated Sandbox • ISO C99 / Python 3.12</span>
        </div>
        {isReady ? (
          <span className={styles.runGatePassBadge}>✓ Ready to Execute</span>
        ) : (
          <span className={styles.runGateBlockBadge}>🔒 Blocked: Resolve Validation Issues</span>
        )}
      </div>

      <div className={styles.runTestBody}>
        <div className={styles.stdinSection}>
          <label className={styles.stdinLabel} htmlFor="stdin-input">
            Standard Input (stdin):
            <span className={styles.stdinHint}>
              Provide inputs your program reads with {targetLanguage === "python" ? "input()" : "scanf"}
            </span>
          </label>
          <textarea
            id="stdin-input"
            className={styles.stdinTextarea}
            rows={2}
            value={programInput}
            onChange={(e) => setProgramInput(e.target.value)}
            placeholder="e.g. 25"
          />
          <div className={styles.runActionRow}>
            <button
              type="button"
              className={styles.runSubmitBtn}
              disabled={!isReady || isRunning}
              onClick={onRunProgram}
            >
              {isRunning
                ? "⏳ Compiling & Running in Sandbox..."
                : `▶ Run & Test (${targetLanguage === "python" ? "Python" : "C"})`}
            </button>
            {!isReady && isEquivalent === false && onSyncFlowchartToSpec ? (
              <span className={styles.runDisabledNote}>
                ⚠️ Differences between algorithm and flowchart detected.{" "}
                <button
                  type="button"
                  onClick={onSyncFlowchartToSpec}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent, #10b981)",
                    textDecoration: "underline",
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: 600,
                  }}
                >
                  Auto-Sync Algorithm with Flowchart
                </button>{" "}
                to unlock execution.
              </span>
            ) : !isReady ? (
              <span className={styles.runDisabledNote}>
                ⚠️ Resolve validation errors in Step {workflow === "flowchart" ? 5 : 4} (Validation) to enable execution.
              </span>
            ) : null}
          </div>
        </div>

        {/* Execution Output Console */}
        {executionResult && (
          <div className={styles.consoleCard}>
            <div className={styles.consoleHeader}>
              <span className={styles.consoleTitle}>Program Output</span>
              <div className={styles.consoleMetaRow}>
                {executionResult.executionTimeMs != null && executionResult.executionTimeMs > 0 && (
                  <span className={styles.consoleDuration}>⏱ {executionResult.executionTimeMs}ms</span>
                )}
                {executionResult.runner && (
                  <span className={styles.consoleRunnerBadge}>
                    {executionResult.runner === "local_isolated" ? "⚡ Local Runner" : "☁ Cloud Sandbox"}
                  </span>
                )}
                <span
                  className={`${styles.consoleStatusPill} ${
                    executionResult.success ? styles.statusSuccess : styles.statusFail
                  }`}
                >
                  {executionResult.status === "completed" || executionResult.status === "success"
                    ? executionResult.success
                      ? "Success (Exit 0)"
                      : `Terminated (Exit ${executionResult.exitCode ?? 1})`
                    : executionResult.status}
                </span>
              </div>
            </div>

            <div className={styles.consoleBody}>
              {executionResult.stdout && (
                <div className={styles.outputBlock}>
                  <span className={styles.outputLabel}>Standard Output (stdout):</span>
                  <pre className={styles.consoleStdout}>{executionResult.stdout}</pre>
                </div>
              )}
              {executionResult.stderr && (
                <div className={styles.outputBlock}>
                  <span className={styles.outputLabel}>Standard Error (stderr):</span>
                  <pre className={styles.consoleStderr}>{executionResult.stderr}</pre>
                </div>
              )}
              {executionResult.message && !executionResult.stdout && !executionResult.stderr && (
                <div className={styles.outputBlock}>
                  <span className={styles.outputLabel}>Status Note:</span>
                  <pre className={styles.consoleStderr}>{executionResult.message}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
