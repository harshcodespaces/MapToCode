"use client";

import React, { useRef } from "react";
import type { ProjectEnvelope } from "@/types/contracts";

interface ProjectModalsProps {
  activeModal: string | null;
  setActiveModal: (modal: any) => void;
  project: ProjectEnvelope | null;
  workflow: string;
  switchWorkflow: (wf: "logic" | "flowchart") => void;
  newProjectName: string;
  setNewProjectName: (val: string) => void;
  newProjectWorkflow: "logic" | "flowchart";
  setNewProjectWorkflow: (wf: "logic" | "flowchart") => void;
  onCreateProject: (name: string, wf: "logic" | "flowchart") => void;
  savedProjects: any[];
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string, name: string) => void;
  sampleDetails: Array<{ key: string; title: string; note: string }>;
  sampleWorkflowTarget: any;
  setSampleWorkflowTarget: (target: any) => void;
  onSelectSample: (key: string, wf: "logic" | "flowchart") => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  styles: Record<string, string>;
}

export default function ProjectModals({
  activeModal,
  setActiveModal,
  project,
  workflow,
  switchWorkflow,
  newProjectName,
  setNewProjectName,
  newProjectWorkflow,
  setNewProjectWorkflow,
  onCreateProject,
  savedProjects,
  onOpenProject,
  onDeleteProject,
  sampleDetails,
  sampleWorkflowTarget,
  setSampleWorkflowTarget,
  onSelectSample,
  onExport,
  onImportFile,
  styles,
}: ProjectModalsProps): React.JSX.Element | null {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!activeModal) return null;

  return (
    <>
      {/* 1. Choose Workflow Modal */}
      {activeModal === "chooseWorkflow" && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.chooseWorkflowModalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3>Choose Your Starting Workflow</h3>
                <p className={styles.modalHint}>
                  Which approach do you prefer? You can switch between workflows at any time without losing your project data.
                </p>
              </div>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setActiveModal(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.chooseWorkflowGrid}>
                {/* Option A Card */}
                <div className={`${styles.workflowCardChoice} ${styles.choiceGreen}`}>
                  <div className={styles.workflowChoiceHeader}>
                    <span className={styles.workflowChoiceBadgeGreen}>Option A</span>
                    <span className={styles.stepCountBadge}>6 Steps</span>
                  </div>
                  <h4 className={styles.workflowChoiceTitle}>Option A — Describe My Logic</h4>
                  <p className={styles.workflowChoiceSubtitle}>
                    &ldquo;Write what your algorithm should do, step by step.&rdquo;
                  </p>
                  <ol className={styles.workflowChoiceSteps}>
                    <li><span className={styles.workflowChoiceStepNum}>1</span><span>Describe the algorithm using a structured specification.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>2</span><span>Create a flowchart representing the same logic.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>3</span><span>Compare the two representations.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>4</span><span>Validate the inputs and resolve errors.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>5</span><span>Verify matching logic and generate clean code.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>6</span><span>Trace execution step-by-step, watch variables, and inspect branch decisions.</span></li>
                  </ol>
                  <button
                    type="button"
                    className={styles.selectWorkflowBtnGreen}
                    onClick={() => {
                      switchWorkflow("logic");
                      setActiveModal(null);
                    }}
                  >
                    {workflow === "logic" ? "✓ Currently Active (Option A)" : "Switch to Option A (Describe Logic)"}
                  </button>
                </div>

                {/* Option B Card */}
                <div className={`${styles.workflowCardChoice} ${styles.choiceAmber}`}>
                  <div className={styles.workflowChoiceHeader}>
                    <span className={styles.workflowChoiceBadgeAmber}>Option B</span>
                    <span className={styles.stepCountBadge}>7 Steps</span>
                  </div>
                  <h4 className={styles.workflowChoiceTitle}>Option B — Draw My Flowchart</h4>
                  <p className={styles.workflowChoiceSubtitle}>
                    &ldquo;Build your algorithm visually, then understand how it works.&rdquo;
                  </p>
                  <ol className={styles.workflowChoiceSteps}>
                    <li><span className={styles.workflowChoiceStepNum}>1</span><span>Create a flowchart using drag-and-drop blocks.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>2</span><span>Explain the flowchart in simple English and show readable pseudocode.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>3</span><span>Author or review the separate structured algorithm specification.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>4</span><span>Compare the independently authored specification with the flowchart.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>5</span><span>Validate both representations and resolve errors.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>6</span><span>Verify matching logic and generate clean code.</span></li>
                    <li><span className={styles.workflowChoiceStepNum}>7</span><span>Trace execution step-by-step, watch variables, and inspect branch decisions.</span></li>
                  </ol>
                  <button
                    type="button"
                    className={styles.selectWorkflowBtnAmber}
                    onClick={() => {
                      switchWorkflow("flowchart");
                      setActiveModal(null);
                    }}
                  >
                    {workflow === "flowchart" ? "✓ Currently Active (Option B)" : "Switch to Option B (Draw Flowchart)"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. New Project Modal */}
      {activeModal === "newProject" && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setNewProjectName("");
            setActiveModal(null);
          }}
        >
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Create New Project</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => {
                  setNewProjectName("");
                  setActiveModal(null);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <form
                className={styles.newProjectForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  const nameToCreate = newProjectName.trim() || "My Algorithm";
                  setNewProjectName("");
                  onCreateProject(nameToCreate, newProjectWorkflow);
                  setActiveModal(null);
                }}
              >
                <label className={styles.newProjectLabel}>
                  Project name
                  <input
                    className={styles.newProjectNameInput}
                    autoFocus
                    type="text"
                    placeholder="e.g. Check Even or Odd"
                    value={newProjectName}
                    maxLength={60}
                    onChange={(e) => setNewProjectName(e.target.value)}
                  />
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "14px 0" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>Starting Workflow:</span>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13.5px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="newProjectWorkflow"
                        value="logic"
                        checked={newProjectWorkflow === "logic"}
                        onChange={() => setNewProjectWorkflow("logic")}
                      />
                      <span>Option A: Describe Logic</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13.5px", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="newProjectWorkflow"
                        value="flowchart"
                        checked={newProjectWorkflow === "flowchart"}
                        onChange={() => setNewProjectWorkflow("flowchart")}
                      />
                      <span>Option B: Draw Flowchart</span>
                    </label>
                  </div>
                </div>

                <button type="submit" className={styles.modalNewProjectBtn}>
                  ＋ Create Blank Project
                </button>
              </form>

              <div className={styles.newProjectDivider}>
                <span>— or start from a sample —</span>
              </div>

              <div className={styles.sampleProjectsModalGrid}>
                {sampleDetails.map((sample) => (
                  <div
                    className={styles.sampleModalCard}
                    key={sample.key}
                    onClick={() => {
                      onSelectSample(sample.key, newProjectWorkflow);
                      setActiveModal(null);
                    }}
                  >
                    <strong>{sample.title}</strong>
                    <p>{sample.note}</p>
                    <span className={styles.loadSampleLink}>Use this example →</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. My Projects Modal */}
      {activeModal === "projects" && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>My Projects</h3>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setActiveModal(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <button
                type="button"
                className={styles.modalNewProjectBtn}
                onClick={() => {
                  setNewProjectName("");
                  setActiveModal("newProject");
                }}
              >
                ＋ Start a New Project
              </button>

              {savedProjects.length === 0 ? (
                <p className={styles.emptyProjectsMsg}>No saved projects yet. Create your first one above!</p>
              ) : (
                <div className={styles.savedProjectsList}>
                  {savedProjects.map((p) => (
                    <div className={styles.savedProjectItem} key={p.projectId}>
                      <div className={styles.savedProjectInfo}>
                        <strong>{p.name}</strong>
                        <small>Last edited: {new Date(p.updatedAt).toLocaleDateString()}</small>
                      </div>
                      <div className={styles.projectItemActions}>
                        <button
                          type="button"
                          className={styles.projectOpenBtn}
                          onClick={() => {
                            onOpenProject(p.projectId);
                            setActiveModal(null);
                          }}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className={styles.projectDeleteBtn}
                          title="Delete project"
                          onClick={() => onDeleteProject(p.projectId, p.name)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Sample Projects Modal */}
      {activeModal === "samples" && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setActiveModal(null);
            setSampleWorkflowTarget(null);
          }}
        >
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            {!sampleWorkflowTarget ? (
              <>
                <div className={styles.modalHeader}>
                  <h3>Try a Sample Project</h3>
                  <button
                    type="button"
                    className={styles.modalCloseBtn}
                    onClick={() => setActiveModal(null)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className={styles.modalBody}>
                  <div className={styles.sampleProjectsModalGrid}>
                    {sampleDetails.map((sample) => (
                      <div
                        className={styles.sampleModalCard}
                        key={sample.key}
                        onClick={() => setSampleWorkflowTarget(sample)}
                      >
                        <strong>{sample.title}</strong>
                        <p>{sample.note}</p>
                        <span className={styles.loadSampleLink}>Choose workflow →</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={styles.modalHeader}>
                  <h3>Start {sampleWorkflowTarget.title}</h3>
                  <button
                    type="button"
                    className={styles.modalCloseBtn}
                    onClick={() => setSampleWorkflowTarget(null)}
                    aria-label="Back"
                  >
                    ←
                  </button>
                </div>
                <div className={styles.modalBody}>
                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <button
                      type="button"
                      className={styles.selectWorkflowBtnGreen}
                      onClick={() => {
                        onSelectSample(sampleWorkflowTarget.key, "logic");
                        setActiveModal(null);
                        setSampleWorkflowTarget(null);
                      }}
                    >
                      Start Option A (Logic First) →
                    </button>
                    <button
                      type="button"
                      className={styles.selectWorkflowBtnAmber}
                      onClick={() => {
                        onSelectSample(sampleWorkflowTarget.key, "flowchart");
                        setActiveModal(null);
                        setSampleWorkflowTarget(null);
                      }}
                    >
                      Start Option B (Flowchart First) →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 5. Guide Modal */}
      {activeModal === "guide" && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Beginner&apos;s Guide to MapToCode</h3>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setActiveModal(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.guideStep}>
                <span className={styles.guideStepNum}>1</span>
                <div>
                  <strong>Algorithm Specification</strong>
                  <p>Describe what inputs your program needs, calculations or decisions it makes, and what it outputs.</p>
                </div>
              </div>
              <div className={styles.guideStep}>
                <span className={styles.guideStepNum}>2</span>
                <div>
                  <strong>Flowchart Editor</strong>
                  <p>Draw the same logic visually using Start, Input, Process, Decision, Output, and End blocks.</p>
                </div>
              </div>
              <div className={styles.guideStep}>
                <span className={styles.guideStepNum}>3</span>
                <div>
                  <strong>Check &amp; Compare</strong>
                  <p>MapToCode verifies that your written steps and visual diagram represent identical logic.</p>
                </div>
              </div>
              <div className={styles.guideStep}>
                <span className={styles.guideStepNum}>4</span>
                <div>
                  <strong>Validation &amp; Verification</strong>
                  <p>Checks for type mismatches, missing connections, and unsafe expressions before code generation.</p>
                </div>
              </div>
              <div className={styles.guideStep}>
                <span className={styles.guideStepNum}>5</span>
                <div>
                  <strong>Generate Code</strong>
                  <p>Get clean Python or C code that you can copy or download. All processing runs in your browser.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Settings Modal */}
      {activeModal === "settings" && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Settings &amp; Backup</h3>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setActiveModal(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>All projects are saved locally in your browser — no accounts, no remote server required.</p>
              <div className={styles.settingsBtnRow}>
                <button type="button" className={styles.exportBtn} onClick={onExport}>
                  Export Project JSON
                </button>
                <button
                  type="button"
                  className={styles.importBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import Project JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onImportFile(file);
                      setActiveModal(null);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
