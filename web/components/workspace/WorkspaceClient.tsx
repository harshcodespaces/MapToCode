"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adaptFlowchartToAst, adaptSpecificationToAst } from "@/core/adapters.js";
import {
  createEligibilityExample,
  createEvenOddExample,
  createGradeExample,
  createNumberComparisonExample,
} from "@/core/examples.js";
import {
  approveCurrentProject,
  generateCForProject,
  generatePythonForProject,
} from "@/core/generation-gate.js";
import {
  deriveSpecificationFromFlowchart,
  syncProjectSpecification,
} from "@/core/reconciliation-sync.js";
import { generateCFromAst } from "@/core/c-generator.js";
import { generatePythonFromAst } from "@/core/python-generator.js";
import { reconcileAstCandidates } from "@/core/reconciliation.js";
import { validateAstSemantics } from "@/core/ast-validation.js";
import { explainFlowchartToLearner } from "@/core/flowchart-explanation.js";
import {
  createProject,
  createProjectStore,
  exportProjectJson,
  renameProject,
  setProjectApproval,
  updateFlowchartPresentation,
  updateFlowchartSemantics,
  updateSpecification,
} from "@/core/project-service.js";
import LogicTracer from "@/components/tracer/LogicTracer";
import FlowCanvas, {
  type CanvasTheme,
  type EdgeRouting,
  COLOR_TAG_PRESETS,
  getEdgeCoordinates,
  getNodeDimensions,
} from "@/components/canvas/FlowCanvas";
import WorkspaceHeader from "./WorkspaceHeader";
import WorkflowStepper, { type WorkflowStep } from "./WorkflowStepper";
import CodePreviewPanel from "./CodePreviewPanel";
import ExecutionConsole from "./ExecutionConsole";
import ProjectModals from "./ProjectModals";
import ExplanationCard from "./ExplanationCard";
import { StepList, renderAlgoStepsPreview } from "./AlgorithmEditor";
import { mapToCodeApi, type GenerateCodeResponse } from "@/api/client";
import type {
  ProjectEnvelope,
  AlgorithmSpecification,
  FlowchartGraph,
  FlowchartNode,
  FlowchartEdge,
  ScalarType,
} from "@/types/contracts";
import styles from "./workspace.module.css";

const uid = (): string =>
  globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const initialPosition = (index: number) => ({ x: 370, y: 28 + index * 120 });

const getNextVariableName = (kind: "input" | "process", existingNodes: FlowchartNode[] = []): string => {
  const usedNames = new Set<string>();
  existingNodes.forEach((n) => {
    const payload = n.payload as any;
    if (n.kind === "input" && payload?.name) usedNames.add(String(payload.name).trim().toLowerCase());
    if (n.kind === "process" && payload?.operation === "declaration" && payload?.name) {
      usedNames.add(String(payload.name).trim().toLowerCase());
    }
  });

  const inputCandidates = ["n", "x", "y", "a", "b", "c", "num", "val", "count"];
  const processCandidates = ["result", "total", "sum", "ans", "count", "score", "temp"];

  const candidates = kind === "input" ? inputCandidates : processCandidates;
  for (const name of candidates) {
    if (!usedNames.has(name.toLowerCase())) return name;
  }

  const prefix = kind === "input" ? "var" : "res";
  let counter = 1;
  while (usedNames.has(`${prefix}${counter}`)) {
    counter++;
  }
  return `${prefix}${counter}`;
};

export const WORKFLOW_LOGIC: WorkflowStep[] = [
  { id: "specification", label: "Algorithm", subtitle: "Describe your logic", stepNumber: 1 },
  { id: "flowchart", label: "Flowchart", subtitle: "Draw the same logic", stepNumber: 2 },
  { id: "review", label: "Check & Compare", subtitle: "Find differences", stepNumber: 3 },
  { id: "validate", label: "Validation", subtitle: "Check for errors", stepNumber: 4 },
  { id: "generate", label: "Generate Code", subtitle: "Get clean code", stepNumber: 5 },
  { id: "trace", label: "Trace Logic", subtitle: "Step-by-step execution", stepNumber: 6 },
];

export const WORKFLOW_FLOWCHART: WorkflowStep[] = [
  { id: "flowchart", label: "Flowchart", subtitle: "Build visual algorithm", stepNumber: 1 },
  { id: "explain", label: "Explain & Learn", subtitle: "Understand your diagram", stepNumber: 2 },
  { id: "specification", label: "Algorithm", subtitle: "Author specification", stepNumber: 3 },
  { id: "review", label: "Check & Compare", subtitle: "Find differences", stepNumber: 4 },
  { id: "validate", label: "Validation", subtitle: "Check for errors", stepNumber: 5 },
  { id: "generate", label: "Generate Code", subtitle: "Get clean code", stepNumber: 6 },
  { id: "trace", label: "Trace Logic", subtitle: "Step-by-step execution", stepNumber: 7 },
];

const SAMPLE_FACTORIES: Record<string, () => any> = {
  "even-odd": createEvenOddExample,
  largest: createNumberComparisonExample,
  eligibility: createEligibilityExample,
  grade: createGradeExample,
};

const SAMPLE_DETAILS = [
  { key: "even-odd", title: "Even or Odd Number", note: "Input n, remainder check via n % 2 == 0, and two branches." },
  { key: "largest", title: "Largest of Two Numbers", note: "Compare two numbers and handle equal values." },
  { key: "eligibility", title: "Voting Eligibility", note: "Verify if user age meets the 18-year requirement." },
  { key: "grade", title: "Calculate a Grade", note: "Evaluate score cutoffs for A, B, C, or F grades." },
];

