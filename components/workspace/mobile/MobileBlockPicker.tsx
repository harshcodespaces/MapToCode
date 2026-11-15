"use client";

import React, { useState } from "react";
import styles from "./MobileWorkspace.module.css";

export type MobileBlockKind =
  | "start"
  | "end"
  | "input"
  | "initialization"
  | "process"
  | "decision"
  | "output";

interface MobileBlockPickerProps {
  onAddBlock: (kind: MobileBlockKind) => void;
  hasStartNode: boolean;
}

const blocks: Array<{
  kind: MobileBlockKind;
  label: string;
  icon: string;
}> = [
  { kind: "start", label: "Start", icon: "🟢" },
  { kind: "input", label: "Input", icon: "🔵" },
  { kind: "initialization", label: "Initialize", icon: "🟢" },
  { kind: "process", label: "Process", icon: "🟣" },
  { kind: "decision", label: "Decision", icon: "🟠" },
  { kind: "output", label: "Output", icon: "🔴" },
  { kind: "end", label: "End", icon: "🛑" },
];

export default function MobileBlockPicker({
  onAddBlock,
  hasStartNode,
}: MobileBlockPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const handleAdd = (kind: MobileBlockKind) => {
    if (kind === "start" && hasStartNode) {
      return;
    }

    onAddBlock(kind);
    setOpen(false);
  };

  return (
    <div className={styles.mobileBlockPicker}>
      {open ? (
        <>
          <button
            type="button"
            className={styles.mobileBlockPickerBackdrop}
            aria-label="Close block picker"
            onClick={() => setOpen(false)}
          />

          <div className={styles.mobileBlockSheet}>
            <div className={styles.mobileBlockSheetHandle} />

            <div className={styles.mobileBlockSheetHeader}>
              <div>
                <span className={styles.mobileBlockSheetTitle}>
                  Add Block
                </span>
                <span className={styles.mobileBlockSheetSubtitle}>
                  Choose a block to add to your flowchart
                </span>
              </div>

              <button
                type="button"
                className={styles.mobileBlockClose}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className={styles.mobileBlockGrid}>
              {blocks.map((block) => {
                const disabled =
                  block.kind === "start" && hasStartNode;

                return (
                  <button
                    key={block.kind}
                    type="button"
                    className={`${styles.mobileBlockOption} ${
                      disabled
                        ? styles.mobileBlockOptionDisabled
                        : ""
                    }`}
                    disabled={disabled}
                    onClick={() => handleAdd(block.kind)}
                  >
                    <span
                      className={styles.mobileBlockOptionIcon}
                      aria-hidden="true"
                    >
                      {block.icon}
                    </span>

                    <span className={styles.mobileBlockOptionLabel}>
                      {block.label}
                    </span>

                    {disabled ? (
                      <span className={styles.mobileBlockOptionStatus}>
                        Added
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      <button
        type="button"
        className={styles.mobileAddBlockButton}
        onClick={() => setOpen(true)}
        aria-label="Add block"
        aria-expanded={open}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}