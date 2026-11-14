"use client";

import MobileFiles from "./MobileFiles";
import React, { useState } from "react";
import MobileHeader, { type MobileMode } from "./MobileHeader";
import MobileBottomNav from "./MobileBottomNav";
import styles from "./MobileWorkspace.module.css";

interface MobileWorkspaceProps {
  fileName?: string;
  canvas: React.ReactNode;
  files?: React.ReactNode;
  code?: React.ReactNode;
  run?: React.ReactNode;
  onRun?: () => void;
}

export default function MobileWorkspace({
  fileName,
  canvas,
  files,
  code,
  run,
  onRun,
}: MobileWorkspaceProps): React.JSX.Element {
  const [activeMode, setActiveMode] = useState<MobileMode>("canvas");

  const renderContent = (): React.ReactNode => {
    switch (activeMode) {
      case "files":
        return files ?? (
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>📁</div>
            <h2>Files</h2>
            <p>Mobile file explorer is coming next.</p>
          </div>
        );

      case "code":
        return code ?? (
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>{"</>"}</div>
            <h2>Code</h2>
            <p>Mobile code view is coming next.</p>
          </div>
        );

      case "run":
        return run ?? (
          <div className={styles.comingSoon}>
            <div className={styles.comingSoonIcon}>▶</div>
            <h2>Run</h2>
            <p>Mobile terminal is coming next.</p>
          </div>
        );

      case "canvas":
      default:
        return canvas;
    }
  };

  return (
    <div className={styles.mobileWorkspace}>
      <MobileHeader
        mode={activeMode}
        fileName={fileName}
        onBack={
          activeMode === "canvas"
            ? undefined
            : () => setActiveMode("canvas")
        }
        onRun={onRun}
      />

      <main className={styles.content}>
        {renderContent()}
      </main>

      <MobileBottomNav
        activeMode={activeMode}
        onChange={setActiveMode}
      />
    </div>
  );
}