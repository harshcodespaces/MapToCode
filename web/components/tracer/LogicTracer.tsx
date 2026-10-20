"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { generateAstTrace, TRACE_ENGINE_VERSION } from "@/core/trace-engine.js";
import { generateCFromAst } from "@/core/c-generator.js";
import { generatePythonFromAst } from "@/core/python-generator.js";
import FlowCanvas from "@/components/canvas/FlowCanvas";
import styles from "./LogicTracer.module.css";

export interface LogicTracerProps {
  project?: any;
  ast?: any;
  onHighlightFlowchartNode?: (nodeId: string) => void;
  className?: string;
}

export default function LogicTracer({
  project,
  ast,
  onHighlightFlowchartNode,
  className = "",
}: LogicTracerProps): React.JSX.Element {
  // 1. Identify input symbols from AST or project
  const inputSymbols = useMemo(() => {
    if (!ast?.symbols) return [];
    // Input symbols are either in project.specification.inputs or flowchart input nodes
    const inputNames = new Set([
      ...(project?.specification?.inputs?.map((i: any) => i.name) || []),
      ...(project?.flowchart?.nodes?.filter((n: any) => n.kind === "input").map((n: any) => n.payload?.name) || []),
    ]);
    return ast.symbols.filter((s: any) => inputNames.has(s.name));
  }, [ast, project]);

  // Default initial inputs
  const defaultInputs = useMemo(() => {
    const defaults: Record<string, any> = {};
    for (const sym of inputSymbols) {
      if (sym.name.toLowerCase().includes("age")) defaults[sym.name] = 18;
      else if (sym.name.toLowerCase().includes("num") || sym.name === "n") defaults[sym.name] = 4;
      else if (sym.name === "first" || sym.name === "a") defaults[sym.name] = 10;
      else if (sym.name === "second" || sym.name === "b") defaults[sym.name] = 25;
      else if (sym.name.toLowerCase().includes("mark") || sym.name.toLowerCase().includes("score")) defaults[sym.name] = 85;
      else if (sym.type === "int") defaults[sym.name] = 5;
      else if (sym.type === "double") defaults[sym.name] = 3.14;
      else if (sym.type === "char") defaults[sym.name] = "A";
      else defaults[sym.name] = 1;
    }
    return defaults;
  }, [inputSymbols]);

  const [userInputs, setUserInputs] = useState<Record<string, any>>({});
  const inputs = useMemo(() => ({ ...defaultInputs, ...userInputs }), [defaultInputs, userInputs]);
  const [inputDraft, setInputDraft] = useState<Record<string, any>>({});
  const [showInputModal, setShowInputModal] = useState<boolean>(false);
  const [inputError, setInputError] = useState<string>("");

  const [codeViewMode, setCodeViewMode] = useState<"python" | "c" | "flowchart" | "split">("python");
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState<boolean>(false);

  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // 2. Generate deterministic trace
  const traceResult = useMemo(() => {
    if (!ast) return null;
    return generateAstTrace(ast, inputs);
  }, [ast, inputs]);

  const snapshots: any[] = traceResult?.snapshots || [];
  const currentSnapshot: any = snapshots[activeStepIndex] || snapshots[0] || null;

  // 3. Pre-generate code text for Python and C with source maps
  const { pyLines, cLines, algoSteps } = useMemo(() => {
    if (!ast) return { pyLines: [], cLines: [], algoSteps: [] };
    const py = generatePythonFromAst(ast);
    const c = generateCFromAst(ast);

    const steps: Array<{ id: string; label: string }> = [];
    if (project?.specification?.steps) {
      function flattenSteps(items: any[], prefix = "") {
        items.forEach((item: any, i: number) => {
          const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
          steps.push({ id: item.id, label: `${num}. ${item.kind}` });
          if (item.kind === "conditional") {
            flattenSteps(item.payload.whenTrue, `${num}.True`);
            flattenSteps(item.payload.whenFalse, `${num}.False`);
          }
        });
      }
      flattenSteps(project.specification.steps);
    }

    return {
      pyLines: (py.code || "").split("\n"),
      cLines: (c.code || "").split("\n"),
      algoSteps: steps,
    };
  }, [ast, project]);

  // 4. Notify parent of flowchart node highlight
  useEffect(() => {
    if (currentSnapshot?.flowchartNodeId && onHighlightFlowchartNode) {
      onHighlightFlowchartNode(currentSnapshot.flowchartNodeId);
    }
  }, [currentSnapshot, onHighlightFlowchartNode]);

  // 5. Auto-scroll timeline to active snapshot
  useEffect(() => {
    if (!timelineScrollRef.current) return;
    const activeEl = timelineScrollRef.current.querySelector(
      `[data-step-index="${activeStepIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeStepIndex]);

  // Keyboard arrow keys navigation (Left Arrow = Prev, Right Arrow = Next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveStepIndex((prev) => Math.min(snapshots.length - 1, prev + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveStepIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [snapshots.length]);

  // Execution controls
  const handleFirstStep = () => {
    setActiveStepIndex(0);
  };

  const handlePrevStep = () => {
    setActiveStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextStep = () => {
    setActiveStepIndex((prev) => Math.min(snapshots.length - 1, prev + 1));
  };

  const handleLastStep = () => {
    setActiveStepIndex(Math.max(0, snapshots.length - 1));
  };

  const handleReset = () => {
    setActiveStepIndex(0);
  };

  // Input configuration modal handlers
  const handleOpenInputModal = () => {
    setInputDraft({ ...inputs });
    setInputError("");
    setShowInputModal(true);
  };

  const handleApplyInputs = (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setUserInputs({ ...inputDraft });
    setActiveStepIndex(0);
    setShowInputModal(false);
  };

  // Determine active line in code view
  const activeLineNumber = useMemo(() => {
    if (!currentSnapshot) return null;
    if (codeViewMode === "python") return currentSnapshot.pythonLine;
    if (codeViewMode === "c") return currentSnapshot.cLine;
    return null;
  }, [codeViewMode, currentSnapshot]);

  // Variables list
  const variablesList: any[] = useMemo(() => {
    if (!currentSnapshot?.variables) return [];
    return Object.values(currentSnapshot.variables);
  }, [currentSnapshot]);

  if (!ast || snapshots.length === 0) {
    return (
      <section className={`${styles.tracerContainer} ${className}`} aria-label="Step-by-Step Logic Tracer">
        <header className={styles.tracerHeader}>
          <div className={styles.tracerHeaderLeft}>
            <h2>
              Step-by-Step Logic Tracer
              <span className={styles.badge}>v{TRACE_ENGINE_VERSION} Interpreter</span>
            </h2>
            <p>Trace algorithm execution deterministically.</p>
          </div>
        </header>

        <div className={styles.tracerEmptyStateCard}>
          <div className={styles.tracerEmptyIcon}>🔍</div>
          <h3>Algorithm Waiting for Structure</h3>
          <p>
            The Step-by-Step Logic Tracer needs a valid flowchart or specification to interpret.
            Ensure your algorithm has a <strong>Start</strong> block, an <strong>End</strong> block, and connected processing or decision steps.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.tracerContainer} ${className}`} aria-label="Step-by-Step Logic Tracer">
      {/* Top Header & Entry Bar */}
      <header className={styles.tracerHeader}>
        <div className={styles.tracerHeaderLeft}>
          <h2>
            Step-by-Step Logic Tracer
            <span className={styles.badge}>v{TRACE_ENGINE_VERSION} Interpreter</span>
          </h2>
          <p>
            Trace algorithm execution deterministically. Inspect step-by-step state, decision branching, and variable changes.
          </p>
        </div>

        <div className={styles.tracerHeaderActions}>
          {inputSymbols.length > 0 && (
            <button
              type="button"
              className={styles.inputConfigBtn}
              onClick={handleOpenInputModal}
              title="Configure test inputs before tracing"
            >
              ⚙ Test Inputs ({Object.entries(inputs).map(([k, v]) => `${k}=${v}`).join(", ")})
            </button>
          )}

          <div className={styles.viewModeToggle}>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${codeViewMode === "python" ? styles.viewModeBtnActive : ""}`}
              onClick={() => setCodeViewMode("python")}
            >
              Python
            </button>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${codeViewMode === "c" ? styles.viewModeBtnActive : ""}`}
              onClick={() => setCodeViewMode("c")}
            >
              C
            </button>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${codeViewMode === "flowchart" ? styles.viewModeBtnActive : ""}`}
              onClick={() => setCodeViewMode("flowchart")}
            >
              Flowchart
            </button>
            <button
              type="button"
              className={`${styles.viewModeBtn} ${codeViewMode === "split" ? styles.viewModeBtnActive : ""}`}
              onClick={() => setCodeViewMode("split")}
              title="Show Code, Flowchart, and Variables together"
            >
              All Panels
            </button>
          </div>
        </div>
      </header>

      {/* Educational Notice on Supported M1 Subset and While-Loop Proposal */}
      <div className={styles.loopNoticeBanner}>
        <span className={styles.noticeIcon}>ℹ️</span>
        <div>
          <strong>M1 Educational Scope: Deterministic Branching & Variables</strong>
          <p>
            MapToCode M1 supports deterministic variable declarations, arithmetic expressions, I/O, and conditional branches.
            While loops (like the summing loop in the design preview) are specified in the upcoming <strong>M1.2 Loop Architecture Extension</strong>.
            Loops in M1 algorithms are strictly guarded to prevent infinite execution.
          </p>
        </div>
      </div>

      {/* Main Reference-Style Window Container */}
      <div className={styles.tracerWindow}>
        {/* Title Bar with Mac-style Dots and Top Flow Nav */}
        <div className={styles.windowBar}>
          <div className={styles.macDots}>
            <div className={styles.dotRed} />
            <div className={styles.dotYellow} />
            <div className={styles.dotGreen} />
          </div>

          {/* Top Breadcrumb Flow Navigation */}
          <div className={styles.windowFlowNav}>
            <div className={styles.flowItem}>
              <div
                className={`${styles.flowNodeCircle} ${
                  currentSnapshot?.action === "start" ? styles.flowNodeActive : styles.flowNodeCompleted
                }`}
                title="Start"
              >
                {currentSnapshot?.action === "start" && <div className={styles.flowNodePointer} />}
                ▶
              </div>
              <span className={styles.flowArrow}>┈➔</span>
            </div>

            {snapshots
              .filter((s: any) => s.action !== "start" && s.action !== "end")
              .slice(0, 5)
              .map((s: any, idx: number) => {
                const isActive = activeStepIndex === s.stepIndex;
                const isPassed = activeStepIndex > s.stepIndex;
                return (
                  <div key={s.stepIndex} className={styles.flowItem}>
                    <div
                      className={`${styles.flowNodeCircle} ${
                        isActive
                          ? styles.flowNodeActive
                          : isPassed
                          ? styles.flowNodeCompleted
                          : ""
                      }`}
                      title={s.explanation?.activeBlock}
                      onClick={() => setActiveStepIndex(s.stepIndex)}
                      style={{ cursor: "pointer" }}
                    >
                      {isActive && <div className={styles.flowNodePointer} />}
                      {idx + 1}
                    </div>
                    <span className={styles.flowArrow}>┈➔</span>
                  </div>
                );
              })}

            <div className={styles.flowItem}>
              <div
                className={`${styles.flowNodeCircle} ${
                  currentSnapshot?.action === "end" ? styles.flowNodeActive : ""
                }`}
                title="End"
              >
                {currentSnapshot?.action === "end" && <div className={styles.flowNodePointer} />}
                ■
              </div>
            </div>
          </div>

          <div style={{ width: "40px" }} />
        </div>

        {/* Window Body: Left Code View + Right Variables & Memory Cards */}
        <div className={codeViewMode === "split" ? styles.windowMainGridSplit : styles.windowMainGrid}>
          {/* Column 1: Code / Algorithm Panel (shown in python, c, or split modes) */}
          {codeViewMode !== "flowchart" && (
            <div className={styles.codePanel}>
              <div className={styles.codePanelHeader}>
                <span>
                  {codeViewMode === "c" ? "Generated ISO C99" : "Generated Python"}
                </span>
                <span style={{ fontSize: "0.78rem", color: currentSnapshot?.lineMappingAvailable ? "#10b981" : "#94a3b8" }}>
                  {currentSnapshot?.lineMappingAvailable
                    ? `✓ Mapped to Line ${activeLineNumber || "-"}`
                    : "Line mapping: Prelude / Block"}
                </span>
              </div>

              {/* Code Lines with Active Line Highlight & Pointer */}
              <div className={styles.codeView}>
                {(codeViewMode === "c" ? cLines : pyLines).map((line: string, idx: number) => {
                  const lineNum = idx + 1;
                  const isLineActive = activeLineNumber === lineNum;

                  return (
                    <div
                      key={lineNum}
                      className={`${styles.codeLine} ${isLineActive ? styles.codeLineActive : ""}`}
                    >
                      <span className={styles.codeLineNumber}>{lineNum}</span>
                      {isLineActive ? (
                        <span className={styles.activeLinePointer}>➜</span>
                      ) : (
                        <span style={{ width: "16px" }} />
                      )}
                      <span className={styles.codeLineContent}>{line || " "}</span>
                    </div>
                  );
                })}
              </div>

              {/* Beginner-Friendly Explanation Card */}
              {currentSnapshot && (
                <div className={styles.explanationBox}>
                  <div className={styles.explanationTitle}>
                    <span>💡 Step {activeStepIndex + 1} of {snapshots.length}:</span>
                    <span>{currentSnapshot.explanation?.activeBlock}</span>
                  </div>
                  <p className={styles.explanationText}>
                    {currentSnapshot.explanation?.whatIsHappening}
                  </p>
                  {currentSnapshot.explanation?.whyBranchTaken && (
                    <p className={styles.explanationDetail}>
                      <strong>Branch Decision:</strong> {currentSnapshot.explanation.whyBranchTaken}
                    </p>
                  )}
                  {currentSnapshot.explanation?.variableChanged && (
                    <p className={styles.explanationDetail}>
                      <strong>Memory Update:</strong> {currentSnapshot.explanation.variableChanged}
                    </p>
                  )}
                  <div className={styles.explanationWhatNext}>
                    {currentSnapshot.explanation?.whatIsNext}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Column 2: Flowchart Panel (shown in flowchart or split modes) */}
          {(codeViewMode === "flowchart" || codeViewMode === "split") && (
            <div className={styles.codePanel} style={{ borderRight: "1px solid #e2e8f0" }}>
              <div className={styles.codePanelHeader}>
                <span>Flowchart Diagram</span>
                <span style={{ fontSize: "0.78rem", color: currentSnapshot?.flowchartNodeId ? "#10b981" : "#94a3b8" }}>
                  {currentSnapshot?.flowchartNodeId
                    ? `Active Node: ${currentSnapshot.flowchartNodeId}`
                    : "Execution Flow"}
                </span>
              </div>
              <div style={{ height: "340px", overflow: "hidden", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
                {project?.flowchart ? (
                  <FlowCanvas
                    flowchart={project.flowchart}
                    selected={currentSnapshot?.flowchartNodeId}
                    highlightedNodeId={currentSnapshot?.flowchartNodeId}
                    activeBranch={currentSnapshot?.decision?.branch}
                    zoom={0.65}
                    readOnly={true}
                  />
                ) : (
                  <div style={{ padding: "2rem", color: "#64748b", textAlign: "center" }}>
                    No visual flowchart available.
                  </div>
                )}
              </div>
              {codeViewMode === "flowchart" && currentSnapshot && (
                <div className={styles.explanationBox}>
                  <div className={styles.explanationTitle}>
                    <span>💡 Step {activeStepIndex + 1} of {snapshots.length}:</span>
                    <span>{currentSnapshot.explanation?.activeBlock}</span>
                  </div>
                  <p className={styles.explanationText}>
                    {currentSnapshot.explanation?.whatIsHappening}
                  </p>
                  {currentSnapshot.explanation?.whyBranchTaken && (
                    <p className={styles.explanationDetail}>
                      <strong>Branch Decision:</strong> {currentSnapshot.explanation.whyBranchTaken}
                    </p>
                  )}
                  {currentSnapshot.explanation?.variableChanged && (
                    <p className={styles.explanationDetail}>
                      <strong>Memory Update:</strong> {currentSnapshot.explanation.variableChanged}
                    </p>
                  )}
                  <div className={styles.explanationWhatNext}>
                    {currentSnapshot.explanation?.whatIsNext}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Right Panel: Variable Watch Table + Visual Memory Cards */}
          <div className={styles.rightPanels}>
            {/* Variable Watch Section */}
            <div className={styles.watchSection}>
              <h4 className={styles.panelTitle}>Variable Watch</h4>
              <table className={styles.watchTable}>
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Type</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {variablesList.map((v: any) => (
                    <tr
                      key={v.name}
                      className={v.changed ? styles.varChangedRow : ""}
                    >
                      <td>
                        <span className={styles.varName}>{v.name}</span>
                      </td>
                      <td>
                        <span className={styles.varType}>{v.type}</span>
                      </td>
                      <td>
                        {v.status === "initialized" ? (
                          <span className={styles.varValue}>
                            {String(v.value)}
                            {v.previousValue !== undefined && v.previousValue !== v.value && (
                              <span className={styles.varPrevValue}>({v.previousValue})</span>
                            )}
                          </span>
                        ) : (
                          <span className={styles.varUninit}>uninitialized</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* Empty rows to replicate reference aesthetics */}
                  {Array.from({ length: Math.max(0, 3 - variablesList.length) }).map((_, i) => (
                    <tr key={`empty-${i}`}>
                      <td style={{ color: "#cbd5e1" }}>—</td>
                      <td style={{ color: "#cbd5e1" }}>—</td>
                      <td style={{ color: "#cbd5e1" }}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Console Output Stream */}
              <div className={styles.outputConsole}>
                <div className={styles.outputConsoleHeader}>
                  <span>Standard Output (stdout)</span>
                  <span>{currentSnapshot?.outputHistory?.length || 0} lines</span>
                </div>
                <div className={styles.consoleText}>
                  {currentSnapshot?.outputHistory?.length > 0
                    ? currentSnapshot.outputHistory.join("\n")
                    : "(no output emitted yet)"}
                </div>
              </div>
            </div>

            {/* Visual Memory Cards Section */}
            <div className={styles.memorySection}>
              <h4 className={styles.panelTitle}>Memory Visualizer</h4>
              <div className={styles.memoryCardList}>
                {variablesList.map((v: any) => (
                  <div
                    key={v.name}
                    className={`${styles.memoryCard} ${v.changed ? styles.memoryCardActive : ""}`}
                  >
                    <span className={styles.memVarBadge}>{v.name}</span>
                    <span className={styles.memArrow}>➔</span>
                    <span className={styles.memValueBox}>
                      {v.status === "initialized" ? String(v.value) : "?"}
                    </span>
                  </div>
                ))}
                {variablesList.length === 0 && (
                  <div style={{ color: "#94a3b8", fontSize: "0.85rem", fontStyle: "italic" }}>
                    No variables declared.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Horizontal Execution Timeline (Snapshots Carousel) */}
        <div className={styles.timelineSection}>
          <div className={styles.timelineHeader}>
            <span>Execution Timeline ({snapshots.length} Recorded States)</span>
            <span>Click any step to travel backward or forward</span>
          </div>

          <div ref={timelineScrollRef} className={styles.timelineCardsScroll}>
            {snapshots.map((s: any, idx: number) => {
              const isActive = activeStepIndex === idx;

              return (
                <div key={s.stepIndex} className={styles.timelineCardWrapper}>
                  <div
                    data-step-index={idx}
                    className={`${styles.snapshotCard} ${isActive ? styles.snapshotCardActive : ""}`}
                    onClick={() => {
                      setActiveStepIndex(idx);
                    }}
                  >
                    <div className={styles.snapshotCardHeader}>
                      <span>Step {idx + 1}</span>
                      <span>{s.action}</span>
                    </div>

                    <div className={styles.snapshotMiniCode}>
                      {s.explanation?.activeBlock}
                    </div>

                    <div className={styles.snapshotMiniVars}>
                      {Object.values(s.variables || {}).map((v: any) => (
                        <span key={v.name} className={styles.miniVarTag}>
                          {v.name}: {v.status === "initialized" ? String(v.value) : "?"}
                        </span>
                      ))}
                    </div>
                  </div>

                  {idx < snapshots.length - 1 && (
                    <span className={styles.timelineStepArrow}>➔</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Execution Controls Bar */}
        <div className={styles.controlsBar}>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleFirstStep}
            disabled={activeStepIndex === 0}
            title="First Step (|◀)"
          >
            |◀ First
          </button>

          <button
            type="button"
            className={styles.prevArrowBtn}
            onClick={handlePrevStep}
            disabled={activeStepIndex === 0}
            title="Previous Step (← or Left Arrow key)"
          >
            ← Previous Step
          </button>

          <span className={styles.stepIndicatorPill}>
            Step {snapshots.length > 0 ? activeStepIndex + 1 : 0} of {snapshots.length}
          </span>

          <button
            type="button"
            className={styles.nextArrowBtn}
            onClick={handleNextStep}
            disabled={activeStepIndex >= snapshots.length - 1}
            title="Next Step (→ or Right Arrow key)"
          >
            Next Step →
          </button>

          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleLastStep}
            disabled={activeStepIndex >= snapshots.length - 1}
            title="Last Step (▶|)"
          >
            Last ▶|
          </button>

          <button
            type="button"
            className={styles.resetBtn}
            onClick={handleReset}
            title="Reset to beginning (↺)"
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Advanced Technical Details Drawer (Collapsible) */}
      <div className={styles.techDetailsSection}>
        <button
          type="button"
          className={styles.techDetailsToggle}
          onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
        >
          <span>{showAdvancedDetails ? "▼" : "▶"} Advanced Trace Metadata</span>
        </button>

        {showAdvancedDetails && (
          <div className={styles.techDetailsContent}>
            <div><strong>Active AST Node ID:</strong> {currentSnapshot?.astNodeId || "None"}</div>
            <div><strong>Flowchart Node ID:</strong> {currentSnapshot?.flowchartNodeId || "None"}</div>
            <div><strong>Source Provenance Refs:</strong> {JSON.stringify(currentSnapshot?.sourceRefs || [])}</div>
            <div><strong>Interpreter Status:</strong> {currentSnapshot?.status || "Ready"}</div>
            {currentSnapshot?.decision && (
              <div><strong>Decision Condition:</strong> {currentSnapshot.decision.conditionText} ➔ {currentSnapshot.decision.result ? "TRUE" : "FALSE"}</div>
            )}
          </div>
        )}
      </div>

      {/* Test Input Configuration Modal */}
      {showInputModal && (
        <div className={styles.inputModalOverlay}>
          <div className={styles.inputModalCard}>
            <div className={styles.inputModalHeader}>
              <h3>Configure Test Inputs</h3>
              <button
                type="button"
                className={styles.closeModalBtn}
                onClick={() => setShowInputModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApplyInputs}>
              <div className={styles.inputModalBody}>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                  Provide test inputs to trace how your algorithm executes on different values.
                </p>

                {inputSymbols.map((sym: any) => (
                  <div key={sym.id} className={styles.inputFieldGroup}>
                    <label className={styles.inputFieldLabel}>
                      <span>{sym.name} ({sym.type})</span>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {sym.type === "int" ? "Whole number" : sym.type === "double" ? "Decimal" : "Single character"}
                      </span>
                    </label>
                    <input
                      type={sym.type === "int" || sym.type === "double" ? "number" : "text"}
                      step={sym.type === "double" ? "any" : "1"}
                      className={styles.inputFieldInput}
                      value={inputDraft[sym.name] ?? ""}
                      onChange={(e) =>
                        setInputDraft({
                          ...inputDraft,
                          [sym.name]: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                ))}

                {/* Quick Presets based on variable name */}
                {inputSymbols.some((s: any) => s.name === "number" || s.name === "n") && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "0.3rem" }}>
                      Quick Test Presets:
                    </div>
                    <div className={styles.presetButtons}>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, number: 4, n: 4 })}
                      >
                        Even Number (4)
                      </button>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, number: 7, n: 7 })}
                      >
                        Odd Number (7)
                      </button>
                    </div>
                  </div>
                )}

                {inputSymbols.some((s: any) => s.name.toLowerCase().includes("age")) && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "0.3rem" }}>
                      Quick Test Presets:
                    </div>
                    <div className={styles.presetButtons}>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, age: 21 })}
                      >
                        Adult (Age 21)
                      </button>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, age: 15 })}
                      >
                        Minor (Age 15)
                      </button>
                    </div>
                  </div>
                )}

                {inputSymbols.some((s: any) => s.name.toLowerCase().includes("mark") || s.name.toLowerCase().includes("score")) && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "0.3rem" }}>
                      Quick Test Presets:
                    </div>
                    <div className={styles.presetButtons}>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, mark: 95, score: 95 })}
                      >
                        Grade A (95)
                      </button>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, mark: 85, score: 85 })}
                      >
                        Grade B (85)
                      </button>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, mark: 72, score: 72 })}
                      >
                        Grade C (72)
                      </button>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, mark: 50, score: 50 })}
                      >
                        Grade F (50)
                      </button>
                    </div>
                  </div>
                )}

                {inputSymbols.some((s: any) => s.name === "first" || s.name === "second") && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: "0.3rem" }}>
                      Quick Test Presets:
                    </div>
                    <div className={styles.presetButtons}>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, first: 10, second: 5 })}
                      >
                        First Greater (10, 5)
                      </button>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, first: 3, second: 8 })}
                      >
                        Second Greater (3, 8)
                      </button>
                      <button
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => setInputDraft({ ...inputDraft, first: 5, second: 5 })}
                      >
                        Both Equal (5, 5)
                      </button>
                    </div>
                  </div>
                )}

                {inputError && (
                  <div style={{ color: "#dc2626", fontSize: "0.85rem" }}>
                    {inputError}
                  </div>
                )}
              </div>

              <div className={styles.inputModalFooter}>
                <button
                  type="button"
                  className={styles.resetBtn}
                  onClick={() => setShowInputModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.submitInputBtn}>
                  Apply Inputs & Re-Trace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