function downloadFile(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function renderFlowchartPreview(flowchart: FlowchartGraph | undefined, cssStyles: Record<string, string>): React.JSX.Element {
  const nodes = flowchart?.nodes || [];
  if (nodes.length === 0) return <p style={{ color: "var(--muted)" }}>Empty flowchart.</p>;
  return (
    <div className={cssStyles.miniDiagramBox}>
      {nodes.map((node, i) => (
        <div key={node.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
          {i > 0 && <span className={cssStyles.miniArrow}>↓</span>}
          {node.kind === "start" && <div className={cssStyles.miniNodeStart}>Start</div>}
          {node.kind === "end" && <div className={cssStyles.miniNodeEnd}>End</div>}
          {node.kind === "input" && (
            <div className={cssStyles.miniNodeInput}>
              Read {(node.payload as any).name || "n"} ({(node.payload as any).type || "int"})
            </div>
          )}
          {node.kind === "process" && (
            <div className={cssStyles.miniNodeProcess}>
              {(node.payload as any).operation === "declaration"
                ? `${(node.payload as any).name || "result"} = ${(node.payload as any).initializer || 0}`
                : (node.payload as any).expression || "Calculate"}
            </div>
          )}
          {node.kind === "decision" && (
            <div className={cssStyles.miniNodeDecision}>
              {(node.payload as any).condition || "condition ?"}
            </div>
          )}
          {node.kind === "output" && (
            <div className={cssStyles.miniNodeOutput}>
              Print {(node.payload as any).mode === "message" ? `"${(node.payload as any).message || ""}"` : (node.payload as any).expression || ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const RESERVED_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
  "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
  "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while",
  "with", "yield", "False", "None", "True", "auto", "case", "char", "const", "default",
  "do", "double", "enum", "extern", "float", "goto", "int", "long", "register", "short",
  "signed", "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned", "void", "volatile"
]);

function validateVarName(name: string): { valid: boolean; message?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, message: "Variable name cannot be empty" };
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    return { valid: false, message: "Must start with a letter/underscore and contain only letters, numbers, and underscores" };
  }
  if (RESERVED_KEYWORDS.has(trimmed)) {
    return { valid: false, message: `"${trimmed}" is a reserved programming keyword` };
  }
  return { valid: true };
}

export default function M1WorkspaceClient(): React.JSX.Element {
  const [project, setProject] = useState<ProjectEnvelope>(() => createEvenOddExample() as unknown as ProjectEnvelope);
  const [savedProjects, setSavedProjects] = useState<ProjectEnvelope[]>([]);
  const [workflow, setWorkflow] = useState<"logic" | "flowchart">("logic");
  const [stage, setStage] = useState<string>("specification");
  const [step1SubTab, setStep1SubTab] = useState<"inputs" | "processing" | "output">("inputs");
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const flowchartEditorRef = useRef<HTMLElement | null>(null);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>("dots");
  const [edgeRouting, setEdgeRouting] = useState<EdgeRouting>("curved");
  const [showMinimap, setShowMinimap] = useState<boolean>(false);
  const [showCustomizeMenu, setShowCustomizeMenu] = useState<boolean>(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState<boolean>(false);
  const [nodeColorTags, setNodeColorTags] = useState<Record<string, string>>({});
  const [nodeNotes, setNodeNotes] = useState<Record<string, string>>({});
  const [codeResult, setCodeResult] = useState<GenerateCodeResponse | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<"python" | "c">("python");
  const [previewTab, setPreviewTab] = useState<"text" | "diagram">("text");
  const [zoom, setZoom] = useState<number>(1);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [activeModal, setActiveModal] = useState<
    "chooseWorkflow" | "newProject" | "projects" | "samples" | "guide" | "settings" | "traceLogic" | null
  >(null);
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [newProjectWorkflow, setNewProjectWorkflow] = useState<"logic" | "flowchart">("logic");
  const [sampleWorkflowTarget, setSampleWorkflowTarget] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [copiedPseudocode, setCopiedPseudocode] = useState<boolean>(false);
  const [showDraftPreview, setShowDraftPreview] = useState<boolean>(false);
  const [draftLanguage, setDraftLanguage] = useState<"python" | "c">("python");
  const [programInput, setProgramInput] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionRecord, setExecutionRecord] = useState<{
    data: any;
    language: "python" | "c";
    semanticRevision?: number;
  } | null>(null);
  const executionResult =
    executionRecord &&
    executionRecord.language === targetLanguage &&
    executionRecord.semanticRevision === project?.revisions?.semantic
      ? executionRecord.data
      : null;

  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [serverReconLoading, setServerReconLoading] = useState(false);
  const [serverReconResult, setServerReconResult] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await mapToCodeApi.health();
        if (active && res?.status === "ok") {
          setBackendStatus("connected");
        } else if (active) {
          setBackendStatus("offline");
        }
      } catch {
        if (active) setBackendStatus("offline");
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Authoritative server-side reconciliation check on validation stage
  useEffect(() => {
    if (stage === "validate" && project && backendStatus === "connected") {
      let active = true;
      const timer = setTimeout(() => {
        setServerReconLoading(true);
        mapToCodeApi
          .reconcileProject(project)
          .then((res) => {
            if (active) {
              setServerReconResult(res);
              setServerReconLoading(false);
            }
          })
          .catch(() => {
            if (active) {
              setServerReconLoading(false);
            }
          });
      }, 50);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
  }, [stage, project, backendStatus]);

  const storeRef = useRef<any>(null);
  const graphHistory = useRef<{ past: FlowchartGraph[]; future: FlowchartGraph[] }>({ past: [], future: [] });

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === "b") {
        if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
        e.preventDefault();
        setSidebarCollapsed((prev) => {
          const next = !prev;
          try {
            localStorage.setItem("maptocode_sidebar_collapsed", String(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("maptocode_sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Initialize store and active project (defaults to Even or Odd Number matching the mockup!)
  useEffect(() => {
    const timer = setTimeout(() => {
      let saved: ProjectEnvelope[] = [];
      try {
        const store = createProjectStore(window.localStorage);
        storeRef.current = store;
        saved = store.list();
        setSavedProjects(saved);
      } catch (storeError: any) {
        setError(storeError?.message || "Could not access browser storage.");
      }

      try {
        const savedSidebar = window.localStorage.getItem("maptocode_sidebar_collapsed");
        if (savedSidebar !== null) {
          setSidebarCollapsed(savedSidebar === "true");
        }
      } catch {
        // ignore
      }

      const params = new URLSearchParams(window.location.search);
      const requestedSample = params.get("sample");
      const requestedWorkflow = params.get("workflow");
      let savedWorkflow: string | null = null;
      try {
        savedWorkflow = window.localStorage.getItem("maptocode_preferred_workflow");
      } catch {
        // ignore
      }
      const effectiveWorkflow: "logic" | "flowchart" =
        requestedWorkflow === "flowchart" || requestedWorkflow === "logic"
          ? requestedWorkflow
          : savedWorkflow === "flowchart" || savedWorkflow === "logic"
          ? savedWorkflow
          : "logic";

      setWorkflow(effectiveWorkflow);
      setNewProjectWorkflow(effectiveWorkflow);
      if (requestedWorkflow) {
        try {
          window.localStorage.setItem("maptocode_preferred_workflow", requestedWorkflow);
        } catch {
          // ignore
        }
      }

      const requestedStage = params.get("stage");
      if (requestedStage) {
        setStage(requestedStage);
      } else if (effectiveWorkflow === "flowchart") {
        setStage("flowchart");
      } else {
        setStage("specification");
      }

      let active: ProjectEnvelope;
      if (requestedSample && SAMPLE_FACTORIES[requestedSample]) {
        active = SAMPLE_FACTORIES[requestedSample]() as unknown as ProjectEnvelope;
      } else if (params.get("new") === "1") {
        active = createProject({ name: "New Project" }) as unknown as ProjectEnvelope;
        if (!requestedWorkflow) {
          setActiveModal("chooseWorkflow");
        }
      } else if (saved.length > 0) {
        active = saved[0];
      } else {
        active = createEvenOddExample() as unknown as ProjectEnvelope;
      }

      if (storeRef.current) {
        try {
          if (!saved.some((item) => item.projectId === active.projectId)) {
            storeRef.current.save(active);
            setSavedProjects(storeRef.current.list());
          }
        } catch {
          // ignore
        }
      }
      setProject(active);

      // Clean query parameters once project is initialized to prevent refresh re-creating drafts
      if (requestedSample || params.get("new") === "1") {
        try {
          window.history.replaceState({}, "", "/workspace");
        } catch {
          // ignore
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    if (!project || !storeRef.current) return undefined;
    const timer = setTimeout(() => {
      try {
        storeRef.current.save(project);
        setSavedProjects(storeRef.current.list());
        setError((prev) => (prev?.includes("damaged structure") || prev?.includes("Browser storage") ? "" : prev));
      } catch (exception: any) {
        if (!exception?.message?.includes("damaged structure")) {
          setError(exception?.message);
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [project]);

  // Analysis and verification
  const analysis = useMemo(() => {
    if (!project) return null;
    const specificationCandidate = adaptSpecificationToAst(project.specification, {
      projectId: project.projectId,
    });
    const flowchartCandidate = adaptFlowchartToAst(project.flowchart, { projectId: project.projectId });
    const reconciliation = reconcileAstCandidates(specificationCandidate, flowchartCandidate);
    const specValidation = specificationCandidate.ast ? validateAstSemantics(specificationCandidate.ast) : null;
    const graphValidation = flowchartCandidate.ast ? validateAstSemantics(flowchartCandidate.ast) : null;
    return { specificationCandidate, flowchartCandidate, reconciliation, specValidation, graphValidation };
  }, [project]);

  // Auto-generate code when entering generate stage if valid and not yet generated
  useEffect(() => {
    if (stage === "generate" && !codeResult && project) {
      const timer = setTimeout(async () => {
        let currentProj = project;
        const isAppr = project.generationApproval?.semanticRevision === project.revisions.semantic;
        const isEquiv = analysis?.reconciliation?.status === "equivalent";
        const isVal =
          analysis?.specificationCandidate?.valid &&
          analysis?.flowchartCandidate?.valid &&
          analysis?.specValidation?.valid &&
          analysis?.graphValidation?.valid;

        if (!isEquiv && isVal) {
          try {
            const synced = syncProjectSpecification(currentProj);
            if (synced) {
              currentProj = synced;
              setProject(currentProj);
              if (storeRef.current) {
                try { storeRef.current.save(currentProj); } catch {}
              }
            }
          } catch {}
        } else if (!isAppr && isEquiv && isVal) {
          let approved = false;
          if (backendStatus === "connected") {
            try {
              const approvalRes = await mapToCodeApi.approveProject(project);
              if (approvalRes?.approval) {
                currentProj = setProjectApproval(project, approvalRes.approval);
                setProject(currentProj);
                approved = true;
              }
            } catch {
              // fall through to local approval
            }
          }
          if (!approved) {
            const approvalRes = approveCurrentProject(project);
            if (approvalRes?.approval) {
              currentProj = setProjectApproval(project, approvalRes.approval);
              setProject(currentProj);
            }
          }
        }

        let res: GenerateCodeResponse | null = null;
        if (backendStatus === "connected") {
          try {
            const apiCall = targetLanguage === "python" ? mapToCodeApi.generatePython : mapToCodeApi.generateC;
            res = await apiCall(currentProj);
          } catch {
            // fall through to local generator
          }
        }
        if (!res) {
          const localGen = targetLanguage === "python" ? generatePythonForProject : generateCForProject;
          res = localGen(currentProj) as unknown as GenerateCodeResponse;
        }

        setCodeResult(res);
        if (res.status !== "ready") {
          setError(res.diagnostics?.map((item) => item.message).join(" ") || "Please resolve issues before generating code.");
        } else {
          setError("");
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [stage, codeResult, targetLanguage, project, analysis, backendStatus]);

  // Real-time draft code generated directly from flowchart AST
  const draftFlowchartCode = useMemo(() => {
    if (!analysis?.flowchartCandidate?.ast) return null;
    try {
      const gen = draftLanguage === "python" ? generatePythonFromAst : generateCFromAst;
      return gen(analysis.flowchartCandidate.ast);
    } catch {
      return null;
    }
  }, [analysis, draftLanguage]);

  // Sandboxed program execution handler
  const handleRunProgram = async () => {
    if (!project) return;
    setIsRunning(true);
    setExecutionRecord(null);
    let runProj = project;
    const isAppr = project?.generationApproval?.semanticRevision === project?.revisions?.semantic;
    const isEquiv = analysis?.reconciliation?.status === "equivalent";
    const isVal =
      analysis?.specificationCandidate?.valid &&
      analysis?.flowchartCandidate?.valid &&
      analysis?.specValidation?.valid &&
      analysis?.graphValidation?.valid;
    // If valid flowchart but not equivalent (e.g. flowchart edited), auto-sync to unlock execution
    if (!isEquiv && isVal) {
      try {
        const synced = syncProjectSpecification(runProj);
        if (synced) {
          runProj = synced;
          setProject(runProj);
          if (storeRef.current) {
            try { storeRef.current.save(runProj); } catch {}
          }
        }
      } catch {}
    } else if (!isAppr && isEquiv && isVal) {
      const approvalRes = approveCurrentProject(project);
      if (approvalRes.approval) {
        runProj = setProjectApproval(project, approvalRes.approval);
        setProject(runProj);
      }
    }
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: runProj,
          language: targetLanguage,
          stdin: programInput,
        }),
      });
      const data = await res.json();
      setExecutionRecord({
        data,
        language: targetLanguage,
        semanticRevision: runProj?.revisions?.semantic,
      });
    } catch (err: any) {
      setExecutionRecord({
        data: {
          success: false,
          status: "service_error",
          message: `Failed to connect to execution server: ${err?.message || "Unknown error"}`,
        },
        language: targetLanguage,
        semanticRevision: runProj?.revisions?.semantic,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSyncSpecificationFromFlowchart = () => {
    if (!project) return;
    const synced = syncProjectSpecification(project);
    setProject(synced);
    if (storeRef.current) {
      try {
        storeRef.current.save(synced);
      } catch {}
    }
    const localGen = targetLanguage === "python" ? generatePythonForProject : generateCForProject;
    const res = localGen(synced);
    setCodeResult(res as any);
    setError("");
    setNotice("✨ Algorithm synchronized with flowchart! Both representations are now verified and ready.");
  };

  const applySpec = useCallback(
    (change: any) => {
      setCodeResult(null);
      setProject((current) =>
        current ? updateSpecification(current, typeof change === "function" ? change(current.specification) : change) : current
      );
    },
    []
  );

  const applyGraph = useCallback((change: any) => {
    setCodeResult(null);
    setProject((current) => {
      if (!current) return current;
      const nextFlowchart = typeof change === "function" ? change(current.flowchart) : change;
      graphHistory.current.past.push(structuredClone(current.flowchart));
      if (graphHistory.current.past.length > 50) graphHistory.current.past.shift();
      graphHistory.current.future = [];
      return updateFlowchartSemantics(current, nextFlowchart);
    });
  }, []);

  const undoGraph = useCallback(() => {
    if (!graphHistory.current.past.length) return;
    const snapshot = graphHistory.current.past.pop()!;
    setProject((current) => {
      if (!current) return current;
      graphHistory.current.future.push(structuredClone(current.flowchart));
      return updateFlowchartSemantics(current, { ...snapshot, revision: current.flowchart.revision });
    });
    setCodeResult(null);
  }, []);

  const redoGraph = useCallback(() => {
    if (!graphHistory.current.future.length) return;
    const snapshot = graphHistory.current.future.pop()!;
    setProject((current) => {
      if (!current) return current;
      graphHistory.current.past.push(structuredClone(current.flowchart));
      return updateFlowchartSemantics(current, { ...snapshot, revision: current.flowchart.revision });
    });
    setCodeResult(null);
  }, []);

  const clearAllNodes = () => {
    if (!project) return;
    if (!window.confirm("Reset flowchart to blank Start and End blocks?")) return;
    applyGraph((current: FlowchartGraph) => ({
      ...current,
      nodes: [
        { id: "start", kind: "start", payload: {} },
        { id: "end", kind: "end", payload: {} },
      ],
      edges: [{ id: "edge-start-end", from: "start", to: "end" }],
      layout: { positions: { start: { x: 380, y: 30 }, end: { x: 380, y: 350 } }, zoom: 1 },
    }));
    setSelectedNode("");
  };

  // Close modal on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeProject = (next: ProjectEnvelope, nextWorkflow?: "logic" | "flowchart") => {
    if (project && storeRef.current) {
      try {
        storeRef.current.save(project);
      } catch {
        // ignore
      }
    }
    graphHistory.current = { past: [], future: [] };
    setProject(next);
    setCodeResult(null);
    setExecutionRecord(null);
    setProgramInput("");
    setIsRunning(false);
    setServerReconResult(null);
    setServerReconLoading(false);
    setIsEditingTitle(false);
    setSelectedEdge(null);
    setError("");
    setNotice("");
    setActiveModal(null);
    if (storeRef.current) {
      try {
        storeRef.current.save(next);
        setSavedProjects(storeRef.current.list());
      } catch {
        // ignore
      }
    }
    const activeW = nextWorkflow || workflow;
    if (nextWorkflow) {
      setWorkflow(nextWorkflow);
      try {
        localStorage.setItem("maptocode_preferred_workflow", nextWorkflow);
      } catch {
        // ignore
      }
    }
    setStage(activeW === "flowchart" ? "flowchart" : "specification");
    setStep1SubTab("inputs");
    setSelectedNode("");
  };

  const switchWorkflow = (nextWorkflow: "logic" | "flowchart") => {
    setWorkflow(nextWorkflow);
    try {
      localStorage.setItem("maptocode_preferred_workflow", nextWorkflow);
    } catch {
      // ignore
    }
    setStage(nextWorkflow === "flowchart" ? "flowchart" : "specification");
    setNotice(
      `Switched to ${nextWorkflow === "flowchart" ? "Option B: Draw My Flowchart" : "Option A: Describe My Logic"}. All project data has been preserved.`
    );
    setActiveModal(null);
  };

  const handleManualSave = () => {
    if (!storeRef.current || !project) return;
    try {
      storeRef.current.save(project);
      setSavedProjects(storeRef.current.list());
      setNotice("✓ Project saved successfully to browser storage!");
      setTimeout(() => {
        setNotice((prev) => (prev.includes("saved successfully") ? "" : prev));
      }, 3000);
    } catch (err: any) {
      setError(`Failed to save: ${err?.message || "Unknown error"}`);
    }
  };

  const flowchartExplanation = useMemo(() => {
    if (!project?.flowchart) return null;
    return explainFlowchartToLearner(project.flowchart);
  }, [project]);

  const copyPseudocode = async () => {
    if (!flowchartExplanation?.pseudocode) return;
    try {
      await navigator.clipboard.writeText(flowchartExplanation.pseudocode);
      setCopiedPseudocode(true);
      setTimeout(() => setCopiedPseudocode(false), 2000);
    } catch {
      setNotice("Pseudocode copied to clipboard!");
    }
  };

  const spec = project?.specification;
  const graph = project?.flowchart;
  const selected = graph?.nodes.find((node) => node.id === selectedNode);

  const availableAssignTargets = (graph?.nodes || [])
    .filter(
      (n) =>
        (n.kind === "input" && (n.payload as any)?.name) ||
        (n.kind === "process" && (n.payload as any)?.operation === "declaration" && (n.payload as any)?.name)
    )
    .map((n) => ({
      symbolId: (n.payload as any).symbolId || `symbol-${n.id}`,
      name: (n.payload as any).name,
      type: (n.payload as any).type || "int",
      source: n.kind === "input" ? "Input variable" : "Declared variable",
    }));

  const addNode = (kind: "start" | "end" | "input" | "process" | "decision" | "output") => {
    if (!graph) return;
    if (kind === "start" && graph.nodes.some((n) => n.kind === "start")) {
      setError("A flowchart can only have one Start block.");
      return;
    }
    if (kind === "end" && graph.nodes.some((n) => n.kind === "end")) {
      setError("A flowchart can only have one End block.");
      return;
    }
    const id = uid();
    const inputVar = getNextVariableName("input", graph.nodes);
    const processVar = getNextVariableName("process", graph.nodes);
    const payloads: Record<string, any> = {
      start: {},
      end: {},
      input: { symbolId: `symbol-${id}`, name: inputVar, type: "int", prompt: `Enter ${inputVar}: ` },
      process: { operation: "declaration", symbolId: `symbol-${id}`, name: processVar, type: "int", initializer: "0" },
      decision: { condition: `${inputVar} % 2 == 0` },
      output: { outputId: `output-${id}`, mode: "message", message: "Result" },
    };

    let maxY = 40;
    Object.values(graph.layout.positions || {}).forEach((p) => {
      if (p.y > maxY) maxY = p.y;
    });
    const positions = {
      ...graph.layout.positions,
      [id]: { x: 380, y: Math.max(maxY + 100, 40 + graph.nodes.length * 110) },
    };

    applyGraph((current: FlowchartGraph) => ({
      ...current,
      nodes: [...current.nodes, { id, kind, payload: payloads[kind] } as FlowchartNode],
      layout: { ...current.layout, positions },
    }));
    setSelectedNode(id);
    setError("");
  };

  const moveNode = (id: string, position: { x: number; y: number }) => {
    setProject((current) =>
      current
        ? updateFlowchartPresentation(current, {
            ...current.flowchart.layout,
            positions: { ...current.flowchart.layout.positions, [id]: position },
          })
        : current
    );
  };

  const deleteNode = () => {
    if (!selected) return;
    if (selected.kind === "start" || selected.kind === "end") {
      setNotice("Start and End blocks are required terminators and cannot be deleted.");
      return;
    }
    applyGraph((current: FlowchartGraph) => {
      const { [selectedNode]: _removed, ...remainingPositions } = current.layout.positions;
      return {
        ...current,
        nodes: current.nodes.filter((node) => node.id !== selectedNode),
        edges: current.edges.filter((edge) => edge.from !== selectedNode && edge.to !== selectedNode),
        layout: { ...current.layout, positions: remainingPositions },
      };
    });
    setSelectedNode("");
  };

  // Keyboard shortcut: Delete or Backspace to delete selected flowchart node or selected arrow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && stage === "flowchart") {
        if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
        if (selectedNode) {
          const targetNode = project?.flowchart?.nodes?.find((n) => n.id === selectedNode);
          if (targetNode?.kind === "start" || targetNode?.kind === "end") {
            return;
          }
          e.preventDefault();
          applyGraph((current: FlowchartGraph) => {
            const { [selectedNode]: _removed, ...remainingPositions } = current.layout.positions;
            return {
              ...current,
              nodes: current.nodes.filter((node) => node.id !== selectedNode),
              edges: current.edges.filter((edge) => edge.from !== selectedNode && edge.to !== selectedNode),
              layout: { ...current.layout, positions: remainingPositions },
            };
          });
          setSelectedNode("");
        } else if (selectedEdge) {
          e.preventDefault();
          applyGraph((current: FlowchartGraph) => ({
            ...current,
            edges: current.edges.filter((edge) => edge.id !== selectedEdge),
          }));
          setSelectedEdge(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stage, selectedNode, selectedEdge, applyGraph, project]);

  // Keyboard shortcuts for Undo (Ctrl+Z), Redo (Ctrl+Y / Ctrl+Shift+Z), Escape to deselect
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if (stage !== "flowchart") return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          redoGraph();
        } else {
          undoGraph();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redoGraph();
      } else if (e.key === "Escape") {
        if (selectedNode) setSelectedNode("");
        if (selectedEdge) setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [stage, selectedNode, selectedEdge, undoGraph, redoGraph]);

  // Keyboard arrow keys nudge selected block
  useEffect(() => {
    const handleNudge = (e: KeyboardEvent) => {
      if (stage !== "flowchart" || !selectedNode) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const delta = e.shiftKey ? 20 : 10;
        const currentPos = graph?.layout?.positions?.[selectedNode] || { x: 380, y: 100 };
        const nextPos = { ...currentPos };
        if (e.key === "ArrowLeft") nextPos.x = Math.max(12, currentPos.x - delta);
        if (e.key === "ArrowRight") nextPos.x = currentPos.x + delta;
        if (e.key === "ArrowUp") nextPos.y = Math.max(12, currentPos.y - delta);
        if (e.key === "ArrowDown") nextPos.y = currentPos.y + delta;
        if (snapToGrid) {
          nextPos.x = Math.round(nextPos.x / 20) * 20;
          nextPos.y = Math.round(nextPos.y / 20) * 20;
        }
        moveNode(selectedNode, nextPos);
      }
    };
    window.addEventListener("keydown", handleNudge);
    return () => window.removeEventListener("keydown", handleNudge);
  }, [stage, selectedNode, graph, snapToGrid]);

  const addEdge = (from: string, to: string, branch?: string) => {
    if (!from || !to) return;
    if (from === to) {
      setError("A block cannot connect to itself.");
      return;
    }
    applyGraph((current: FlowchartGraph) => {
      const fromNode = current.nodes.find((n) => n.id === from);
      const isDecision = fromNode?.kind === "decision";
      const filteredEdges = current.edges.filter((e) => {
        if (e.from !== from) return true;
        if (isDecision) {
          return e.branch !== (branch || "true");
        }
        return false;
      });
      return {
        ...current,
        edges: [
          ...filteredEdges,
          {
            id: uid(),
            from,
            to,
            ...(isDecision ? { branch: (branch as "true" | "false") || "true" } : {}),
          } as FlowchartEdge,
        ],
      };
    });
    setNotice("Connection updated.");
  };

  const removeEdge = (edgeId: string) => {
    applyGraph((current: FlowchartGraph) => ({
      ...current,
      edges: current.edges.filter((e) => e.id !== edgeId),
    }));
    if (selectedEdge === edgeId) setSelectedEdge(null);
    setNotice("Connection removed.");
  };

  const duplicateNode = (nodeId: string) => {
    if (!graph) return;
    const target = graph.nodes.find((n) => n.id === nodeId);
    if (!target) return;
    if (target.kind === "start" || target.kind === "end") {
      setNotice("Start and End blocks cannot be duplicated.");
      return;
    }
    const newId = uid();
    const currentPos = graph.layout.positions[nodeId] || { x: 380, y: 100 };
    const newPos = { x: currentPos.x + 35, y: currentPos.y + 35 };
    const clonedPayload: any = structuredClone(target.payload);
    if ("symbolId" in clonedPayload && clonedPayload.symbolId) {
      clonedPayload.symbolId = `symbol-${newId}`;
    }
    if ("outputId" in clonedPayload && clonedPayload.outputId) {
      clonedPayload.outputId = `output-${newId}`;
    }
    if (target.kind === "input" && clonedPayload.name) {
      clonedPayload.name = getNextVariableName("input", graph.nodes);
      clonedPayload.prompt = `Enter ${clonedPayload.name}: `;
    } else if (target.kind === "process" && clonedPayload.operation === "declaration" && clonedPayload.name) {
      clonedPayload.name = getNextVariableName("process", graph.nodes);
    }
    applyGraph((current: FlowchartGraph) => ({
      ...current,
      nodes: [...current.nodes, { id: newId, kind: target.kind, payload: clonedPayload } as FlowchartNode],
      layout: { ...current.layout, positions: { ...current.layout.positions, [newId]: newPos } },
    }));
    setSelectedNode(newId);
    setSelectedEdge(null);
    setNotice(`Duplicated ${target.kind.toUpperCase()} block.`);
  };

  const insertNodeOnEdge = (edgeId: string, kind: "input" | "process" | "decision" | "output") => {
    if (!graph) return;
    const edge = graph.edges.find((e) => e.id === edgeId);
    if (!edge) return;

    const fromPos = graph.layout.positions[edge.from] || { x: 380, y: 40 };
    const toPos = graph.layout.positions[edge.to] || { x: 380, y: 280 };

    const newId = uid();
    const inputVar = getNextVariableName("input", graph.nodes);
    const processVar = getNextVariableName("process", graph.nodes);
    const payloads: Record<string, any> = {
      input: { symbolId: `symbol-${newId}`, name: inputVar, type: "int", prompt: `Enter ${inputVar}: ` },
      process: { operation: "declaration", symbolId: `symbol-${newId}`, name: processVar, type: "int", initializer: "0" },
      decision: { condition: `${inputVar} % 2 == 0` },
      output: { outputId: `output-${newId}`, mode: "message", message: "Result" },
    };

    const midPos = {
      x: Math.round((fromPos.x + toPos.x) / 2),
      y: Math.max(fromPos.y + 60, Math.round((fromPos.y + toPos.y) / 2)),
    };

    applyGraph((current: FlowchartGraph) => {
      const filteredEdges = current.edges.filter((e) => e.id !== edgeId);
      const edgeIn: FlowchartEdge = {
        id: uid(),
        from: edge.from,
        to: newId,
        ...(edge.branch ? { branch: edge.branch } : {}),
      };
      const edgeOut: FlowchartEdge = {
        id: uid(),
        from: newId,
        to: edge.to,
        ...(kind === "decision" ? { branch: "true" } : {}),
      };

      return {
        ...current,
        nodes: [...current.nodes, { id: newId, kind, payload: payloads[kind] } as FlowchartNode],
        edges: [...filteredEdges, edgeIn, edgeOut],
        layout: {
          ...current.layout,
          positions: { ...current.layout.positions, [newId]: midPos },
        },
      };
    });

    setSelectedNode(newId);
    setSelectedEdge(null);
    setNotice(`Inserted new ${kind.toUpperCase()} block on connection.`);
  };

  const autoArrangeLayout = () => {
    if (!graph || !graph.nodes || graph.nodes.length === 0) return;
    const nodes = graph.nodes;
    const edges = graph.edges;

    const outgoing = new Map<string, FlowchartEdge[]>();
    nodes.forEach((n) => outgoing.set(n.id, []));
    edges.forEach((e) => {
      if (outgoing.has(e.from)) outgoing.get(e.from)!.push(e);
    });

    const startNode = nodes.find((n) => n.kind === "start") || nodes[0];
    const newPositions: Record<string, { x: number; y: number }> = {};
    const queue: Array<{ id: string; level: number; xOffset: number }> = [
      { id: startNode.id, level: 0, xOffset: 380 },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, level, xOffset } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      newPositions[id] = { x: xOffset, y: 40 + level * 110 };

      const out = outgoing.get(id) || [];
      if (out.length === 2) {
        const trueEdge = out.find((e) => e.branch === "true") || out[0];
        const falseEdge = out.find((e) => e.branch === "false") || out[1];
        if (trueEdge) queue.push({ id: trueEdge.to, level: level + 1, xOffset: Math.max(80, xOffset - 170) });
        if (falseEdge) queue.push({ id: falseEdge.to, level: level + 1, xOffset: xOffset + 170 });
      } else if (out.length === 1) {
        queue.push({ id: out[0].to, level: level + 1, xOffset });
      }
    }

    // Determine highest Y of non-end nodes
    let maxNonEndY = 40;
    nodes.forEach((n) => {
      if (n.kind !== "end" && newPositions[n.id] && newPositions[n.id].y > maxNonEndY) {
        maxNonEndY = newPositions[n.id].y;
      }
    });

    const endNode = nodes.find((n) => n.kind === "end");
    if (endNode) {
      // End block is placed centered at 380 and strictly below all other arranged blocks
      newPositions[endNode.id] = { x: 380, y: maxNonEndY + 110 };
    }

    let disconnectedY = (endNode ? newPositions[endNode.id]?.y : maxNonEndY) || maxNonEndY;
    nodes.forEach((n) => {
      if (!newPositions[n.id]) {
        disconnectedY += 100;
        newPositions[n.id] = { x: 380, y: disconnectedY };
      }
    });

    setProject((curr) => (curr ? updateFlowchartPresentation(curr, { ...curr.flowchart.layout, positions: newPositions }) : curr));
    setNotice("✨ Flowchart auto-arranged cleanly!");
  };

  const exportFlowchartSvg = () => {
    if (!graph || !project) return;
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const positions = graph.layout?.positions || {};

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      const pos = positions[n.id] || { x: 40, y: 40 };
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + 220 > maxX) maxX = pos.x + 220;
      if (pos.y + 90 > maxY) maxY = pos.y + 90;
    });
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
    minX = Math.max(0, minX - 40);
    minY = Math.max(0, minY - 40);
    maxX = maxX + 40;
    maxY = maxY + 40;
    const width = maxX - minX;
    const height = maxY - minY;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">\n`;
    svg += `  <style>\n`;
    svg += `    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; }\n`;
    svg += `    .node-text { font-weight: 600; fill: #1e293b; text-anchor: middle; dominant-baseline: middle; }\n`;
    svg += `    .branch-text { font-weight: 700; font-size: 11px; text-anchor: middle; dominant-baseline: middle; }\n`;
    svg += `  </style>\n`;
    svg += `  <defs>\n`;
    svg += `    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">\n`;
    svg += `      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3D4B43" />\n`;
    svg += `    </marker>\n`;
    svg += `  </defs>\n`;
    svg += `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#fafafa" />\n`;

    edges.forEach((e) => {
      const from = positions[e.from] || { x: 24, y: 24 };
      const to = positions[e.to] || { x: 24, y: 24 };
      const fromNode = nodes.find((n) => n.id === e.from);
      const toNode = nodes.find((n) => n.id === e.to);
      const { x1, y1, x2, y2 } = getEdgeCoordinates(fromNode as any, toNode as any, from, to, e.branch);
      const midY = (y1 + y2) / 2;
      const c1x = fromNode?.kind === "decision" ? (e.branch === "true" ? x1 - 36 : x1 + 36) : x1;
      svg += `  <path d="M ${x1} ${y1} C ${c1x} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="#3D4B43" stroke-width="2" marker-end="url(#arrow)" />\n`;
      if (e.branch) {
        const bx = fromNode?.kind === "decision" ? (e.branch === "true" ? x1 - 18 : x1 + 18) : (x1 + x2) / 2;
        const by = fromNode?.kind === "decision" ? y1 - 8 : midY;
        svg += `  <text x="${bx}" y="${by}" class="branch-text" fill="${e.branch === "true" ? "#059669" : "#dc2626"}">${e.branch === "true" ? "Yes" : "No"}</text>\n`;
      }
    });

    nodes.forEach((n) => {
      const pos = positions[n.id] || { x: 24, y: 24 };
      const dims = getNodeDimensions(n.kind);
      const x = pos.x, y = pos.y, w = dims.width, h = dims.height;
      let label = n.kind.toUpperCase();
      if (n.kind === "start") label = "Start";
      else if (n.kind === "end") label = "End";
      else if (n.kind === "input") label = n.payload?.prompt ? n.payload.prompt.replace(/: ?$/, "") : `Read ${n.payload?.name || "n"}`;
      else if (n.kind === "decision") label = n.payload?.condition || "Decision";
      else if (n.kind === "output") label = n.payload?.mode === "message" ? `Print "${n.payload?.message || ""}"` : `Print ${n.payload?.expression || ""}`;
      else if (n.kind === "process") label = n.payload?.operation === "declaration" ? `${n.payload.name} = ${n.payload.initializer || 0}` : n.payload?.expression || "Process";

      label = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      if (n.kind === "start" || n.kind === "end") {
        svg += `  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="27" fill="#f0fdf4" stroke="#16a34a" stroke-width="2" />\n`;
      } else if (n.kind === "decision") {
        const cx = x + w / 2, cy = y + h / 2;
        svg += `  <polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" fill="#fefce8" stroke="#ca8a04" stroke-width="2" />\n`;
      } else if (n.kind === "input" || n.kind === "output") {
        svg += `  <polygon points="${x + 20},${y} ${x + w},${y} ${x + w - 20},${y + h} ${x},${y + h}" fill="${n.kind === "input" ? "#eff6ff" : "#fdf2f8"}" stroke="${n.kind === "input" ? "#2563eb" : "#db2777"}" stroke-width="2" />\n`;
      } else {
        svg += `  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#f8fafc" stroke="#475569" stroke-width="2" />\n`;
      }
      svg += `  <text x="${x + w / 2}" y="${y + h / 2}" class="node-text">${label}</text>\n`;
    });

    svg += `</svg>\n`;
    const cleanFileName = (project.name || "flowchart").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadFile(`${cleanFileName}-diagram.svg`, svg, "image/svg+xml");
    setNotice("✓ Flowchart diagram exported as SVG!");
  };

  const fitToScreen = () => {
    if (!graph || graph.nodes.length === 0) return;
    const positions = graph.layout.positions;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    graph.nodes.forEach((n) => {
      const p = positions[n.id] || { x: 380, y: 100 };
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + 190 > maxX) maxX = p.x + 190;
      if (p.y + 70 > maxY) maxY = p.y + 70;
    });
    const contentW = Math.max(100, maxX - minX);
    const contentH = Math.max(100, maxY - minY);
    const availW = isFullscreen ? (typeof window !== "undefined" ? window.innerWidth - 220 : 900) : 800;
    const availH = isFullscreen ? (typeof window !== "undefined" ? window.innerHeight - 150 : 600) : 520;
    const scale = Math.min(1.2, Math.max(0.6, Math.min(availW / contentW, availH / contentH)));
    setZoom(Math.round(scale * 10) / 10);
    setNotice("Flowchart centered and fitted to view.");
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      const el = flowchartEditorRef.current;
      if (el && document.fullscreenEnabled && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      }
      setNotice("Flowchart Editor: Fullscreen mode on (Press Esc or click 🗗 to exit).");
    } else {
      setIsFullscreen(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setNotice("Flowchart Editor: Fullscreen mode off.");
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [isFullscreen]);

  const generate = async () => {
    if (!project) return;
    let currentProj = project;
    const isAppr = project?.generationApproval?.semanticRevision === project?.revisions?.semantic;
    const isEquiv = analysis?.reconciliation?.status === "equivalent";
    const isVal =
      analysis?.specificationCandidate?.valid &&
      analysis?.flowchartCandidate?.valid &&
      analysis?.specValidation?.valid &&
      analysis?.graphValidation?.valid;

    if (!isEquiv && isVal) {
      try {
        const synced = syncProjectSpecification(currentProj);
        if (synced) {
          currentProj = synced;
          setProject(currentProj);
          if (storeRef.current) {
            try { storeRef.current.save(currentProj); } catch {}
          }
        }
      } catch {}
    } else if (!isAppr && isEquiv && isVal) {
      let approved = false;
      if (backendStatus === "connected") {
        try {
          const approvalRes = await mapToCodeApi.approveProject(project);
          if (approvalRes?.approval) {
            currentProj = setProjectApproval(project, approvalRes.approval);
            setProject(currentProj);
            approved = true;
          }
        } catch {
          // fall through to local approval
        }
      }
      if (!approved) {
        const approvalRes = approveCurrentProject(project);
        if (approvalRes?.approval) {
          currentProj = setProjectApproval(project, approvalRes.approval);
          setProject(currentProj);
        }
      }
    }

    let result: GenerateCodeResponse | null = null;
    if (backendStatus === "connected") {
      try {
        const apiCall = targetLanguage === "python" ? mapToCodeApi.generatePython : mapToCodeApi.generateC;
        result = await apiCall(currentProj);
      } catch {
        // fall through to local generator
      }
    }
    if (!result) {
      const localGen = targetLanguage === "python" ? generatePythonForProject : generateCForProject;
      result = localGen(currentProj) as unknown as GenerateCodeResponse;
    }

    setCodeResult(result);
    if (result.status !== "ready") {
      setError(result.diagnostics?.map((item) => item.message).join(" ") || "Please resolve issues before generating code.");
    } else {
      setError("");
    }
  };

  const handleSelectTargetLanguage = async (lang: "python" | "c") => {
    setTargetLanguage(lang);
    if (!project) return;
    let res: GenerateCodeResponse | null = null;
    if (backendStatus === "connected") {
      try {
        const apiCall = lang === "python" ? mapToCodeApi.generatePython : mapToCodeApi.generateC;
        res = await apiCall(project);
      } catch {
        // fall through to local generator
      }
    }
    if (!res) {
      const localGen = lang === "python" ? generatePythonForProject : generateCForProject;
      res = localGen(project) as unknown as GenerateCodeResponse;
    }
    setCodeResult(res);
    if (res.status !== "ready") {
      setError(res.diagnostics?.map((item) => item.message).join(" ") || "Please resolve issues before generating code.");
    } else {
      setError("");
    }
  };

  const copyCode = async () => {
    if (codeResult?.status !== "ready") return;
    try {
      await navigator.clipboard.writeText(codeResult.code);
      setNotice(`Generated ${targetLanguage === "python" ? "Python" : "C"} code copied to clipboard!`);
    } catch {
      setError("Clipboard access denied. Please use the Download button.");
    }
  };

  if (!project || !analysis || !spec || !graph) {
    return (
      <main className={styles.loadingScreen}>
        <div className={styles.loadingSpinner}>⚙</div>
        <p>Opening MapToCode Workspace…</p>
      </main>
    );
  }

  const isApproved = project.generationApproval?.semanticRevision === project.revisions.semantic;
  const isEquivalent = analysis.reconciliation.status === "equivalent";
  const isValid =
    analysis.specificationCandidate.valid &&
    analysis.flowchartCandidate.valid &&
    analysis.specValidation?.valid &&
    analysis.graphValidation?.valid;

  const activeWorkflowSteps = workflow === "flowchart" ? WORKFLOW_FLOWCHART : WORKFLOW_LOGIC;
  const currentStepIndex = Math.max(0, activeWorkflowSteps.findIndex((s) => s.id === stage));
  const currentStepObj = activeWorkflowSteps[currentStepIndex] || activeWorkflowSteps[0];
  const totalSteps = activeWorkflowSteps.length;
  const progressPercentage = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  return (
    <div className={styles.workspaceLayout}>
      {/* 1. Left Dark Green Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}>
        {/* Brand Header with Smart Collapse Arrow Button */}
        <div className={styles.sidebarBrand}>
          <Link href="/" className={styles.sidebarBrandGroup} title="MapToCode Home" aria-label="Go to MapToCode Home">
            <svg viewBox="0 0 32 32" className={styles.sidebarLogoIcon} aria-hidden="true">
              <circle cx="16" cy="6" r="4.5" fill="#D48332" />
              <path d="M16 10.5V17M16 17H8V21.5M16 17H24V21.5" stroke="#D48332" strokeWidth="2" strokeLinecap="round" />
              <circle cx="8" cy="25" r="4" fill="#D48332" />
              <circle cx="24" cy="25" r="4" fill="#D48332" />
            </svg>
            <span className={styles.sidebarBrandTitle}>MapToCode</span>
          </Link>
          <button
            type="button"
            className={styles.sidebarCollapseBtn}
            onClick={toggleSidebar}
            title="Hide sidebar (Ctrl+B)"
            aria-label="Hide sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Menu Navigation */}
        <nav className={styles.sidebarNav}>
          <Link
            href="/"
            className={styles.sidebarNavItem}
            title="Go to Homepage"
          >
            <span className={styles.sidebarNavIcon}>🏠</span>
            <span>Home</span>
          </Link>

          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeModal === "newProject" ? styles.sidebarNavActive : ""}`}
            onClick={() => {
              setNewProjectName("");
              setActiveModal("newProject");
            }}
            title="Create a new flowchart project"
          >
            <span className={styles.sidebarNavIcon}>＋</span>
            <span>New Project</span>
          </button>

          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeModal === "projects" ? styles.sidebarNavActive : ""}`}
            onClick={() => setActiveModal("projects")}
          >
            <span className={styles.sidebarNavIcon}>📁</span>
            <span>My Projects</span>
            <span className={styles.sidebarCountBadge}>{savedProjects.length}</span>
          </button>

          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeModal === "samples" ? styles.sidebarNavActive : ""}`}
            onClick={() => setActiveModal("samples")}
          >
            <span className={styles.sidebarNavIcon}>📋</span>
            <span>Examples</span>
          </button>

          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeModal === "chooseWorkflow" ? styles.sidebarNavActive : ""}`}
            onClick={() => setActiveModal("chooseWorkflow")}
          >
            <span className={styles.sidebarNavIcon}>🔀</span>
            <span>Switch Workflow</span>
          </button>

          <button
            type="button"
            className={`${styles.sidebarNavItem} ${activeModal === "traceLogic" ? styles.sidebarNavActive : ""}`}
            onClick={() => setActiveModal("traceLogic")}
          >
            <span className={styles.sidebarNavIcon}>🔍</span>
            <span>Trace Logic</span>
          </button>
        </nav>

        {/* Workflow Progress Widget */}
        <div className={styles.sidebarProgressBox}>
          <div className={styles.progressBoxHeader}>
            <span className={styles.progressBoxTitle}>
              {workflow === "flowchart" ? "Option B: Flowchart First" : "Option A: Logic First"}
            </span>
            <span className={styles.progressPercent}>{progressPercentage}%</span>
          </div>

          <div className={styles.progressBarBg}>
            <div className={styles.progressBarFill} style={{ width: `${progressPercentage}%` }} />
          </div>

          <p className={styles.progressStepDesc}>
            Step {currentStepIndex + 1} of {totalSteps}: {currentStepObj.label}
          </p>
        </div>

        {/* Sidebar Footer Help */}
        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.sidebarFooterBtn}
            onClick={() => setActiveModal("guide")}
          >
            <span className={styles.sidebarNavIcon}>❓</span>
            <span>Help &amp; Guide</span>
          </button>
          <button
            type="button"
            className={styles.sidebarFooterBtn}
            onClick={() => setActiveModal("settings")}
          >
            <span className={styles.sidebarNavIcon}>⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Workspace Surface */}
      <div className={styles.workspaceMain}>
        <WorkspaceHeader
          project={project}
          isEditingTitle={isEditingTitle}
          setIsEditingTitle={setIsEditingTitle}
          onRename={(name) => {
            try {
              const trimmed = name.trim();
              if (!trimmed) {
                // Keep input responsive while editing, don't crash
                setProject({ ...project, name });
                return;
              }
              const updated = renameProject(project, trimmed);
              setProject(updated);
              if (storeRef.current) {
                try {
                  storeRef.current.save(updated);
                  setSavedProjects(storeRef.current.list());
                } catch {
                  // ignore
                }
              }
            } catch {
              // ignore
            }
          }}
          workflow={workflow}
          stage={stage}
          setStage={setStage}
          onOpenModal={setActiveModal}
          onSave={handleManualSave}
          onExport={() =>
            downloadFile(
              `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
              exportProjectJson(project),
              "application/json"
            )
          }
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
          styles={styles}
          backendStatus={backendStatus}
        />

        <WorkflowStepper
          workflow={workflow}
          stage={stage}
          setStage={setStage}
          activeWorkflowSteps={activeWorkflowSteps}
          currentStepIndex={currentStepIndex}
          progressPercentage={progressPercentage}
          styles={styles}
        />

        {/* Alerts / Notices */}
        {(notice || error) && (
          <div className={error ? styles.errorBanner : styles.noticeBanner} role="alert">
            <span>{error || notice}</span>
            <button
              type="button"
              className={styles.bannerCloseBtn}
              onClick={() => {
                setError("");
                setNotice("");
              }}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}

        {/* 4. Active Step Content Area */}
        <main className={styles.stageContent} id="main-content">
          {/* STEP 1: Algorithm Specification */}
          {stage === "specification" && (
            <section className={styles.step1Layout} aria-label="Algorithm Specification">
              <div className={styles.step1Header}>
                <h2>
                  <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 3 : 1}</span> Algorithm Specification
                </h2>
                <p>
                  {workflow === "flowchart"
                    ? "Author or review your separate structured algorithm specification."
                    : "Describe your algorithm step by step."}
                </p>
              </div>

              {workflow === "flowchart" && (
                <div className={styles.flowchartModeSpecBanner}>
                  <span className={styles.specBannerIcon}>✍️</span>
                  <div>
                    <strong>Step 3: Author Your Independent Algorithm Specification</strong>
                    <p>
                      Describe your algorithm steps in your own words below.
                      This specification is authored independently by you. In Step 4, our reconciliation engine
                      will independently compare your written specification with your visual flowchart to verify that both describe identical logic.
                    </p>
                  </div>
                </div>
              )}

              {analysis.specificationCandidate.diagnostics.length > 0 && (
                <div className={styles.specWarningBanner}>
                  <strong>⚠️ Algorithm Issues:</strong>
                  <ul>
                    {analysis.specificationCandidate.diagnostics.map((d: any, i: number) => (
                      <li key={i}>{d.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.step1BodyGrid}>
                {/* Left Sub-tabs */}
                <div className={styles.step1SubTabs}>
                  <button
                    type="button"
                    className={`${styles.subTabButton} ${
                      step1SubTab === "inputs" ? styles.subTabActive : ""
                    }`}
                    onClick={() => setStep1SubTab("inputs")}
                  >
                    <span className={styles.subTabNum}>1</span>
                    <span>Input Variables</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.subTabButton} ${
                      step1SubTab === "processing" ? styles.subTabActive : ""
                    }`}
                    onClick={() => setStep1SubTab("processing")}
                  >
                    <span className={styles.subTabNum}>2</span>
                    <span>Processing Steps</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.subTabButton} ${
                      step1SubTab === "output" ? styles.subTabActive : ""
                    }`}
                    onClick={() => setStep1SubTab("output")}
                  >
                    <span className={styles.subTabNum}>3</span>
                    <span>Output</span>
                  </button>
                </div>

                {/* Center Form Card */}
                <div className={styles.step1CenterCard}>
                  {step1SubTab === "inputs" && (
                    <div className={styles.subTabContent}>
                      <div className={styles.cardTitleRow}>
                        <h3>Input Variables</h3>
                        <p>Define the input variables and their types.</p>
                      </div>

                      {/* Variables Form */}
                      <div className={styles.variablesFormTable}>
                        {spec.inputs.length > 0 && (
                          <div className={styles.variablesHeaderRow}>
                            <span>Variable name</span>
                            <span>Data type</span>
                            <span />
                          </div>
                        )}

                        {spec.inputs.length === 0 && (
                          <div className={styles.emptyFormMsg}>
                            No input variables defined yet. Click &ldquo;＋ Add Variable&rdquo; below to declare the first value your algorithm receives.
                          </div>
                        )}

                        {spec.inputs.map((input) => (
                          <div className={styles.variableRow} key={input.id}>
                            <input
                              className={styles.variableNameInput}
                              value={input.name}
                              placeholder="n"
                              onChange={(e) =>
                                applySpec((curr: AlgorithmSpecification) => ({
                                  ...curr,
                                  inputs: curr.inputs.map((item) =>
                                    item.id === input.id ? { ...item, name: e.target.value } : item
                                  ),
                                }))
                              }
                            />
                            <select
                              className={styles.variableTypeSelect}
                              value={input.type}
                              onChange={(e) =>
                                applySpec((curr: AlgorithmSpecification) => ({
                                  ...curr,
                                  inputs: curr.inputs.map((item) =>
                                    item.id === input.id ? { ...item, type: e.target.value as ScalarType } : item
                                  ),
                                }))
                              }
                            >
                              <option value="int">int</option>
                              <option value="double">double</option>
                              <option value="char">char</option>
                            </select>
                            <button
                              type="button"
                              className={styles.deleteVarBtn}
                              title="Delete variable"
                              onClick={() =>
                                applySpec((curr: AlgorithmSpecification) => ({
                                  ...curr,
                                  inputs: curr.inputs.filter((item) => item.id !== input.id),
                                  steps: curr.steps.filter((s: any) => s.kind !== "input" || s.payload?.inputId !== input.id),
                                }))
                              }
                            >
                              🗑️
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          className={styles.addVariableBtn}
                          onClick={() => {
                            const newId = `input-${uid()}`;
                            applySpec((curr: AlgorithmSpecification) => {
                              const existingNames = new Set([...curr.inputs, ...curr.variables].map((v) => v.name));
                              let varName = "n";
                              let count = 2;
                              while (existingNames.has(varName)) {
                                varName = `n${count++}`;
                              }
                              return {
                                ...curr,
                                inputs: [...curr.inputs, { id: newId, name: varName, type: "int" as ScalarType, description: "" }],
                                steps: [
                                  ...curr.steps,
                                  { id: uid(), kind: "input", payload: { inputId: newId, prompt: `Enter ${varName}: ` } },
                                ],
                              };
                            });
                          }}
                        >
                          ＋ Add Variable
                        </button>
                      </div>

                      {/* Helpful Educational Callout */}
                      <div className={styles.infoCalloutBox}>
                        <div className={styles.calloutIcon}>⬇️</div>
                        <div className={styles.calloutText}>
                          <strong>What is an input variable?</strong>
                          <p>An input variable is a value that the user provides to the program.</p>
                          <small>Example: n (integer)</small>
                        </div>
                      </div>
                    </div>
                  )}

                  {step1SubTab === "processing" && (
                    <div className={styles.subTabContent}>
                      <div className={styles.cardTitleRow}>
                        <h3>Processing Steps</h3>
                        <p>Define arithmetic, variable updates, and decision conditions.</p>
                      </div>

                      <StepList
                        steps={spec.steps}
                        outputs={{ inputs: spec.inputs, variables: spec.variables, outputs: spec.outputs }}
                        onChange={applySpec}
                        styles={styles}
                      />
                    </div>
                  )}

                  {step1SubTab === "output" && (
                    <div className={styles.subTabContent}>
                      <div className={styles.cardTitleRow}>
                        <h3>Output Results</h3>
                        <p>Specify what values or messages are shown to the user.</p>
                      </div>

                      <div className={styles.outputRows}>
                        {spec.outputs.length === 0 && (
                          <div className={styles.emptyFormMsg}>
                            No output results defined yet. Click &ldquo;＋ Add Output&rdquo; below to declare what messages or values your algorithm shows to the user.
                          </div>
                        )}

                        {spec.outputs.map((out) => (
                          <div className={styles.outputCard} key={out.id}>
                            <label>
                              Output Description
                              <input
                                value={out.description}
                                onChange={(e) =>
                                  applySpec((curr: AlgorithmSpecification) => ({
                                    ...curr,
                                    outputs: curr.outputs.map((item) =>
                                      item.id === out.id ? { ...item, description: e.target.value } : item
                                    ),
                                  }))
                                }
                              />
                            </label>
                          </div>
                        ))}

                        <button
                          type="button"
                          className={styles.addVariableBtn}
                          onClick={() => {
                            const newId = `out-${uid()}`;
                            applySpec((curr: AlgorithmSpecification) => ({
                              ...curr,
                              outputs: [...curr.outputs, { id: newId, description: "Output message" }],
                              steps: [
                                ...curr.steps,
                                { id: uid(), kind: "output", payload: { outputId: newId, mode: "message", message: "Result" } },
                              ],
                            }));
                          }}
                        >
                          ＋ Add Output
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Example Card */}
                <div className={styles.step1RightCard}>
                  <div className={styles.exampleCardHeader}>
                    <span className={styles.exampleEyebrow}>Example</span>
                    <h4>Even or Odd Number</h4>
                  </div>
                  <div className={styles.exampleContent}>
                    <p>
                      <strong>Input:</strong> n (int)
                    </p>
                    <p>
                      <strong>Steps:</strong>
                    </p>
                    <ol>
                      <li>1. Read the number n.</li>
                      <li>2. If n % 2 == 0, the number is even.</li>
                      <li>3. Otherwise, the number is odd.</li>
                    </ol>
                    <p className={styles.exampleOutputRow}>
                      <strong>Output:</strong> &quot;Even&quot; or &quot;Odd&quot;
                    </p>
                  </div>
                </div>
              </div>

              {/* Specification Footer Actions */}
              <div className={styles.stageFooter}>
                {workflow === "flowchart" ? (
                  <button type="button" className={styles.backBtn} onClick={() => setStage("explain")}>
                    ← Back to Explain &amp; Learn
                  </button>
                ) : (
                  <Link href="/" className={styles.backBtn}>
                    ← Exit to Home
                  </Link>
                )}

                <div className={styles.stageFooterRight}>
                  <button type="button" className={styles.secondaryActionBtn} onClick={handleManualSave}>
                    💾 Save Progress
                  </button>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={() => {
                      if (step1SubTab === "inputs") setStep1SubTab("processing");
                      else if (step1SubTab === "processing") setStep1SubTab("output");
                      else setStage(workflow === "flowchart" ? "review" : "flowchart");
                    }}
                  >
                    {step1SubTab === "inputs"
                      ? "Next: Processing Steps →"
                      : step1SubTab === "processing"
                      ? "Next: Output →"
                      : workflow === "flowchart"
                      ? "Next: Check & Compare →"
                      : "Next: Draw Flowchart →"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* STEP 2: Flowchart Editor */}
          {stage === "flowchart" && (
            <section
              ref={flowchartEditorRef}
              className={`${styles.flowchartEditorLayout} ${isFullscreen ? styles.fullscreenMode : ""}`}
              aria-label="Flowchart Editor"
            >
              <div className={styles.editorToolbarRow}>
                <div className={styles.editorTitleInfo}>
                  <h2>
                    <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 1 : 2}</span> Flowchart Editor
                  </h2>
                  <p>Drag and drop the blocks to build your algorithm visually.</p>
                </div>
                <div className={styles.editorActions}>
                  <button
                    type="button"
                    className={`${styles.flowchartPreviewToggleBtn} ${showDraftPreview ? styles.flowchartPreviewToggleActive : ""}`}
                    onClick={() => setShowDraftPreview((prev) => !prev)}
                    title="Toggle real-time draft C and Python code preview generated from the flowchart"
                  >
                    ⚡ {showDraftPreview ? "Hide Code Preview" : "Live Code Preview"}
                  </button>
                  <button
                    type="button"
                    className={styles.autoArrangeBtn}
                    onClick={autoArrangeLayout}
                    title="Auto-arrange flowchart blocks into clean vertical hierarchy"
                  >
                    ✨ Auto-Arrange
                  </button>
                  <button
                    type="button"
                    className={`${styles.snapToggleBtn} ${snapToGrid ? styles.snapToggleActive : ""}`}
                    onClick={() => {
                      setSnapToGrid((s) => !s);
                      setShowGrid((g) => !g);
                    }}
                    title="Toggle 20px grid snapping and visual guide dots"
                  >
                    🧲 Snap: {snapToGrid ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    className={styles.exportSvgBtn}
                    onClick={exportFlowchartSvg}
                    title="Export standalone vector flowchart image (.svg)"
                  >
                    🖼 Export SVG
                  </button>
                  <div className={styles.customizeDropdownContainer}>
                    <button
                      type="button"
                      className={`${styles.customizeBtn} ${showCustomizeMenu ? styles.customizeBtnActive : ""}`}
                      onClick={() => setShowCustomizeMenu((m) => !m)}
                      title="Customize flowchart theme, grid, and arrow line styles"
                    >
                      🎨 Customize ▾
                    </button>
                    {showCustomizeMenu && (
                      <div className={styles.customizeMenu}>
                        <div className={styles.customizeSection}>
                          <span className={styles.customizeSectionTitle}>Canvas Grid & Theme</span>
                          <div className={styles.customizeBtnGroup}>
                            <button
                              type="button"
                              className={`${styles.customizeOptionBtn} ${canvasTheme === "dots" ? styles.customizeOptionActive : ""}`}
                              onClick={() => {
                                setCanvasTheme("dots");
                                setShowGrid(true);
                              }}
                            >
                              ⁝⁝ Dots
                            </button>
                            <button
                              type="button"
                              className={`${styles.customizeOptionBtn} ${canvasTheme === "grid" ? styles.customizeOptionActive : ""}`}
                              onClick={() => {
                                setCanvasTheme("grid");
                                setShowGrid(true);
                              }}
                            >
                              ⊞ Grid
                            </button>
                            <button
                              type="button"
                              className={`${styles.customizeOptionBtn} ${canvasTheme === "blueprint" ? styles.customizeOptionActive : ""}`}
                              onClick={() => {
                                setCanvasTheme("blueprint");
                                setShowGrid(true);
                              }}
                            >
                              🌌 Blueprint
                            </button>
                            <button
                              type="button"
                              className={`${styles.customizeOptionBtn} ${canvasTheme === "blank" ? styles.customizeOptionActive : ""}`}
                              onClick={() => {
                                setCanvasTheme("blank");
                                setShowGrid(false);
                              }}
                            >
                              ⬜ Blank
                            </button>
                          </div>
                        </div>

                        <div className={styles.customizeSection}>
                          <span className={styles.customizeSectionTitle}>Connector Line Style</span>
                          <div className={styles.customizeBtnGroup}>
                            <button
                              type="button"
                              className={`${styles.customizeOptionBtn} ${edgeRouting === "curved" ? styles.customizeOptionActive : ""}`}
                              onClick={() => setEdgeRouting("curved")}
                            >
                              〰 Curved
                            </button>
                            <button
                              type="button"
                              className={`${styles.customizeOptionBtn} ${edgeRouting === "orthogonal" ? styles.customizeOptionActive : ""}`}
                              onClick={() => setEdgeRouting("orthogonal")}
                            >
                              ⎾ Stepped
                            </button>
                            <button
                              type="button"
                              className={`${styles.customizeOptionBtn} ${edgeRouting === "straight" ? styles.customizeOptionActive : ""}`}
                              onClick={() => setEdgeRouting("straight")}
                            >
                              ― Straight
                            </button>
                          </div>
                        </div>

                        <div className={styles.customizeSection}>
                          <span className={styles.customizeSectionTitle}>Canvas Tools</span>
                          <div className={styles.customizeBtnGroup}>
                            <button
                              type="button"
                              className={`${styles.customizeOptionBtn} ${showMinimap ? styles.customizeOptionActive : ""}`}
                              onClick={() => setShowMinimap((m) => !m)}
                            >
                              🗺 Minimap: {showMinimap ? "On" : "Off"}
                            </button>
                            <button
                              type="button"
                              className={styles.customizeOptionBtn}
                              onClick={fitToScreen}
                            >
                              ⊡ Fit to View
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`${styles.fullscreenToggleBtn} ${isFullscreen ? styles.fullscreenToggleActive : ""}`}
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Exit Fullscreen (Esc)" : "Expand flowchart editor to full screen"}
                  >
                    {isFullscreen ? "✕ Exit Fullscreen" : "⛶ Fullscreen"}
                  </button>
                  <button type="button" className={styles.toolBtn} onClick={undoGraph} title="Undo (Ctrl+Z)">
                    ↩
                  </button>
                  <button type="button" className={styles.toolBtn} onClick={redoGraph} title="Redo (Ctrl+Y)">
                    ↪
                  </button>
                  <button type="button" className={styles.clearAllBtn} onClick={clearAllNodes}>
                    Clear All
                  </button>
                </div>
              </div>

              {/* Real-time Draft Code Preview Drawer */}
              {showDraftPreview && (
                <div className={styles.flowchartPreviewPanel}>
                  <div className={styles.flowchartPreviewHeader}>
                    <div className={styles.previewLangTabs}>
                      <button
                        type="button"
                        className={`${styles.previewLangTabBtn} ${draftLanguage === "c" ? styles.previewLangTabActive : ""}`}
                        onClick={() => setDraftLanguage("c")}
                      >
                        C (Draft)
                      </button>
                      <button
                        type="button"
                        className={`${styles.previewLangTabBtn} ${draftLanguage === "python" ? styles.previewLangTabActive : ""}`}
                        onClick={() => setDraftLanguage("python")}
                      >
                        Python (Draft)
                      </button>
                    </div>

                    <div className={styles.previewBadgeRow}>
                      <span className={analysis.flowchartCandidate.valid ? styles.previewBadgeDraft : styles.previewBadgeBlocked}>
                        {analysis.flowchartCandidate.valid
                          ? `Draft Preview (Rev ${graph.revision})`
                          : "Flowchart Incomplete"}
                      </span>
                    </div>
                  </div>

                  {analysis.flowchartCandidate.valid && draftFlowchartCode ? (
                    <pre className={styles.previewPre}>
                      <code>{draftFlowchartCode.code || (draftLanguage === "python" ? "# Generating Python..." : "/* Generating C... */")}</code>
                    </pre>
                  ) : (
                    <div className={styles.previewEmptyState}>
                      <strong>⚠️ Code preview is unavailable while the flowchart has structural issues:</strong>
                      <ul>
                        {analysis.flowchartCandidate.diagnostics.length > 0 ? (
                          analysis.flowchartCandidate.diagnostics.map((d: any, i: number) => (
                            <li key={i}>{d.message}</li>
                          ))
                        ) : (
                          <li>Connect Start and End blocks with valid path connections to generate code preview.</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {analysis.flowchartCandidate.diagnostics.length > 0 && (
                <div className={styles.flowchartWarningBanner}>
                  <strong>⚠️ Flowchart Issues:</strong>
                  <ul>
                    {analysis.flowchartCandidate.diagnostics.map((d: any, i: number) => (
                      <li key={i}>{d.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.flowchartWorkspace}>
                {/* Left Tool Palette */}
                <div className={`${styles.palette} ${paletteCollapsed ? styles.paletteCollapsed : ""}`}>
                  {isFullscreen && (
                    <button
                      type="button"
                      className={styles.paletteCollapseBtn}
                      onClick={() => setPaletteCollapsed((p) => !p)}
                      title={paletteCollapsed ? "Expand Palette" : "Collapse Palette"}
                    >
                      {paletteCollapsed ? "▶" : "◀ Hide"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.paletteItem} ${styles.paletteStartEnd}`}
                    onClick={() => addNode("start")}
                    title="Add Start block (terminator)"
                  >
                    <div className={styles.shapePill}>Start</div>
                  </button>

                  <button
                    type="button"
                    className={`${styles.paletteItem} ${styles.paletteInput}`}
                    onClick={() => addNode("input")}
                    title="Add Input block"
                  >
                    <div className={styles.shapeParallelogram}>Input</div>
                  </button>

                  <button
                    type="button"
                    className={`${styles.paletteItem} ${styles.paletteProcess}`}
                    onClick={() => addNode("process")}
                    title="Add Process block"
                  >
                    <div className={styles.shapeRectangle}>Process</div>
                  </button>

                  <button
                    type="button"
                    className={`${styles.paletteItem} ${styles.paletteDecision}`}
                    onClick={() => addNode("decision")}
                    title="Add Decision block"
                  >
                    <div className={styles.shapeDiamond}>Decision</div>
                  </button>

                  <button
                    type="button"
                    className={`${styles.paletteItem} ${styles.paletteOutput}`}
                    onClick={() => addNode("output")}
                    title="Add Output block"
                  >
                    <div className={styles.shapeParallelogramPink}>Output</div>
                  </button>

                  <button
                    type="button"
                    className={`${styles.paletteItem} ${styles.paletteStartEnd}`}
                    onClick={() => addNode("end")}
                    title="Add End block (terminator)"
                  >
                    <div className={styles.shapePillEnd}>End</div>
                  </button>
                </div>

                {/* Center Interactive Canvas */}
                <div className={styles.canvasContainer}>
                  <FlowCanvas
                    flowchart={graph as any}
                    selected={selectedNode}
                    setSelected={(id) => {
                      setSelectedNode(id || "");
                      if (id) setSelectedEdge(null);
                    }}
                    moveNode={moveNode}
                    zoom={zoom}
                    setZoom={setZoom}
                    onAddStart={() => addNode("start")}
                    selectedEdge={selectedEdge}
                    setSelectedEdge={(id) => {
                      setSelectedEdge(id);
                      if (id) setSelectedNode("");
                    }}
                    onDeleteEdge={removeEdge}
                    onInsertNodeOnEdge={insertNodeOnEdge}
                    onConnect={addEdge}
                    snapToGrid={snapToGrid}
                    showGrid={showGrid}
                    canvasTheme={canvasTheme}
                    edgeRouting={edgeRouting}
                    showMinimap={showMinimap}
                    nodeColorTags={nodeColorTags}
                    nodeNotes={nodeNotes}
                  />

                  {/* Zoom Controls */}
                  <div className={styles.zoomControlPill}>
                    <button
                      type="button"
                      className={styles.zoomBtn}
                      onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
                      title="Zoom Out (-)"
                      aria-label="Zoom Out"
                    >
                      -
                    </button>
                    <span
                      className={styles.zoomValue}
                      onClick={() => setZoom(1)}
                      title="Click to reset zoom to 100%"
                      style={{ cursor: "pointer" }}
                    >
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      className={styles.zoomBtn}
                      onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                      title="Zoom In (+)"
                      aria-label="Zoom In"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className={styles.zoomBtn}
                      onClick={() => setZoom(1)}
                      title="Reset zoom to 100%"
                      aria-label="Reset zoom"
                    >
                      ↺
                    </button>
                    <button
                      type="button"
                      className={styles.zoomBtn}
                      onClick={fitToScreen}
                      title="Fit flowchart to view (⊡)"
                      aria-label="Fit to View"
                    >
                      ⊡
                    </button>
                    <button
                      type="button"
                      className={`${styles.zoomBtn} ${showMinimap ? styles.zoomBtnActive : ""}`}
                      onClick={() => setShowMinimap((m) => !m)}
                      title="Toggle Overview Minimap (🗺)"
                      aria-label="Toggle Minimap"
                    >
                      🗺
                    </button>
                    <button
                      type="button"
                      className={`${styles.zoomBtn} ${isFullscreen ? styles.zoomBtnActive : ""}`}
                      onClick={toggleFullscreen}
                      title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen Mode"}
                      aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
                    >
                      {isFullscreen ? "🗗" : "⛶"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Node Inspector and Connector */}
              {selected && (
                <div className={styles.nodeInspectorPanel}>
                  <div className={styles.inspectorHeader}>
                    <strong>Selected: {selected.kind.toUpperCase()} Block</strong>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {selected.kind !== "start" && selected.kind !== "end" ? (
                        <>
                          <button
                            type="button"
                            className={styles.duplicateBtn}
                            onClick={() => duplicateNode(selected.id)}
                            title="Create a duplicate copy of this block"
                          >
                            📋 Duplicate
                          </button>
                          <button type="button" className={styles.dangerBtn} onClick={deleteNode}>
                            Delete Block
                          </button>
                        </>
                      ) : (
                        <span className={styles.requiredNodeBadge} title="Start and End blocks cannot be deleted">
                          Required
                        </span>
                      )}
                      <button
                        type="button"
                        className={styles.closeInspectorBtn}
                        onClick={() => setSelectedNode("")}
                        title="Close Inspector"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {selected.kind === "start" && (
                    <p className={styles.inspectorHint}>
                      Every algorithm begins at the Start block. Connect an outgoing arrow to the first step.
                    </p>
                  )}

                  {selected.kind === "end" && (
                    <p className={styles.inspectorHint}>
                      The End block terminates execution. It should receive incoming connections and has no outgoing arrows.
                    </p>
                  )}

                  {selected.kind === "decision" && (
                    <label className={styles.inspectorField}>
                      Decision Condition:
                      <input
                        value={(selected.payload as any).condition || ""}
                        onChange={(e) =>
                          applyGraph((curr: FlowchartGraph) => ({
                            ...curr,
                            nodes: curr.nodes.map((n) =>
                              n.id === selected.id ? { ...n, payload: { ...n.payload, condition: e.target.value } } : n
                            ),
                          }))
                        }
                      />
                    </label>
                  )}

                  {selected.kind === "input" && (
                    <>
                      <label className={styles.inspectorField}>
                        Variable name:
                        <input
                          value={(selected.payload as any).name || ""}
                          placeholder="n"
                          onChange={(e) =>
                            applyGraph((curr: FlowchartGraph) => ({
                              ...curr,
                              nodes: curr.nodes.map((n) =>
                                n.id === selected.id ? { ...n, payload: { ...n.payload, name: e.target.value } } : n
                              ),
                            }))
                          }
                        />
                      </label>
                      {(() => {
                        const vName = (selected.payload as any).name || "";
                        if (!vName) return null;
                        const vRes = validateVarName(vName);
                        if (!vRes.valid) {
                          return <div className={styles.varValidationWarning}>⚠️ {vRes.message}</div>;
                        }
                        return <div className={styles.varValidationOk}>✓ Valid variable name</div>;
                      })()}
                      <label className={styles.inspectorField}>
                        Data type:
                        <select
                          value={(selected.payload as any).type || "int"}
                          onChange={(e) =>
                            applyGraph((curr: FlowchartGraph) => ({
                              ...curr,
                              nodes: curr.nodes.map((n) =>
                                n.id === selected.id ? { ...n, payload: { ...n.payload, type: e.target.value as ScalarType } } : n
                              ),
                            }))
                          }
                        >
                          <option value="int">int</option>
                          <option value="double">double</option>
                          <option value="char">char</option>
                        </select>
                      </label>
                      <label className={styles.inspectorField}>
                        Prompt shown to user:
                        <input
                          value={(selected.payload as any).prompt || ""}
                          placeholder="Enter a number: "
                          onChange={(e) =>
                            applyGraph((curr: FlowchartGraph) => ({
                              ...curr,
                              nodes: curr.nodes.map((n) =>
                                n.id === selected.id ? { ...n, payload: { ...n.payload, prompt: e.target.value } } : n
                              ),
                            }))
                          }
                        />
                      </label>
                    </>
                  )}

                  {selected.kind === "process" && (
                    <>
                      <label className={styles.inspectorField}>
                        Operation:
                        <select
                          value={(selected.payload as any).operation || "declaration"}
                          onChange={(e) => {
                            const op = e.target.value;
                            applyGraph((curr: FlowchartGraph) => ({
                              ...curr,
                              nodes: curr.nodes.map((n) => {
                                if (n.id !== selected.id) return n;
                                if (op === "declaration") {
                                  return {
                                    ...n,
                                    payload: {
                                      operation: "declaration",
                                      symbolId: (n.payload as any).symbolId || `symbol-${n.id}`,
                                      name: (n.payload as any).name || "result",
                                      type: (n.payload as any).type || "int",
                                      ...((n.payload as any).initializer ? { initializer: (n.payload as any).initializer } : {}),
                                    },
                                  };
                                }
                                return {
                                  ...n,
                                  payload: {
                                    operation: "assignment",
                                    symbolId: availableAssignTargets[0]?.symbolId || (n.payload as any).symbolId || `symbol-${n.id}`,
                                    expression: (n.payload as any).expression || "0",
                                  },
                                };
                              }),
                            }));
                          }}
                        >
                          <option value="declaration">Declare variable</option>
                          <option value="assignment">Assign / Calculate</option>
                        </select>
                      </label>

                      {(selected.payload as any).operation === "declaration" ? (
                        <>
                          <label className={styles.inspectorField}>
                            Variable name:
                            <input
                              value={(selected.payload as any).name || ""}
                              placeholder="result"
                              onChange={(e) =>
                                applyGraph((curr: FlowchartGraph) => ({
                                  ...curr,
                                  nodes: curr.nodes.map((n) =>
                                    n.id === selected.id
                                      ? {
                                          ...n,
                                          payload: {
                                            operation: "declaration",
                                            symbolId: (n.payload as any).symbolId || `symbol-${n.id}`,
                                            name: e.target.value,
                                            type: (n.payload as any).type || "int",
                                            ...((n.payload as any).initializer ? { initializer: (n.payload as any).initializer } : {}),
                                          },
                                        }
                                      : n
                                  ),
                                }))
                              }
                            />
                          </label>
                          {(() => {
                            const vName = (selected.payload as any).name || "";
                            if (!vName) return null;
                            const vRes = validateVarName(vName);
                            if (!vRes.valid) {
                              return <div className={styles.varValidationWarning}>⚠️ {vRes.message}</div>;
                            }
                            return <div className={styles.varValidationOk}>✓ Valid variable name</div>;
                          })()}
                          <label className={styles.inspectorField}>
                            Data type:
                            <select
                              value={(selected.payload as any).type || "int"}
                              onChange={(e) =>
                                applyGraph((curr: FlowchartGraph) => ({
                                  ...curr,
                                  nodes: curr.nodes.map((n) =>
                                    n.id === selected.id
                                      ? {
                                          ...n,
                                          payload: {
                                            ...(n.payload as any),
                                            type: e.target.value as ScalarType,
                                          },
                                        }
                                      : n
                                  ),
                                }))
                              }
                            >
                              <option value="int">int</option>
                              <option value="double">double</option>
                              <option value="char">char</option>
                            </select>
                          </label>
                          <label className={styles.inspectorField}>
                            Initial value (optional):
                            <input
                              value={(selected.payload as any).initializer || ""}
                              placeholder="e.g. 0"
                              onChange={(e) =>
                                applyGraph((curr: FlowchartGraph) => ({
                                  ...curr,
                                  nodes: curr.nodes.map((n) =>
                                    n.id === selected.id
                                      ? {
                                          ...n,
                                          payload: {
                                            operation: "declaration",
                                            symbolId: (n.payload as any).symbolId || `symbol-${n.id}`,
                                            name: (n.payload as any).name || "result",
                                            type: (n.payload as any).type || "int",
                                            ...(e.target.value ? { initializer: e.target.value } : {}),
                                          },
                                        }
                                      : n
                                  ),
                                }))
                              }
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className={styles.inspectorField}>
                            Assign to variable:
                            <select
                              value={(selected.payload as any).symbolId || ""}
                              onChange={(e) =>
                                applyGraph((curr: FlowchartGraph) => ({
                                  ...curr,
                                  nodes: curr.nodes.map((n) =>
                                    n.id === selected.id
                                      ? {
                                          ...n,
                                          payload: {
                                            ...(n.payload as any),
                                            operation: "assignment",
                                            symbolId: e.target.value,
                                          },
                                        }
                                      : n
                                  ),
                                }))
                              }
                            >
                              <option value="" disabled>Choose variable to update…</option>
                              {availableAssignTargets.map((target) => (
                                <option key={target.symbolId} value={target.symbolId}>
                                  {target.name} ({target.type}) — {target.source}
                                </option>
                              ))}
                            </select>
                          </label>
                          {availableAssignTargets.length === 0 && (
                            <small style={{ color: "var(--amber-dark, #b45309)", display: "block", marginBottom: "8px" }}>
                              ⚠️ No variables found. Add an Input block or a Declaration Process block first.
                            </small>
                          )}
                          <label className={styles.inspectorField}>
                            Calculation / Expression:
                            <input
                              value={(selected.payload as any).expression || ""}
                              placeholder="e.g. n + 1 or a * b"
                              onChange={(e) =>
                                applyGraph((curr: FlowchartGraph) => ({
                                  ...curr,
                                  nodes: curr.nodes.map((n) =>
                                    n.id === selected.id
                                      ? {
                                          ...n,
                                          payload: {
                                            ...(n.payload as any),
                                            operation: "assignment",
                                            symbolId: (n.payload as any).symbolId || availableAssignTargets[0]?.symbolId || `symbol-${n.id}`,
                                            expression: e.target.value,
                                          },
                                        }
                                      : n
                                  ),
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}

                  {selected.kind === "output" && (
                    <>
                      <label className={styles.inspectorField}>
                        Output Mode:
                        <select
                          value={(selected.payload as any).mode || "message"}
                          onChange={(e) => {
                            const mode = e.target.value;
                            applyGraph((curr: FlowchartGraph) => ({
                              ...curr,
                              nodes: curr.nodes.map((n) =>
                                n.id === selected.id
                                  ? {
                                      ...n,
                                      payload: {
                                        outputId: (n.payload as any).outputId || `output-${n.id}`,
                                        mode,
                                        ...(mode === "message"
                                          ? { message: (n.payload as any).message || "Result" }
                                          : { expression: (n.payload as any).expression || (availableAssignTargets[0]?.name || "n") }),
                                      },
                                    }
                                  : n
                              ),
                            }));
                          }}
                        >
                          <option value="message">Display Message (Text)</option>
                          <option value="expression">Display Variable / Expression</option>
                        </select>
                      </label>
                      {(selected.payload as any).mode === "expression" ? (
                        <label className={styles.inspectorField}>
                          Variable / Expression to display:
                          <input
                            value={(selected.payload as any).expression || ""}
                            placeholder="e.g. result or n * 2"
                            onChange={(e) =>
                              applyGraph((curr: FlowchartGraph) => ({
                                ...curr,
                                nodes: curr.nodes.map((n) =>
                                  n.id === selected.id
                                    ? {
                                        ...n,
                                        payload: {
                                          outputId: (n.payload as any).outputId || `output-${n.id}`,
                                          mode: "expression",
                                          expression: e.target.value,
                                        },
                                      }
                                    : n
                                ),
                              }))
                            }
                          />
                        </label>
                      ) : (
                        <label className={styles.inspectorField}>
                          Output message:
                          <input
                            value={(selected.payload as any).message || ""}
                            placeholder='e.g. Result is even'
                            onChange={(e) =>
                              applyGraph((curr: FlowchartGraph) => ({
                                ...curr,
                                nodes: curr.nodes.map((n) =>
                                  n.id === selected.id
                                    ? {
                                        ...n,
                                        payload: {
                                          outputId: (n.payload as any).outputId || `output-${n.id}`,
                                          mode: "message",
                                          message: e.target.value,
                                        },
                                      }
                                    : n
                                ),
                              }))
                            }
                          />
                        </label>
                      )}
                    </>
                  )}

                  {/* Block Customization: Note & Accent */}
                  <label className={styles.inspectorField}>
                    Block Note / Description (Optional):
                    <input
                      value={nodeNotes[selected.id] || ""}
                      placeholder="e.g. Validates user input before checking"
                      onChange={(e) => {
                        const val = e.target.value;
                        setNodeNotes((curr) => ({ ...curr, [selected.id]: val }));
                      }}
                    />
                  </label>

                  <div className={styles.inspectorField}>
                    <span>Block Accent Color:</span>
                    <div className={styles.colorPickerRow}>
                      <button
                        type="button"
                        className={`${styles.colorDot} ${styles.colorDotDefault} ${!nodeColorTags[selected.id] ? styles.colorDotActive : ""}`}
                        onClick={() => {
                          const next = { ...nodeColorTags };
                          delete next[selected.id];
                          setNodeColorTags(next);
                        }}
                        title="Default Theme"
                      />
                      {Object.entries(COLOR_TAG_PRESETS).map(([key, item]) => (
                        <button
                          key={key}
                          type="button"
                          className={`${styles.colorDot} ${nodeColorTags[selected.id] === key ? styles.colorDotActive : ""}`}
                          style={{ background: item.border }}
                          onClick={() => setNodeColorTags((curr) => ({ ...curr, [selected.id]: key }))}
                          title={`${item.label} Accent`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Incoming connections list */}
                  {graph.edges.filter((e) => e.to === selected.id).length > 0 && (
                    <div className={styles.connectionsList}>
                      <span className={styles.connectionsTitle}>Incoming Connections:</span>
                      {graph.edges.filter((e) => e.to === selected.id).map((edge) => {
                        const srcNode = graph.nodes.find((n) => n.id === edge.from);
                        return (
                          <div key={edge.id} className={styles.connectionItem}>
                            <span>
                              ← From {srcNode ? `${srcNode.kind} (${(srcNode.payload as any).name || (srcNode.payload as any).condition || (srcNode.payload as any).message || srcNode.id})` : edge.from}
                              {edge.branch ? ` [${edge.branch === "true" ? "Yes" : "No"}]` : ""}
                            </span>
                            <button
                              type="button"
                              className={styles.deleteConnBtn}
                              onClick={() => removeEdge(edge.id)}
                              title="Disconnect this incoming arrow"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Outgoing connections list with disconnect button */}
                  {graph.edges.filter((e) => e.from === selected.id).length > 0 && (
                    <div className={styles.connectionsList}>
                      <span className={styles.connectionsTitle}>Outgoing Connections:</span>
                      {graph.edges.filter((e) => e.from === selected.id).map((edge) => {
                        const destNode = graph.nodes.find((n) => n.id === edge.to);
                        return (
                          <div key={edge.id} className={styles.connectionItem}>
                            <span>
                              → {destNode ? `${destNode.kind} (${(destNode.payload as any).name || (destNode.payload as any).condition || (destNode.payload as any).message || destNode.id})` : edge.to}
                              {edge.branch ? ` [Branch: ${edge.branch === "true" ? "Yes" : "No"}]` : ""}
                            </span>
                            <button
                              type="button"
                              className={styles.deleteConnBtn}
                              onClick={() => removeEdge(edge.id)}
                              title="Disconnect this arrow"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Connect arrow to another block (hidden for End block) */}
                  {selected.kind === "end" ? (
                    <div className={styles.endBlockNotice}>
                      End block marks the completion of the algorithm and has no outgoing arrows.
                    </div>
                  ) : (
                    <form
                      className={styles.connectForm}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        const to = form.get("to") as string;
                        const branch = form.get("branch") as string;
                        if (to) addEdge(selected.id, to, branch);
                        e.currentTarget.reset();
                      }}
                    >
                      <span>Connect arrow to:</span>
                      <select name="to" required defaultValue="">
                        <option value="" disabled>
                          Choose destination block…
                        </option>
                        {graph.nodes
                          .filter((n) => n.id !== selected.id && n.kind !== "start")
                          .map((n) => (
                            <option value={n.id} key={n.id}>
                              {n.kind} ({(n.payload as any).name || (n.payload as any).message || (n.payload as any).condition || n.id})
                            </option>
                          ))}
                      </select>

                      {selected.kind === "decision" && (
                        <select name="branch" defaultValue="true">
                          <option value="true">Yes (True Branch)</option>
                          <option value="false">No (False Branch)</option>
                        </select>
                      )}

                      <button type="submit" className={styles.connectSubmitBtn}>
                        Add Arrow
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Selected Arrow (Edge) Inspector Panel */}
              {!selected && selectedEdge && (() => {
                const edge = graph.edges.find((e) => e.id === selectedEdge);
                if (!edge) return null;
                const srcNode = graph.nodes.find((n) => n.id === edge.from);
                const destNode = graph.nodes.find((n) => n.id === edge.to);
                return (
                  <div className={styles.nodeInspectorPanel}>
                    <div className={styles.inspectorHeader}>
                      <strong>Selected: Arrow (Connection)</strong>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <button
                          type="button"
                          className={styles.dangerBtn}
                          onClick={() => removeEdge(edge.id)}
                        >
                          ✕ Delete Arrow
                        </button>
                        <button
                          type="button"
                          className={styles.closeInspectorBtn}
                          onClick={() => setSelectedEdge(null)}
                          title="Close Inspector"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <p className={styles.inspectorHint}>
                      Flow: <strong>{srcNode ? srcNode.kind.toUpperCase() : edge.from}</strong> → <strong>{destNode ? destNode.kind.toUpperCase() : edge.to}</strong>
                      {edge.branch ? ` (${edge.branch === "true" ? "Yes / True Branch" : "No / False Branch"})` : ""}
                    </p>
                    {srcNode?.kind === "decision" && (
                      <label className={styles.inspectorField}>
                        Branch condition:
                        <select
                          value={edge.branch || "true"}
                          onChange={(e) => {
                            const branchVal = e.target.value as "true" | "false";
                            applyGraph((curr: FlowchartGraph) => ({
                              ...curr,
                              edges: curr.edges.map((ed) => (ed.id === edge.id ? { ...ed, branch: branchVal } : ed)),
                            }));
                          }}
                        >
                          <option value="true">Yes (True Branch)</option>
                          <option value="false">No (False Branch)</option>
                        </select>
                      </label>
                    )}
                    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>Insert Step In Between:</span>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={styles.duplicateBtn}
                          onClick={() => insertNodeOnEdge(edge.id, "input")}
                        >
                          ＋ Input
                        </button>
                        <button
                          type="button"
                          className={styles.duplicateBtn}
                          onClick={() => insertNodeOnEdge(edge.id, "process")}
                        >
                          ＋ Process
                        </button>
                        <button
                          type="button"
                          className={styles.duplicateBtn}
                          onClick={() => insertNodeOnEdge(edge.id, "decision")}
                        >
                          ＋ Decision
                        </button>
                        <button
                          type="button"
                          className={styles.duplicateBtn}
                          onClick={() => insertNodeOnEdge(edge.id, "output")}
                        >
                          ＋ Output
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Flowchart Footer */}
              <div className={styles.stageFooter}>
                {workflow === "flowchart" ? (
                  <Link href="/" className={styles.backBtn}>
                    ← Exit to Home
                  </Link>
                ) : (
                  <button type="button" className={styles.backBtn} onClick={() => setStage("specification")}>
                    ← Back to Algorithm
                  </button>
                )}
                <div className={styles.stageFooterRight}>
                  <button type="button" className={styles.secondaryActionBtn} onClick={handleManualSave}>
                    💾 Save Progress
                  </button>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={() => setStage(workflow === "flowchart" ? "explain" : "review")}
                  >
                    {workflow === "flowchart" ? "Next: Understand How It Works →" : "Next: Check & Compare →"}
                  </button>
                </div>
              </div>

              {/* Fullscreen Keyboard Shortcuts Helper Bar */}
              {isFullscreen && (
                <div className={styles.fullscreenKeyboardBar}>
                  <span>⌨️ <strong>Del</strong>: Delete Block/Arrow</span>
                  <span>·</span>
                  <span><strong>Shift + Arrows</strong>: Fast Nudge</span>
                  <span>·</span>
                  <span><strong>Esc</strong>: Exit Fullscreen</span>
                </div>
              )}
            </section>
          )}

          {/* STEP 2 (Option B): Explain & Learn */}
          {stage === "explain" && (
            <ExplanationCard
              workflow={workflow}
              flowchartExplanation={flowchartExplanation}
              copiedPseudocode={copiedPseudocode}
              onCopyPseudocode={copyPseudocode}
              onEditFlowchart={() => setStage("flowchart")}
              onSave={handleManualSave}
              onNext={() => setStage("specification")}
              styles={styles}
            />
          )}

          {/* STEP 3: Check & Compare */}
          {stage === "review" && (
            <section className={styles.step3Layout} aria-label="Step 3: Check & Compare">
              <div className={styles.step3Header}>
                <h2>
                  <span className={styles.compareIcon}>🔄</span>
                  <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 4 : 3}</span> Check &amp; Compare
                </h2>
                <p>We compare your algorithm and flowchart to find differences.</p>
              </div>

              <div className={styles.compareGrid}>
                {/* Left Comparison Results */}
                <div className={styles.compareResultsList}>
                  {analysis.reconciliation.status === "equivalent" ? (
                    <>
                      <div className={styles.matchCard}>
                        <span className={styles.matchIconCheck}>✓</span>
                        <div>
                          <strong>Input variables match</strong>
                          <p>
                            Both have: {spec.inputs.length > 0 ? spec.inputs.map((i) => `${i.name} (${i.type})`).join(", ") : "no inputs"}
                          </p>
                        </div>
                      </div>

                      <div className={styles.matchCard}>
                        <span className={styles.matchIconCheck}>✓</span>
                        <div>
                          <strong>Processing steps match</strong>
                          <p>Both representations execute identical operations and branch conditions.</p>
                        </div>
                      </div>

                      <div className={styles.matchCard}>
                        <span className={styles.matchIconCheck}>✓</span>
                        <div>
                          <strong>Output matches</strong>
                          <p>
                            Both display:{" "}
                            {spec.outputs.length > 0
                              ? spec.outputs.map((o) => `"${o.description}"`).join(" or ")
                              : "consistent results"}
                          </p>
                        </div>
                      </div>

                      <div className={styles.infoMatchCard}>
                        <span className={styles.matchIconInfo}>ℹ️</span>
                        <div>
                          <strong>Logic Equivalent</strong>
                          <p>Your algorithm specification and visual flowchart describe the exact same execution model.</p>
                        </div>
                      </div>
                    </>
                  ) : analysis.reconciliation.status === "conflict" ? (
                    <>
                      <div className={styles.conflictCard}>
                        <span className={styles.conflictIcon}>⚠️</span>
                        <div>
                          <strong>Logic Differences Detected</strong>
                          <p>{analysis.reconciliation.findings.length} difference(s) found between the algorithm and flowchart.</p>
                        </div>
                      </div>

                      <div style={{ margin: "10px 0 14px 0", padding: "12px 14px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "8px" }}>
                        <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "var(--foreground, #18181b)" }}>
                          💡 <strong>Quick Fix:</strong> Update the algorithm specification to match your visual flowchart with 1 click:
                        </p>
                        <button
                          type="button"
                          className={styles.primaryActionBtn}
                          onClick={handleSyncSpecificationFromFlowchart}
                          title="Automatically synchronize the algorithm specification with your flowchart"
                          style={{ fontSize: "13px", padding: "6px 14px" }}
                        >
                          🔄 Auto-Sync Algorithm with Flowchart
                        </button>
                      </div>

                      <div className={styles.findingAlertList}>
                        <h4>Differences to resolve:</h4>
                        {analysis.reconciliation.findings.map((f: any) => (
                          <div className={styles.findingItem} key={f.id}>
                            <strong>Location: {f.path}</strong>
                            <p>
                              Algorithm: <code>{JSON.stringify(f.specificationValue ?? "(missing)")}</code>
                              <br />
                              Flowchart: <code>{JSON.stringify(f.flowchartValue ?? "(missing)")}</code>
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : analysis.reconciliation.status === "invalid" ? (
                    <div className={styles.conflictCard}>
                      <span className={styles.conflictIcon}>⚠️</span>
                      <div>
                        <strong>Invalid Sources</strong>
                        <p>One or both sources could not be parsed into a valid AST. Return to Step 1 or Step 2 to resolve structural errors.</p>
                        {analysis.reconciliation.diagnostics.map((d: any, i: number) => (
                          <small key={i} style={{ display: "block", marginTop: "4px" }}>• {d.message}</small>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.blueHelpCard}>
                      <span className={styles.matchIconBlue}>ℹ</span>
                      <div>
                        <strong>Equivalence Unknown</strong>
                        <p>Equivalence cannot be established automatically for these constructs.</p>
                      </div>
                    </div>
                  )}

                  {/* Explanatory note */}
                  <div className={styles.blueHelpCard}>
                    <span className={styles.matchIconBlue}>ℹ</span>
                    <div>
                      <strong>How comparison works</strong>
                      <p>Both the written algorithm and the visual flowchart are canonicalized into a shared Typed AST before comparison.</p>
                    </div>
                  </div>
                </div>

                {/* Right Dual Representation Preview */}
                <div className={styles.previewPanel}>
                  <div className={styles.previewHeaderRow}>
                    <span>Preview of Both Representations</span>
                    <div className={styles.tabTogglePill}>
                      <button
                        type="button"
                        className={`${styles.tabToggleBtn} ${previewTab === "text" ? styles.tabToggleActive : ""}`}
                        onClick={() => setPreviewTab("text")}
                      >
                        Algorithm (Text)
                      </button>
                      <button
                        type="button"
                        className={`${styles.tabToggleBtn} ${previewTab === "diagram" ? styles.tabToggleActive : ""}`}
                        onClick={() => setPreviewTab("diagram")}
                      >
                        Flowchart (Diagram)
                      </button>
                    </div>
                  </div>

                  <div className={styles.previewPaneBody}>
                    {previewTab === "text" ? (
                      <ol className={styles.previewAlgoList}>
                        {renderAlgoStepsPreview(spec.steps, spec)}
                      </ol>
                    ) : (
                      renderFlowchartPreview(graph, styles)
                    )}
                  </div>
                </div>
              </div>

              {/* Review Footer */}
              <div className={styles.stageFooter}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setStage(workflow === "flowchart" ? "specification" : "flowchart")}
                >
                  {workflow === "flowchart" ? "← Back to Algorithm" : "← Back to Flowchart"}
                </button>
                <div className={styles.stageFooterRight}>
                  <button type="button" className={styles.secondaryActionBtn} onClick={handleManualSave}>
                    💾 Save Progress
                  </button>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={() => setStage("validate")}
                  >
                    Next: Validation →
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* STEP 4: Validation */}
          {stage === "validate" && (
            <section className={styles.step4Layout} aria-label="Step 4: Validation & Verification">
              <div className={styles.step4Header}>
                <h2>
                  <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 5 : 4}</span> Validation &amp; Verification
                </h2>
                <p>Check for errors and verify matching logic before code generation.</p>
              </div>

              <div className={styles.validationCardsGrid}>
                <div className={styles.valCheckCard}>
                  <div className={styles.valCheckIcon}>{isValid ? "✓" : "⚠️"}</div>
                  <div>
                    <strong>Structural Integrity</strong>
                    <p>Single Start block, valid connections, all paths terminate cleanly at End.</p>
                  </div>
                </div>

                <div className={styles.valCheckCard}>
                  <div className={styles.valCheckIcon}>{isValid ? "✓" : "⚠️"}</div>
                  <div>
                    <strong>Type &amp; Expression Safety</strong>
                    <p>Safe numeric operations, verified data types, and no unsafe code escapes.</p>
                  </div>
                </div>

                <div className={styles.valCheckCard}>
                  <div className={styles.valCheckIcon}>{isEquivalent ? "✓" : "⚠️"}</div>
                  <div>
                    <strong>Equivalence Check</strong>
                    <p>Algorithm specification and visual flowchart describe identical execution logic.</p>
                  </div>
                </div>

                {backendStatus === "connected" && (
                  <div className={styles.valCheckCard}>
                    <div className={styles.valCheckIcon}>
                      {serverReconLoading ? "⏳" : serverReconResult?.reconciliation?.status === "equivalent" ? "✓" : "⚠️"}
                    </div>
                    <div>
                      <strong>FastAPI Domain Authority</strong>
                      <p>
                        {serverReconLoading
                          ? "Querying Python backend service..."
                          : serverReconResult
                          ? `Server validated equivalence as ${serverReconResult.reconciliation?.status || "unknown"}.`
                          : "Verified by Python FastAPI."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {(!isValid || !isEquivalent) && (
                <div className={styles.validationNoticeBox}>
                  <strong>⚠️ Issues requiring attention before generating code:</strong>
                  <ul>
                    {!isEquivalent && (
                      <li>
                        Algorithm and flowchart logic do not match ({analysis.reconciliation?.status || "unresolved"}). Review Step {workflow === "flowchart" ? 4 : 3} for differences.
                        <span style={{ display: "inline-block", marginLeft: "10px" }}>
                          <button
                            type="button"
                            className={styles.primaryActionBtn}
                            onClick={handleSyncSpecificationFromFlowchart}
                            style={{ fontSize: "12px", padding: "3px 10px", verticalAlign: "middle" }}
                            title="Update algorithm specification to match flowchart"
                          >
                            🔄 Auto-Sync Algorithm with Flowchart
                          </button>
                        </span>
                      </li>
                    )}
                    {analysis.specificationCandidate.diagnostics.map((d: any, i: number) => (
                      <li key={`spec-${i}`}>Algorithm: {d.message} {d.suggestion ? `(${d.suggestion})` : ""}</li>
                    ))}
                    {analysis.flowchartCandidate.diagnostics.map((d: any, i: number) => (
                      <li key={`flow-${i}`}>Flowchart: {d.message} {d.suggestion ? `(${d.suggestion})` : ""}</li>
                    ))}
                    {analysis.specValidation?.diagnostics?.map((d: any, i: number) => (
                      <li key={`specval-${i}`}>Algorithm semantics: {d.message}</li>
                    ))}
                    {analysis.graphValidation?.diagnostics?.map((d: any, i: number) => (
                      <li key={`graphval-${i}`}>Flowchart semantics: {d.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Verification Status Card */}
              <div className={styles.approvalBox}>
                <div>
                  <strong>
                    {isValid && isEquivalent ? "✓ Logic Verified for Code Generation" : "Verification Status"}
                  </strong>
                  <p>
                    {isValid && isEquivalent
                      ? "Both algorithm and flowchart representations are valid, equivalent, and verified. You can proceed directly to generate code."
                      : "Resolve any validation errors or logic differences above to enable code generation."}
                  </p>
                </div>
                <span className={isValid && isEquivalent ? styles.verifiedBadge : styles.unapprovedBadge}>
                  {isValid && isEquivalent ? "✓ Logic Verified" : "Verification Pending"}
                </span>
              </div>

              {/* Validation Footer */}
              <div className={styles.stageFooter}>
                <button type="button" className={styles.backBtn} onClick={() => setStage("review")}>
                  ← Back to Check &amp; Compare
                </button>
                <div className={styles.stageFooterRight}>
                  <button type="button" className={styles.secondaryActionBtn} onClick={handleManualSave}>
                    💾 Save Progress
                  </button>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    disabled={!isValid || !isEquivalent}
                    onClick={() => {
                      generate();
                      setStage("generate");
                    }}
                  >
                    Next: Generate Code →
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* STEP 5 / 6: Generate Code */}
          {stage === "generate" && (
            <CodePreviewPanel
              workflow={workflow}
              targetLanguage={targetLanguage}
              setTargetLanguage={handleSelectTargetLanguage}
              codeResult={codeResult}
              isApproved={isApproved}
              isValid={Boolean(isValid)}
              isEquivalent={isEquivalent}
              semanticRevision={project?.revisions?.semantic ?? 0}
              spec={spec}
              onCopy={copyCode}
              onDownload={() =>
                downloadFile(
                  `solution.${targetLanguage === "python" ? "py" : "c"}`,
                  codeResult?.code || "",
                  targetLanguage === "python" ? "text/x-python" : "text/x-csrc"
                )
              }
              onSyncFlowchartToSpec={handleSyncSpecificationFromFlowchart}
              styles={styles}
            >
              <ExecutionConsole
                targetLanguage={targetLanguage}
                workflow={workflow}
                isReady={Boolean(isValid && isEquivalent)}
                isRunning={isRunning}
                programInput={programInput}
                setProgramInput={setProgramInput}
                onRunProgram={handleRunProgram}
                executionResult={executionResult}
                isEquivalent={isEquivalent}
                onSyncFlowchartToSpec={handleSyncSpecificationFromFlowchart}
                styles={styles}
              />
              <div className={styles.stageFooter}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setStage("validate")}
                >
                  ← Back to Validation
                </button>
                <div className={styles.stageFooterRight}>
                  <button
                    type="button"
                    className={styles.primaryActionBtn}
                    onClick={() => setStage("trace")}
                  >
                    Next: Trace Logic →
                  </button>
                  <button type="button" className={styles.secondaryActionBtn} onClick={handleManualSave}>
                    💾 Save Project
                  </button>
                  <Link href="/" className={styles.homeReturnBtn}>
                    Done &amp; Return Home
                  </Link>
                </div>
              </div>
            </CodePreviewPanel>
          )}

          {/* STEP 6 (Option A) or STEP 7 (Option B): Step-by-Step Logic Tracer */}
          {stage === "trace" && (
            <section className={styles.traceLayout} aria-label="Step-by-Step Logic Tracer">
              <div className={styles.step5Header}>
                <div className={styles.step5HeaderTitle}>
                  <h2>
                    <span className={styles.stepNumBadge}>{workflow === "flowchart" ? 7 : 6}</span> Step-by-Step Logic Tracer
                  </h2>
                  <p>
                    Observe deterministic execution of your algorithm, inspect variable values in memory, and watch how conditional decisions branch.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    className={styles.secondaryActionBtn}
                    onClick={() => setStage("generate")}
                  >
                    ← Back to Generate Code
                  </button>
                </div>
              </div>

              <div>
                <LogicTracer
                  project={project}
                  ast={analysis?.flowchartCandidate?.ast || analysis?.specificationCandidate?.ast}
                  onHighlightFlowchartNode={(nodeId) => setSelectedNode(nodeId)}
                />
              </div>

              {/* Trace Stage Footer */}
              <div className={styles.stageFooter}>
                <button type="button" className={styles.backBtn} onClick={() => setStage("generate")}>
                  ← Back to Generate Code
                </button>
                <div className={styles.stageFooterRight}>
                  <button type="button" className={styles.secondaryActionBtn} onClick={handleManualSave}>
                    💾 Save Project
                  </button>
                  <Link href="/" className={styles.homeReturnBtn}>
                    Done &amp; Return Home
                  </Link>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* MODALS */}

      {/* 0. TRACE LOGIC MODAL */}
      {activeModal === "traceLogic" && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.traceModalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>🔍</span>
                <div>
                  <h3 style={{ margin: 0 }}>Step-by-Step Logic Tracer</h3>
                  <p className={styles.modalHint}>
                    Visual algorithm execution, branch decisions, and variable changes
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setActiveModal(null)}
                aria-label="Close Trace Logic"
              >
                ×
              </button>
            </div>
            <div style={{ padding: "16px 20px 24px", background: "var(--paper-soft)", overflowY: "auto" }}>
              <LogicTracer
                project={project}
                ast={analysis?.flowchartCandidate?.ast || analysis?.specificationCandidate?.ast}
                onHighlightFlowchartNode={(nodeId) => setSelectedNode(nodeId)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ProjectModals
        activeModal={activeModal}
        setActiveModal={setActiveModal}
        project={project}
        workflow={workflow}
        switchWorkflow={switchWorkflow}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        newProjectWorkflow={newProjectWorkflow}
        setNewProjectWorkflow={setNewProjectWorkflow}
        onCreateProject={async (name, wf) => {
          let proj: ProjectEnvelope;
          const cleanName = (name || "").trim() || "Untitled Project";
          if (backendStatus === "connected") {
            try {
              proj = await mapToCodeApi.createProject(cleanName);
            } catch {
              proj = createProject({ name: cleanName, projectId: uid() }) as unknown as ProjectEnvelope;
            }
          } else {
            proj = createProject({ name: cleanName, projectId: uid() }) as unknown as ProjectEnvelope;
          }
          if (!proj.projectId) {
            proj.projectId = uid();
          }
          changeProject(proj, wf);
          setNewProjectName("");
          setNotice(`Created new project "${proj.name}".`);
        }}
        savedProjects={savedProjects}
        onOpenProject={(id) => {
          if (storeRef.current) {
            const loaded = storeRef.current.load(id);
            changeProject(loaded);
          }
        }}
        onDeleteProject={(id, name) => {
          if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
          if (storeRef.current) {
            storeRef.current.delete(id);
            const remaining: ProjectEnvelope[] = storeRef.current.list();
            setSavedProjects(remaining);
            if (id === project?.projectId) {
              if (remaining.length > 0) {
                changeProject(storeRef.current.load(remaining[0].projectId));
              } else {
                const blank = createProject({ name: "New Project" }) as unknown as ProjectEnvelope;
                storeRef.current.save(blank);
                changeProject(blank);
              }
            }
          }
        }}
        sampleDetails={SAMPLE_DETAILS}
        sampleWorkflowTarget={sampleWorkflowTarget}
        setSampleWorkflowTarget={setSampleWorkflowTarget}
        onSelectSample={(key, wf) => {
          const factory = SAMPLE_FACTORIES[key] || createEvenOddExample;
          const loaded = factory();
          const sampleCopy: ProjectEnvelope = {
            ...loaded,
            projectId: uid(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          changeProject(sampleCopy, wf);
          setNotice(`Loaded sample "${sampleCopy.name}".`);
        }}
        onExport={async () => {
          if (!project) return;
          let projToExport = project;
          if (backendStatus === "connected") {
            try {
              projToExport = await mapToCodeApi.exportProject(project);
            } catch {
              projToExport = project;
            }
          }
          downloadFile(
            `${projToExport.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
            exportProjectJson(projToExport),
            "application/json"
          );
        }}
        onImportFile={async (file) => {
          try {
            const text = await file.text();
            let imported: ProjectEnvelope;
            if (backendStatus === "connected") {
              try {
                const parsed = JSON.parse(text);
                imported = await mapToCodeApi.importProject(parsed);
              } catch {
                if (storeRef.current) {
                  imported = storeRef.current.import(text);
                } else {
                  throw new Error("Local storage store not available.");
                }
              }
            } else if (storeRef.current) {
              imported = storeRef.current.import(text);
            } else {
              throw new Error("Local storage store not available.");
            }
            if (storeRef.current) {
              storeRef.current.save(imported);
            }
            changeProject(imported);
            setNotice("Project restored and verified successfully!");
          } catch (err: any) {
            setError(err?.message || "Failed to import file.");
          }
        }}
        styles={styles}
      />
    </div>
  );
}
