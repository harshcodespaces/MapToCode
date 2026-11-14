"use client";

import React from "react";
import styles from "./MobileWorkspace.module.css";

export type MobileMode = "files" | "canvas" | "code" | "run";

interface MobileHeaderProps {
  mode: MobileMode;
  fileName?: string;
  onBack?: () => void;
  onRun?: () => void;
}

const titles: Record<MobileMode, string> = {
  files: "Files",
  canvas: "Canvas",
  code: "Code",
  run: "Run",
};

export default function MobileHeader({
  mode,
  fileName,
  onBack,
  onRun,
}: MobileHeaderProps): React.JSX.Element {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        {mode !== "canvas" && onBack ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onBack}
            aria-label="Back to canvas"
          >
            <span aria-hidden="true">←</span>
          </button>
        ) : null}

        <div className={styles.titleGroup}>
          <span className={styles.appTitle}>MapToCode</span>
          <span className={styles.modeTitle}>
            {mode === "canvas" ? fileName || "main.fc" : titles[mode]}
          </span>
        </div>
      </div>

      <div className={styles.headerActions}>
        {mode === "canvas" && onRun ? (
          <button
            type="button"
            className={styles.runButton}
            onClick={onRun}
          >
            <span aria-hidden="true">▶</span>
            <span>Run</span>
          </button>
        ) : null}

        <button
          type="button"
          className={styles.iconButton}
          aria-label="More options"
        >
          <span aria-hidden="true">⋮</span>
        </button>
      </div>
    </header>
  );
}