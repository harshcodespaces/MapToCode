"use client";

import React, { useState } from "react";
import styles from "./MobileWorkspace.module.css";

interface WaitingForInput {
  varName: string;
  varType: string;
  prompt: string;
  targetFile: string;
}

interface MobileRunProps {
  terminalHistory: string[];
  waitingForInput: WaitingForInput | null;
  onRun: () => void;
  onClear: () => void;
  onSubmitInput: (value: string) => void;
}

export default function MobileRun({
  terminalHistory,
  waitingForInput,
  onRun,
  onClear,
  onSubmitInput,
}: MobileRunProps): React.JSX.Element {
  const [input, setInput] = useState("");

  const output = terminalHistory
    .filter((line) => !line.startsWith("PS C:\\MapToCode>"))
    .join("\n");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!input.trim()) return;

    onSubmitInput(input);
    setInput("");
  };

  return (
    <div className={styles.mobileRun}>
      {/* Run toolbar */}
      <div className={styles.mobileRunToolbar}>
        <div>
          <span className={styles.mobileRunTitle}>Program Output</span>
          <span className={styles.mobileRunSubtitle}>
            {waitingForInput ? "Waiting for input" : "Ready to execute"}
          </span>
        </div>

        <div className={styles.mobileRunActions}>
          <button
            type="button"
            className={styles.mobileRunClear}
            onClick={onClear}
          >
            Clear
          </button>

          <button
            type="button"
            className={styles.mobileRunButton}
            onClick={onRun}
          >
            <span aria-hidden="true">▶</span>
            Run
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div className={styles.mobileTerminal}>
        {output ? (
          <pre>{output}</pre>
        ) : (
          <div className={styles.mobileTerminalEmpty}>
            <div className={styles.mobileTerminalIcon}>▶</div>
            <h3>No output yet</h3>
            <p>
              Run your flowchart to see the program output here.
            </p>
          </div>
        )}
      </div>

      {/* Input */}
      {waitingForInput ? (
        <form
          className={styles.mobileRunInput}
          onSubmit={handleSubmit}
        >
          <div className={styles.mobileRunPrompt}>
            {waitingForInput.prompt}
          </div>

          <div className={styles.mobileRunInputRow}>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Enter ${waitingForInput.varType}...`}
              autoFocus
            />

            <button type="submit">
              Send
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}