"use client";

import Link from "next/link";
import React from "react";
import type { ProjectEnvelope } from "@/types/contracts";

interface WorkspaceHeaderProps {
  project: ProjectEnvelope | null;
  isEditingTitle: boolean;
  setIsEditingTitle: (editing: boolean) => void;
  onRename: (name: string) => void;
  workflow: string;
  stage: string;
  setStage: (stage: string) => void;
  onOpenModal: (modal: any) => void;
  onSave: () => void;
  onExport: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  styles: Record<string, string>;
  backendStatus?: "connected" | "offline" | "checking";
}

export default function WorkspaceHeader({
  project,
  isEditingTitle,
  setIsEditingTitle,
  onRename,
  workflow,
  stage,
  setStage,
  onOpenModal,
  onSave,
  onExport,
  sidebarCollapsed,
  onToggleSidebar,
  styles,
  backendStatus: _backendStatus = "checking",
}: WorkspaceHeaderProps): React.JSX.Element {
  if (!project) return <div className={styles.topHeader} />;

  return (
    <header className={styles.topHeader}>
      {/* Project Title with Edit Icon */}
      <div className={styles.titleArea}>
        <Link
          href="/"
          className={styles.homeBtn}
          title="Back to Homepage"
          aria-label="Back to Homepage"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
          </svg>
          <span>Home</span>
        </Link>
        <button
          type="button"
          className={styles.headerNewBtn || styles.homeBtn}
          onClick={() => onOpenModal("newProject")}
          title="Create a new flowchart project"
          aria-label="New Project"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>New</span>
        </button>
        {sidebarCollapsed && (
          <button
            type="button"
            className={styles.sidebarExpandBtn}
            onClick={onToggleSidebar}
            title="Show sidebar (Ctrl+B)"
            aria-label="Show sidebar"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>Sidebar</span>
          </button>
        )}
        {isEditingTitle ? (
          <input
            className={styles.titleInput}
            autoFocus
            aria-label="Project name input"
            value={project.name}
            onBlur={() => {
              if (!project.name.trim()) {
                onRename("Untitled flowchart");
              }
              setIsEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (!project.name.trim()) {
                  onRename("Untitled flowchart");
                }
                setIsEditingTitle(false);
              }
            }}
            onChange={(e) => onRename(e.target.value)}
          />
        ) : (
          <h1 className={styles.projectTitle} onClick={() => setIsEditingTitle(true)}>
            <span>{project.name}</span>
            <span className={styles.pencilIcon} title="Click to rename" aria-label="Rename project">
              ✏️
            </span>
          </h1>
        )}
      </div>

      {/* Right Header Controls */}
      <div className={styles.headerRight}>
        <button
          type="button"
          className={styles.workflowSelectorPill}
          onClick={() => onOpenModal("chooseWorkflow")}
          title="Switch between Option A (Describe Logic) and Option B (Draw Flowchart)"
        >
          <span className={`${styles.workflowPillBadge} ${workflow === "flowchart" ? styles.workflowPillBadgeAmber : styles.workflowPillBadgeGreen}`}>
            {workflow === "flowchart" ? "Option B" : "Option A"}
          </span>
          <span className={styles.workflowPillTitle}>
            {workflow === "flowchart" ? "Draw Flowchart" : "Describe Logic"}
          </span>
          <span className={styles.workflowPillArrow} aria-hidden="true">▾</span>
        </button>

        <button
          type="button"
          className={`${styles.traceLogicHeaderBtn} ${stage === "trace" ? styles.traceLogicHeaderBtnActive : ""}`}
          onClick={() => setStage("trace")}
          title="Step-by-Step Logic Tracer / Visual Debugger"
        >
          🔍 Trace Logic
        </button>

        <button
          type="button"
          className={styles.manualSaveBtn}
          onClick={onSave}
          title="Save project to browser storage"
        >
          💾 Save
        </button>

        <button
          type="button"
          className={styles.manualSaveBtn}
          onClick={onExport}
          title="Export JSON backup"
        >
          ⤓ Export
        </button>
      </div>
    </header>
  );
}
