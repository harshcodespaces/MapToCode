"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import styles from "./IdeWorkspace.module.css";
import FlowCanvas, {
  type CanvasTheme,
  type EdgeRouting,
  getNodeDimensions,
} from "@/components/canvas/FlowCanvas";
import {
  createEvenOddExample,
  createNumberComparisonExample,
  createEligibilityExample,
  createGradeExample,
} from "@/core/examples.js";
import {
  createProject,
  createProjectStore,
  exportProjectJson,
  importProjectJson,
  renameProject,
  setProjectApproval,
  updateFlowchartSemantics,
  updateSpecification,
} from "@/core/project-service.js";
import { adaptFlowchartToAst, adaptSpecificationToAst } from "@/core/adapters.js";
import { generatePythonFromAst } from "@/core/python-generator.js";
import { generateCFromAst } from "@/core/c-generator.js";
import { generateJavaFromAst } from "@/core/java-generator.js";
import { validateAstSemantics } from "@/core/ast-validation.js";
import { reconcileAstCandidates } from "@/core/reconciliation.js";
import { syncProjectSpecification } from "@/core/reconciliation-sync.js";
import {
  resolveNewFileName,
  createEmptyProjectWorkspace,
  getDefaultProjectWorkspace,
  loadProjectWorkspace,
  saveProjectWorkspace,
  deleteProjectWorkspace,
  renameFileInWorkspace,
  renameFolderInWorkspace,
} from "@/core/workspace-files.js";
import { generateAstTrace } from "@/core/trace-engine.js";
import { parsePseudocodeToFlowchart } from "@/core/pseudocode-parser.js";
import { explainFlowchartToLearner } from "@/core/flowchart-explanation.js";
import LogicTracer from "@/components/tracer/LogicTracer";
import type {
  ProjectEnvelope,
  FlowchartGraph,
  FlowchartNode,
  FlowchartEdge,
  ScalarType,
} from "@/types/contracts";

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

function persistWorkspaceSnapshot(
  projectId: string,
  files: ExplorerFile[],
  folders: ExplorerFolder[],
  openTabs: string[],
  activeTab: string,
): void {
  if (typeof window === "undefined") return;
  saveProjectWorkspace(window.localStorage, projectId, { files, folders, openTabs, activeTab });
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
    return { valid: false, message: "Must start with a letter/underscore and contain only alphanumeric/underscores" };
  }
  if (RESERVED_KEYWORDS.has(trimmed)) {
    return { valid: false, message: `"${trimmed}" is a reserved programming keyword` };
  }
  return { valid: true };
}

interface ExplorerFile {
  id: string;
  name: string;
  type: "fc" | "ps" | "text";
  content?: string;
  folderId?: string | null;
  flowchart?: FlowchartGraph;
}

interface ExplorerFolder {
  id: string;
  name: string;
  isOpen: boolean;
}

function MobileBottomNav({
  onFiles,
  onCanvas,
  onCode,
  onRun,
}: {
  onFiles: () => void;
  onCanvas: () => void;
  onCode: () => void;
  onRun: () => void;
}): React.JSX.Element {
  const items = [
    { key: "files", label: "Files", onClick: onFiles, icon: "files" },
    { key: "canvas", label: "Canvas", onClick: onCanvas, icon: "canvas" },
    { key: "code", label: "Code", onClick: onCode, icon: "code" },
    { key: "run", label: "Run", onClick: onRun, icon: "run" },
  ] as const;

  const icons: Record<string, React.ReactNode> = {
    files: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2h6.5A1.5 1.5 0 0 1 20 7.5v10A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
        <path d="M4 8h16" />
      </svg>
    ),
    canvas: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
        <path d="M10 7h4a2 2 0 0 1 2 2v5M7 10v4a2 2 0 0 0 2 2h5" />
      </svg>
    ),
    code: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
      </svg>
    ),
    run: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" />
      </svg>
    ),
  };

  return (
    <nav className={styles.mobileBottomNav} aria-label="Mobile workspace navigation">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={styles.mobileBottomNavItem}
          onClick={item.onClick}
          aria-label={item.label}
        >
          <span className={styles.mobileBottomNavIcon}>{icons[item.icon]}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function IdeWorkspace(): React.JSX.Element {
  // Main Project State: initialize from existing saved projects or start fresh
  const [project, setProject] = useState<ProjectEnvelope>(() =>
    createProject({ name: "My First Algorithm" }) as unknown as ProjectEnvelope
  );
  const [savedProjects, setSavedProjects] = useState<ProjectEnvelope[]>([]);
  const storeRef = useRef<any>(null);
  const graphHistory = useRef<{ past: FlowchartGraph[]; future: FlowchartGraph[] }>({ past: [], future: [] });
  const copiedFileRef = useRef<ExplorerFile | null>(null);
  const copiedNodeRef = useRef<FlowchartNode | null>(null);

  // Files, Folders & Tabs State (VS Code File Explorer isolated per project)
  const [explorerFiles, setExplorerFiles] = useState<ExplorerFile[]>(
  () => getDefaultProjectWorkspace(project).files as ExplorerFile[]
);
  const [explorerFolders, setExplorerFolders] = useState<ExplorerFolder[]>(
    () => getDefaultProjectWorkspace(project).folders as ExplorerFolder[]
  );
  const [openTabs, setOpenTabs] = useState<string[]>(
    () => getDefaultProjectWorkspace(project).openTabs
  );
  const [activeTab, setActiveTab] = useState<string>(
    () => getDefaultProjectWorkspace(project).activeTab
  );

  // Inline Explorer Creation State (VS Code style)
  const [isCreatingItem, setIsCreatingItem] = useState<"file" | "folder" | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState<string>("");
  const [itemError, setItemError] = useState<{ title: string; message: string } | null>(null);

  const [activeActivity, setActiveActivity] = useState<"explorer" | "search" | "git" | "debug">("explorer");
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Selection & Canvas state
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [activeTool, setActiveTool] = useState<"select" | "pan">("select");
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showMinimap, setShowMinimap] = useState<boolean>(false);
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>("dots");
  const [edgeRouting, setEdgeRouting] = useState<EdgeRouting>("curved");

  // Right Subwindows State ("Blocks" & "Properties")
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(true);
  const [blocksWindowOpen, setBlocksWindowOpen] = useState<boolean>(true);
  const [blocksWindowCollapsed, setBlocksWindowCollapsed] = useState<boolean>(false);
  const [blocksWindowFloating, setBlocksWindowFloating] = useState<boolean>(false);
  const [blocksWindowPos, setBlocksWindowPos] = useState<{ x: number; y: number }>({ x: 20, y: 50 });

  const [propsWindowOpen, setPropsWindowOpen] = useState<boolean>(true);
  const [propsWindowCollapsed, setPropsWindowCollapsed] = useState<boolean>(false);
  const [propsWindowFloating, setPropsWindowFloating] = useState<boolean>(false);
  const [propsWindowPos, setPropsWindowPos] = useState<{ x: number; y: number }>({ x: 250, y: 20 });

  const [draggingWindow, setDraggingWindow] = useState<{
    type: "blocks" | "props";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handleWindowDragStart = (e: React.MouseEvent, type: "blocks" | "props") => {
    e.preventDefault();
    const orig = type === "blocks" ? blocksWindowPos : propsWindowPos;
    setDraggingWindow({
      type,
      startX: e.clientX,
      startY: e.clientY,
      origX: orig.x,
      origY: orig.y,
    });
  };

  useEffect(() => {
    if (!draggingWindow) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - draggingWindow.startX;
      const dy = e.clientY - draggingWindow.startY;
      const nextX = Math.max(10, draggingWindow.origX + dx);
      const nextY = Math.max(10, draggingWindow.origY + dy);
      if (draggingWindow.type === "blocks") {
        setBlocksWindowPos({ x: nextX, y: nextY });
      } else {
        setPropsWindowPos({ x: nextX, y: nextY });
      }
    };
    const handleMouseUp = () => {
      setDraggingWindow(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingWindow]);

  const [showAddBlockMenu, setShowAddBlockMenu] = useState<boolean>(false);

  // Bottom Panel State ("Terminal", "Generated Code", "Output", "Problems")
  const [bottomTab, setBottomTab] = useState<"terminal" | "generatedCode" | "output" | "problems">("terminal");
  const [codeGenLang, setCodeGenLang] = useState<"python" | "c" | "java">("python");
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState<boolean>(false);
  const [bottomPanelMaximized, setBottomPanelMaximized] = useState<boolean>(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number>(220);
  const [isDraggingPanel, setIsDraggingPanel] = useState<boolean>(false);
  const dragPanelStartY = useRef<number>(0);
  const dragPanelStartHeight = useRef<number>(220);

  const handleStartResizePanel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragPanelStartY.current = e.clientY;
    dragPanelStartHeight.current = bottomPanelHeight;
    setIsDraggingPanel(true);
    if (bottomPanelCollapsed) setBottomPanelCollapsed(false);
    if (bottomPanelMaximized) setBottomPanelMaximized(false);
  };

  useEffect(() => {
    if (!isDraggingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragPanelStartY.current - e.clientY;
      const minH = 80;
      const maxH = typeof window !== "undefined" ? Math.max(minH, window.innerHeight - 120) : 600;
      const nextH = Math.min(Math.max(dragPanelStartHeight.current + deltaY, minH), maxH);
      setBottomPanelHeight(nextH);
    };

    const handleMouseUp = () => {
      setIsDraggingPanel(false);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingPanel]);

  // Terminal state
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    "MapToCode Integrated Terminal [Version 1.0.0]",
    "Type 'python main.py', 'ls', or click ▶ Run to execute algorithm.",
    "",
  ]);
  const [terminalInput, setTerminalInput] = useState<string>("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [waitingForInput, setWaitingForInput] = useState<{
    varName: string;
    varType: string;
    prompt: string;
    targetFile: string;
  } | null>(null);
  const [collectedInputs, setCollectedInputs] = useState<Record<string, any>>({});
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);

  // In-app Rename & Delete Modals (custom popup instead of browser popups)
  const [renameModal, setRenameModal] = useState<{
    id: string;
    currentName: string;
    isFolder: boolean;
  } | null>(null);
  const [renameInputName, setRenameInputName] = useState<string>("");

  const [deleteModal, setDeleteModal] = useState<{
    id: string;
    name: string;
    isFolder?: boolean;
    isProject?: boolean;
  } | null>(null);

  // Explorer Accordions
  const [explorerOpen, setExplorerOpen] = useState<boolean>(true);
  const [outlineOpen, setOutlineOpen] = useState<boolean>(true);
  const [timelineOpen, setTimelineOpen] = useState<boolean>(false);

  // Modals state
  const [activeModal, setActiveModal] = useState<"newProject" | "projects" | "samples" | "guide" | "settings" | "traceLogic" | null>(null);
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [newProjectCodeLevel, setNewProjectCodeLevel] = useState<"beginner" | "intermediate" | "professional">("beginner");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("blank");
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>("");

  // In-app companion file popup modal (custom IDE dialog with proper alignment instead of browser popup)
  const [companionModal, setCompanionModal] = useState<{
    isOpen: boolean;
    createdFileName: string;
    createdFileType: "fc" | "ps";
    companionFileName: string;
    folderId: string | null;
    folderName: string | null;
  } | null>(null);
  const [companionInputName, setCompanionInputName] = useState<string>("");

  // Recently deleted file backup for instant Undo & Remake
  const [recentlyDeleted, setRecentlyDeleted] = useState<{
    file: ExplorerFile;
    tabIdx?: number;
  } | null>(null);

  // Unsaved files tracking (displays dot indicator and requires Save to sync changes)
  const [unsavedFiles, setUnsavedFiles] = useState<Set<string>>(new Set());

  // Flowchart full screen state & ref
  const [isFlowchartFullscreen, setIsFlowchartFullscreen] = useState<boolean>(false);
  const flowchartWrapperRef = useRef<HTMLDivElement>(null);

  const filteredProjects = useMemo(() => {
    if (!projectSearchQuery.trim()) return savedProjects;
    const q = projectSearchQuery.toLowerCase();
    return savedProjects.filter((p) => p.name?.toLowerCase().includes(q));
  }, [savedProjects, projectSearchQuery]);

  const handleCreateProjectSubmit = () => {
    // 1. Immediately auto-save current project envelope and workspace files
    if (project && storeRef.current) {
      try {
        storeRef.current.save(project);
        setSavedProjects(storeRef.current.list());
      } catch {}
    }
    if (project?.projectId && typeof window !== "undefined") {
      saveProjectWorkspace(window.localStorage, project.projectId, {
        files: explorerFiles,
        folders: explorerFolders,
        openTabs,
        activeTab,
      });
    }

    // 2. Prepare new project
    const templateTitle = SAMPLE_DETAILS.find((s) => s.key === selectedTemplate)?.title;
    const name = newProjectName.trim() || (selectedTemplate === "blank" ? "Untitled Flowchart" : templateTitle || "My Algorithm");
    let freshProject: ProjectEnvelope;
    if (selectedTemplate !== "blank" && SAMPLE_FACTORIES[selectedTemplate]) {
      freshProject = SAMPLE_FACTORIES[selectedTemplate]();
      freshProject.name = name;
      freshProject.projectId = (globalThis.crypto?.randomUUID?.() || `proj-${Date.now()}`);
      freshProject.codeLevel = newProjectCodeLevel;
    } else {
      freshProject = createProject({ name, codeLevel: newProjectCodeLevel }) as unknown as ProjectEnvelope;
    }

    // 3. New project is created clean without any folder or file!
    if (typeof window !== "undefined") {
      const emptyWs = createEmptyProjectWorkspace(freshProject.projectId);
      saveProjectWorkspace(window.localStorage, freshProject.projectId, emptyWs);
    }

    // 4. Switch to the new project and initialize its empty workspace
    changeProject(freshProject);
    setNewProjectName("");
    setNewProjectCodeLevel("beginner");
    setSelectedTemplate("blank");
    setActiveModal(null);
    setNotice(`🎉 Created new project "${freshProject.name}" (clean workspace)`);
    setTimeout(() => setNotice(""), 3000);
  };

  // Helper to create a single file in the workspace
  const createExplorerFile = useCallback(
    (rawInput: string, folderId: string | null = null, skipCompanionPrompt: boolean = false) => {
      const targetFolder = folderId ? explorerFolders.find((f) => f.id === folderId) : null;
      const enteredName = rawInput.trim().split("/").pop() || "";
      const extension = enteredName.slice(enteredName.lastIndexOf(".")).toLowerCase();
      const allowedExtensions = new Set([".fc", ".ps", ".txt"]);
      if (!enteredName.includes(".") || enteredName.startsWith(".") || enteredName.endsWith(".")) {
        setItemError({
          title: "File extension required",
          message: "Add an extension to the file name. MapToCode allows only .fc, .ps, and .txt files.",
        });
        return null;
      }
      if (!allowedExtensions.has(extension)) {
        setItemError({
          title: "Unsupported file extension",
          message: `“${extension}” is not supported. Use only .fc, .ps, or .txt.`,
        });
        return null;
      }
      const resolved = resolveNewFileName(rawInput, targetFolder?.name);
      if (!resolved) return null;
      const { fileName: finalName, fileType, baseName } = resolved;

      if (explorerFiles.some((f) => f.name.toLowerCase() === finalName.toLowerCase())) {
        setItemError({ title: "File already exists", message: `A file named “${finalName}” already exists. Choose a different name.` });
        return null;
      }

      const defaultContent =
        fileType === "text"
          ? `# ${finalName}\n# Created ${new Date().toLocaleTimeString()}\n\n`
          : fileType === "ps"
          ? `# ${finalName} — Algorithm Specification\nBEGIN\n    // Algorithm steps\nEND\n`
          : "";

      const initialFlowchart: FlowchartGraph = {
        schemaVersion: "1.0.0",
        revision: 1,
        nodes: [
          { id: "start-1", kind: "start", payload: {} },
          { id: "end-1", kind: "end", payload: {} },
        ],
        edges: [
          { id: "edge-start-end", from: "start-1", to: "end-1" },
        ],
        layout: {
          positions: {
            "start-1": { x: 380, y: 50 },
            "end-1": { x: 380, y: 220 },
          },
          zoom: 1,
        },
      };

      const newFile: ExplorerFile = {
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: finalName,
        type: fileType,
        content: defaultContent,
        folderId: folderId || null,
        flowchart: fileType === "fc" ? initialFlowchart : undefined,
      };

      setExplorerFiles((prev) => [...prev, newFile]);
      setOpenTabs((prev) => (prev.includes(finalName) ? prev : [...prev, finalName]));
      if (fileType === "fc") {
        setProject((curr) => {
          if (!curr) return curr;
          return updateFlowchartSemantics(curr, structuredClone(initialFlowchart));
        });
      }
      setActiveTab(finalName);
      setNotice(`📄 Created file "${finalName}"`);
      setTimeout(() => setNotice(""), 3000);

      // When .fc, .fs, or .ps file is created, show our custom properly aligned companion popup (if not already existing)
      if (!skipCompanionPrompt && (fileType === "fc" || fileType === "ps")) {
        const companionExt = fileType === "fc" ? ".ps" : ".fc";
        const rawBase = baseName.includes("/") ? baseName.split("/").pop()! : baseName;
        const companionBase = rawBase.replace(/\.(fc|fs|ps)$/i, "") + companionExt;
        const companionFullName = targetFolder ? `${targetFolder.name}/${companionBase}` : companionBase;

        const companionExists = explorerFiles.some(
          (f) => f.name.toLowerCase() === companionFullName.toLowerCase()
        );
        if (!companionExists) {
          setCompanionModal({
            isOpen: true,
            createdFileName: finalName,
            createdFileType: fileType,
            companionFileName: companionFullName,
            folderId: folderId || null,
            folderName: targetFolder?.name || null,
          });
          setCompanionInputName(companionBase);
        }
      }

      return { file: newFile, resolved };
    },
    [explorerFiles, explorerFolders]
  );

  // VS Code Explorer File / Folder Handlers
  const isConfirmingNewItemRef = useRef(false);
  const handleConfirmNewItem = () => {
    if (itemError) return;
    if (isConfirmingNewItemRef.current) return;
    if (!isCreatingItem) return;
    const raw = newItemName.trim();
    if (!raw) {
      setIsCreatingItem(null);
      setNewItemName("");
      return;
    }

    isConfirmingNewItemRef.current = true;
    setTimeout(() => {
      isConfirmingNewItemRef.current = false;
    }, 300);

    if (isCreatingItem === "folder") {
      if (explorerFolders.some((f) => f.name.toLowerCase() === raw.toLowerCase())) {
        setItemError({ title: "Folder already exists", message: `A folder named “${raw}” already exists. Choose a different name.` });
        return;
      }
      const newFolder: ExplorerFolder = {
        id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: raw,
        isOpen: true,
      };
      setExplorerFolders((prev) => [...prev, newFolder]);
      setSelectedFolderId(newFolder.id);
      setIsCreatingItem(null);
      setNewItemName("");
      setNotice(`📁 Created folder "${raw}" — click +📄 to create a file inside it`);
      setTimeout(() => setNotice(""), 3000);
      return;
    }

    // Creating a file:
    const targetFId = targetFolderId;
    const result = createExplorerFile(raw, targetFId);
    if (result) {
      setIsCreatingItem(null);
      setTargetFolderId(null);
      setNewItemName("");
    }
  };

  const handleSkipCompanionModal = () => {
    setCompanionModal(null);
  };

  const handleCancelNewItem = () => {
    setIsCreatingItem(null);
    setTargetFolderId(null);
    setNewItemName("");
  };

  const handleOpenFile = (fileName: string) => {
    // If leaving a .fc file, preserve its current flowchart so files don't overwrite each other
    if (activeTab && activeTab !== fileName) {
      const curFile = explorerFiles.find((f) => f.name === activeTab);
      if (curFile && curFile.type === "fc") {
        setExplorerFiles((prev) =>
          prev.map((f) => (f.name === activeTab ? { ...f, flowchart: structuredClone(project.flowchart) } : f))
        );
      }
    }
    // If opening a .fc file, restore its isolated flowchart
    const targetFile = explorerFiles.find((f) => f.name === fileName);
    if (targetFile && targetFile.type === "fc" && targetFile.flowchart) {
      setProject((curr) => {
        if (!curr) return curr;
        return updateFlowchartSemantics(curr, structuredClone(targetFile.flowchart!));
      });
    }

    setOpenTabs((prev) => (prev.includes(fileName) ? prev : [...prev, fileName]));
    setActiveTab(fileName);
  };

  const handleCloseTab = (fileName: string) => {
    const nextTabs = openTabs.filter((t) => t !== fileName);
    setOpenTabs(nextTabs);
    if (activeTab === fileName) {
      const closedIdx = openTabs.indexOf(fileName);
      const nextActive = nextTabs.length > 0 ? nextTabs[Math.max(0, closedIdx - 1)] : "";
      setActiveTab(nextActive);
    }
  };

  const handleUndoDelete = () => {
    if (!recentlyDeleted) return;
    const { file } = recentlyDeleted;
    setExplorerFiles((prev) => (prev.some((f) => f.id === file.id) ? prev : [...prev, file]));
    setOpenTabs((prev) => (prev.includes(file.name) ? prev : [...prev, file.name]));
    setActiveTab(file.name);
    setRecentlyDeleted(null);
    setNotice(`↺ Restored "${file.name}"!`);
    setTimeout(() => setNotice(""), 3500);
  };

  const performDeleteFile = (fileId: string, fileName: string) => {
    const targetFile = explorerFiles.find((f) => f.id === fileId);
    if (targetFile) {
      setRecentlyDeleted({ file: targetFile, tabIdx: openTabs.indexOf(fileName) });
    }
    setExplorerFiles((prev) => prev.filter((f) => f.id !== fileId));
    setOpenTabs((prev) => {
      const remaining = prev.filter((t) => t !== fileName);
      if (activeTab === fileName) {
        setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1] : "");
      }
      return remaining;
    });
    if (selectedFileId === fileId) {
      setSelectedFileId(null);
    }
    if (fileName.endsWith(".ps")) {
      setNotice(`🗑️ Deleted "${fileName}". You can remake it anytime from Flowchart (.fc)!`);
    } else if (fileName.endsWith(".fc") || fileName.endsWith(".fs")) {
      setNotice(`🗑️ Deleted "${fileName}". You can remake it anytime from Pseudocode (.ps)!`);
    } else {
      setNotice(`🗑️ Deleted "${fileName}".`);
    }
    setTimeout(() => setNotice(""), 5000);
  };

  const performDeleteFolder = (folderId: string, folderName: string) => {
    setExplorerFolders((prev) => prev.filter((f) => f.id !== folderId));
    const filesInFolder = explorerFiles.filter((f) => f.folderId === folderId);
    setExplorerFiles((prev) => prev.filter((f) => f.folderId !== folderId));
    setOpenTabs((prev) => {
      const removedNames = new Set(filesInFolder.map((f) => f.name));
      const remaining = prev.filter((t) => !removedNames.has(t));
      if (removedNames.has(activeTab)) {
        setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1] : "");
      }
      return remaining;
    });
    if (selectedFolderId === folderId) {
      setSelectedFolderId(null);
    }
    setNotice(`Deleted folder "${folderName}"`);
    setTimeout(() => setNotice(""), 3000);
  };

  const handleDeleteFile = (fileId: string, fileName: string) => {
    setDeleteModal({ id: fileId, name: fileName, isFolder: false });
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    setDeleteModal({ id: folderId, name: folderName, isFolder: true });
  };

  const handleConfirmDelete = () => {
    if (!deleteModal) return;
    if (deleteModal.isProject) {
      if (storeRef.current) {
        storeRef.current.delete(deleteModal.id);
        deleteProjectWorkspace(window.localStorage, deleteModal.id);
        const remaining = storeRef.current.list();
        setSavedProjects(remaining);
        if (project.projectId === deleteModal.id) {
          if (remaining.length > 0) {
            changeProject(remaining[0]);
          } else {
            const fresh = createProject({ name: "My First Algorithm" }) as unknown as ProjectEnvelope;
            changeProject(fresh);
          }
        }
        setNotice(`🗑 Deleted project "${deleteModal.name}"`);
        setTimeout(() => setNotice(""), 3000);
      }
    } else if (deleteModal.isFolder) {
      performDeleteFolder(deleteModal.id, deleteModal.name);
    } else {
      performDeleteFile(deleteModal.id, deleteModal.name);
    }
    setDeleteModal(null);
  };

  const handleDeleteSelected = useCallback(() => {
    if (selectedFileId) {
      const file = explorerFiles.find((f) => f.id === selectedFileId);
      if (!file) return;
      if (file.name === "main.fc" || file.name === "algorithm.ps") {
        setNotice(`⚠️ "${file.name}" is a core project file and cannot be deleted.`);
        setTimeout(() => setNotice(""), 3000);
        return;
      }
      handleDeleteFile(file.id, file.name);
      return;
    }

    if (selectedFolderId) {
      const folder = explorerFolders.find((f) => f.id === selectedFolderId);
      if (!folder) return;
      if (folder.id === "folder-assets") {
        setNotice(`⚠️ "${folder.name}" is a core project folder and cannot be deleted.`);
        setTimeout(() => setNotice(""), 3000);
        return;
      }
      handleDeleteFolder(folder.id, folder.name);
      return;
    }

    setNotice("Select a file or folder in the Explorer to delete (or press Del).");
    setTimeout(() => setNotice(""), 2500);
  }, [selectedFileId, selectedFolderId, explorerFiles, explorerFolders]);

  const handleCopyFile = useCallback(() => {
    if (!selectedFileId) {
      setNotice("Select a file in Explorer to copy (Ctrl+C).");
      setTimeout(() => setNotice(""), 2500);
      return;
    }
    const file = explorerFiles.find((f) => f.id === selectedFileId);
    if (!file) return;
    copiedFileRef.current = file;
    try {
      if (file.content) {
        navigator.clipboard.writeText(file.content);
      }
    } catch {}
    setNotice(`📋 Copied file "${file.name}" (Ctrl+V to paste)`);
    setTimeout(() => setNotice(""), 3000);
  }, [selectedFileId, explorerFiles]);

  const handlePasteFile = useCallback(() => {
    if (!copiedFileRef.current) {
      setNotice("No file in clipboard. Select a file and press Ctrl+C first.");
      setTimeout(() => setNotice(""), 2500);
      return;
    }
    const source = copiedFileRef.current;
    const parts = source.name.split(".");
    const ext = parts.length > 1 ? `.${parts.pop()}` : "";
    const base = parts.join(".");

    let copyIndex = 1;
    let newName = `${base}_copy${ext}`;
    while (explorerFiles.some((f) => f.name === newName)) {
      copyIndex++;
      newName = `${base}_copy${copyIndex}${ext}`;
    }

    const newFile: ExplorerFile = {
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newName,
      type: source.type,
      content: source.content || "",
      folderId: selectedFolderId || source.folderId || null,
    };

    setExplorerFiles((prev) => [...prev, newFile]);
    setOpenTabs((prev) => (prev.includes(newName) ? prev : [...prev, newName]));
    setActiveTab(newName);
    setSelectedFileId(newFile.id);
    setNotice(`📄 Pasted file "${newName}"`);
    setTimeout(() => setNotice(""), 3000);
  }, [explorerFiles, selectedFolderId]);

  const handleRenameSelected = useCallback(() => {
    if (selectedFileId) {
      const file = explorerFiles.find((f) => f.id === selectedFileId);
      if (!file) return;
      if (file.name === "main.fc" || file.name === "algorithm.ps") {
        setNotice(`⚠️ "${file.name}" is a core project file and cannot be renamed.`);
        setTimeout(() => setNotice(""), 3000);
        return;
      }
      const promptName = file.name.includes("/") ? file.name.split("/").pop()! : file.name;
      setRenameModal({ id: file.id, currentName: promptName, isFolder: false });
      setRenameInputName(promptName);
      return;
    }

    if (selectedFolderId) {
      const folder = explorerFolders.find((f) => f.id === selectedFolderId);
      if (!folder) return;
      if (folder.id === "folder-assets") {
        setNotice(`⚠️ Default folder "${folder.name}" cannot be renamed.`);
        setTimeout(() => setNotice(""), 3000);
        return;
      }
      setRenameModal({ id: folder.id, currentName: folder.name, isFolder: true });
      setRenameInputName(folder.name);
      return;
    }

    setNotice("Select a file or folder in Explorer to rename (F2)");
    setTimeout(() => setNotice(""), 2500);
  }, [selectedFileId, selectedFolderId, explorerFiles, explorerFolders]);

  const handleConfirmRename = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameModal) return;
    const trimmed = renameInputName.trim();
    if (!trimmed || trimmed === renameModal.currentName) {
      setRenameModal(null);
      return;
    }

    const wsState = {
      files: explorerFiles,
      folders: explorerFolders,
      openTabs,
      activeTab,
    };

    if (renameModal.isFolder) {
      const result = renameFolderInWorkspace(wsState, renameModal.id, trimmed);
      if (!result.success) {
        setNotice(`⚠️ ${result.reason}`);
        setTimeout(() => setNotice(""), 3000);
        return;
      }
      const updatedWs = result.workspace as any;
      setExplorerFolders(updatedWs.folders);
      setExplorerFiles(updatedWs.files);
      setOpenTabs(updatedWs.openTabs);
      setActiveTab(updatedWs.activeTab);
      setNotice(`✏️ Renamed folder to "${result.newFolderName}"`);
    } else {
      const result = renameFileInWorkspace(wsState, renameModal.id, trimmed);
      if (!result.success) {
        setNotice(`⚠️ ${result.reason}`);
        setTimeout(() => setNotice(""), 3000);
        return;
      }
      const updatedWs = result.workspace as any;
      setExplorerFiles(updatedWs.files);
      setOpenTabs(updatedWs.openTabs);
      setActiveTab(updatedWs.activeTab);
      setNotice(`✏️ Renamed file to "${result.newName}"`);
    }
    setTimeout(() => setNotice(""), 3000);
    setRenameModal(null);
  };

  // Notice / feedback
  const [notice, setNotice] = useState<string>("");

  // Initialize Store and load initial project
  useEffect(() => {
    document.body.style.backgroundColor = "#1e1e1e";
    document.body.style.overflow = "hidden";
    try {
      const store = createProjectStore(window.localStorage);
      storeRef.current = store;
      const list = store.list();
      setSavedProjects(list);

      const params = new URLSearchParams(window.location.search);
      const isNew = params.get("new") === "1" || params.get("new") === "true";
      const sampleKey = params.get("sample");

      if (sampleKey && SAMPLE_FACTORIES[sampleKey]) {
        const sampleProj = SAMPLE_FACTORIES[sampleKey]();
        changeProject(sampleProj);
        try {
          window.history.replaceState({}, "", "/workspace");
        } catch {}
      } else if (isNew) {
        setActiveModal("newProject");
        try {
          window.history.replaceState({}, "", "/workspace");
        } catch {}
      } else if (list.length > 0) {
        const currentInList = list.find((p: any) => p.projectId === project?.projectId);
        if (!currentInList) {
          const target = list[0];
          setProject(target);
          const ws = loadProjectWorkspace(window.localStorage, target);
          setExplorerFiles(ws.files as ExplorerFile[]);
          setExplorerFolders(ws.folders as ExplorerFolder[]);
          setOpenTabs(ws.openTabs);
          setActiveTab(ws.activeTab);
        }
      }
    } catch {
      // LocalStorage unavailable
    }
    return () => {
      document.body.style.backgroundColor = "";
      document.body.style.overflow = "";
    };
  }, []);

  // Auto-save project contract to localStorage
  useEffect(() => {
    if (!project || !storeRef.current) return;
    const timer = setTimeout(() => {
      try {
        storeRef.current.save(project);
        setSavedProjects(storeRef.current.list());
      } catch {
        // ignore
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [project]);

  // Auto-save project workspace (files, folders, tabs) to localStorage
  useEffect(() => {
    if (!project?.projectId || typeof window === "undefined") return;
    const timer = setTimeout(() => {
      saveProjectWorkspace(window.localStorage, project.projectId, {
        files: explorerFiles,
        folders: explorerFolders,
        openTabs,
        activeTab,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [project?.projectId, explorerFiles, explorerFolders, openTabs, activeTab]);

  // Click outside to dismiss menus
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest(`.${styles.titlebarMenus}`)) {
        setActiveMenu(null);
      }
      if (!(e.target as HTMLElement)?.closest(`.${styles.addBlockDropdownBtn}`)) {
        setShowAddBlockMenu(false);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Auto scroll terminal to bottom on change (only when terminal tab is visible)
  useEffect(() => {
    if (!bottomPanelCollapsed && bottomTab === "terminal") {
      terminalBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalHistory, bottomPanelCollapsed, bottomTab]);

  // AST Analysis & Diagnostics
  const analysis = useMemo(() => {
    if (!project) return null;
    const specificationCandidate = adaptSpecificationToAst(project.specification, { projectId: project.projectId });
    const flowchartCandidate = adaptFlowchartToAst(project.flowchart, { projectId: project.projectId });
    const reconciliation = reconcileAstCandidates(specificationCandidate, flowchartCandidate);
    const specValidation = specificationCandidate.ast ? validateAstSemantics(specificationCandidate.ast) : null;
    const graphValidation = flowchartCandidate.ast ? validateAstSemantics(flowchartCandidate.ast) : null;
    return { specificationCandidate, flowchartCandidate, reconciliation, specValidation, graphValidation };
  }, [project]);

  // Active AST for the currently open file / flowchart
  const activeAst = useMemo(() => {
    const curFile = explorerFiles.find((f) => f.name === activeTab);
    if (activeTab && (activeTab === "algorithm.ps" || activeTab.endsWith(".ps"))) {
      if (curFile?.content) {
        try {
          const parsed = parsePseudocodeToFlowchart(curFile.content);
          if (parsed.success && parsed.flowchart) {
            const adapted = adaptFlowchartToAst(parsed.flowchart as FlowchartGraph, { projectId: project.projectId });
            if (adapted.ast) return adapted.ast;
          }
        } catch (_) {}
      }
    } else if (curFile && curFile.type === "fc" && curFile.flowchart) {
      try {
        const adapted = adaptFlowchartToAst(curFile.flowchart, { projectId: project.projectId });
        if (adapted.ast) return adapted.ast;
      } catch (_) {}
    }
    return analysis?.flowchartCandidate?.ast || null;
  }, [activeTab, explorerFiles, project, analysis]);

  // Real-time generated code for Python, C, and Java
  const generatedCodes = useMemo(() => {
    if (!activeAst) {
      return {
        python: "# Connect Start and End nodes to generate Python code.",
        c: "// Connect Start and End nodes to generate C code.",
        java: "// Connect Start and End nodes to generate Java code.",
      };
    }
    try {
      const options = { codeLevel: project.codeLevel };
      const pyRes = generatePythonFromAst(activeAst, options);
      const cRes = generateCFromAst(activeAst, options);
      const javaRes = generateJavaFromAst(activeAst, options);
      return {
        python: pyRes.code || "# Generating Python...",
        c: cRes.code || "// Generating C...",
        java: javaRes.code || "// Generating Java...",
      };
    } catch (e: any) {
      return {
        python: `# Code generation note: ${e?.message || "Incomplete diagram"}`,
        c: `// Code generation note: ${e?.message || "Incomplete diagram"}`,
        java: `// Code generation note: ${e?.message || "Incomplete diagram"}`,
      };
    }
  }, [activeAst, project.codeLevel]);

  const pythonCode = generatedCodes.python;
  const activePythonCode = generatedCodes.python;

  // Graph History Actions
  const applyGraph = useCallback((change: any) => {
    setProject((current) => {
      if (!current) return current;
      const nextFlowchart = typeof change === "function" ? change(current.flowchart) : change;
      graphHistory.current.past.push(structuredClone(current.flowchart));
      if (graphHistory.current.past.length > 50) graphHistory.current.past.shift();
      graphHistory.current.future = [];
      return updateFlowchartSemantics(current, nextFlowchart);
    });
    setExplorerFiles((prev) =>
      prev.map((f) => {
        if (f.name === activeTab && f.type === "fc") {
          const nextFlowchart = typeof change === "function" ? change(f.flowchart || project.flowchart) : change;
          return { ...f, flowchart: nextFlowchart };
        }
        return f;
      })
    );
    // Mark the active flowchart file as having unsaved changes
    setUnsavedFiles((prev) => {
      const next = new Set(prev);
      if (activeTab) next.add(activeTab);
      return next;
    });
  }, [activeTab, project]);

  const undoGraph = useCallback(() => {
    if (!graphHistory.current.past.length) return;
    const snapshot = graphHistory.current.past.pop()!;
    setProject((current) => {
      if (!current) return current;
      graphHistory.current.future.push(structuredClone(current.flowchart));
      return updateFlowchartSemantics(current, { ...snapshot, revision: current.flowchart.revision });
    });
    setUnsavedFiles((prev) => {
      const next = new Set(prev);
      if (activeTab) next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const redoGraph = useCallback(() => {
    if (!graphHistory.current.future.length) return;
    const snapshot = graphHistory.current.future.pop()!;
    setProject((current) => {
      if (!current) return current;
      graphHistory.current.past.push(structuredClone(current.flowchart));
      return updateFlowchartSemantics(current, { ...snapshot, revision: current.flowchart.revision });
    });
    setUnsavedFiles((prev) => {
      const next = new Set(prev);
      if (activeTab) next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Find companion file for a given file (.fc <-> .ps)
  const getCompanionFile = useCallback(
    (fileOrName: ExplorerFile | string | undefined | null): ExplorerFile | null => {
      if (!fileOrName) return null;
      const file = typeof fileOrName === "string" ? explorerFiles.find((f) => f.name === fileOrName) : fileOrName;
      if (!file) return null;

      const folderId = file.folderId || null;
      const cleanBase = file.name.split("/").pop()!.replace(/\.(fc|fs|ps)$/i, "");

      if (file.type === "fc" || file.name.endsWith(".fc") || file.name.endsWith(".fs")) {
        const companionBase = `${cleanBase}.ps`;
        return (
          explorerFiles.find((f) => {
            if (f.type !== "ps" && !f.name.endsWith(".ps")) return false;
            const candidateBase = f.name.split("/").pop()!.toLowerCase();
            if (folderId) return f.folderId === folderId && candidateBase === companionBase.toLowerCase();
            return !f.folderId && (candidateBase === companionBase.toLowerCase() || (cleanBase.toLowerCase() === "main" && candidateBase === "algorithm.ps"));
          }) || null
        );
      }

      if (file.type === "ps" || file.name.endsWith(".ps")) {
        const companionBase = `${cleanBase}.fc`;
        return (
          explorerFiles.find((f) => {
            if (f.type !== "fc" && !f.name.endsWith(".fc") && !f.name.endsWith(".fs")) return false;
            const candidateBase = f.name.split("/").pop()!.toLowerCase();
            if (folderId) return f.folderId === folderId && [companionBase.toLowerCase(), `${cleanBase}.fs`.toLowerCase()].includes(candidateBase);
            return !f.folderId && (candidateBase === companionBase.toLowerCase() || (cleanBase.toLowerCase() === "algorithm" && ["main.fc", "main.fs"].includes(candidateBase)));
          }) || null
        );
      }

      return null;
    },
    [explorerFiles]
  );

  // Recreate / Remake Pseudocode (.ps) from Flowchart (.fc)
  const remakePseudocodeFromFlowchart = useCallback(
    (sourceFcName: string = activeTab) => {
      const sourceFile = explorerFiles.find((f) => f.name === sourceFcName);
      const flowchartToConvert = sourceFile?.flowchart || project.flowchart;

      const folderId = sourceFile?.folderId || null;
      const targetFolder = folderId ? explorerFolders.find((f) => f.id === folderId) : null;
      const cleanBase = (sourceFile?.name || sourceFcName).split("/").pop()!.replace(/\.(fc|fs)$/i, "");
      let companionBase = `${cleanBase}.ps`;
      if (cleanBase === "main") {
        if (
          explorerFiles.some((f) => f.name === "algorithm.ps") ||
          recentlyDeleted?.file.name === "algorithm.ps"
        ) {
          companionBase = "algorithm.ps";
        }
      }
      const companionName = targetFolder ? `${targetFolder.name}/${companionBase}` : companionBase;

      try {
        const generatedPseudocode = explainFlowchartToLearner(flowchartToConvert).pseudocode;
        const existing = explorerFiles.find(
          (f) => f.name.toLowerCase() === companionName.toLowerCase()
        );

        if (existing) {
          setExplorerFiles((prev) =>
            prev.map((f) =>
              f.id === existing.id ? { ...f, content: generatedPseudocode } : f
            )
          );
          setOpenTabs((prev) => (prev.includes(existing.name) ? prev : [...prev, existing.name]));
          setActiveTab(existing.name);
          setNotice(`✨ Remade "${existing.name}" from Flowchart diagram!`);
          setTimeout(() => setNotice(""), 3500);
        } else {
          const newFile: ExplorerFile = {
            id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: companionName,
            type: "ps",
            content: generatedPseudocode,
            folderId,
          };
          setExplorerFiles((prev) => [...prev, newFile]);
          setOpenTabs((prev) => (prev.includes(companionName) ? prev : [...prev, companionName]));
          setActiveTab(companionName);
          setNotice(`✨ Remade "${companionName}" from Flowchart diagram!`);
          setTimeout(() => setNotice(""), 3500);
        }
      } catch (err: any) {
        setNotice(`⚠️ Could not remake pseudocode: ${err?.message || "Invalid diagram"}`);
        setTimeout(() => setNotice(""), 3500);
      }
    },
    [activeTab, explorerFiles, explorerFolders, project.flowchart, recentlyDeleted]
  );

  // Recreate / Remake Flowchart (.fc) from Pseudocode (.ps)
  const remakeFlowchartFromPseudocode = useCallback(
    (sourcePsName: string = activeTab) => {
      const sourceFile = explorerFiles.find((f) => f.name === sourcePsName);
      const pseudocodeContent =
        sourceFile?.content !== undefined
          ? sourceFile.content
          : explainFlowchartToLearner(project.flowchart).pseudocode;

      const folderId = sourceFile?.folderId || null;
      const targetFolder = folderId ? explorerFolders.find((f) => f.id === folderId) : null;
      const cleanBase = (sourceFile?.name || sourcePsName).split("/").pop()!.replace(/\.ps$/i, "");
      let companionBase = `${cleanBase}.fc`;
      if (cleanBase === "algorithm") {
        if (
          explorerFiles.some((f) => f.name === "main.fc") ||
          recentlyDeleted?.file.name === "main.fc"
        ) {
          companionBase = "main.fc";
        }
      }
      const companionName = targetFolder ? `${targetFolder.name}/${companionBase}` : companionBase;

      const parseRes = parsePseudocodeToFlowchart(pseudocodeContent);
      if (!parseRes.success || !parseRes.flowchart) {
        setNotice(`⚠️ Could not remake flowchart: ${parseRes.error || "Syntax error in pseudocode"}`);
        setTimeout(() => setNotice(""), 4000);
        return;
      }

      try {
        const parsedFlowchart = parseRes.flowchart as FlowchartGraph;
        const existing = explorerFiles.find(
          (f) => f.name.toLowerCase() === companionName.toLowerCase()
        );

        if (existing) {
          setExplorerFiles((prev) =>
            prev.map((f) =>
              f.id === existing.id ? { ...f, flowchart: parsedFlowchart } : f
            )
          );
        } else {
          const newFile: ExplorerFile = {
            id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: companionName,
            type: "fc",
            folderId,
            flowchart: parsedFlowchart,
          };
          setExplorerFiles((prev) => [...prev, newFile]);
        }

        applyGraph(parsedFlowchart);
        setProject((curr) => {
          if (!curr) return curr;
          return syncProjectSpecification({
            ...curr,
            flowchart: parsedFlowchart,
          });
        });

        setOpenTabs((prev) => (prev.includes(companionName) ? prev : [...prev, companionName]));
        setActiveTab(companionName);
        setNotice(`✨ Remade "${companionName}" from Pseudocode logic!`);
        setTimeout(() => setNotice(""), 3500);
      } catch (err: any) {
        setNotice(`⚠️ Error remaking flowchart: ${err?.message || "Invalid structure"}`);
        setTimeout(() => setNotice(""), 3500);
      }
    },
    [activeTab, applyGraph, explorerFiles, explorerFolders, project.flowchart, recentlyDeleted]
  );

  const handleConfirmCompanionModal = () => {
    if (!companionModal) return;
    const trimmed = companionInputName.trim();
    if (!trimmed) {
      setCompanionModal(null);
      return;
    }
    const folderId = companionModal.folderId;
    // Create the file
    const res = createExplorerFile(trimmed, folderId, true);
    if (res && res.file) {
      // Synchronize immediately from the created counterpart
      if (companionModal.createdFileType === "fc") {
        remakePseudocodeFromFlowchart(companionModal.createdFileName);
      } else if (companionModal.createdFileType === "ps") {
        remakeFlowchartFromPseudocode(companionModal.createdFileName);
      }
    }
    setCompanionModal(null);
  };

  // Save active file and update changes across counterpart (.fc <-> .ps) and Python
  const handleSaveActiveFile = useCallback(() => {
    if (!activeTab || !project) return;
    const curFile = explorerFiles.find((f) => f.name === activeTab);
    const isFc = activeTab === "main.fc" || activeTab.endsWith(".fc") || activeTab.endsWith(".fs") || curFile?.type === "fc";
    const isPs = activeTab === "algorithm.ps" || activeTab.endsWith(".ps") || curFile?.type === "ps";

    // 1. If active file is a Flowchart (.fc):
    if (isFc) {
      const companion = getCompanionFile(curFile || activeTab);
      const currentFlowchart = structuredClone(curFile?.flowchart || project.flowchart);
      let updatedPseudocode = "";
      try {
        updatedPseudocode = explainFlowchartToLearner(currentFlowchart).pseudocode;
      } catch {}

      const nextFiles = explorerFiles.map((f) => {
          if (f.name === activeTab) {
            return { ...f, flowchart: currentFlowchart };
          }
          if (companion && f.id === companion.id && updatedPseudocode) {
            return { ...f, content: updatedPseudocode };
          }
          return f;
        });
      setExplorerFiles(nextFiles);
      persistWorkspaceSnapshot(project.projectId, nextFiles, explorerFolders, openTabs, activeTab);

      // Re-sync project specification and Python code
      const nextProject = syncProjectSpecification({ ...project, flowchart: currentFlowchart });
      setProject(nextProject);

      try {
        storeRef.current?.save(nextProject);
        setSavedProjects(storeRef.current?.list() || []);
      } catch {}

      setUnsavedFiles((prev) => {
        const next = new Set(prev);
        next.delete(activeTab);
        if (companion) next.delete(companion.name);
        return next;
      });

      if (companion) {
        setNotice(`💾 Saved "${activeTab}" and updated companion "${companion.name}" & Python!`);
      } else {
        setNotice(`💾 Saved "${activeTab}" and updated Python!`);
      }
      setTimeout(() => setNotice(""), 3500);
      return;
    }

    // 2. If active file is a Pseudocode (.ps):
    if (isPs) {
      const content = curFile?.content !== undefined ? curFile.content : explainFlowchartToLearner(project.flowchart).pseudocode;
      const companion = getCompanionFile(curFile || activeTab);
      const parseRes = parsePseudocodeToFlowchart(content);

      if (parseRes.success && parseRes.flowchart) {
        const parsedFlowchart = parseRes.flowchart as FlowchartGraph;
        applyGraph(parsedFlowchart);

        const nextFiles = explorerFiles.map((f) => {
            if (f.name === activeTab) {
              return { ...f, content };
            }
            if (companion && f.id === companion.id) {
              return { ...f, flowchart: parsedFlowchart };
            }
            return f;
          });
        setExplorerFiles(nextFiles);
        persistWorkspaceSnapshot(project.projectId, nextFiles, explorerFolders, openTabs, activeTab);

        const nextProject = syncProjectSpecification({ ...project, flowchart: parsedFlowchart });
        setProject(nextProject);

        try {
          storeRef.current?.save(nextProject);
          setSavedProjects(storeRef.current?.list() || []);
        } catch {}

        setUnsavedFiles((prev) => {
          const next = new Set(prev);
          next.delete(activeTab);
          if (companion) next.delete(companion.name);
          return next;
        });

        if (companion) {
          setNotice(`💾 Saved "${activeTab}" and updated companion "${companion.name}" & Python!`);
        } else {
          setNotice(`💾 Saved "${activeTab}" and updated Python!`);
        }
        setTimeout(() => setNotice(""), 3500);
      } else {
        persistWorkspaceSnapshot(project.projectId, explorerFiles, explorerFolders, openTabs, activeTab);
        try {
          storeRef.current?.save(project);
          setSavedProjects(storeRef.current?.list() || []);
        } catch {}
        setUnsavedFiles((prev) => {
          const next = new Set(prev);
          next.delete(activeTab);
          return next;
        });
        setNotice(`⚠️ Saved text in "${activeTab}", but syntax error in pseudocode: ${parseRes.error || "Cannot compile"}`);
        setTimeout(() => setNotice(""), 4500);
      }
      return;
    }

    // 3. For any other text file (.txt, etc.):
    persistWorkspaceSnapshot(project.projectId, explorerFiles, explorerFolders, openTabs, activeTab);
    try {
      storeRef.current?.save(project);
      setSavedProjects(storeRef.current?.list() || []);
    } catch {}
    setUnsavedFiles((prev) => {
      const next = new Set(prev);
      next.delete(activeTab);
      return next;
    });
    setNotice(`💾 Saved "${activeTab}"!`);
    setTimeout(() => setNotice(""), 3000);
  }, [activeTab, project, explorerFiles, getCompanionFile, applyGraph]);

  // Graph manipulation functions
  const addNodeAtPosition = useCallback((kind: string, pos: { x: number; y: number }) => {
    if (kind === "start") {
      const hasStart = project.flowchart.nodes.some((n) => n.kind === "start");
      if (hasStart) {
        setNotice("⚠️ A Start block already exists. Only one Start block is permitted.");
        setTimeout(() => setNotice(""), 3000);
        return;
      }
    }
    const id = `${kind}-${Date.now().toString(36)}`;
    let defaultPayload: any = {};
    if (kind === "start" || kind === "end") {
      defaultPayload = {};
    } else if (kind === "input") {
      const existingNames = new Set(
        project.flowchart.nodes
          .filter((n) => n.kind === "input" || n.kind === "initialization" || n.kind === "process")
          .map((n) => ((n.payload as any)?.name || (n.payload as any)?.target || "").trim())
          .filter(Boolean)
      );
      const candidates = ["x", "y", "z", "a", "b", "c", "num1", "num2", "val"];
      const nextName = candidates.find((c) => !existingNames.has(c)) || `var${existingNames.size + 1}`;
      defaultPayload = {
        symbolId: `symbol-${nextName}`,
        name: nextName,
        type: "int",
        prompt: `Enter ${nextName}: `,
      };
    } else if (kind === "process") {
      defaultPayload = { operation: "assignment", symbolId: "symbol-x", expression: "x + 1" };
    } else if (kind === "initialization") {
      const existingNames = new Set(project.flowchart.nodes.map((node) => String((node.payload as any)?.name || "").trim()).filter(Boolean));
      const nextName = ["value", "constant", "pi", "count"].find((name) => !existingNames.has(name)) || `value${existingNames.size + 1}`;
      defaultPayload = { symbolId: `symbol-${nextName}`, name: nextName, type: "int", initializer: "0" };
    } else if (kind === "decision") {
      defaultPayload = { condition: "x > 0" };
    } else if (kind === "output") {
      defaultPayload = { outputId: `output-${id}`, mode: "expression", expression: "x" };
    }

    applyGraph((current: FlowchartGraph) => ({
      ...current,
      nodes: [...current.nodes, { id, kind, payload: defaultPayload }],
      layout: {
        ...current.layout,
        positions: {
          ...current.layout.positions,
          [id]: pos,
        },
      },
    }));
    setSelectedNode(id);
    setSelectedEdge(null);
    setRightSidebarCollapsed(false);
    setPropsWindowOpen(true);
    setPropsWindowCollapsed(false);
  }, [applyGraph, project.flowchart.nodes]);

  const addNode = (kind: "start" | "end" | "input" | "initialization" | "process" | "decision" | "output") => {
    const nodes = project.flowchart.nodes;
    const lastNode = nodes[nodes.length - 1];
    const lastPos = (lastNode && project.flowchart.layout.positions[lastNode.id]) || { x: 380, y: 40 };
    const nextPos = { x: lastPos.x, y: lastPos.y + 110 };
    addNodeAtPosition(kind, nextPos);
  };

  const moveNode = useCallback((id: string, position: { x: number; y: number }) => {
    setProject((current) => {
      if (!current) return current;
      return {
        ...current,
        flowchart: {
          ...current.flowchart,
          layout: {
            ...current.flowchart.layout,
            positions: {
              ...current.flowchart.layout.positions,
              [id]: position,
            },
          },
        },
      };
    });
    setUnsavedFiles((prev) => {
      const next = new Set(prev);
      if (activeTab) next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const addEdge = useCallback((from: string, to: string, branch?: string) => {
    applyGraph((current: FlowchartGraph) => {
      const exists = current.edges.some((e) => e.from === from && e.to === to && (!branch || e.branch === branch));
      if (exists) return current;
      const filtered = branch
        ? current.edges.filter((e) => !(e.from === from && e.branch === branch))
        : current.edges.filter((e) => e.from !== from);
      const newEdge = { id: `edge-${from}-${to}-${branch || "next"}`, from, to, ...(branch ? { branch } : {}) };
      return {
        ...current,
        edges: [...filtered, newEdge],
      };
    });
  }, [applyGraph]);

  const removeEdge = useCallback((edgeId: string) => {
    applyGraph((current: FlowchartGraph) => ({
      ...current,
      edges: current.edges.filter((e) => e.id !== edgeId),
    }));
    setSelectedEdge(null);
  }, [applyGraph]);

  const deleteNode = useCallback((id: string) => {
    if (!id) return;
    const targetNode = project.flowchart.nodes.find((n) => n.id === id);
    if (!targetNode) return;

    if (targetNode.kind === "start") {
      setNotice("🗑️ Deleted Start block. You can re-add it from the palette anytime.");
      setTimeout(() => setNotice(""), 3000);
    } else if (targetNode.kind === "end") {
      const remainingEnds = project.flowchart.nodes.filter((n) => n.kind === "end" && n.id !== id);
      if (remainingEnds.length === 0) {
        setNotice("🗑️ Deleted End block. You can re-add it from the palette anytime.");
        setTimeout(() => setNotice(""), 3000);
      }
    }

    applyGraph((current: FlowchartGraph) => {
      const nodeToDelete = current.nodes.find((n) => n.id === id);
      if (!nodeToDelete) return current;

      const nextPositions = { ...current.layout.positions };
      delete nextPositions[id];
      return {
        ...current,
        nodes: current.nodes.filter((n) => n.id !== id),
        edges: current.edges.filter((e) => e.from !== id && e.to !== id),
        layout: {
          ...current.layout,
          positions: nextPositions,
        },
      };
    });
    setSelectedNode("");
    setSelectedEdge(null);
  }, [applyGraph, project.flowchart.nodes]);

  const autoArrangeLayout = useCallback(() => {
    applyGraph((current: FlowchartGraph) => {
      const nodes = current.nodes || [];
      const edges = current.edges || [];
      if (nodes.length === 0) return current;

      const outgoing = new Map<string, FlowchartEdge[]>();
      const incoming = new Map<string, FlowchartEdge[]>();
      nodes.forEach((n) => {
        outgoing.set(n.id, []);
        incoming.set(n.id, []);
      });
      edges.forEach((e) => {
        if (outgoing.has(e.from)) outgoing.get(e.from)!.push(e);
        if (incoming.has(e.to)) incoming.get(e.to)!.push(e);
      });

      const startNode = nodes.find((n) => n.kind === "start") || nodes[0];
      const newPositions: Record<string, { x: number; y: number }> = {};
      const nodeLevels: Record<string, number> = { [startNode.id]: 0 };
      const queue: Array<{ id: string; level: number; xOffset: number }> = [
        { id: startNode.id, level: 0, xOffset: 380 },
      ];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const { id, level, xOffset } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);

        const isJoinNode = (incoming.get(id)?.length || 0) > 1;
        const actualX = isJoinNode ? 380 : xOffset;

        newPositions[id] = { x: actualX, y: 40 + level * 110 };

        const out = outgoing.get(id) || [];
        if (out.length === 2) {
          const trueEdge = out.find((e) => e.branch === "true") || out[0];
          const falseEdge = out.find((e) => e.branch === "false") || out[1];
          if (trueEdge) {
            const nextLvl = level + 1;
            nodeLevels[trueEdge.to] = Math.max(nodeLevels[trueEdge.to] || 0, nextLvl);
            queue.push({ id: trueEdge.to, level: nodeLevels[trueEdge.to], xOffset: Math.max(80, actualX - 170) });
          }
          if (falseEdge) {
            const nextLvl = level + 1;
            nodeLevels[falseEdge.to] = Math.max(nodeLevels[falseEdge.to] || 0, nextLvl);
            queue.push({ id: falseEdge.to, level: nodeLevels[falseEdge.to], xOffset: actualX + 170 });
          }
        } else if (out.length === 1) {
          const targetId = out[0].to;
          const targetIsJoin = (incoming.get(targetId)?.length || 0) > 1;
          const nextLvl = level + 1;
          nodeLevels[targetId] = Math.max(nodeLevels[targetId] || 0, nextLvl);
          queue.push({ id: targetId, level: nodeLevels[targetId], xOffset: targetIsJoin ? 380 : actualX });
        }
      }

      // Determine highest Y of non-end nodes
      let maxNonEndY = 40;
      nodes.forEach((n) => {
        if (n.kind !== "end" && newPositions[n.id] && newPositions[n.id].y > maxNonEndY) {
          maxNonEndY = newPositions[n.id].y;
        }
      });

      const endNodes = nodes.filter((n) => n.kind === "end");
      if (endNodes.length === 1) {
        newPositions[endNodes[0].id] = { x: 380, y: maxNonEndY + 110 };
      } else {
        endNodes.forEach((endN, idx) => {
          if (!newPositions[endN.id]) {
            const spacing = 180;
            const startX = 380 - ((endNodes.length - 1) * spacing) / 2;
            newPositions[endN.id] = { x: startX + idx * spacing, y: maxNonEndY + 110 };
          }
        });
      }

      let disconnectedY = maxNonEndY + 110;
      nodes.forEach((n) => {
        if (!newPositions[n.id]) {
          disconnectedY += 100;
          newPositions[n.id] = { x: 380, y: disconnectedY };
        }
      });

      return {
        ...current,
        layout: {
          ...current.layout,
          positions: newPositions,
        },
      };
    });
    setNotice("✨ Flowchart auto-arranged cleanly");
    setTimeout(() => setNotice(""), 2500);
  }, [applyGraph]);

  const clearAllNodes = () => {
    applyGraph((current: FlowchartGraph) => ({
      ...current,
      nodes: [
        { id: "start", kind: "start", payload: {} },
        { id: "end", kind: "end", payload: {} },
      ],
      edges: [{ id: "edge-start-end", from: "start", to: "end" }],
      layout: { positions: { start: { x: 380, y: 40 }, end: { x: 380, y: 320 } }, zoom: 1 },
    }));
    setSelectedNode("");
    setNotice("↺ Flowchart reset to Start & End blocks (Press Ctrl+Z to undo)");
    setTimeout(() => setNotice(""), 3500);
  };

  const fitToScreen = useCallback(() => {
    const nodes = project.flowchart.nodes;
    if (!nodes || nodes.length === 0) {
      setZoom(1);
      return;
    }
    const positions = project.flowchart.layout.positions || {};
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      const p = positions[n.id] || { x: 380, y: 100 };
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    maxX += 180;
    maxY += 80;
    const contentWidth = Math.max(200, maxX - minX);
    const contentHeight = Math.max(200, maxY - minY);
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth * 0.75 : 800;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight * 0.75 : 600;
    const scaleX = viewportWidth / contentWidth;
    const scaleY = viewportHeight / contentHeight;
    const fitScale = Math.min(1.2, Math.max(0.6, Math.min(scaleX, scaleY)));
    setZoom(Math.round(fitScale * 10) / 10);
    setNotice("🎯 Centered and fitted flowchart");
    setTimeout(() => setNotice(""), 2000);
  }, [project.flowchart]);

  const toggleFlowchartFullscreen = useCallback(() => {
    // If not currently viewing a flowchart file, open the flowchart file
    const isCurrentFc = Boolean(activeTab && (activeTab === "main.fc" || activeTab.endsWith(".fc") || activeTab.endsWith(".fs")));
    if (!isCurrentFc) {
      const fcFile = explorerFiles.find((f) => f.name.endsWith(".fc") || f.name.endsWith(".fs") || f.type === "fc");
      if (fcFile) {
        handleOpenFile(fcFile.name);
      }
    }

    const willBeFullscreen = !isFlowchartFullscreen;
    setIsFlowchartFullscreen(willBeFullscreen);

    if (willBeFullscreen) {
      // Synchronously request native element fullscreen during the user activation gesture
      if (typeof document !== "undefined" && flowchartWrapperRef.current) {
        if (document.fullscreenEnabled && flowchartWrapperRef.current.requestFullscreen) {
          flowchartWrapperRef.current.requestFullscreen().catch(() => {
            // If browser blocks native element fullscreen (e.g. iframe policy),
            // CSS fallback in .flowchartFullscreen seamlessly handles viewport expansion
          });
        }
      }
      setNotice("⛶ Full Screen enabled (Press Esc or F11 to exit)");
      setTimeout(() => setNotice(""), 3000);
      setTimeout(() => fitToScreen(), 150);
    } else {
      if (typeof document !== "undefined" && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setNotice("Exited Full Screen");
      setTimeout(() => setNotice(""), 2000);
      setTimeout(() => fitToScreen(), 150);
    }
  }, [activeTab, explorerFiles, handleOpenFile, isFlowchartFullscreen, fitToScreen]);

  useEffect(() => {
    const handleFsChange = () => {
      if (typeof document !== "undefined") {
        const hasFs = Boolean(document.fullscreenElement);
        if (!hasFs) {
          setIsFlowchartFullscreen(false);
        }
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange as any);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange as any);
    };
  }, []);

  // Node Inspector selection tracking
  const selectedNodeObj = useMemo(() => {
    return project.flowchart.nodes.find((n) => n.id === selectedNode) || null;
  }, [project, selectedNode]);

  // Terminal Execution
  const runProgram = (customInputs: Record<string, any> = {}, targetFileOverride?: string) => {
    setBottomTab("terminal");
    setBottomPanelCollapsed(false);

    let fileToRun = targetFileOverride || activeTab || "main.fc";
    if (fileToRun.endsWith(".py")) {
      const base = fileToRun.replace(/\.py$/, "");
      const matchFc = explorerFiles.find((f) => f.name === `${base}.fc` || f.name.endsWith(`/${base}.fc`));
      const matchPs = explorerFiles.find((f) => f.name === `${base}.ps` || f.name.endsWith(`/${base}.ps`));
      if (matchFc) fileToRun = matchFc.name;
      else if (matchPs) fileToRun = matchPs.name;
    }

    const curFile = explorerFiles.find((f) => f.name === fileToRun || f.name.endsWith(`/${fileToRun}`));
    const targetScript = fileToRun.includes("/")
      ? fileToRun.split("/").pop()!.replace(/\.[^/.]+$/, "") + ".py"
      : fileToRun.replace(/\.[^/.]+$/, "") + ".py";

    let runAst: any = null;
    let runFlowchart: FlowchartGraph = project.flowchart;

    if (fileToRun.endsWith(".ps")) {
      const psContent =
        curFile?.content !== undefined
          ? curFile.content
          : explainFlowchartToLearner(project.flowchart).pseudocode;
      const parsed = parsePseudocodeToFlowchart(psContent);
      if (parsed.success && parsed.flowchart) {
        runFlowchart = parsed.flowchart as FlowchartGraph;
        const adapted = adaptFlowchartToAst(runFlowchart, { projectId: project.projectId });
        runAst = adapted.ast;
      }
    } else {
      if (curFile && curFile.type === "fc" && curFile.flowchart) {
        runFlowchart = curFile.flowchart;
      }
      const adapted = adaptFlowchartToAst(runFlowchart, { projectId: project.projectId });
      runAst = adapted.ast;
    }

    if (!runAst) {
      setTerminalHistory((prev) => [
        ...prev,
        `PS C:\\MapToCode> python ${targetScript}`,
        `Error: Cannot execute "${fileToRun}" — flowchart or pseudocode has structural/syntax issues.`,
        "Please check the 'Problems' tab for details.",
        "",
      ]);
      setWaitingForInput(null);
      setCollectedInputs({});
      return;
    }

    const inputNodes = runFlowchart.nodes.filter((n) => n.kind === "input");
    const missingNode = inputNodes.find((n) => {
      const vName = (n.payload as any)?.name;
      return vName && !(vName in customInputs);
    });

    if (missingNode) {
      const vName = (missingNode.payload as any)?.name;
      const vPrompt = (missingNode.payload as any)?.prompt || `Enter value for ${vName}: `;
      const vType = (missingNode.payload as any)?.type || "int";

      if (Object.keys(customInputs).length === 0) {
        setTerminalHistory((prev) => [
          ...prev,
          `PS C:\\MapToCode> python ${targetScript}`,
        ]);
      }

      setWaitingForInput({
        varName: vName,
        varType: vType,
        prompt: vPrompt,
        targetFile: fileToRun,
      });
      return;
    }

    if (Object.keys(customInputs).length === 0) {
      setTerminalHistory((prev) => [
        ...prev,
        `PS C:\\MapToCode> python ${targetScript}`,
      ]);
    }

    try {
      const traceResult = generateAstTrace(runAst, customInputs);
      if (traceResult.success) {
        const outputs = traceResult.outputHistory || [];
        setTerminalHistory((prev) => [
          ...prev,
          ...outputs.map((out: any) => String(out)),
          "--- Program exited with code 0 ---",
          "",
        ]);
      } else {
        setTerminalHistory((prev) => [
          ...prev,
          `Runtime Error: ${traceResult.error || "Execution error"}`,
          "",
        ]);
      }
    } catch (err: any) {
      setTerminalHistory((prev) => [
        ...prev,
        `Execution Failed: ${err?.message || "Unknown error"}`,
        "",
      ]);
    }

    setWaitingForInput(null);
    setCollectedInputs({});
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = terminalInput;
    const cmd = raw.trim();
    setTerminalInput("");
    setHistoryIndex(-1);

    if (waitingForInput) {
      const { varName, varType, prompt: vPrompt, targetFile } = waitingForInput;
      let parsedVal: any = cmd;
      if (varType === "int" || varType === "integer") {
        const num = parseInt(cmd, 10);
        parsedVal = isNaN(num) ? 0 : num;
      } else if (varType === "float" || varType === "double" || varType === "number") {
        const num = parseFloat(cmd);
        parsedVal = isNaN(num) ? 0.0 : num;
      } else if (varType === "bool" || varType === "boolean") {
        parsedVal = cmd.toLowerCase() === "true" || cmd === "1";
      } else if (!isNaN(Number(cmd)) && cmd !== "") {
        parsedVal = Number(cmd);
      }

      const nextInputs = { ...collectedInputs, [varName]: parsedVal };
      setCollectedInputs(nextInputs);
      setTerminalHistory((prev) => [...prev, `${vPrompt}${raw}`]);
      runProgram(nextInputs, targetFile);
      return;
    }

    if (!cmd) return;

    setCommandHistory((prev) => [...prev, cmd]);
    setTerminalHistory((prev) => [...prev, `PS C:\\MapToCode> ${cmd}`]);

    if (cmd === "clear" || cmd === "cls") {
      setTerminalHistory([]);
      setWaitingForInput(null);
      setCollectedInputs({});
      setHistoryIndex(-1);
      return;
    }

    if (cmd === "pwd") {
      setTerminalHistory((prev) => [...prev, "C:\\MapToCode", ""]);
      return;
    }

    if (cmd === "whoami") {
      setTerminalHistory((prev) => [...prev, "MapToCode local workspace (no user account)", ""]);
      return;
    }

    if (cmd === "python --version" || cmd === "python -V" || cmd === "py --version") {
      setTerminalHistory((prev) => [...prev, "Python 3.12.0 (MapToCode AST Engine)", ""]);
      return;
    }

    if (cmd.startsWith("echo ")) {
      const text = cmd.slice(5).trim();
      setTerminalHistory((prev) => [...prev, text, ""]);
      return;
    }

    if (cmd === "help") {
      setTerminalHistory((prev) => [
        ...prev,
        "Available terminal commands:",
        "  python [file]    - Run active flowchart or pseudocode (e.g. python main.py)",
        "  cat <file>       - Display contents of a file (e.g. cat algorithm.ps)",
        "  ls / dir         - List all workspace files and folders",
        "  touch <file>     - Create a new file (e.g. touch notes.txt)",
        "  mkdir <folder>   - Create a new folder (e.g. mkdir helper)",
        "  rm <file>        - Delete a file from workspace",
        "  status           - Check flowchart validation status and issues",
        "  clear / cls      - Clear the terminal screen",
        "  pwd              - Print current working directory",
        "  echo <text>      - Print text to terminal",
        "",
      ]);
      return;
    }

    if (cmd === "ls" || cmd === "dir") {
      const fileList = explorerFiles.map(
        (f) => `  -a----  ${f.name.padEnd(20)} (${f.type === "fc" ? "Flowchart .fc" : f.type === "ps" ? "Pseudocode .ps" : "Text file"})`
      );
      const folderList = explorerFolders.map((f) => `  d-----  ${f.name}/`);
      const outputLines =
        fileList.length === 0 && folderList.length === 0
          ? ["  (empty workspace)"]
          : [...folderList, ...fileList];
      setTerminalHistory((prev) => [
        ...prev,
        "Mode    Name",
        "----    ----",
        ...outputLines,
        "",
      ]);
      return;
    }

    if (cmd.startsWith("cat ") || cmd.startsWith("type ")) {
      const targetName = cmd.split(" ").slice(1).join(" ").trim();
      if (!targetName) {
        setTerminalHistory((prev) => [...prev, "Usage: cat <filename>", ""]);
        return;
      }
      if (targetName === "main.py" || targetName.endsWith(".py")) {
        // Always generate from the corresponding .fc or the main flowchart
        const baseName = targetName.replace(/\.py$/, "");
        const fcFile = explorerFiles.find((f) => f.name === `${baseName}.fc` || f.name === `${baseName}.fs`);
        let code = pythonCode; // fallback: main.fc python code
        if (fcFile?.flowchart) {
          try {
            const adapted = adaptFlowchartToAst(fcFile.flowchart, { projectId: project.projectId });
            if (adapted.ast) {
              const res = generatePythonFromAst(adapted.ast);
              if (res.code) code = res.code;
            }
          } catch {}
        }
        setTerminalHistory((prev) => [...prev, code, ""]);
        return;
      }
      const match = explorerFiles.find(
        (f) => f.name.toLowerCase() === targetName.toLowerCase() || f.name.split("/").pop()?.toLowerCase() === targetName.toLowerCase()
      );
      if (match) {
        if (match.type === "fc") {
          // For flowchart files, show the generated Python instead of raw JSON
          let fcCode = "# (empty flowchart)";
          if (match.flowchart) {
            try {
              const adapted = adaptFlowchartToAst(match.flowchart, { projectId: project.projectId });
              if (adapted.ast) {
                const res = generatePythonFromAst(adapted.ast);
                if (res.code) fcCode = res.code;
              }
            } catch {}
          }
          setTerminalHistory((prev) => [
            ...prev,
            `--- ${match.name} (Flowchart → Python) ---`,
            fcCode,
            "",
          ]);
        } else {
          setTerminalHistory((prev) => [
            ...prev,
            `--- ${match.name} ---`,
            match.content !== undefined ? match.content : "(empty file)",
            "",
          ]);
        }
      } else {
        setTerminalHistory((prev) => [
          ...prev,
          `cat: ${targetName}: No such file or directory`,
          "",
        ]);
      }
      return;
    }

    if (cmd.startsWith("touch ")) {
      const targetName = cmd.slice(6).trim();
      if (!targetName) {
        setTerminalHistory((prev) => [...prev, "Usage: touch <filename>", ""]);
        return;
      }
      const res = createExplorerFile(targetName);
      if (res) {
        setTerminalHistory((prev) => [...prev, `Created file "${res.file.name}"`, ""]);
      }
      return;
    }

    if (cmd.startsWith("mkdir ")) {
      const folderName = cmd.slice(6).trim();
      if (!folderName) {
        setTerminalHistory((prev) => [...prev, "Usage: mkdir <foldername>", ""]);
        return;
      }
      if (explorerFolders.some((f) => f.name.toLowerCase() === folderName.toLowerCase())) {
        setTerminalHistory((prev) => [...prev, `mkdir: cannot create folder '${folderName}': Folder exists`, ""]);
        return;
      }
      const newFolder: ExplorerFolder = {
        id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: folderName,
        isOpen: true,
      };
      setExplorerFolders((prev) => [...prev, newFolder]);
      setTerminalHistory((prev) => [...prev, `Created folder "${folderName}"`, ""]);
      return;
    }

    if (cmd.startsWith("rm ")) {
      const targetName = cmd.slice(3).trim();
      const match = explorerFiles.find(
        (f) => f.name.toLowerCase() === targetName.toLowerCase() || f.name.split("/").pop()?.toLowerCase() === targetName.toLowerCase()
      );
      if (match) {
        handleDeleteFile(match.id, match.name);
        setTerminalHistory((prev) => [...prev, `Removed "${match.name}"`, ""]);
      } else {
        setTerminalHistory((prev) => [...prev, `rm: cannot remove '${targetName}': No such file`, ""]);
      }
      return;
    }

    if (cmd.startsWith("python ") || cmd === "run" || cmd === "python") {
      const arg = cmd.replace(/^python\s*/, "").trim();
      if (arg && arg !== "main.py" && arg !== "run") {
        runProgram({}, arg);
      } else {
        runProgram({});
      }
      return;
    }

    if (cmd === "status") {
      const issues = analysis?.flowchartCandidate?.diagnostics || [];
      if (issues.length === 0) {
        setTerminalHistory((prev) => [...prev, "✓ Flowchart is valid and ready to run.", ""]);
      } else {
        setTerminalHistory((prev) => [
          ...prev,
          `⚠️ Found ${issues.length} issue(s):`,
          ...issues.map((d: any) => `  - [${d.severity?.toUpperCase() || "ERROR"}] ${d.message || d.code}`),
          "",
        ]);
      }
      return;
    }

    setTerminalHistory((prev) => [
      ...prev,
      `'${cmd}' is not recognized as an internal or external command. Type 'help' for available commands.`,
      "",
    ]);
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setTerminalInput(commandHistory[nextIdx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (commandHistory.length === 0 || historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= commandHistory.length) {
        setHistoryIndex(-1);
        setTerminalInput("");
      } else {
        setHistoryIndex(nextIdx);
        setTerminalInput(commandHistory[nextIdx]);
      }
    }
  };

  // Change project handler with workspace isolation
  const changeProject = (next: ProjectEnvelope) => {
    if (!next) return;
    // 1. Immediately auto-save current project envelope and workspace files before switching
    if (project && storeRef.current) {
      try {
        storeRef.current.save(project);
        setSavedProjects(storeRef.current.list());
      } catch {}
    }
    if (project?.projectId && typeof window !== "undefined") {
      saveProjectWorkspace(window.localStorage, project.projectId, {
        files: explorerFiles,
        folders: explorerFolders,
        openTabs,
        activeTab,
      });
    }

    // 2. Load workspace for target project
    const nextWs =
      typeof window !== "undefined"
        ? loadProjectWorkspace(
            window.localStorage,
            next,
            explainFlowchartToLearner(next.flowchart).pseudocode
          )
        : getDefaultProjectWorkspace(
            next,
            explainFlowchartToLearner(next.flowchart).pseudocode
          );

    setExplorerFiles(nextWs.files as ExplorerFile[]);
    setExplorerFolders(nextWs.folders as ExplorerFolder[]);
    setOpenTabs(nextWs.openTabs);
    setActiveTab(nextWs.activeTab);
    setSelectedFileId(null);
    setSelectedFolderId(null);

    // 3. Reset flowchart selection and set project
    graphHistory.current = { past: [], future: [] };
    setProject(next);
    setSelectedNode("");
    setSelectedEdge(null);
    setActiveModal(null);

    if (storeRef.current) {
      try {
        storeRef.current.save(next);
        setSavedProjects(storeRef.current.list());
      } catch {}
    }
  };

  const duplicateNode = useCallback((node: FlowchartNode) => {
    if (node.kind === "start") {
      setNotice("⚠️ Cannot duplicate Start block. Every flowchart must have exactly one Start block.");
      setTimeout(() => setNotice(""), 3000);
      return;
    }
    const currentPos = project.flowchart.layout.positions[node.id] || { x: 380, y: 150 };
    const newPos = { x: currentPos.x + 40, y: currentPos.y + 40 };
    const newId = `${node.kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let newPayload = structuredClone(node.payload) as any;
    if (node.kind === "input") {
      const existingNames = new Set(
        project.flowchart.nodes
          .filter((n) => n.kind === "input" || n.kind === "initialization" || n.kind === "process")
          .map((n) => ((n.payload as any)?.name || (n.payload as any)?.target || "").trim())
          .filter(Boolean)
      );
      const candidates = ["x", "y", "z", "a", "b", "c", "num1", "num2", "val"];
      const nextName = candidates.find((c) => !existingNames.has(c)) || `var${existingNames.size + 1}`;
      newPayload = {
        ...newPayload,
        symbolId: `symbol-${nextName}`,
        name: nextName,
        prompt: `Enter ${nextName}: `,
      };
    } else if (node.kind === "initialization") {
      const existingNames = new Set(project.flowchart.nodes.map((item) => String((item.payload as any)?.name || "").trim()).filter(Boolean));
      const baseName = String((newPayload as any).name || "value");
      let nextName = `${baseName}Copy`;
      let suffix = 2;
      while (existingNames.has(nextName)) nextName = `${baseName}Copy${suffix++}`;
      newPayload = { ...newPayload, name: nextName, symbolId: `symbol-${nextName}` };
    }
    applyGraph((current: FlowchartGraph) => ({
      ...current,
      nodes: [...current.nodes, { ...node, id: newId, payload: newPayload }],
      layout: {
        ...current.layout,
        positions: {
          ...current.layout.positions,
          [newId]: newPos,
        },
      },
    }));
    setSelectedNode(newId);
    setNotice(`📑 Duplicated block "${node.kind}"`);
    setTimeout(() => setNotice(""), 2500);
  }, [project, applyGraph]);

  const duplicateSelectedNode = useCallback(() => {
    const node = project.flowchart.nodes.find((item) => item.id === selectedNode);
    if (node) duplicateNode(node);
  }, [selectedNode, project.flowchart.nodes, duplicateNode]);

  const copySelectedNode = useCallback(() => {
    const node = project.flowchart.nodes.find((item) => item.id === selectedNode);
    if (!node) return false;
    if (node.kind === "start") {
      setNotice("⚠️ Cannot copy Start block. A flowchart can only have one Start block.");
      setTimeout(() => setNotice(""), 3000);
      return false;
    }
    copiedNodeRef.current = structuredClone(node);
    setNotice(`📋 Copied ${node.kind} block. Press Ctrl+V to paste.`);
    setTimeout(() => setNotice(""), 2500);
    return true;
  }, [selectedNode, project.flowchart.nodes]);

  const pasteCopiedNode = useCallback(() => {
    if (!copiedNodeRef.current) return false;
    duplicateNode(copiedNodeRef.current);
    return true;
  }, [duplicateNode]);

  const cutSelectedNode = useCallback(() => {
    const node = project.flowchart.nodes.find((item) => item.id === selectedNode);
    if (!node) return;
    if (node.kind === "start") {
      setNotice("⚠️ Cannot cut Start block. A flowchart must have one Start block.");
      setTimeout(() => setNotice(""), 3000);
      return;
    }
    if (copySelectedNode()) deleteNode(selectedNode);
  }, [copySelectedNode, deleteNode, selectedNode, project.flowchart.nodes]);

  // Full Global IDE Keyboard Shortcuts (VS Code-style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Escape key works globally to cancel/close/blur
      if (e.key === "Escape") {
        if (isFlowchartFullscreen) {
          e.preventDefault();
          toggleFlowchartFullscreen();
          return;
        }
        if (renameModal) {
          e.preventDefault();
          setRenameModal(null);
          return;
        }
        if (deleteModal) {
          e.preventDefault();
          setDeleteModal(null);
          return;
        }
        if (companionModal?.isOpen) {
          e.preventDefault();
          setCompanionModal(null);
          return;
        }
        if (activeModal) {
          e.preventDefault();
          setActiveModal(null);
          return;
        }
        if (isCreatingItem) {
          e.preventDefault();
          handleCancelNewItem();
          return;
        }
        if (selectedNode || selectedEdge || selectedFileId || selectedFolderId) {
          e.preventDefault();
          setSelectedNode("");
          setSelectedEdge(null);
          setSelectedFileId(null);
          setSelectedFolderId(null);
          return;
        }
        if (isInputFocused) {
          target?.blur();
          return;
        }
      }

      // If typing inside an input/textarea, let normal typing proceed (with exceptions for global Ctrl+S / F5 / Ctrl+Enter)
      if (isInputFocused) {
        if (waitingForInput && mod && (e.key === "c" || e.key === "C")) {
          e.preventDefault();
          setTerminalHistory((prev) => [...prev, "^C", ""]);
          setWaitingForInput(null);
          setCollectedInputs({});
          return;
        }
        if (mod && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          handleSaveActiveFile();
          return;
        }
        // Ctrl+C inside a focused input: let browser copy normally, do NOT trigger save
        if (mod && (e.key === "c" || e.key === "C")) {
          // let browser handle copy
          return;
        }
        if (mod && e.key === "Enter" && (activeTab === "algorithm.ps" || activeTab.endsWith(".ps"))) {
          e.preventDefault();
          const curFile = explorerFiles.find((f) => f.name === activeTab);
          const content = curFile?.content !== undefined ? curFile.content : explainFlowchartToLearner(project.flowchart).pseudocode;
          const parseRes = parsePseudocodeToFlowchart(content);
          if (parseRes.success && parseRes.flowchart) {
            applyGraph(parseRes.flowchart);
            setProject((curr) => {
              if (!curr) return curr;
              return syncProjectSpecification({
                ...curr,
                flowchart: parseRes.flowchart,
              });
            });
            setNotice("✨ Flowchart updated from Pseudocode!");
            setTimeout(() => setNotice(""), 3000);
          } else {
            setNotice(`⚠️ ${parseRes.error || "Could not parse pseudocode"}`);
            setTimeout(() => setNotice(""), 3500);
          }
          return;
        }
        if (e.key === "F5") {
          e.preventDefault();
          runProgram();
          return;
        }
        return;
      }

      // F5 - Run Program (Python Execution)
      if (e.key === "F5") {
        e.preventDefault();
        runProgram();
        return;
      }

      // F11 - Toggle Full Screen Flowchart
      if (e.key === "F11" && (activeTab === "main.fc" || activeTab.endsWith(".fc") || activeTab.endsWith(".fs"))) {
        e.preventDefault();
        toggleFlowchartFullscreen();
        return;
      }

      // F1 or Ctrl+Shift+P - Command Palette / Help & Shortcuts
      if (e.key === "F1" || (mod && e.shiftKey && (e.key === "p" || e.key === "P"))) {
        e.preventDefault();
        setActiveModal("guide");
        return;
      }

      // F2 - Rename selected file / folder
      if (e.key === "F2") {
        e.preventDefault();
        handleRenameSelected();
        return;
      }

      // Delete / Backspace - Delete selected file / folder or selected flowchart block
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedFileId || selectedFolderId) {
          e.preventDefault();
          handleDeleteSelected();
          return;
        }
        if (selectedNode && project.flowchart.nodes.some((n) => n.id === selectedNode)) {
          e.preventDefault();
          deleteNode(selectedNode);
        }
        return;
      }

      // Ctrl / Cmd modified shortcuts
      if (mod) {
        const key = e.key.toLowerCase();

        // Ctrl+B: Toggle Primary Sidebar (Explorer)
        if (key === "b") {
          e.preventDefault();
          setLeftSidebarCollapsed((prev) => !prev);
          return;
        }

        // Ctrl+` (backtick) or Ctrl+J: Toggle Bottom Terminal
        if (e.key === "`" || key === "j") {
          e.preventDefault();
          setBottomPanelCollapsed((prev) => !prev);
          return;
        }

        // Ctrl+S / Ctrl+C: Save Active File & Project
        if (key === "s") {
          e.preventDefault();
          handleSaveActiveFile();
          return;
        }

        // Ctrl+Z: Undo diagram edit (only when on a flowchart file)
        if (key === "z" && !e.shiftKey) {
          const isFcActive = activeTab === "main.fc" || activeTab.endsWith(".fc") || activeTab.endsWith(".fs");
          if (isFcActive) {
            e.preventDefault();
            undoGraph();
            setNotice("↩️ Undone diagram edit");
            setTimeout(() => setNotice(""), 2000);
            return;
          }
        }

        // Ctrl+Y or Ctrl+Shift+Z: Redo diagram edit (only on flowchart files)
        if (key === "y" || (key === "z" && e.shiftKey)) {
          const isFcActive = activeTab === "main.fc" || activeTab.endsWith(".fc") || activeTab.endsWith(".fs");
          if (isFcActive) {
            e.preventDefault();
            redoGraph();
            setNotice("↪️ Redone diagram edit");
            setTimeout(() => setNotice(""), 2000);
            return;
          }
        }

        // Ctrl+C: Copy selected block or file (does NOT trigger save — use Ctrl+S to save)
        if (key === "c") {
          const selectedText = window.getSelection()?.toString();
          if (!selectedText) {
            if (selectedNode) {
              e.preventDefault();
              copySelectedNode();
              return;
            }
            if (selectedFileId) {
              e.preventDefault();
              handleCopyFile();
              return;
            }
            // No text selected, no file selected — let browser handle default copy
          }
          // If text is selected, let browser copy it normally (don't intercept)
        }

        // Ctrl+X: Cut selected block
        if (key === "x" && selectedNode) {
          e.preventDefault();
          cutSelectedNode();
          return;
        }

        // Ctrl+V: Paste copied block or file
        if (key === "v") {
          if (copiedNodeRef.current) {
            e.preventDefault();
            pasteCopiedNode();
            return;
          }
          if (copiedFileRef.current) {
            e.preventDefault();
            handlePasteFile();
            return;
          }
        }

        // Ctrl+D: Duplicate selected file or selected node
        if (key === "d") {
          e.preventDefault();
          if (selectedFileId) {
            handleCopyFile();
            handlePasteFile();
            return;
          }
          if (selectedNode) {
            duplicateSelectedNode();
            return;
          }
        }

        // Ctrl+W: Close active tab
        if (key === "w") {
          e.preventDefault();
          handleCloseTab(activeTab);
          return;
        }

        // Ctrl+N: New File
        if (key === "n" && !e.shiftKey) {
          e.preventDefault();
          setLeftSidebarCollapsed(false);
          setExplorerOpen(true);
          setIsCreatingItem("file");
          setNewItemName("");
          return;
        }

        // Ctrl+Shift+N: New Folder
        if (key === "n" && e.shiftKey) {
          e.preventDefault();
          setLeftSidebarCollapsed(false);
          setExplorerOpen(true);
          setIsCreatingItem("folder");
          setNewItemName("");
          return;
        }

        // Ctrl+P: Quick Open / Search
        if (key === "p" && !e.shiftKey) {
          e.preventDefault();
          setLeftSidebarCollapsed(false);
          setActiveActivity("search");
          return;
        }

        // Ctrl+1, Ctrl+2, Ctrl+3, ... : Switch to specific tab number
        if (/^[1-9]$/.test(e.key)) {
          const tabIndex = parseInt(e.key, 10) - 1;
          if (openTabs[tabIndex]) {
            e.preventDefault();
            setActiveTab(openTabs[tabIndex]);
            return;
          }
        }
      }

      // Ctrl+Tab / Ctrl+PageDown: Cycle to next tab
      if (e.ctrlKey && (e.key === "Tab" || e.key === "PageDown")) {
        e.preventDefault();
        if (openTabs.length > 1) {
          const currentIdx = openTabs.indexOf(activeTab);
          const nextIdx = (currentIdx + 1) % openTabs.length;
          setActiveTab(openTabs[nextIdx]);
        }
        return;
      }

      // Ctrl+Shift+Tab / Ctrl+PageUp: Cycle to previous tab
      if (e.ctrlKey && (e.key === "PageUp" || (e.shiftKey && e.key === "Tab"))) {
        e.preventDefault();
        if (openTabs.length > 1) {
          const currentIdx = openTabs.indexOf(activeTab);
          const prevIdx = (currentIdx - 1 + openTabs.length) % openTabs.length;
          setActiveTab(openTabs[prevIdx]);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedFileId,
    selectedFolderId,
    selectedNode,
    selectedEdge,
    activeTab,
    openTabs,
    project,
    activeModal,
    isCreatingItem,
    handleDeleteSelected,
    deleteNode,
    handleCopyFile,
    handlePasteFile,
    handleRenameSelected,
    duplicateSelectedNode,
    copySelectedNode,
    cutSelectedNode,
    pasteCopiedNode,
    undoGraph,
    redoGraph,
    runProgram,
    handleCloseTab,
    handleCancelNewItem,
  ]);

  const hasStartNode = project.flowchart.nodes.some((n) => n.kind === "start");

  const renderBlocksContent = () => (
    <>
      {/* 1. Start */}
      <div
        className={`${styles.blockCard} ${hasStartNode ? styles.blockCardDisabled : ""}`}
        draggable={!hasStartNode}
        onDragStart={(e) => {
          if (hasStartNode) {
            e.preventDefault();
            setNotice("⚠️ A Start block already exists. Only one Start block is permitted.");
            setTimeout(() => setNotice(""), 3000);
            return;
          }
          e.dataTransfer.setData("application/maptocode-node", "start");
        }}
        onClick={() => {
          if (hasStartNode) {
            setNotice("⚠️ A Start block already exists. Only one Start block is permitted.");
            setTimeout(() => setNotice(""), 3000);
          } else {
            addNode("start");
          }
        }}
        title={hasStartNode ? "Start block already added (only 1 permitted)" : "Start Block"}
        style={hasStartNode ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
      >
        <div className={styles.blockShape}>
          <div className={styles.shapePill} />
        </div>
        <span className={styles.blockLabel}>Start {hasStartNode ? "✓" : ""}</span>
      </div>

      {/* 2. End */}
      <div
        className={styles.blockCard}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("application/maptocode-node", "end")}
        onClick={() => addNode("end")}
        title="End Block"
      >
        <div className={styles.blockShape}>
          <div className={styles.shapePillEnd} />
        </div>
        <span className={styles.blockLabel}>End</span>
      </div>

      {/* 2. Input */}
      <div
        className={styles.blockCard}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("application/maptocode-node", "input")}
        onClick={() => addNode("input")}
        title="Input Block"
      >
        <div className={styles.blockShape}>
          <div className={styles.shapeParaBlue} />
        </div>
        <span className={styles.blockLabel}>Input</span>
      </div>

      <div
        className={styles.blockCard}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("application/maptocode-node", "initialization")}
        onClick={() => addNode("initialization")}
        title="Initialize a variable with a starting value"
      >
        <div className={styles.blockShape}>
          <div className={styles.shapeInitialization} />
        </div>
        <span className={styles.blockLabel}>Initialize</span>
      </div>

      {/* 3. Output */}
      <div
        className={styles.blockCard}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("application/maptocode-node", "output")}
        onClick={() => addNode("output")}
        title="Output Block"
      >
        <div className={styles.blockShape}>
          <div className={styles.shapeParaPink} />
        </div>
        <span className={styles.blockLabel}>Output</span>
      </div>

      {/* 4. Process */}
      <div
        className={styles.blockCard}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("application/maptocode-node", "process")}
        onClick={() => addNode("process")}
        title="Process Block"
      >
        <div className={styles.blockShape}>
          <div className={styles.shapeRect} />
        </div>
        <span className={styles.blockLabel}>Process</span>
      </div>

      {/* 5. Decision */}
      <div
        className={styles.blockCard}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("application/maptocode-node", "decision")}
        onClick={() => addNode("decision")}
        title="Decision Block"
      >
        <div className={styles.blockShape}>
          <div className={styles.shapeDiamond} />
        </div>
        <span className={styles.blockLabel}>Decision</span>
      </div>

      {/* + Add Block dropdown button */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className={styles.addBlockDropdownBtn}
          onClick={() => setShowAddBlockMenu((m) => !m)}
        >
          <span>+</span>
          <span>Add Block</span>
          <span style={{ fontSize: "10px" }}>⌵</span>
        </button>

        {showAddBlockMenu && (
          <div className={styles.dropdown} style={{ width: "100%", top: "42px" }}>
            <button
              type="button"
              className={styles.dropdownItem}
              onClick={() => {
                if (hasStartNode) {
                  setNotice("⚠️ A Start block already exists. Only one Start block is permitted.");
                  setTimeout(() => setNotice(""), 3000);
                } else {
                  addNode("start");
                }
                setShowAddBlockMenu(false);
              }}
              style={hasStartNode ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              <span>🟢 Start Block {hasStartNode ? "(Added)" : ""}</span>
            </button>
            <button type="button" className={styles.dropdownItem} onClick={() => { addNode("input"); setShowAddBlockMenu(false); }}>
              <span>🔵 Input Block</span>
            </button>
            <button type="button" className={styles.dropdownItem} onClick={() => { addNode("initialization"); setShowAddBlockMenu(false); }}>
              <span>🟢 Initialization Block</span>
            </button>
            <button type="button" className={styles.dropdownItem} onClick={() => { addNode("process"); setShowAddBlockMenu(false); }}>
              <span>🟣 Process Block</span>
            </button>
            <button type="button" className={styles.dropdownItem} onClick={() => { addNode("decision"); setShowAddBlockMenu(false); }}>
              <span>🟠 Decision Block</span>
            </button>
            <button type="button" className={styles.dropdownItem} onClick={() => { addNode("output"); setShowAddBlockMenu(false); }}>
              <span>🔴 Output Block</span>
            </button>
            <button type="button" className={styles.dropdownItem} onClick={() => { addNode("end"); setShowAddBlockMenu(false); }}>
              <span>🛑 End Block</span>
            </button>
          </div>
        )}
      </div>
    </>
  );

  const renderPropsContent = () => (
    <>
      {selectedNodeObj ? (
        <div className={styles.inspector}>
          <div className={styles.inspectorTitle}>
            <span>{selectedNodeObj.kind.toUpperCase()} BLOCK</span>
            <button
              type="button"
              className={styles.tabClose}
              onClick={() => setSelectedNode("")}
              title="Deselect block"
            >
              ✕
            </button>
          </div>

          {selectedNodeObj.kind === "decision" && (
            <label className={styles.inspectorField}>
              <span className={styles.inspectorLabel}>Condition expression:</span>
              <input
                className={styles.formInput}
                value={(selectedNodeObj.payload as any)?.condition || ""}
                placeholder="n % 2 == 0"
                onChange={(e) => {
                  const val = e.target.value;
                  applyGraph((cur: FlowchartGraph) => ({
                    ...cur,
                    nodes: cur.nodes.map((n) =>
                      n.id === selectedNodeObj.id ? { ...n, payload: { condition: val } } : n
                    ),
                  }));
                }}
              />
            </label>
          )}

          {selectedNodeObj.kind === "input" && (
            <>
              <label className={styles.inspectorField}>
                <span className={styles.inspectorLabel}>Variable Name:</span>
                <input
                  className={styles.formInput}
                  value={(selectedNodeObj.payload as any)?.name || ""}
                  placeholder="n"
                  onChange={(e) => {
                    const val = e.target.value;
                    applyGraph((cur: FlowchartGraph) => ({
                      ...cur,
                      nodes: cur.nodes.map((n) =>
                        n.id === selectedNodeObj.id
                          ? {
                              ...n,
                              payload: {
                                symbolId: `symbol-${val || n.id}`,
                                name: val,
                                type: (n.payload as any)?.type || "int",
                                prompt: (n.payload as any)?.prompt || `Enter ${val || n.id}: `,
                              },
                            }
                          : n
                      ),
                    }));
                  }}
                />
              </label>
              <label className={styles.inspectorField}>
                <span className={styles.inspectorLabel}>Data Type:</span>
                <select
                  className={styles.inspectorSelect}
                  value={(selectedNodeObj.payload as any)?.type || "int"}
                  onChange={(e) => {
                    const val = e.target.value as ScalarType;
                    applyGraph((cur: FlowchartGraph) => ({
                      ...cur,
                      nodes: cur.nodes.map((n) =>
                        n.id === selectedNodeObj.id
                          ? {
                              ...n,
                              payload: {
                                symbolId: (n.payload as any)?.symbolId || `symbol-${(n.payload as any)?.name || n.id}`,
                                name: (n.payload as any)?.name || "x",
                                type: val,
                                prompt: (n.payload as any)?.prompt || `Enter ${(n.payload as any)?.name || "value"}: `,
                              },
                            }
                          : n
                      ),
                    }));
                  }}
                >
                  <option value="int">Integer (int)</option>
                  <option value="double">Decimal (float/double)</option>
                  <option value="char">Character (char)</option>
                </select>
              </label>
              <label className={styles.inspectorField}>
                <span className={styles.inspectorLabel}>Prompt Message:</span>
                <input
                  className={styles.formInput}
                  value={(selectedNodeObj.payload as any)?.prompt || ""}
                  placeholder="Enter a whole number: "
                  onChange={(e) => {
                    const val = e.target.value;
                    applyGraph((cur: FlowchartGraph) => ({
                      ...cur,
                      nodes: cur.nodes.map((n) =>
                        n.id === selectedNodeObj.id
                          ? {
                              ...n,
                              payload: {
                                symbolId: (n.payload as any)?.symbolId || `symbol-${(n.payload as any)?.name || n.id}`,
                                name: (n.payload as any)?.name || "x",
                                type: (n.payload as any)?.type || "int",
                                prompt: val,
                              },
                            }
                          : n
                      ),
                    }));
                  }}
                />
              </label>
            </>
          )}

          {selectedNodeObj.kind === "initialization" && (
            <>
              <label className={styles.inspectorField}>
                <span className={styles.inspectorLabel}>Identifier:</span>
                <input className={styles.formInput} value={(selectedNodeObj.payload as any)?.name || ""} placeholder="pi"
                  onChange={(e) => {
                    const name = e.target.value;
                    applyGraph((cur: FlowchartGraph) => ({
                      ...cur,
                      nodes: cur.nodes.map((n) => n.id === selectedNodeObj.id
                        ? {
                            ...n,
                            payload: {
                              symbolId: `symbol-${name || n.id}`,
                              name,
                              type: (n.payload as any)?.type || "int",
                              initializer: (n.payload as any)?.initializer || "0",
                            },
                          }
                        : n),
                    }));
                  }} />
              </label>
              <label className={styles.inspectorField}>
                <span className={styles.inspectorLabel}>Data Type:</span>
                <select className={styles.inspectorSelect} value={(selectedNodeObj.payload as any)?.type || "int"}
                  onChange={(e) => {
                    const type = e.target.value as ScalarType;
                    applyGraph((cur: FlowchartGraph) => ({
                      ...cur,
                      nodes: cur.nodes.map((n) => n.id === selectedNodeObj.id
                        ? {
                            ...n,
                            payload: {
                              symbolId: (n.payload as any)?.symbolId || `symbol-${(n.payload as any)?.name || n.id}`,
                              name: (n.payload as any)?.name || "value",
                              type,
                              initializer: (n.payload as any)?.initializer || "0",
                            },
                          }
                        : n),
                    }));
                  }}>
                  <option value="int">Integer</option><option value="double">Decimal</option><option value="char">Character</option>
                </select>
              </label>
              <label className={styles.inspectorField}>
                <span className={styles.inspectorLabel}>Starting Value:</span>
                <input className={styles.formInput} value={(selectedNodeObj.payload as any)?.initializer || ""} placeholder="3.14159"
                  onChange={(e) => {
                    const initializer = e.target.value;
                    applyGraph((cur: FlowchartGraph) => ({
                      ...cur,
                      nodes: cur.nodes.map((n) => n.id === selectedNodeObj.id
                        ? {
                            ...n,
                            payload: {
                              symbolId: (n.payload as any)?.symbolId || `symbol-${(n.payload as any)?.name || n.id}`,
                              name: (n.payload as any)?.name || "value",
                              type: (n.payload as any)?.type || "int",
                              initializer,
                            },
                          }
                        : n),
                    }));
                  }} />
              </label>
            </>
          )}

          {selectedNodeObj.kind === "process" && (
            <>
              <>
                  <label className={styles.inspectorField}>
                    <span className={styles.inspectorLabel}>Target Variable:</span>
                    <input
                      className={styles.formInput}
                      value={(selectedNodeObj.payload as any)?.target || (selectedNodeObj.payload as any)?.name || (
                        (selectedNodeObj.payload as any)?.symbolId === `symbol-${selectedNodeObj.id}`
                          ? ""
                          : String((selectedNodeObj.payload as any)?.symbolId || "").replace(/^symbol-/, "")
                      )}
                      placeholder="total"
                      onChange={(e) => {
                        const val = e.target.value;
                        applyGraph((cur: FlowchartGraph) => ({
                          ...cur,
                          nodes: cur.nodes.map((n) =>
                            n.id === selectedNodeObj.id
                              ? { ...n, payload: { operation: "assignment", symbolId: `symbol-${val || n.id}`, expression: (n.payload as any)?.expression || "" } }
                              : n
                          ),
                        }));
                      }}
                    />
                  </label>
                  <label className={styles.inspectorField}>
                    <span className={styles.inspectorLabel}>Calculation Expression:</span>
                    <input
                      className={styles.formInput}
                      value={(selectedNodeObj.payload as any)?.expression || ""}
                      placeholder="x + 1"
                      onChange={(e) => {
                        const val = e.target.value;
                        const standardAssignment = val.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:←|<-|=)\s*(.+)$/);
                        const legacyAssignment = !standardAssignment && (
                          val.match(/^(.+?)\s*(?:←|<-)\s*([A-Za-z_][A-Za-z0-9_]*)$/)
                          || val.match(/^(.+?)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/)
                        );
                        const targetName = standardAssignment ? standardAssignment[1].trim() : legacyAssignment ? legacyAssignment[2].trim() : null;
                        const exprStr = standardAssignment ? standardAssignment[2].trim() : legacyAssignment ? legacyAssignment[1].trim() : val;
                        applyGraph((cur: FlowchartGraph) => ({
                          ...cur,
                          nodes: cur.nodes.map((n) =>
                            n.id === selectedNodeObj.id
                              ? {
                                  ...n,
                                  payload: {
                                    operation: "assignment",
                                    symbolId: targetName
                                      ? `symbol-${targetName}`
                                      : (n.payload as any)?.symbolId || `symbol-${n.id}`,
                                    expression: exprStr,
                                  },
                                }
                              : n
                          ),
                        }));
                      }}
                    />
                  </label>
              </>
            </>
          )}

          {selectedNodeObj.kind === "output" && (
            <>
              <label className={styles.inspectorField}>
                <span className={styles.inspectorLabel}>Output Mode:</span>
                <select
                  className={styles.inspectorSelect}
                  value={(selectedNodeObj.payload as any)?.mode || "message"}
                  onChange={(e) => {
                    const val = e.target.value;
                    applyGraph((cur: FlowchartGraph) => ({
                      ...cur,
                      nodes: cur.nodes.map((n) =>
                        n.id !== selectedNodeObj.id ? n : (() => {
                          const previous = n.payload as any;
                          const outputId = previous?.outputId || `output-${n.id}`;
                          if (val === "message") return { ...n, payload: { outputId, mode: val, message: previous?.message || previous?.expression || "" } };
                          if (val === "expression") return { ...n, payload: { outputId, mode: val, expression: previous?.expression || previous?.message || "" } };
                          return { ...n, payload: {
                            outputId, mode: "formatted",
                            message: previous?.message || "Result:",
                            expression: previous?.mode === "expression" ? previous.expression : previous?.expression || "",
                          } };
                        })()
                      ),
                    }));
                  }}
                >
                  <option value="message">Fixed Message</option>
                  <option value="expression">Variable / Expression</option>
                  <option value="formatted">Message + Variable / Expression</option>
                </select>
              </label>
              {(selectedNodeObj.payload as any)?.mode === "formatted" ? (
                <>
                  <label className={styles.inspectorField}>
                    <span className={styles.inspectorLabel}>Fixed Message:</span>
                    <input className={styles.formInput} value={(selectedNodeObj.payload as any)?.message || ""} placeholder="Area:"
                      onChange={(e) => {
                        const message = e.target.value;
                        applyGraph((cur: FlowchartGraph) => ({ ...cur, nodes: cur.nodes.map((n) => n.id === selectedNodeObj.id
                          ? { ...n, payload: { outputId: (n.payload as any)?.outputId || `output-${n.id}`, mode: "formatted", message, expression: (n.payload as any)?.expression || "0" } } : n) }));
                      }} />
                  </label>
                  <label className={styles.inspectorField}>
                    <span className={styles.inspectorLabel}>Variable / Expression:</span>
                    <input className={styles.formInput} value={(selectedNodeObj.payload as any)?.expression || ""} placeholder="area"
                      onChange={(e) => {
                        const expression = e.target.value;
                        applyGraph((cur: FlowchartGraph) => ({ ...cur, nodes: cur.nodes.map((n) => n.id === selectedNodeObj.id
                          ? { ...n, payload: { outputId: (n.payload as any)?.outputId || `output-${n.id}`, mode: "formatted", message: (n.payload as any)?.message || "", expression } } : n) }));
                      }} />
                  </label>
                </>
              ) : (
                <label className={styles.inspectorField}>
                  <span className={styles.inspectorLabel}>Output Value:</span>
                  <input className={styles.formInput}
                    value={(selectedNodeObj.payload as any)?.mode === "expression"
                      ? (selectedNodeObj.payload as any)?.expression || ""
                      : (selectedNodeObj.payload as any)?.message || ""}
                    placeholder={(selectedNodeObj.payload as any)?.mode === "expression" ? "area" : "Calculation complete"}
                    onChange={(e) => {
                      const val = e.target.value;
                      applyGraph((cur: FlowchartGraph) => ({ ...cur, nodes: cur.nodes.map((n) =>
                        n.id === selectedNodeObj.id
                          ? (n.payload as any)?.mode === "message"
                            ? { ...n, payload: { outputId: (n.payload as any)?.outputId || `output-${n.id}`, mode: "message", message: val } }
                            : { ...n, payload: { outputId: (n.payload as any)?.outputId || `output-${n.id}`, mode: "expression", expression: val } }
                          : n
                      ) }));
                    }} />
                </label>
              )}
            </>
          )}

          <div className={styles.inspectorActions}>
            <button
              type="button"
              className={`${styles.btnSecondary} ${styles.inspectorDeleteBtn}`}
              onClick={() => deleteNode(selectedNodeObj.id)}
              title="Delete this block with the Delete or Backspace key"
              aria-keyshortcuts="Delete Backspace"
            >
              Delete Block
              <kbd className={styles.deleteShortcutHint}>Del</kbd>
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.inspectorEmptyState}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ marginTop: "8px", fontSize: "12px", color: "#777" }}>
            Select a shape on the canvas to inspect its properties.
          </p>
        </div>
      )}
    </>
  );

  const diagnostics = analysis?.flowchartCandidate?.diagnostics || [];

  const renderBottomPanel = () => (
    <div
      className={`${styles.bottomPanel} ${
        bottomPanelCollapsed
          ? styles.bottomPanelHidden
          : bottomPanelMaximized
          ? styles.bottomPanelMaximized
          : ""
      }`}
      style={
        bottomPanelCollapsed
          ? { height: 0 }
          : bottomPanelMaximized
          ? { height: "75%" }
          : {
              height: `${bottomPanelHeight}px`,
              transition: isDraggingPanel ? "none" : undefined,
            }
      }
    >
      {/* VS Code Draggable Resize Bar */}
      {!bottomPanelCollapsed && (
        <div
          className={`${styles.panelResizeHandle} ${isDraggingPanel ? styles.panelResizeHandleActive : ""}`}
          onMouseDown={handleStartResizePanel}
          onDoubleClick={() => setBottomPanelMaximized((m) => !m)}
          title="Drag to resize terminal height (Double-click to toggle maximize)"
        >
          <div className={styles.panelResizeGrip} />
        </div>
      )}
      <div className={styles.panelHeader}>
        <div className={styles.panelTabs}>
          <button
            type="button"
            className={`${styles.panelTab} ${bottomTab === "terminal" ? styles.panelTabActive : ""}`}
            onClick={() => setBottomTab("terminal")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span>Terminal</span>
          </button>

          <button
            type="button"
            className={`${styles.panelTab} ${bottomTab === "generatedCode" ? styles.panelTabActive : ""}`}
            onClick={() => setBottomTab("generatedCode")}
            title="View Generated Python Code"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>Generated Code</span>
          </button>

          <button
            type="button"
            className={`${styles.panelTab} ${bottomTab === "output" ? styles.panelTabActive : ""}`}
            onClick={() => setBottomTab("output")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Output</span>
          </button>

          <button
            type="button"
            className={`${styles.panelTab} ${bottomTab === "problems" ? styles.panelTabActive : ""}`}
            onClick={() => setBottomTab("problems")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Problems</span>
            <span className={`${styles.panelTabBadge} ${diagnostics.length > 0 ? styles.panelTabBadge : ""}`}>
              {diagnostics.length}
            </span>
          </button>
        </div>

        <div className={styles.panelTabsRight}>
          <button
            type="button"
            className={styles.panelIconBtn}
            onClick={() => runProgram()}
            title="Run active file in Terminal (▶)"
          >
            ▶
          </button>
          <button
            type="button"
            className={styles.panelIconBtn}
            onClick={() => {
              setTerminalHistory([]);
              setWaitingForInput(null);
            }}
            title="Clear Terminal (🗑)"
          >
            🗑
          </button>
          <button
            type="button"
            className={styles.panelIconBtn}
            onClick={() => setBottomPanelMaximized((m) => !m)}
            title={bottomPanelMaximized ? "Restore Size" : "Maximize Panel"}
          >
            🗖
          </button>
          <button
            type="button"
            className={styles.panelIconBtn}
            onClick={() => setBottomPanelCollapsed(true)}
            title="Close Panel"
          >
            ✕
          </button>
        </div>
      </div>

      <div className={styles.panelBody}>
        {/* Terminal Tab */}
        {bottomTab === "terminal" && (
          <div
            className={styles.terminalContainer}
            onClick={() => terminalInputRef.current?.focus()}
          >
            <div className={styles.terminalLines}>
              {terminalHistory.map((line, i) => {
                const isErr = line.startsWith("Error:") || line.startsWith("Traceback") || line.startsWith("ZeroDivisionError") || line.startsWith("NameError") || line.startsWith("Runtime Error:") || line.startsWith("Execution Failed:");
                const isPromptLine = line.startsWith("PS C:\\MapToCode>");
                const isSuccess = line.startsWith("--- Program exited") || line.startsWith("✓") || line.startsWith("== Program exited");
                return (
                  <div
                    key={i}
                    className={`${styles.terminalLine} ${isErr ? styles.terminalLineErr : isSuccess ? styles.terminalLineOk : ""}`}
                    style={isPromptLine ? { color: "#9cdcfe" } : undefined}
                  >
                    {line}
                  </div>
                );
              })}
              <div ref={terminalBottomRef} />
            </div>
            <form onSubmit={handleTerminalSubmit} className={styles.terminalPrompt}>
              <span className={styles.terminalPromptText}>
                {waitingForInput ? waitingForInput.prompt : "PS C:\\MapToCode> "}
              </span>
              <input
                ref={terminalInputRef}
                type="text"
                className={styles.terminalInput}
                value={terminalInput}
                onChange={(e) => {
                  setTerminalInput(e.target.value);
                  setHistoryIndex(-1);
                }}
                onKeyDown={handleTerminalKeyDown}
                autoFocus
                placeholder={waitingForInput ? "Type value and press Enter..." : "Type command or 'python main.py'..."}
              />
            </form>
          </div>
        )}

        {/* Generated Code Tab (Python, C, and Java) */}
        {bottomTab === "generatedCode" && (() => {
          const rawBase = activeTab ? activeTab.split("/").pop()!.replace(/\.[^/.]+$/, "") : "main";
          const displayFileName =
            codeGenLang === "python"
              ? `${rawBase}.py`
              : codeGenLang === "c"
              ? `${rawBase}.c`
              : `${rawBase.charAt(0).toUpperCase() + rawBase.slice(1).replace(/[^a-zA-Z0-9_]/g, "") || "Main"}.java`;

          const mimeType =
            codeGenLang === "python"
              ? "text/x-python"
              : codeGenLang === "c"
              ? "text/x-c"
              : "text/x-java";

          const currentCode = generatedCodes[codeGenLang];

          return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              {/* Top Toolbar: Language Selector + File Badge + Improved Action Buttons */}
              <div className={styles.codeGenToolbar}>
                {/* Language Selection Tabs */}
                <div className={styles.codeGenLangGroup} role="tablist" aria-label="Target Code Language">
                  <button
                    type="button"
                    className={`${styles.codeGenLangBtn} ${codeGenLang === "python" ? styles.codeGenLangBtnActive : ""}`}
                    onClick={() => setCodeGenLang("python")}
                    title="Generate Python 3 code"
                  >
                    <span>🐍</span>
                    <span>Python</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.codeGenLangBtn} ${codeGenLang === "c" ? styles.codeGenLangBtnActive : ""}`}
                    onClick={() => setCodeGenLang("c")}
                    title="Generate standard C code"
                  >
                    <span>🇨</span>
                    <span>C</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.codeGenLangBtn} ${codeGenLang === "java" ? styles.codeGenLangBtnActive : ""}`}
                    onClick={() => setCodeGenLang("java")}
                    title="Generate Java code"
                  >
                    <span>☕</span>
                    <span>Java</span>
                  </button>
                </div>

                {/* File Info Badge */}
                <div className={styles.codeGenFileInfo}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <span>{displayFileName}</span>
                </div>
                <span className={styles.codeLevelBadge} title="Code learning level selected when this project was created">
                  {(project.codeLevel || "intermediate").replace(/^./, (letter) => letter.toUpperCase())}
                </span>

                {/* Prominent Action Buttons (Copy & Download) */}
                <div className={styles.codeGenActions}>
                  <button
                    type="button"
                    className={styles.codeGenActionBtnCopy}
                    onClick={() => {
                      navigator.clipboard?.writeText(currentCode);
                      setNotice(`📋 ${codeGenLang.toUpperCase()} code copied to clipboard!`);
                      setTimeout(() => setNotice(""), 2500);
                    }}
                    title={`Copy ${codeGenLang.toUpperCase()} code to clipboard`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Copy Code</span>
                  </button>

                  <button
                    type="button"
                    className={styles.codeGenActionBtnDownload}
                    onClick={() => downloadFile(displayFileName, currentCode, mimeType)}
                    title={`Download ${displayFileName}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download {displayFileName}</span>
                  </button>
                </div>
              </div>

              {/* Syntax Code Display */}
              <pre className={styles.codePre} style={{ margin: 0, padding: "12px 16px", flex: 1, overflow: "auto" }}>
                <code>{currentCode}</code>
              </pre>
            </div>
          );
        })()}

        {/* Output Tab (Execution Log) */}
        {bottomTab === "output" && (
          <div>
            <div className={styles.panelTabs} style={{ borderBottom: "1px solid var(--ide-border)", paddingBottom: "6px", marginBottom: "8px" }}>
              <span className={styles.panelTab}>
                Execution Output (stdout)
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => runProgram()}
                >
                  ▶ Run
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setTerminalHistory([])}
                >
                  Clear
                </button>
              </div>
            </div>
            <pre className={styles.codePre} style={{ color: "#cccccc" }}>
              <code>
                {terminalHistory.filter((l) => !l.startsWith("PS C:\\MapToCode>")).join("\n") || "No program output yet. Run a program in Terminal or click ▶ Run to see output here."}
              </code>
            </pre>
          </div>
        )}

        {/* Problems Tab */}
        {bottomTab === "problems" && (
          <div>
            {diagnostics.length === 0 ? (
              <div style={{ color: "#10b981", padding: "10px 0" }}>
                ✓ No problems have been detected in the workspace.
              </div>
            ) : (
              diagnostics.map((d: any, i: number) => (
                <div
                  key={i}
                  className={`${styles.problemRow} ${d.severity === "warning" ? styles.problemRow : ""}`}
                  onClick={() => {
                    if (d.nodeId) setSelectedNode(d.nodeId);
                  }}
                >
                  <span>{d.severity === "warning" ? "⚠" : "⮾"}</span>
                  <span className={styles.problemMsg}>{d.message}</span>
                  <span className={styles.problemFile}>{activeTab || "main.fc"}</span>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );

  return (
    <div className={styles.ide}>
      {/* ====================================================================
          1. Window Titlebar
          ==================================================================== */}
      <header className={styles.titlebar}>
        <div className={styles.titlebarLeft}>
          <Link href="/" className={styles.titlebarLogo} title="MapToCode Home">
            {/* Orange 3-node flowchart icon */}
            <svg className={styles.titlebarLogoIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="9" y="2" width="6" height="5" rx="1.5" fill="#d48332" stroke="#d48332" />
              <path d="M12 7V13" stroke="#d48332" />
              <path d="M5 13H19" stroke="#d48332" />
              <path d="M5 13V17" stroke="#d48332" />
              <path d="M19 13V17" stroke="#d48332" />
              <rect x="2" y="17" width="6" height="5" rx="1.5" fill="#d48332" stroke="#d48332" />
              <rect x="16" y="17" width="6" height="5" rx="1.5" fill="#d48332" stroke="#d48332" />
            </svg>
            <span className={styles.titlebarLogoText}>MapToCode</span>
          </Link>

          {/* VS Code Menu Items */}
          <div className={styles.titlebarMenus}>
            <button
              type="button"
              className={`${styles.menuBtn} ${activeMenu === "file" ? styles.menuBtnOpen : ""}`}
              onClick={() => setActiveMenu(activeMenu === "file" ? null : "file")}
            >
              File
            </button>
            {activeMenu === "file" && (
              <div className={styles.dropdown}>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setNewProjectName("");
                    setNewProjectCodeLevel("beginner");
                    setActiveModal("newProject");
                    setActiveMenu(null);
                  }}
                >
                  <span>New Project...</span>
                  <span className={styles.dropdownKbd}>Ctrl+N</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setActiveModal("projects");
                    setActiveMenu(null);
                  }}
                >
                  <span>Open Project...</span>
                  <span className={styles.dropdownKbd}>Ctrl+O</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setActiveModal("samples");
                    setActiveMenu(null);
                  }}
                >
                  <span>Examples &amp; Templates...</span>
                </button>
                <div className={styles.dropdownDivider} />
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    handleSaveActiveFile();
                    setActiveMenu(null);
                  }}
                >
                  <span>Save</span>
                  <span className={styles.dropdownKbd}>Ctrl+S / Ctrl+C</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    downloadFile(`${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`, exportProjectJson(project), "application/json");
                    setActiveMenu(null);
                  }}
                >
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    downloadFile("main.py", pythonCode, "text/x-python");
                    setActiveMenu(null);
                  }}
                >
                  <span>Export Python (.py)</span>
                </button>
              </div>
            )}

            <button
              type="button"
              className={`${styles.menuBtn} ${activeMenu === "edit" ? styles.menuBtnOpen : ""}`}
              onClick={() => setActiveMenu(activeMenu === "edit" ? null : "edit")}
            >
              Edit
            </button>
            {activeMenu === "edit" && (
              <div className={styles.dropdown}>
                <button type="button" className={styles.dropdownItem} onClick={() => { undoGraph(); setActiveMenu(null); }}>
                  <span>Undo</span>
                  <span className={styles.dropdownKbd}>Ctrl+Z</span>
                </button>
                <button type="button" className={styles.dropdownItem} onClick={() => { redoGraph(); setActiveMenu(null); }}>
                  <span>Redo</span>
                  <span className={styles.dropdownKbd}>Ctrl+Y</span>
                </button>
                <div className={styles.dropdownDivider} />
                <button type="button" className={styles.dropdownItem} onClick={() => { autoArrangeLayout(); setActiveMenu(null); }}>
                  <span>Auto-Arrange Diagram</span>
                </button>
                <button type="button" className={styles.dropdownItem} onClick={() => { clearAllNodes(); setActiveMenu(null); }}>
                  <span>Clear All Blocks</span>
                </button>
              </div>
            )}

            <button
              type="button"
              className={`${styles.menuBtn} ${activeMenu === "view" ? styles.menuBtnOpen : ""}`}
              onClick={() => setActiveMenu(activeMenu === "view" ? null : "view")}
            >
              View
            </button>
            {activeMenu === "view" && (
              <div className={styles.dropdown}>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setLeftSidebarCollapsed((c) => !c);
                    setActiveMenu(null);
                  }}
                >
                  <span>Toggle Explorer</span>
                  <span className={styles.dropdownKbd}>Ctrl+B</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setBottomPanelCollapsed((c) => !c);
                    setActiveMenu(null);
                  }}
                >
                  <span>Toggle Terminal Panel</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setShowGrid((g) => !g);
                    setActiveMenu(null);
                  }}
                >
                  <span>Toggle Grid Dots</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setShowMinimap((m) => !m);
                    setActiveMenu(null);
                  }}
                >
                  <span>Toggle Minimap</span>
                </button>
                <div className={styles.dropdownDivider} />
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setBlocksWindowOpen((o) => !o);
                    setActiveMenu(null);
                  }}
                >
                  <span>{blocksWindowOpen ? "Hide" : "Show"} Blocks Subwindow</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setPropsWindowOpen((o) => !o);
                    setActiveMenu(null);
                  }}
                >
                  <span>{propsWindowOpen ? "Hide" : "Show"} Properties Subwindow</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setBlocksWindowFloating(false);
                    setPropsWindowFloating(false);
                    setBlocksWindowOpen(true);
                    setPropsWindowOpen(true);
                    setActiveMenu(null);
                  }}
                >
                  <span>Dock All Subwindows</span>
                </button>
                <div className={styles.dropdownDivider} />
                <button type="button" className={styles.dropdownItem} onClick={() => { autoArrangeLayout(); setActiveMenu(null); }}>
                  <span>Auto-Arrange Flowchart</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    toggleFlowchartFullscreen();
                    setActiveMenu(null);
                  }}
                >
                  <span>{isFlowchartFullscreen ? "Exit Full Screen" : "Full Screen Flowchart"}</span>
                  <span className={styles.dropdownKbd}>F11</span>
                </button>
              </div>
            )}

            <button
              type="button"
              className={`${styles.menuBtn} ${activeMenu === "run" ? styles.menuBtnOpen : ""}`}
              onClick={() => setActiveMenu(activeMenu === "run" ? null : "run")}
            >
              Run
            </button>
            {activeMenu === "run" && (
              <div className={styles.dropdown}>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    runProgram();
                    setActiveMenu(null);
                  }}
                >
                  <span>Run Python Program</span>
                  <span className={styles.dropdownKbd}>F5</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setActiveModal("traceLogic");
                    setActiveMenu(null);
                  }}
                >
                  <span>Step-by-Step Logic Tracer...</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    try {
                      const synced = syncProjectSpecification(project);
                      setProject(synced);
                      setNotice("✨ Algorithm specification synchronized with flowchart!");
                      setTimeout(() => setNotice(""), 3000);
                    } catch {}
                    setActiveMenu(null);
                  }}
                >
                  <span>Reconcile Specification</span>
                </button>
              </div>
            )}

            <button
              type="button"
              className={`${styles.menuBtn} ${activeMenu === "help" ? styles.menuBtnOpen : ""}`}
              onClick={() => setActiveMenu(activeMenu === "help" ? null : "help")}
            >
              Help
            </button>
            {activeMenu === "help" && (
              <div className={styles.dropdown}>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setActiveModal("guide");
                    setActiveMenu(null);
                  }}
                >
                  <span>User Guide &amp; Documentation</span>
                </button>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    setActiveModal("samples");
                    setActiveMenu(null);
                  }}
                >
                  <span>Interactive Examples</span>
                </button>
                <div className={styles.dropdownDivider} />
                <button
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => {
                    alert("MapToCode Flowchart IDE\nVersion 1.0.0\nTurn flowcharts into clean Python code.");
                    setActiveMenu(null);
                  }}
                >
                  <span>About MapToCode</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Run Button + Theme + Settings + Avatar + Window controls */}
        <div className={styles.titlebarRight}>
          <button
            type="button"
            className={styles.runBtn}
            onClick={() => runProgram()}
            title="Execute Flowchart as Python (F5)"
          >
            <span className={""}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </span>
            <span>Run</span>
            <span style={{ fontSize: "10px", marginLeft: "2px" }}>⌵</span>
          </button>

          {/* Theme icon (Sun) */}
          <button
            type="button"
            className={styles.titlebarIconBtn}
            onClick={() => setCanvasTheme((t) => (t === "dots" ? "grid" : t === "grid" ? "blueprint" : "dots"))}
            title="Toggle Canvas Theme (Dots / Grid / Blueprint)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>

          {/* Settings icon (Gear) */}
          <button
            type="button"
            className={styles.titlebarIconBtn}
            onClick={() => setActiveModal("settings")}
            title="Workspace Settings"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

        </div>
      </header>

      {/* ====================================================================
          2. IDE Main Body (Activity Bar + Left Sidebar + Canvas + Right Sidebar)
          ==================================================================== */}
      <div className={styles.body}>
        {/* Leftmost Activity Bar */}
        <nav className={styles.activityBar} aria-label="Activity Bar">
          <div className={styles.activityGroup}>
            <button
              type="button"
              className={`${styles.activityBtn} ${activeActivity === "explorer" && !leftSidebarCollapsed ? styles.activityBtnActive : ""}`}
              onClick={() => {
                if (activeActivity === "explorer" && !leftSidebarCollapsed) {
                  setLeftSidebarCollapsed(true);
                } else {
                  setActiveActivity("explorer");
                  setLeftSidebarCollapsed(false);
                }
              }}
              title="Explorer (Files)"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.activityBtn} ${activeActivity === "search" && !leftSidebarCollapsed ? styles.activityBtnActive : ""}`}
              onClick={() => {
                if (activeActivity === "search" && !leftSidebarCollapsed) {
                  setLeftSidebarCollapsed(true);
                } else {
                  setActiveActivity("search");
                  setLeftSidebarCollapsed(false);
                }
              }}
              title="Search Diagram &amp; Code"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.activityBtn} ${activeActivity === "git" && !leftSidebarCollapsed ? styles.activityBtnActive : ""}`}
              onClick={() => {
                if (activeActivity === "git" && !leftSidebarCollapsed) {
                  setLeftSidebarCollapsed(true);
                } else {
                  setActiveActivity("git");
                  setLeftSidebarCollapsed(false);
                }
              }}
              title="Source Control"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="18" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                <line x1="6" y1="9" x2="6" y2="21" />
              </svg>
            </button>

            <button
              type="button"
              className={`${styles.activityBtn} ${activeActivity === "debug" && !leftSidebarCollapsed ? styles.activityBtnActive : ""}`}
              onClick={() => {
                setActiveModal("traceLogic");
              }}
              title="Run &amp; Debug (Logic Tracer)"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          </div>

          <div className={styles.activityGroup}>
            <button
              type="button"
              className={styles.activityBtn}
              onClick={() => setActiveModal("settings")}
              title="Settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </nav>

        {/* Left Sidebar (Explorer View) */}
        <aside className={`${styles.sidebar} ${leftSidebarCollapsed ? styles.sidebarHidden : ""}`}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarHeaderTitle}>
              {activeActivity === "explorer"
                ? "Explorer"
                : activeActivity === "search"
                ? "Search"
                : activeActivity === "git"
                ? "Source Control"
                : "Debugger"}
            </span>
            <div className={styles.sidebarHeaderActions}>
              <button
                type="button"
                className={styles.sidebarHeaderBtn}
                onClick={() => {
                  setExplorerOpen(true);
                  const activeFolder = selectedFolderId
                    ? explorerFolders.find((f) => f.id === selectedFolderId)
                    : null;
                  if (activeFolder) {
                    setExplorerFolders((prev) =>
                      prev.map((f) => (f.id === activeFolder.id ? { ...f, isOpen: true } : f))
                    );
                    setTargetFolderId(activeFolder.id);
                  } else {
                    setTargetFolderId(null);
                  }
                  setIsCreatingItem("file");
                  setNewItemName("");
                }}
                title={
                  selectedFolderId
                    ? `New File inside ${explorerFolders.find((f) => f.id === selectedFolderId)?.name || "Folder"}...`
                    : "New File..."
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.sidebarHeaderBtn}
                onClick={() => {
                  setExplorerOpen(true);
                  setIsCreatingItem("folder");
                  setNewItemName("");
                }}
                title="New Folder..."
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.sidebarHeaderBtn}
                onClick={handleCopyFile}
                title={
                  selectedFileId
                    ? `Copy ${explorerFiles.find((f) => f.id === selectedFileId)?.name} (Ctrl+C)`
                    : "Copy file (Ctrl+C)"
                }
                style={{
                  opacity: selectedFileId ? 1 : 0.5,
                  cursor: selectedFileId ? "pointer" : "default",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.sidebarHeaderBtn}
                onClick={handlePasteFile}
                title="Paste copied file (Ctrl+V)"
                style={{
                  opacity: copiedFileRef.current ? 1 : 0.5,
                  cursor: copiedFileRef.current ? "pointer" : "default",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.sidebarHeaderBtn}
                onClick={handleRenameSelected}
                title={
                  selectedFileId
                    ? `Rename ${explorerFiles.find((f) => f.id === selectedFileId)?.name} (F2)`
                    : selectedFolderId
                    ? `Rename folder ${explorerFolders.find((f) => f.id === selectedFolderId)?.name} (F2)`
                    : "Rename selected file or folder (F2)"
                }
                style={{
                  opacity:
                    (selectedFileId && !["file-main-fc", "file-algo-ps"].includes(selectedFileId)) ||
                    (selectedFolderId && selectedFolderId !== "folder-assets")
                      ? 1
                      : 0.5,
                  cursor:
                    (selectedFileId && !["file-main-fc", "file-algo-ps"].includes(selectedFileId)) ||
                    (selectedFolderId && selectedFolderId !== "folder-assets")
                      ? "pointer"
                      : "default",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.sidebarHeaderBtn}
                onClick={handleDeleteSelected}
                title={
                  selectedFileId
                    ? `Delete ${explorerFiles.find((f) => f.id === selectedFileId)?.name} (Del)`
                    : selectedFolderId
                    ? `Delete folder ${explorerFolders.find((f) => f.id === selectedFolderId)?.name} (Del)`
                    : "Delete selected file or folder (Del)"
                }
                style={{
                  opacity:
                    (selectedFileId && !["file-main-fc", "file-algo-ps"].includes(selectedFileId)) ||
                    (selectedFolderId && selectedFolderId !== "folder-assets")
                      ? 1
                      : 0.5,
                  cursor:
                    (selectedFileId && !["file-main-fc", "file-algo-ps"].includes(selectedFileId)) ||
                    (selectedFolderId && selectedFolderId !== "folder-assets")
                      ? "pointer"
                      : "default",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
              <button
                type="button"
                className={styles.sidebarHeaderBtn}
                onClick={() => {
                  try {
                    const store = createProjectStore(window.localStorage);
                    setSavedProjects(store.list());
                  } catch {}
                  setNotice("Explorer refreshed");
                  setTimeout(() => setNotice(""), 2000);
                }}
                title="Refresh Explorer"
              >
                ⟲
              </button>
              <button
                type="button"
                className={styles.sidebarHeaderBtn}
                onClick={() => setActiveModal("samples")}
                title="Examples Library"
              >
                📂
              </button>
            </div>
          </div>

          <div className={styles.treeSection}>
            {/* Project Folder Row */}
            <div
              className={styles.treeFolderRow}
              onClick={() => {
                setSelectedFolderId(null);
                setExplorerOpen((o) => !o);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, overflow: "hidden" }}>
                <span className={styles.treeFolderChevron}>{explorerOpen ? "⌵" : ">"}</span>
                <span className={styles.treeProjectTitle} title={project?.name || "Project"}>
                  {project?.name || "My Project"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "3px", marginLeft: "auto", flexShrink: 0 }}>
                <button
                  type="button"
                  className={styles.sidebarHeaderBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExplorerOpen(true);
                    setTargetFolderId(null);
                    setIsCreatingItem("file");
                    setNewItemName("");
                  }}
                  title="New File..."
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={styles.sidebarHeaderBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExplorerOpen(true);
                    setIsCreatingItem("folder");
                    setNewItemName("");
                  }}
                  title="New Folder..."
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                </button>
              </div>
            </div>

            {explorerOpen && (
              <>
                {/* Inline Creation Input at Root Level (VS Code Style) */}
                {isCreatingItem === "file" && !targetFolderId && (
                  <div className={styles.treeItemRow} style={{ background: "#2a2d2e" }}>
                    <div className={styles.treeItemLeft} style={{ width: "100%" }}>
                      <svg className={styles.treeFileIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <input
                        type="text"
                        className={styles.inlineTreeInput}
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleConfirmNewItem();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            handleCancelNewItem();
                          }
                        }}
                        onBlur={() => {
                          if (!isConfirmingNewItemRef.current) {
                            handleConfirmNewItem();
                          }
                        }}
                        placeholder="File name with extension (e.g. notes.txt, flow.fc, script.ps)"
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {isCreatingItem === "folder" && (
                  <div className={styles.treeItemRow} style={{ background: "#2a2d2e" }}>
                    <div className={styles.treeItemLeft} style={{ width: "100%" }}>
                      <svg className={styles.treeFileIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <input
                        type="text"
                        className={styles.inlineTreeInput}
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleConfirmNewItem();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            handleCancelNewItem();
                          }
                        }}
                        onBlur={() => {
                          if (!isConfirmingNewItemRef.current) {
                            handleConfirmNewItem();
                          }
                        }}
                        placeholder="Folder name"
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {/* Folders */}
                {explorerFolders.map((folder) => {
                  const folderFiles = explorerFiles.filter((f) => f.folderId === folder.id);
                  const isCreatingInThisFolder = isCreatingItem === "file" && targetFolderId === folder.id;

                  return (
                    <div key={folder.id}>
                      <div
                        className={`${styles.treeItemRow} ${selectedFolderId === folder.id ? styles.treeItemActive : ""}`}
                        onClick={() => {
                          setSelectedFolderId(folder.id);
                          setSelectedFileId(null);
                          setExplorerFolders((prev) =>
                            prev.map((f) => (f.id === folder.id ? { ...f, isOpen: !f.isOpen } : f))
                          );
                        }}
                      >
                        <div className={styles.treeItemLeft}>
                          <span className={styles.treeFolderChevron}>{folder.isOpen ? "⌵" : ">"}</span>
                          <svg className={styles.treeFileIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          <span>{folder.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                          {/* New File inside this folder button */}
                          <button
                            type="button"
                            className={styles.treeItemActionBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFolderId(folder.id);
                              setSelectedFileId(null);
                              setExplorerFolders((prev) =>
                                prev.map((f) => (f.id === folder.id ? { ...f, isOpen: true } : f))
                              );
                              setTargetFolderId(folder.id);
                              setIsCreatingItem("file");
                              setNewItemName("");
                            }}
                            title={`New File inside ${folder.name}...`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="12" y1="18" x2="12" y2="12" />
                              <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                          </button>
                          {folder.id !== "folder-assets" && (
                            <>
                              <span className={styles.treeItemKeyBadge} title="Press Delete key on keyboard to delete">Del</span>
                              <button
                                type="button"
                                className={styles.treeItemDelete}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFolder(folder.id, folder.name);
                                }}
                                title={`Delete ${folder.name} (Del)`}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Folder Children (Files & Inline Creation) */}
                      {folder.isOpen && (
                        <div>
                          {isCreatingInThisFolder && (
                            <div className={styles.treeItemRow} style={{ paddingLeft: "34px", background: "#2a2d2e" }}>
                              <div className={styles.treeItemLeft} style={{ width: "100%" }}>
                                <svg className={styles.treeFileIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                                <input
                                  type="text"
                                  className={styles.inlineTreeInput}
                                  value={newItemName}
                                  onChange={(e) => setNewItemName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleConfirmNewItem();
                                    if (e.key === "Escape") handleCancelNewItem();
                                  }}
                                  onBlur={handleConfirmNewItem}
                                  placeholder={`file in ${folder.name}`}
                                  autoFocus
                                />
                              </div>
                            </div>
                          )}

                          {folderFiles.map((file) => {
                            const isFc = file.type === "fc";
                            const isPs = file.type === "ps";
                            const displayName = file.name.includes("/") ? file.name.split("/").slice(1).join("/") : file.name;

                            return (
                              <div
                                key={file.id}
                                className={`${styles.treeItemRow} ${activeTab === file.name || selectedFileId === file.id ? styles.treeItemActive : ""}`}
                                style={{ paddingLeft: "34px" }}
                                onClick={() => {
                                  setSelectedFolderId(null);
                                  setSelectedFileId(file.id);
                                  handleOpenFile(file.name);
                                }}
                              >
                                <div className={styles.treeItemLeft}>
                                  {isFc ? (
                                    <svg className={styles.treeFileIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2.2">
                                      <rect x="9" y="3" width="6" height="5" rx="1.5" />
                                      <path d="M12 8V14" />
                                      <path d="M5 14H19" />
                                      <rect x="2" y="16" width="6" height="5" rx="1.5" />
                                      <rect x="16" y="16" width="6" height="5" rx="1.5" />
                                    </svg>
                                  ) : isPs ? (
                                    <svg className={styles.treeFileIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8c92a4" strokeWidth="2">
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                      <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                  ) : (
                                    <svg className={styles.treeFileIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                      <polyline points="14 2 14 8 20 8" />
                                      <line x1="16" y1="13" x2="8" y2="13" />
                                      <line x1="16" y1="17" x2="8" y2="17" />
                                    </svg>
                                  )}
                                  <span>{displayName}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                  {isFc && !getCompanionFile(file) ? (
                                    <button
                                      type="button"
                                      className={styles.remakeIconBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        remakePseudocodeFromFlowchart(file.name);
                                      }}
                                      title="Companion pseudocode was deleted — click to remake .ps from this flowchart"
                                    >
                                      📝
                                    </button>
                                  ) : isPs && !getCompanionFile(file) ? (
                                    <button
                                      type="button"
                                      className={styles.remakeIconBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        remakeFlowchartFromPseudocode(file.name);
                                      }}
                                      title="Companion flowchart was deleted — click to remake .fc from this pseudocode"
                                    >
                                      ⚡
                                    </button>
                                  ) : null}
                                  <span className={styles.treeItemKeyBadge} title="Press Delete key on keyboard to delete">Del</span>
                                  <button
                                    type="button"
                                    className={styles.treeItemDelete}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteFile(file.id, file.name);
                                    }}
                                    title={`Delete ${file.name} (Del)`}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {folderFiles.length === 0 && !isCreatingInThisFolder && (
                            <div style={{ padding: "3px 34px", fontSize: "11px", color: "#6e7681", fontStyle: "italic" }}>
                              (empty)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Root Files */}
                {explorerFiles.filter((f) => !f.folderId).map((file) => {
                  const isFc = file.type === "fc";
                  const isPs = file.type === "ps";
                  const isDefaultFile = file.name === "main.fc" || file.name === "algorithm.ps";

                  return (
                    <div
                      key={file.id}
                      className={`${styles.treeItemRow} ${activeTab === file.name || selectedFileId === file.id ? styles.treeItemActive : ""}`}
                      onClick={() => {
                        setSelectedFolderId(null);
                        setSelectedFileId(file.id);
                        handleOpenFile(file.name);
                      }}
                    >
                      <div className={styles.treeItemLeft}>
                        {isFc ? (
                          <svg className={styles.treeFileIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2.2">
                            <rect x="9" y="3" width="6" height="5" rx="1.5" />
                            <path d="M12 8V14" />
                            <path d="M5 14H19" />
                            <rect x="2" y="16" width="6" height="5" rx="1.5" />
                            <rect x="16" y="16" width="6" height="5" rx="1.5" />
                          </svg>
                        ) : isPs ? (
                          <svg className={styles.treeFileIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8c92a4" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        ) : (
                          <svg className={styles.treeFileIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        )}
                        <span>{file.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {isFc && !getCompanionFile(file) ? (
                          <button
                            type="button"
                            className={styles.remakeIconBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              remakePseudocodeFromFlowchart(file.name);
                            }}
                            title="Companion pseudocode was deleted — click to remake .ps from this flowchart"
                          >
                            📝
                          </button>
                        ) : isPs && !getCompanionFile(file) ? (
                          <button
                            type="button"
                            className={styles.remakeIconBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              remakeFlowchartFromPseudocode(file.name);
                            }}
                            title="Companion flowchart was deleted — click to remake .fc from this pseudocode"
                          >
                            ⚡
                          </button>
                        ) : null}
                        <span className={styles.treeItemKeyBadge} title="Press Delete key on keyboard to delete">Del</span>
                        <button
                          type="button"
                          className={styles.treeItemDelete}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file.id, file.name);
                          }}
                          title={`Delete ${file.name} (Del)`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}

                {explorerFolders.length === 0 && explorerFiles.length === 0 && !isCreatingItem && (
                  <div style={{ padding: "14px 16px", fontSize: "12px", color: "#64748b", fontStyle: "italic", textAlign: "center" }}>
                    Empty project workspace.<br />Click + above to create a file or folder.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Accordion: OUTLINE */}
          <div className={styles.sidebarAccordion}>
            <button
              type="button"
              className={styles.accordionHeader}
              onClick={() => setOutlineOpen((o) => !o)}
            >
              <span className={styles.treeFolderChevron}>{outlineOpen ? "⌵" : ">"}</span>
              <span>Outline</span>
            </button>
            {outlineOpen && (
              <div className={styles.accordionContent}>
                {project.flowchart.nodes.map((node) => (
                  <div
                    key={node.id}
                    className={styles.outlineItem}
                    onClick={() => {
                      setSelectedNode(node.id);
                      setSelectedEdge(null);
                      setRightSidebarCollapsed(false);
                      setPropsWindowOpen(true);
                      setPropsWindowCollapsed(false);
                    }}
                  >
                    <span>
                      {node.kind === "start" || node.kind === "initialization" ? "🟢" : node.kind === "end" ? "🔴" : node.kind === "decision" ? "🟠" : node.kind === "input" ? "🔵" : "🟣"}
                    </span>
                    <span>
                      {node.kind === "input"
                        ? `Input ${(node.payload as any)?.name || ""}`
                        : node.kind === "initialization"
                        ? `Initialize ${(node.payload as any)?.name || "value"} = ${(node.payload as any)?.initializer || "0"}`
                        : node.kind === "decision"
                        ? `Decision ${(node.payload as any)?.condition || ""}`
                        : node.kind === "output"
                        ? `Output`
                        : node.kind.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Accordion: TIMELINE */}
          <div className={styles.sidebarAccordion}>
            <button
              type="button"
              className={styles.accordionHeader}
              onClick={() => setTimelineOpen((o) => !o)}
            >
              <span className={styles.treeFolderChevron}>{timelineOpen ? "⌵" : ">"}</span>
              <span>Timeline</span>
            </button>
            {timelineOpen && (
              <div className={styles.accordionContent}>
                <div className={styles.outlineItem}>
                  <span>🕒</span>
                  <span>Revision {project.flowchart.revision} (Current)</span>
                </div>
                <div className={styles.outlineItem}>
                  <span>🕒</span>
                  <span>Initial commit</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Main Work Area */}
        <div className={styles.main}>
          {/* Editor Tabs Bar */}
          <div className={styles.tabs}>
            {openTabs.map((tabName) => {
              const file = explorerFiles.find((f) => f.name === tabName);
              const isFc = tabName === "main.fc" || tabName.endsWith(".fc") || tabName.endsWith(".fs") || file?.type === "fc";
              const isPs = tabName === "algorithm.ps" || tabName.endsWith(".ps") || file?.type === "ps";
              const isLinkedPair = (isFc || isPs) && Boolean(getCompanionFile(file || tabName));
              const isActive = activeTab === tabName;

              return (
                <div
                  key={tabName}
                  className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
                  onClick={() => handleOpenFile(tabName)}
                  title={tabName}
                >
                  {isFc ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2.2">
                      <rect x="9" y="3" width="6" height="5" rx="1.5" />
                      <path d="M12 8V14" />
                      <path d="M5 14H19" />
                      <rect x="2" y="16" width="6" height="5" rx="1.5" />
                      <rect x="16" y="16" width="6" height="5" rx="1.5" />
                    </svg>
                  ) : isPs ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8c92a4" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  )}
                  <span>{tabName}</span>
                  {unsavedFiles.has(tabName) && (
                    <span
                      className={styles.unsavedDot}
                      title="Unsaved changes (Save with Ctrl+S or Ctrl+C)"
                    />
                  )}
                  {isLinkedPair && (
                    <span
                      style={{ fontSize: "10px", color: isActive ? "#38bdf8" : "#64748b", opacity: 0.8 }}
                      title="Linked flowchart and pseudocode pair"
                    >
                      🔗
                    </span>
                  )}
                  <button
                    type="button"
                    className={styles.tabClose}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(tabName);
                    }}
                    title={`Close ${tabName}`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => {
                setExplorerOpen(true);
                setIsCreatingItem("file");
                setNewItemName("");
              }}
              title="New File..."
            >
              +
            </button>
          </div>

          {/* IDE Breadcrumbs & File Pipeline Bar */}
          {(() => {
            const activeFileObj = explorerFiles.find((f) => f.name === activeTab);
            const activeFolder = activeFileObj?.folderId
              ? explorerFolders.find((folder) => folder.id === activeFileObj.folderId)
              : null;

            const isCurrentFc = Boolean(activeTab && (activeTab.endsWith(".fc") || activeTab.endsWith(".fs")));
            const isCurrentPs = Boolean(activeTab && activeTab.endsWith(".ps"));

            // Files inside a folder can form a linked module for that folder
            const folderFiles = activeFolder
              ? explorerFiles.filter((f) => f.folderId === activeFolder.id)
              : [];
            const folderFc = folderFiles.find((f) =>
              (f.name.endsWith(".fc") || f.name.endsWith(".fs")) && Boolean(getCompanionFile(f))
            );
            const folderPs = folderFc ? getCompanionFile(folderFc) : null;
            const folderTxt = folderFiles.find((f) => !f.name.endsWith(".fc") && !f.name.endsWith(".fs") && !f.name.endsWith(".ps"));
            const hasFolderPipeline = Boolean(folderFc && folderPs);

            return (
              <div className={styles.ideBreadcrumbsBar}>
                {/* Left: IDE File Path Breadcrumbs */}
                <div className={styles.breadcrumbPath}>
                  <span className={styles.breadcrumbItem} title="Workspace Root">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>MapToCode</span>
                  </span>
                  {activeFolder && (
                    <>
                      <span className={styles.breadcrumbSeparator}>›</span>
                      <span className={styles.breadcrumbItem}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        <span>{activeFolder.name}</span>
                      </span>
                    </>
                  )}
                  <span className={styles.breadcrumbSeparator}>›</span>
                  <span className={`${styles.breadcrumbItem} ${styles.breadcrumbActiveFile}`}>
                    {isCurrentFc ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2.2">
                        <rect x="9" y="3" width="6" height="5" rx="1.5" />
                        <path d="M12 8V14" />
                        <path d="M5 14H19" />
                        <rect x="2" y="16" width="6" height="5" rx="1.5" />
                        <rect x="16" y="16" width="6" height="5" rx="1.5" />
                      </svg>
                    ) : isCurrentPs ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8c92a4" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    ) : activeTab ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    ) : null}
                    <span>{activeTab || "(no file open)"}</span>
                  </span>
                </div>

                {/* Right: If inside folder with multiple companion files, show that folder's pipeline.
                    If file is outside the folder (root), it works lonely/standalone with no linked pipeline! */}
                {activeFolder && hasFolderPipeline ? (
                  <div className={styles.linkedPipelineContainer}>
                    <div className={styles.linkedPipelineLabel}>
                      <span className={styles.linkedDot} />
                      <span>{activeFolder.name} Pipeline:</span>
                    </div>
                    <div className={styles.pipelineChain}>
                      {folderFc && (
                        <button
                          type="button"
                          className={`${styles.pipelineNode} ${activeTab === folderFc.name ? styles.pipelineNodeActive : ""}`}
                          onClick={() => handleOpenFile(folderFc.name)}
                          title={`Flowchart: ${folderFc.name}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2.2">
                            <rect x="9" y="3" width="6" height="5" rx="1.5" />
                            <path d="M12 8V14" />
                            <path d="M5 14H19" />
                            <rect x="2" y="16" width="6" height="5" rx="1.5" />
                            <rect x="16" y="16" width="6" height="5" rx="1.5" />
                          </svg>
                          <span>{folderFc.name.split("/").pop()}</span>
                          <span className={styles.pipelineExtTag}>.fc</span>
                        </button>
                      )}
                      {folderFc && folderPs && (
                        <div className={styles.pipelineArrow}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </div>
                      )}
                      {folderPs && (
                        <button
                          type="button"
                          className={`${styles.pipelineNode} ${activeTab === folderPs.name ? styles.pipelineNodeActive : ""}`}
                          onClick={() => handleOpenFile(folderPs.name)}
                          title={`Pseudocode: ${folderPs.name}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8c92a4" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span>{folderPs.name.split("/").pop()}</span>
                          <span className={styles.pipelineExtTag}>.ps</span>
                        </button>
                      )}
                      {folderPs && folderTxt && (
                        <div className={styles.pipelineArrow}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </div>
                      )}
                      {folderTxt && (
                        <button
                          type="button"
                          className={`${styles.pipelineNode} ${activeTab === folderTxt.name ? styles.pipelineNodeActive : ""}`}
                          onClick={() => handleOpenFile(folderTxt.name)}
                          title={`Text / Notes: ${folderTxt.name}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                          <span>{folderTxt.name.split("/").pop()}</span>
                          <span className={styles.pipelineExtTag}>.txt</span>
                        </button>
                      )}
                      {folderFc && !folderPs && (
                        <button
                          type="button"
                          className={styles.remakeActionBtn}
                          onClick={() => remakePseudocodeFromFlowchart(folderFc.name)}
                          title="Remake missing companion pseudocode (.ps) in this folder"
                        >
                          + Remake .ps
                        </button>
                      )}
                      {folderPs && !folderFc && (
                        <button
                          type="button"
                          className={styles.remakeActionBtn}
                          onClick={() => remakeFlowchartFromPseudocode(folderPs.name)}
                          title="Remake missing companion flowchart (.fc) in this folder"
                        >
                          + Remake .fc
                        </button>
                      )}
                    </div>
                  </div>
                ) : activeTab ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {!activeFolder && !getCompanionFile(activeFileObj || activeTab) && (
                      <div className={styles.standaloneBadge} title="Standalone file without a matching flowchart and pseudocode pair">
                        <span className={styles.standaloneDot} />
                        <span>Standalone File</span>
                      </div>
                    )}
                    {isCurrentFc && !getCompanionFile(activeTab) ? (
                      <button
                        type="button"
                        className={styles.remakeActionBtn}
                        onClick={() => remakePseudocodeFromFlowchart()}
                        title="Companion pseudocode was deleted — click to remake .ps from this flowchart"
                      >
                        <span>📝</span>
                        <span>Remake .ps</span>
                      </button>
                    ) : isCurrentPs && !getCompanionFile(activeTab) ? (
                      <button
                        type="button"
                        className={styles.remakeActionBtn}
                        onClick={() => remakeFlowchartFromPseudocode()}
                        title="Companion flowchart was deleted — click to remake .fc from this pseudocode"
                      >
                        <span>⚡</span>
                        <span>Remake .fc</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })()}

          {Boolean(activeTab && (activeTab === "main.fc" || activeTab.endsWith(".fc") || activeTab.endsWith(".fs"))) ? (
            <div
              ref={flowchartWrapperRef}
              className={`${styles.flowchartWorkspace} ${isFlowchartFullscreen ? styles.flowchartFullscreen : ""}`}
            >
              {/* Canvas Toolbar Docked Directly Under Tabs */}
              <div className={styles.canvasToolbar}>
                <div className={styles.toolGroup}>
                  {/* Select pointer tool */}
                  <button
                    type="button"
                    className={`${styles.toolBtn} ${activeTool === "select" ? styles.toolBtnActive : ""}`}
                    onClick={() => setActiveTool("select")}
                    title="Select &amp; Edit Tool"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="3 3 10.07 19.97 12.58 12.58 19.97 10.07 3 3" />
                    </svg>
                  </button>

                  {/* Pan / Hand tool */}
                  <button
                    type="button"
                    className={`${styles.toolBtn} ${activeTool === "pan" ? styles.toolBtnActive : ""}`}
                    onClick={() => setActiveTool("pan")}
                    title="Pan Tool"
                  >
                    ✋
                  </button>

                  {/* Auto Arrange Flowchart tool */}
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={autoArrangeLayout}
                    title="Auto Arrange Flowchart"
                    aria-label="Auto Arrange Flowchart"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="8.5" y="2" width="7" height="5" rx="1" />
                      <path d="M12 7v4" />
                      <path d="M5.5 11h13" />
                      <path d="M5.5 11v4" />
                      <path d="M18.5 11v4" />
                      <rect x="2" y="15" width="7" height="5" rx="1" />
                      <rect x="15" y="15" width="7" height="5" rx="1" />
                    </svg>
                  </button>

                  {/* Full Screen Flowchart toggle tool button */}
                  <button
                    type="button"
                    className={`${styles.toolBtn} ${isFlowchartFullscreen ? styles.toolBtnActive : ""}`}
                    onClick={toggleFlowchartFullscreen}
                    title={isFlowchartFullscreen ? "Exit Full Screen (Esc or F11)" : "Full Screen Flowchart (F11)"}
                    aria-label={isFlowchartFullscreen ? "Exit Full Screen" : "Full Screen Flowchart"}
                  >
                    {isFlowchartFullscreen ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="21" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    )}
                  </button>

                  <div className={styles.toolSep} />

                  {/* Zoom Out */}
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                    title="Zoom Out"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>

                  {/* Zoom In */}
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                    title="Zoom In"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>

                  <div className={styles.toolSep} />

                  {/* Undo */}
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={undoGraph}
                    title="Undo (Ctrl+Z)"
                  >
                    ↺
                  </button>

                  {/* Redo */}
                  <button
                    type="button"
                    className={styles.toolBtn}
                    onClick={redoGraph}
                    title="Redo (Ctrl+Y)"
                  >
                    ↻
                  </button>
                </div>

                <div className={styles.toolGroupRight}>
                  {/* Zoom Percentage dropdown */}
                  <select
                    className={styles.zoomSelect}
                    value={Math.round(zoom * 100)}
                    onChange={(e) => setZoom(Number(e.target.value) / 100)}
                  >
                    <option value="50">50%</option>
                    <option value="75">75%</option>
                    <option value="100">100%</option>
                    <option value="125">125%</option>
                    <option value="150">150%</option>
                  </select>

                  {/* Minimap toggle button */}
                  <button
                    type="button"
                    className={`${styles.toolBtn} ${showMinimap ? styles.toolBtnActive : ""}`}
                    onClick={() => setShowMinimap((m) => !m)}
                    title="Toggle Minimap"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                  </button>

                  <div className={styles.toolSep} />

                  {/* Subwindow Toggles */}
                  <button
                    type="button"
                    className={`${styles.toolBtn} ${!rightSidebarCollapsed && blocksWindowOpen && !blocksWindowCollapsed ? styles.toolBtnActive : ""}`}
                    onClick={() => {
                      if (!rightSidebarCollapsed && blocksWindowOpen && !blocksWindowCollapsed) {
                        setBlocksWindowCollapsed(true);
                        if (propsWindowCollapsed || !propsWindowOpen) setRightSidebarCollapsed(true);
                      } else {
                        setRightSidebarCollapsed(false);
                        setBlocksWindowOpen(true);
                        setBlocksWindowCollapsed(false);
                        setBlocksWindowFloating(false);
                      }
                    }}
                    title={!rightSidebarCollapsed && blocksWindowOpen && !blocksWindowCollapsed ? "Hide Blocks Subwindow" : "Show Blocks Subwindow"}
                    style={{ width: "auto", padding: "0 7px", gap: "4px", fontSize: "11.5px" }}
                  >
                    <span>📦</span>
                    <span>Blocks</span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.toolBtn} ${!rightSidebarCollapsed && propsWindowOpen && !propsWindowCollapsed ? styles.toolBtnActive : ""}`}
                    onClick={() => {
                      if (!rightSidebarCollapsed && propsWindowOpen && !propsWindowCollapsed) {
                        setPropsWindowCollapsed(true);
                        if (blocksWindowCollapsed || !blocksWindowOpen) setRightSidebarCollapsed(true);
                      } else {
                        setRightSidebarCollapsed(false);
                        setPropsWindowOpen(true);
                        setPropsWindowCollapsed(false);
                        setPropsWindowFloating(false);
                      }
                    }}
                    title={!rightSidebarCollapsed && propsWindowOpen && !propsWindowCollapsed ? "Hide Properties Subwindow" : "Show Properties Subwindow"}
                    style={{ width: "auto", padding: "0 7px", gap: "4px", fontSize: "11.5px" }}
                  >
                    <span>⚙️</span>
                    <span>Properties</span>
                  </button>

                  <div className={styles.toolSep} />

                  {/* Save flowchart button with unsaved indicator */}
                  <button
                    type="button"
                    className={`${styles.saveToolbarBtn} ${unsavedFiles.has(activeTab) ? styles.saveToolbarBtnDirty : ""}`}
                    onClick={() => handleSaveActiveFile()}
                    title="Save flowchart and update companion pseudocode & Python (Ctrl+S or Ctrl+C)"
                  >
                    <span>💾 Save</span>
                    {unsavedFiles.has(activeTab) && <span className={styles.dirtyDot} />}
                  </button>

                  {/* Remake Pseudocode (.ps) — ONLY shown when companion .ps is deleted/missing */}
                  {!getCompanionFile(activeTab) && (
                    <button
                      type="button"
                      className={styles.remakeActionBtn}
                      onClick={() => remakePseudocodeFromFlowchart()}
                      title="Companion pseudocode was deleted — click to remake .ps from this flowchart"
                    >
                      <span>📝</span>
                      <span>Remake Pseudocode (.ps)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Main Content Area: Flowchart Canvas + Docked Right Panel */}
              <div className={styles.flowchartContentArea}>
                {/* Center Column: Flowchart Canvas on top + Bottom Panel (Terminal) on bottom */}
                <div className={styles.flowchartCenterColumn}>
                  {/* Center Canvas Area */}
                  <div className={styles.canvasArea}>
                  <FlowCanvas
                    flowchart={project.flowchart as any}
                    selected={selectedNode}
                    setSelected={(id) => {
                      setSelectedNode(id || "");
                      if (id) {
                        setSelectedEdge(null);
                        setRightSidebarCollapsed(false);
                        setPropsWindowOpen(true);
                        setPropsWindowCollapsed(false);
                      }
                    }}
                    moveNode={moveNode}
                    zoom={zoom}
                    setZoom={setZoom}
                    selectedEdge={selectedEdge}
                    setSelectedEdge={(id) => {
                      setSelectedEdge(id);
                      if (id) setSelectedNode("");
                    }}
                    onDeleteEdge={removeEdge}
                    onDeleteNode={deleteNode}
                    onConnect={addEdge}
                    onDuplicate={(node) => duplicateNode(node as FlowchartNode)}
                    snapToGrid={snapToGrid}
                    showGrid={showGrid}
                    canvasTheme={canvasTheme}
                    edgeRouting={edgeRouting}
                    showMinimap={showMinimap}
                    onAddNodeAtPosition={addNodeAtPosition}
                    emptyWatermark={
                      <div className={styles.canvasEmpty}>
                        <svg className={styles.canvasEmptyIcon} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="18" y="6" width="12" height="8" rx="2" />
                          <path d="M24 14V22" />
                          <path d="M12 22H36" />
                          <path d="M12 22V30" />
                          <path d="M36 22V30" />
                          <rect x="6" y="30" width="12" height="8" rx="2" />
                          <rect x="30" y="30" width="12" height="8" rx="2" />
                        </svg>
                        <h3 className={styles.canvasEmptyTitle}>Start drawing your flowchart</h3>
                        <p className={styles.canvasEmptySub}>Drag and drop shapes or click to add</p>
                      </div>
                    }
                  />

                  {/* Floating Blocks Subwindow */}
                  {blocksWindowFloating && blocksWindowOpen && (
                    <div
                      className={styles.floatingSubwindow}
                      style={{ left: blocksWindowPos.x, top: blocksWindowPos.y }}
                    >
                      <div
                        className={styles.subwindowHeader}
                        onMouseDown={(e) => handleWindowDragStart(e, "blocks")}
                      >
                        <div className={styles.subwindowTitle}>
                          <span className={styles.subwindowChevron}>⋮⋮</span>
                          <span>📦 Blocks</span>
                        </div>
                        <div className={styles.subwindowActions} onMouseDown={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => setBlocksWindowCollapsed((c) => !c)}
                            title={blocksWindowCollapsed ? "Expand Subwindow" : "Minimize Subwindow"}
                          >
                            {blocksWindowCollapsed ? "□" : "—"}
                          </button>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => setBlocksWindowFloating(false)}
                            title="Dock back to Right Sidebar"
                          >
                            ⇲
                          </button>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => setBlocksWindowOpen(false)}
                            title="Close Subwindow"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {!blocksWindowCollapsed && (
                        <div className={styles.subwindowBody}>
                          {renderBlocksContent()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Floating Properties Subwindow */}
                  {propsWindowFloating && propsWindowOpen && (
                    <div
                      className={styles.floatingSubwindow}
                      style={{ left: propsWindowPos.x, top: propsWindowPos.y }}
                    >
                      <div
                        className={styles.subwindowHeader}
                        onMouseDown={(e) => handleWindowDragStart(e, "props")}
                      >
                        <div className={styles.subwindowTitle}>
                          <span className={styles.subwindowChevron}>⋮⋮</span>
                          <span>⚙️ Properties {selectedNodeObj ? `(${selectedNodeObj.kind})` : ""}</span>
                        </div>
                        <div className={styles.subwindowActions} onMouseDown={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => setPropsWindowCollapsed((c) => !c)}
                            title={propsWindowCollapsed ? "Expand Subwindow" : "Minimize Subwindow"}
                          >
                            {propsWindowCollapsed ? "□" : "—"}
                          </button>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => setPropsWindowFloating(false)}
                            title="Dock back to Right Sidebar"
                          >
                            ⇲
                          </button>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => setPropsWindowOpen(false)}
                            title="Close Subwindow"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {!propsWindowCollapsed && (
                        <div className={styles.subwindowBody}>
                          {renderPropsContent()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Panel (Terminal / Problems / Generated Code) docked cleanly under Canvas */}
                {renderBottomPanel()}
              </div>

              {/* Right Sidebar — Subwindows ("Blocks" & "Properties") */}
              <aside className={`${styles.rightPanel} ${rightSidebarCollapsed ? styles.rightPanelHidden : ""}`}>
                {/* Subwindow 1: BLOCKS */}
                {blocksWindowOpen && !blocksWindowFloating && (
                  <div
                    className={styles.subwindow}
                    style={
                      propsWindowOpen && !propsWindowCollapsed
                        ? { flex: "0 1 auto", maxHeight: "48%" }
                        : undefined
                    }
                  >
                      <div
                        className={styles.subwindowHeader}
                        onClick={() => {
                          setBlocksWindowCollapsed((c) => {
                            const next = !c;
                            if (next && propsWindowCollapsed) setRightSidebarCollapsed(true);
                            return next;
                          });
                        }}
                      >
                        <div className={styles.subwindowTitle}>
                          <span className={styles.subwindowChevron}>{blocksWindowCollapsed ? "›" : "⌵"}</span>
                          <span>📦 Blocks</span>
                        </div>
                        <div className={styles.subwindowActions} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => {
                              setBlocksWindowCollapsed((c) => {
                                const next = !c;
                                if (next && propsWindowCollapsed) setRightSidebarCollapsed(true);
                                return next;
                              });
                            }}
                            title={blocksWindowCollapsed ? "Expand Subwindow" : "Minimize Subwindow"}
                          >
                            {blocksWindowCollapsed ? "□" : "—"}
                          </button>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => setBlocksWindowFloating(true)}
                            title="Pop out as Floating Subwindow"
                          >
                            ⧉
                          </button>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => {
                              setBlocksWindowOpen(false);
                              if (propsWindowCollapsed || !propsWindowOpen) setRightSidebarCollapsed(true);
                            }}
                            title="Close Subwindow"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {!blocksWindowCollapsed && (
                        <div className={styles.subwindowBody}>
                          {renderBlocksContent()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Subwindow 2: PROPERTIES */}
                  {propsWindowOpen && !propsWindowFloating && (
                    <div className={styles.subwindow} style={{ flex: 1, minHeight: 0 }}>
                      <div
                        className={styles.subwindowHeader}
                        onClick={() => {
                          setPropsWindowCollapsed((c) => {
                            const next = !c;
                            if (next && blocksWindowCollapsed) setRightSidebarCollapsed(true);
                            return next;
                          });
                        }}
                      >
                        <div className={styles.subwindowTitle}>
                          <span className={styles.subwindowChevron}>{propsWindowCollapsed ? "›" : "⌵"}</span>
                          <span>⚙️ Properties {selectedNodeObj ? `(${selectedNodeObj.kind})` : ""}</span>
                        </div>
                        <div className={styles.subwindowActions} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => {
                              setPropsWindowCollapsed((c) => {
                                const next = !c;
                                if (next && blocksWindowCollapsed) setRightSidebarCollapsed(true);
                                return next;
                              });
                            }}
                            title={propsWindowCollapsed ? "Expand Subwindow" : "Minimize Subwindow"}
                          >
                            {propsWindowCollapsed ? "□" : "—"}
                          </button>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => setPropsWindowFloating(true)}
                            title="Pop out as Floating Subwindow"
                          >
                            ⧉
                          </button>
                          <button
                            type="button"
                            className={styles.subwindowActionBtn}
                            onClick={() => {
                              setPropsWindowOpen(false);
                              if (blocksWindowCollapsed || !blocksWindowOpen) setRightSidebarCollapsed(true);
                            }}
                            title="Close Subwindow"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {!propsWindowCollapsed && (
                        <div className={styles.subwindowBody}>
                          {renderPropsContent()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Restore Bar if both subwindows are detached or closed */}
                  {(!blocksWindowOpen || blocksWindowFloating) && (!propsWindowOpen || propsWindowFloating) && (
                    <div className={styles.dockRestoreBar}>
                      <p>Right Subwindows Detached</p>
                      {(!blocksWindowOpen || blocksWindowFloating) && (
                        <button
                          type="button"
                          className={styles.dockRestoreBtn}
                          onClick={() => {
                            setBlocksWindowOpen(true);
                            setBlocksWindowFloating(false);
                            setBlocksWindowCollapsed(false);
                            setRightSidebarCollapsed(false);
                          }}
                        >
                          <span>📦</span>
                          <span>Dock Blocks Subwindow</span>
                        </button>
                      )}
                      {(!propsWindowOpen || propsWindowFloating) && (
                        <button
                          type="button"
                          className={styles.dockRestoreBtn}
                          onClick={() => {
                            setPropsWindowOpen(true);
                            setPropsWindowFloating(false);
                            setPropsWindowCollapsed(false);
                            setRightSidebarCollapsed(false);
                          }}
                        >
                          <span>⚙️</span>
                          <span>Dock Properties Subwindow</span>
                        </button>
                      )}
                    </div>
                  )}
                </aside>
              </div>

              {/* Floating Exit Fullscreen Button */}
              {isFlowchartFullscreen && (
                <button
                  type="button"
                  className={styles.fullscreenFloatingExitBtn}
                  onClick={toggleFlowchartFullscreen}
                  title="Exit Full Screen (Esc or F11)"
                  aria-label="Exit Full Screen"
                >
                  <span>✕</span>
                  <span>Exit Full Screen</span>
                </button>
              )}

              {/* Fullscreen Notification Toast */}
              {isFlowchartFullscreen && notice && (
                <div className={styles.fullscreenToast}>
                  <span>{notice}</span>
                </div>
              )}
            </div>
          ) : activeTab === "algorithm.ps" || activeTab.endsWith(".ps") ? (
            /* Workable Pseudocode & Algorithm Specification tab */
            (() => {
              const curFile = explorerFiles.find((f) => f.name === activeTab);
              const content =
                curFile?.content !== undefined
                  ? curFile.content
                  : explainFlowchartToLearner(project.flowchart).pseudocode;
              const lines = content.split("\n");

              const handleCompilePseudocode = () => {
                const parseRes = parsePseudocodeToFlowchart(content);
                if (!parseRes.success || !parseRes.flowchart) {
                  setNotice(`⚠️ ${parseRes.error || "Could not parse pseudocode"}`);
                  setTimeout(() => setNotice(""), 3500);
                  return;
                }
                try {
                  applyGraph(parseRes.flowchart);
                  setProject((curr) => {
                    if (!curr) return curr;
                    return syncProjectSpecification({
                      ...curr,
                      flowchart: parseRes.flowchart,
                    });
                  });
                  setNotice("✨ Flowchart & Python updated from Pseudocode!");
                  setTimeout(() => setNotice(""), 3500);
                } catch (e: any) {
                  setNotice(`⚠️ Error compiling: ${e?.message || "Invalid syntax"}`);
                  setTimeout(() => setNotice(""), 3500);
                }
              };

              const handlePullFromFlowchart = () => {
                try {
                  const gen = explainFlowchartToLearner(project.flowchart).pseudocode;
                  setExplorerFiles((prev) =>
                    prev.map((f) => (f.name === activeTab ? { ...f, content: gen } : f))
                  );
                  setNotice("✨ Updated Pseudocode from Flowchart!");
                  setTimeout(() => setNotice(""), 3000);
                } catch {}
              };

              const insertSnippet = (snippet: string) => {
                const nextContent = content ? `${content}\n${snippet}` : snippet;
                setExplorerFiles((prev) =>
                  prev.map((f) => (f.name === activeTab ? { ...f, content: nextContent } : f))
                );
                setUnsavedFiles((prev) => {
                  const next = new Set(prev);
                  next.add(activeTab);
                  return next;
                });
              };

              return (
                <div className={styles.textFileEditor}>
                  {/* Top Toolbar */}
                  <div className={styles.pseudoToolbar}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8c92a4" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <strong style={{ color: "#ffffff", fontSize: "12.5px" }}>{activeTab}</strong>
                      <span style={{ fontSize: "11px", color: "#6e7681" }}>
                        (Pseudocode &amp; Algorithm Spec)
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {/* Save pseudocode button with unsaved indicator */}
                      <button
                        type="button"
                        className={`${styles.saveToolbarBtn} ${unsavedFiles.has(activeTab) ? styles.saveToolbarBtnDirty : ""}`}
                        onClick={() => handleSaveActiveFile()}
                        title="Save pseudocode and update companion flowchart & Python (Ctrl+S or Ctrl+C)"
                      >
                        <span>💾 Save</span>
                        {unsavedFiles.has(activeTab) && <span className={styles.dirtyDot} />}
                      </button>

                      {/* Remake Flowchart (.fc) — ONLY shown when companion .fc is deleted/missing */}
                      {!getCompanionFile(activeTab) && (
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          onClick={() => remakeFlowchartFromPseudocode()}
                          title="Companion flowchart was deleted — click to remake .fc from this pseudocode"
                        >
                          ⚡ Remake Flowchart (.fc)
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.textFileHeaderBtn}
                        onClick={handlePullFromFlowchart}
                        title="Regenerate pseudocode from the current visual flowchart diagram"
                      >
                        🔄 Pull from Flowchart
                      </button>
                      <button
                        type="button"
                        className={styles.textFileHeaderBtn}
                        onClick={() => runProgram()}
                        title="Run pseudocode logic in the integrated terminal (F5)"
                      >
                        ▶ Run (F5)
                      </button>
                      <button
                        type="button"
                        className={styles.textFileHeaderBtn}
                        onClick={() => downloadFile(activeTab, content, "text/plain")}
                        title="Download .ps file"
                      >
                        ⬇ Download
                      </button>
                    </div>
                  </div>

                  {/* Text Editor with Snippet Bar */}
                  <div className={styles.pseudoSnippetBar}>
                    <span className={styles.pseudoSnippetTag}>Quick Insert:</span>
                    <button
                      type="button"
                      className={styles.pseudoSnippetBtn}
                      onClick={() => insertSnippet('    INPUT x PROMPT "Enter value for x: "')}
                      title="Insert INPUT statement"
                    >
                      + INPUT
                    </button>
                    <button
                      type="button"
                      className={styles.pseudoSnippetBtn}
                      onClick={() => insertSnippet("    y = x + 1")}
                      title="Insert assignment/calculation statement"
                    >
                      + PROCESS (=)
                    </button>
                    <button
                      type="button"
                      className={styles.pseudoSnippetBtn}
                      onClick={() =>
                        insertSnippet('    IF x > 0 THEN\n        OUTPUT "Positive"\n    ELSE\n        OUTPUT "Zero or Negative"\n    END IF')
                      }
                      title="Insert IF / ELSE / END IF decision block"
                    >
                      + IF / ELSE
                    </button>
                    <button
                      type="button"
                      className={styles.pseudoSnippetBtn}
                      onClick={() => insertSnippet('    OUTPUT "Result is ready"')}
                      title="Insert OUTPUT / PRINT statement"
                    >
                      + OUTPUT
                    </button>
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
                      {lines.length} lines, {content.length} characters
                    </span>
                  </div>

                  <div className={styles.textFileEditorBody}>
                    <div className={styles.textFileLineNumbers}>
                      {lines.map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    <textarea
                      className={styles.textFileTextarea}
                      value={content}
                      onChange={(e) => {
                        const val = e.target.value;
                        setExplorerFiles((prev) =>
                          prev.map((f) => (f.name === activeTab ? { ...f, content: val } : f))
                        );
                        setUnsavedFiles((prev) => {
                          const next = new Set(prev);
                          next.add(activeTab);
                          return next;
                        });
                      }}
                      placeholder="Write algorithm pseudocode (e.g. BEGIN, INPUT, IF/ELSE, OUTPUT, END)..."
                      spellCheck={false}
                    />
                  </div>
                </div>
              );
            })()
          ) : activeTab ? (
            /* Text File Editor for .txt and custom files */
            (() => {
              const curFile = explorerFiles.find((f) => f.name === activeTab);
              const content = curFile?.content || "";
              const lines = content.split("\n");
              return (
                <div className={styles.textFileEditor}>
                  <div className={styles.textFileHeader}>
                    <div className={styles.textFileHeaderTitle}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>{activeTab}</span>
                      <span style={{ fontSize: "11px", color: "#6e7681", marginLeft: "6px" }}>
                        {activeTab.endsWith(".txt") ? "Text Document" : (activeTab.split(".").pop()?.toUpperCase() || "TEXT") + " File"}
                      </span>
                    </div>
                    <div className={styles.textFileHeaderActions}>
                      <span style={{ fontSize: "11px", color: "#858585" }}>
                        {lines.length} {lines.length === 1 ? "line" : "lines"}, {content.length} chars
                      </span>
                      <button
                        type="button"
                        className={`${styles.saveToolbarBtn} ${unsavedFiles.has(activeTab) ? styles.saveToolbarBtnDirty : ""}`}
                        onClick={() => handleSaveActiveFile()}
                        title="Save file (Ctrl+S or Ctrl+C)"
                      >
                        <span>💾 Save</span>
                        {unsavedFiles.has(activeTab) && <span className={styles.dirtyDot} />}
                      </button>
                      <button
                        type="button"
                        className={styles.textFileHeaderBtn}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(content);
                            setNotice(`📋 Copied ${activeTab} to clipboard!`);
                            setTimeout(() => setNotice(""), 3000);
                          } catch {}
                        }}
                        title="Copy Content"
                      >
                        📋 Copy
                      </button>
                      <button
                        type="button"
                        className={styles.textFileHeaderBtn}
                        onClick={() => {
                          downloadFile(activeTab, content, "text/plain");
                        }}
                        title="Download File"
                      >
                        ⬇ Download
                      </button>
                    </div>
                  </div>

                  <div className={styles.textFileEditorBody}>
                    <div className={styles.textFileLineNumbers}>
                      {lines.map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    <textarea
                      className={styles.textFileTextarea}
                      value={content}
                      onChange={(e) => {
                        const val = e.target.value;
                        setExplorerFiles((prev) =>
                          prev.map((f) => (f.name === activeTab ? { ...f, content: val } : f))
                        );
                        setUnsavedFiles((prev) => {
                          const next = new Set(prev);
                          next.add(activeTab);
                          return next;
                        });
                      }}
                      placeholder="Type notes or text here..."
                      spellCheck={false}
                    />
                  </div>
                </div>
              );
            })()
          ) : (
            /* Clean Empty Workspace Welcome View */
            <div className={styles.emptyWorkspaceContainer}>
              <div className={styles.emptyWorkspaceCard}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.6">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#f8fafc", margin: "12px 0 4px" }}>
                  {project?.name || "Project"}
                </h2>
                <p style={{ fontSize: "12.5px", color: "#858b9c", maxWidth: "380px", margin: "0 0 16px", textAlign: "center" }}>
                  Clean project workspace. Create a file to start designing your algorithm.
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => createExplorerFile("main.fc")}
                  >
                    + Create Flowchart (.fc)
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => createExplorerFile("algorithm.ps")}
                  >
                    + Create Pseudocode (.ps)
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => createExplorerFile("notes.txt")}
                  >
                    + Create Notes (.txt)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Panel when on pseudocode, notes, or empty tabs */}
          {!Boolean(activeTab && (activeTab === "main.fc" || activeTab.endsWith(".fc") || activeTab.endsWith(".fs"))) &&
            renderBottomPanel()}
        </div>

        {/* ====================================================================
            Right Sidebar ("Blocks" & "Properties") is docked directly in
            the Flowchart Workspace for seamless full screen & normal view.
            ==================================================================== */}
      </div>

      {/* ====================================================================
          4. Bottom Status Bar
          ==================================================================== */}
      <footer className={styles.statusBar}>
        <div className={styles.statusItem}>
          <div className={styles.statusItem} title="Git branch">
            <span>⑂</span>
            <span>main</span>
          </div>

          <div
            className={styles.statusItem}
            onClick={() => {
              handleSaveActiveFile();
            }}
            title="Synchronize and save changes (Ctrl+S or Ctrl+C)"
          >
            <span>↻</span>
          </div>

          <div
            className={`${styles.statusItem} ${styles.statusItem}`}
            onClick={() => {
              setBottomTab("problems");
              setBottomPanelCollapsed(false);
            }}
            title="Problems in workspace"
          >
            <span>⮾ {diagnostics.filter((d: any) => d.severity !== "warning").length}</span>
            <span>⚠ {diagnostics.filter((d: any) => d.severity === "warning").length}</span>
          </div>

          {notice && (
            <span style={{ color: "#38bdf8", marginLeft: "10px", display: "inline-flex", alignItems: "center" }}>
              {notice}
              {recentlyDeleted && (
                <button
                  type="button"
                  className={styles.undoNoticeBtn}
                  onClick={handleUndoDelete}
                  title="Undo and restore deleted file"
                >
                  ↺ Undo
                </button>
              )}
            </span>
          )}
        </div>

        <div className={styles.statusItemGroup}>
          <div className={styles.statusItem}>Ln 1, Col 1</div>
          <div className={styles.statusItem}>UTF-8</div>
          <div
            className={styles.statusItem}
            onClick={() => {
              if (openTabs.length > 0) {
                const nextIdx = (openTabs.indexOf(activeTab) + 1) % openTabs.length;
                setActiveTab(openTabs[nextIdx]);
              }
            }}
            title="Switch Language Mode / Open Tab"
          >
            {!activeTab
              ? "No File"
              : activeTab === "main.fc" || activeTab.endsWith(".fc") || activeTab.endsWith(".fs")
              ? "FC (Flowchart)"
              : activeTab === "algorithm.ps" || activeTab.endsWith(".ps")
              ? "PS (Pseudocode)"
              : activeTab.endsWith(".txt")
              ? "Plain Text"
              : (activeTab.split(".").pop()?.toUpperCase() || "Text")}
          </div>
          <div className={styles.statusItem} title="Notifications">
            🔔
          </div>
        </div>
      </footer>

      {/* ====================================================================
          0. Companion File Creation Popup Modal (Proper Alignment & In-App Theme)
          ==================================================================== */}
      {companionModal?.isOpen && (
        <div className={styles.overlay} onClick={handleSkipCompanionModal}>
          <div
            className={styles.modal}
            style={{ maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {companionModal.createdFileType === "fc" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2.2">
                    <rect x="9" y="3" width="6" height="5" rx="1.5" />
                    <path d="M12 8V14" />
                    <path d="M5 14H19" />
                    <rect x="2" y="16" width="6" height="5" rx="1.5" />
                    <rect x="16" y="16" width="6" height="5" rx="1.5" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8c92a4" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                )}
                <span className={styles.modalHeaderTitle}>
                  {companionModal.createdFileType === "fc"
                    ? "Create Companion Pseudocode (.ps)?"
                    : "Create Companion Flowchart (.fc)?"}
                </span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={handleSkipCompanionModal}
                title="Skip & Close (Esc)"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmCompanionModal();
              }}
            >
              <div className={styles.modalBody}>
                <p style={{ fontSize: "12.5px", color: "#9da3af", margin: "0", lineHeight: "1.5" }}>
                  You created{" "}
                  <strong style={{ color: "#ffffff" }}>{companionModal.createdFileName}</strong>.
                  Would you like to generate a linked companion file to work together with your algorithm?
                </p>

                {/* Visual Pipeline Link Preview */}
                <div className={styles.companionCardPreview}>
                  <div className={styles.companionPill}>
                    {companionModal.createdFileType === "fc" ? "⚡ Flowchart (.fc)" : "📝 Pseudocode (.ps)"}
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      ({companionModal.createdFileName.split("/").pop()})
                    </span>
                  </div>
                  <div className={styles.companionArrowIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                  <div className={`${styles.companionPill} ${styles.companionPillActive}`}>
                    + {companionModal.createdFileType === "fc" ? "Pseudocode (.ps)" : "Flowchart (.fc)"}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#cbd5e1" }}>
                    Companion File Name
                  </label>
                  <input
                    type="text"
                    className={styles.searchInput}
                    value={companionInputName}
                    onChange={(e) => setCompanionInputName(e.target.value)}
                    placeholder={
                      companionModal.createdFileType === "fc" ? "e.g. algorithm.ps" : "e.g. main.fc"
                    }
                    autoFocus
                  />
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    {companionModal.folderName
                      ? `Will be created inside folder "${companionModal.folderName}"`
                      : "Will be created in root workspace"}
                  </span>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleSkipCompanionModal}
                >
                  No, Keep Single File
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                >
                  + Create Companion File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-app Rename Dialog Modal */}
      {renameModal && (
        <div className={styles.overlay} onClick={() => setRenameModal(null)}>
          <div
            className={styles.modal}
            style={{ maxWidth: "420px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>✏️</span>
                <span className={styles.modalHeaderTitle}>
                  Rename {renameModal.isFolder ? "Folder" : "File"}
                </span>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setRenameModal(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmRename();
              }}
            >
              <div className={styles.modalBody}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#cbd5e1" }}>
                    New {renameModal.isFolder ? "Folder" : "File"} Name:
                  </label>
                  <input
                    type="text"
                    className={styles.searchInput}
                    value={renameInputName}
                    onChange={(e) => setRenameInputName(e.target.value)}
                    autoFocus
                  />
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Currently: {renameModal.currentName}
                  </span>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setRenameModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-app Delete Confirmation Modal */}
      {deleteModal && (
        <div className={styles.duplicateItemOverlay} onClick={() => setDeleteModal(null)}>
          <div
            className={styles.duplicateItemDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-message"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.duplicateItemHeading}>
              <div className={styles.duplicateItemIcon} aria-hidden="true">!</div>
              <div>
                <h2 id="delete-confirm-title">
                  Delete {deleteModal.isProject ? "project" : deleteModal.isFolder ? "folder" : "file"}?
                </h2>
                <p id="delete-confirm-message">
                  Are you sure you want to delete <strong>&quot;{deleteModal.name}&quot;</strong>?
                </p>
                {deleteModal.isFolder && <p>This also removes all files inside this folder.</p>}
                {deleteModal.isProject && <p>This also removes the project and its workspace files.</p>}
              </div>
            </div>
            <div className={styles.duplicateItemActions}>
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteConfirmButton}
                autoFocus
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          1. Create New Project Modal
          ==================================================================== */}
      {activeModal === "newProject" && (
        <div className={styles.overlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modal} style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2.2">
                  <rect x="9" y="3" width="6" height="5" rx="1.5" />
                  <path d="M12 8V14" />
                  <path d="M5 14H19" />
                  <rect x="2" y="16" width="6" height="5" rx="1.5" />
                  <rect x="16" y="16" width="6" height="5" rx="1.5" />
                </svg>
                <span className={styles.modalHeaderTitle}>Create New Project</span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setActiveModal(null)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateProjectSubmit();
              }}
            >
              <div className={styles.modalBody}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#9da3af" }}>
                    Project Name
                  </label>
                  <input
                    type="text"
                    className={styles.searchInput}
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. Even or Odd Number"
                    autoFocus
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#9da3af" }}>
                    Code Learning Level
                  </label>
                  <div className={styles.codeLevelGrid} role="radiogroup" aria-label="Code learning level">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={newProjectCodeLevel === "beginner"}
                      className={`${styles.codeLevelCard} ${newProjectCodeLevel === "beginner" ? styles.codeLevelCardSelected : ""}`}
                      onClick={() => setNewProjectCodeLevel("beginner")}
                    >
                      <strong>Beginner</strong>
                      <span>Extra comments explain each step.</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={newProjectCodeLevel === "intermediate"}
                      className={`${styles.codeLevelCard} ${newProjectCodeLevel === "intermediate" ? styles.codeLevelCardSelected : ""}`}
                      onClick={() => setNewProjectCodeLevel("intermediate")}
                    >
                      <strong>Intermediate</strong>
                      <span>Clean, standard code with familiar formatting.</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={newProjectCodeLevel === "professional"}
                      className={`${styles.codeLevelCard} ${newProjectCodeLevel === "professional" ? styles.codeLevelCardSelected : ""}`}
                      onClick={() => setNewProjectCodeLevel("professional")}
                    >
                      <strong>Professional</strong>
                      <span>Compact code with no teaching comments.</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#9da3af" }}>
                    Choose a Starting Point or Template
                  </label>
                  <div className={styles.templateGrid}>
                    <div
                      className={`${styles.templateCard} ${selectedTemplate === "blank" ? styles.templateCardSelected : ""}`}
                      onClick={() => setSelectedTemplate("blank")}
                    >
                      <span className={""}>📄</span>
                      <strong className={styles.templateCardTitle}>Blank Flowchart</strong>
                      <span className={styles.templateCardDesc}>
                        Start fresh with connected Start and End blocks.
                      </span>
                    </div>

                    <div
                      className={`${styles.templateCard} ${selectedTemplate === "even-odd" ? styles.templateCardSelected : ""}`}
                      onClick={() => setSelectedTemplate("even-odd")}
                    >
                      <span className={""}>⚖️</span>
                      <strong className={styles.templateCardTitle}>Even or Odd</strong>
                      <span className={styles.templateCardDesc}>
                        Input n, remainder check via n % 2 == 0.
                      </span>
                    </div>

                    <div
                      className={`${styles.templateCard} ${selectedTemplate === "largest" ? styles.templateCardSelected : ""}`}
                      onClick={() => setSelectedTemplate("largest")}
                    >
                      <span className={""}>🏆</span>
                      <strong className={styles.templateCardTitle}>Largest of Two</strong>
                      <span className={styles.templateCardDesc}>
                        Compare two numbers and handle maximum.
                      </span>
                    </div>

                    <div
                      className={`${styles.templateCard} ${selectedTemplate === "eligibility" ? styles.templateCardSelected : ""}`}
                      onClick={() => setSelectedTemplate("eligibility")}
                    >
                      <span className={""}>🗳️</span>
                      <strong className={styles.templateCardTitle}>Voting Eligibility</strong>
                      <span className={styles.templateCardDesc}>
                        Verify if user age meets 18 requirement.
                      </span>
                    </div>

                    <div
                      className={`${styles.templateCard} ${selectedTemplate === "grade" ? styles.templateCardSelected : ""}`}
                      onClick={() => setSelectedTemplate("grade")}
                    >
                      <span className={""}>📊</span>
                      <strong className={styles.templateCardTitle}>Calculate Grade</strong>
                      <span className={styles.templateCardDesc}>
                        Evaluate score cutoffs for A, B, C, or F.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setActiveModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          2. Open Project Modal
          ==================================================================== */}
      {activeModal === "projects" && (
        <div className={styles.overlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modal} style={{ maxWidth: "620px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className={styles.modalHeaderTitle}>Open Project</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  className={styles.btnSmall}
                  style={{ fontSize: "11px", padding: "4px 9px" }}
                  onClick={() => {
                    setNewProjectName("");
                    setNewProjectCodeLevel("beginner");
                    setActiveModal("newProject");
                  }}
                >
                  + New Project
                </button>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setActiveModal(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              {/* Search Bar */}
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search saved projects by name..."
                value={projectSearchQuery}
                onChange={(e) => setProjectSearchQuery(e.target.value)}
                autoFocus
              />

              {/* Projects List */}
              <div className={styles.projectList}>
                {filteredProjects.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#505668" strokeWidth="1.5">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <p style={{ marginTop: "10px", fontSize: "13px" }}>
                      {savedProjects.length === 0
                        ? "No saved projects found in browser storage."
                        : "No projects match your search query."}
                    </p>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      style={{ marginTop: "12px" }}
                      onClick={() => {
                        setNewProjectName("");
                        setNewProjectCodeLevel("beginner");
                        setActiveModal("newProject");
                      }}
                    >
                      + Create First Project
                    </button>
                  </div>
                ) : (
                  filteredProjects.map((p) => {
                    const isCurrent = p.projectId === project?.projectId;
                    const nodeCount = p.flowchart?.nodes?.length || 0;
                    return (
                      <div
                        key={p.projectId}
                        className={`${styles.projectItem} ${isCurrent ? styles.projectItemCurrent : ""}`}
                      >
                        <div className={styles.projectItemLeft}>
                          <span className={styles.projectItemName}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d48332" strokeWidth="2.2">
                              <rect x="9" y="3" width="6" height="5" rx="1.5" />
                              <path d="M12 8V14" />
                              <path d="M5 14H19" />
                              <rect x="2" y="16" width="6" height="5" rx="1.5" />
                              <rect x="16" y="16" width="6" height="5" rx="1.5" />
                            </svg>
                            {p.name}
                            {isCurrent && <span className={styles.currentTag}>CURRENT</span>}
                          </span>
                          <span className={styles.projectItemMeta}>
                            {nodeCount} block{nodeCount !== 1 ? "s" : ""} • Edited {new Date(p.updatedAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div className={styles.projectItemActions}>
                          {!isCurrent ? (
                            <button
                              type="button"
                              className={styles.btnSmall}
                              onClick={() => {
                                changeProject(p);
                                setActiveModal(null);
                              }}
                            >
                              Open
                            </button>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 600, padding: "4px 8px" }}>
                              ✓ Open
                            </span>
                          )}

                          <button
                            type="button"
                            className={styles.btnSmall}
                            onClick={() => {
                              downloadFile(
                                `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
                                exportProjectJson(p),
                                "application/json"
                              );
                            }}
                            title="Export as JSON"
                          >
                            Export
                          </button>

                          <button
                            type="button"
                            className={styles.btnIcon}
                            onClick={() => {
                              setDeleteModal({
                                id: p.projectId,
                                name: p.name,
                                isProject: true,
                              });
                            }}
                            title="Delete project"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className={styles.modalFooter} style={{ justifyContent: "space-between" }}>
              <label className={styles.btnSecondary} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>📁 Import Project JSON</span>
                <input
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const text = ev.target?.result as string;
                          const parsed = importProjectJson(text);
                          changeProject(parsed);
                          setActiveModal(null);
                          setNotice(`📥 Imported project "${parsed.name}"`);
                          setTimeout(() => setNotice(""), 3000);
                        } catch (err: any) {
                          setNotice(`⚠️ Import failed: ${err?.message || "Invalid project file"}`);
                          setTimeout(() => setNotice(""), 4000);
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
              </label>

              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setActiveModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          3. Samples & Templates Modal
          ==================================================================== */}
      {activeModal === "samples" && (
        <div className={styles.overlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modal} style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📋</span>
                <span className={styles.modalHeaderTitle}>Flowchart Examples &amp; Templates</span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setActiveModal(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ fontSize: "12.5px", color: "#8c92a4" }}>
                Explore interactive algorithms designed to illustrate input, calculation, branching, and output in MapToCode.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                {SAMPLE_DETAILS.map((sample) => (
                  <div
                    key={sample.key}
                    className={styles.projectItem}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      if (SAMPLE_FACTORIES[sample.key]) {
                        changeProject(SAMPLE_FACTORIES[sample.key]());
                        setActiveModal(null);
                      }
                    }}
                  >
                    <div className={styles.projectItemLeft}>
                      <strong style={{ fontSize: "13.5px", color: "#ffffff" }}>{sample.title}</strong>
                      <span style={{ fontSize: "12px", color: "#858b9c" }}>{sample.note}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.btnSmall}
                    >
                      Load Example →
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setActiveModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          4. Settings Modal
          ==================================================================== */}
      {activeModal === "settings" && (
        <div className={styles.overlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modal} style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>⚙️</span>
                <span className={styles.modalHeaderTitle}>Workspace Settings</span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setActiveModal(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.settingsGrid}>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Grid Snapping (20px)</div>
                    <div className={styles.settingsDesc}>Automatically snap blocks to 20px grid intervals</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={snapToGrid}
                    onChange={(e) => setSnapToGrid(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Visual Grid Dots</div>
                    <div className={styles.settingsDesc}>Show dot grid guides on canvas</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Connector Arrow Style</div>
                    <div className={styles.settingsDesc}>Routing algorithm for flowchart connecting arrows</div>
                  </div>
                  <select
                    className={styles.zoomSelect}
                    value={edgeRouting}
                    onChange={(e) => setEdgeRouting(e.target.value as any)}
                  >
                    <option value="curved">〰 Curved</option>
                    <option value="orthogonal">⎾ Stepped</option>
                    <option value="straight">― Straight</option>
                  </select>
                </div>

                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Overview Minimap</div>
                    <div className={styles.settingsDesc}>Show mini overview thumbnail at bottom right</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showMinimap}
                    onChange={(e) => setShowMinimap(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setActiveModal(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          5. Guide & Shortcuts Modal
          ==================================================================== */}
      {activeModal === "guide" && (
        <div className={styles.overlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modal} style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>❓</span>
                <span className={styles.modalHeaderTitle}>MapToCode Help &amp; Keyboard Shortcuts</span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setActiveModal(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.guideSection}>
                <span className={styles.guideSectionTitle}>Flowchart Block Shapes</span>
                <div className={styles.guideGrid}>
                  <div className={styles.guideCard}>
                    <strong style={{ color: "#10b981" }}>🟢 Start / End (Pill)</strong>
                    Begin and terminate algorithm control flow.
                  </div>
                  <div className={styles.guideCard}>
                    <strong style={{ color: "#3b82f6" }}>🔵 Input (Parallelogram)</strong>
                    Prompt user and receive variable inputs.
                  </div>
                  <div className={styles.guideCard}>
                    <strong style={{ color: "#a855f7" }}>🟣 Process (Rectangle)</strong>
                    Variable declarations and arithmetic calculations.
                  </div>
                  <div className={styles.guideCard}>
                    <strong style={{ color: "#f59e0b" }}>🟠 Decision (Diamond)</strong>
                    Branch execution along Yes (True) and No (False) paths.
                  </div>
                  <div className={styles.guideCard}>
                    <strong style={{ color: "#f43f5e" }}>🔴 Output (Parallelogram)</strong>
                    Print messages or variable values.
                  </div>
                </div>
              </div>

              <div className={styles.guideSection} style={{ marginTop: "12px" }}>
                <span className={styles.guideSectionTitle}>Keyboard Shortcuts (VS Code-style)</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "4px" }}>
                    Execution &amp; Layout
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Run Flowchart (Python)</span>
                    <span className={styles.shortcutKey}>F5</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Toggle Explorer Sidebar</span>
                    <span className={styles.shortcutKey}>Ctrl+B</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Toggle Terminal Panel</span>
                    <span className={styles.shortcutKey}>Ctrl+` or Ctrl+J</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Quick Open / Search</span>
                    <span className={styles.shortcutKey}>Ctrl+P</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Help &amp; Command Palette</span>
                    <span className={styles.shortcutKey}>F1 or Ctrl+Shift+P</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Deselect / Close Active Modal</span>
                    <span className={styles.shortcutKey}>Escape</span>
                  </div>

                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "8px" }}>
                    File Explorer
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>New File</span>
                    <span className={styles.shortcutKey}>Ctrl+N</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>New Folder</span>
                    <span className={styles.shortcutKey}>Ctrl+Shift+N</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Copy Selected File</span>
                    <span className={styles.shortcutKey}>Ctrl+C</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Paste Copied File</span>
                    <span className={styles.shortcutKey}>Ctrl+V</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Duplicate File or Block</span>
                    <span className={styles.shortcutKey}>Ctrl+D</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Rename Selected File / Folder</span>
                    <span className={styles.shortcutKey}>F2</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Delete Selected File / Folder</span>
                    <span className={styles.shortcutKey}>Delete / Backspace</span>
                  </div>

                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#a855f7", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "8px" }}>
                    Editor &amp; Diagram
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Close Active Tab</span>
                    <span className={styles.shortcutKey}>Ctrl+W</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Cycle to Next / Prev Tab</span>
                    <span className={styles.shortcutKey}>Ctrl+Tab / Ctrl+Shift+Tab</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Switch to Tab 1, 2, 3...</span>
                    <span className={styles.shortcutKey}>Ctrl+1..9</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Save Project</span>
                    <span className={styles.shortcutKey}>Ctrl+S</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Undo Diagram Edit</span>
                    <span className={styles.shortcutKey}>Ctrl+Z</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Redo Diagram Edit</span>
                    <span className={styles.shortcutKey}>Ctrl+Y / Ctrl+Shift+Z</span>
                  </div>
                  <div className={styles.shortcutRow}>
                    <span>Delete Selected Block</span>
                    <span className={styles.shortcutKey}>Delete</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setActiveModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === "traceLogic" && (
        <div className={styles.overlay} onClick={() => setActiveModal(null)}>
          <div
            className={styles.modal}
            style={{ maxWidth: "900px", height: "85vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <span className={styles.modalHeaderTitle}>🔍 Logic Tracer &amp; Step-by-Step Debugger</span>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setActiveModal(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
              <LogicTracer
                project={project}
                ast={analysis?.flowchartCandidate?.ast}
              />
            </div>
          </div>
        </div>
      )}

      {itemError && (
        <div className={styles.duplicateItemOverlay}>
          <section
            className={styles.duplicateItemDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="duplicate-item-title"
            aria-describedby="duplicate-item-message"
          >
            <div className={styles.duplicateItemHeading}>
              <div className={styles.duplicateItemIcon} aria-hidden="true">!</div>
              <div>
                <h2 id="duplicate-item-title">{itemError.title}</h2>
                <p id="duplicate-item-message">{itemError.message}</p>
              </div>
            </div>
            <div className={styles.duplicateItemActions}>
              <button type="button" autoFocus onClick={() => setItemError(null)}>Got it</button>
            </div>
          </section>
        </div>
      )}
      <MobileBottomNav
        onFiles={() => {
          setActiveActivity("explorer");
          setLeftSidebarCollapsed(false);
          setRightSidebarCollapsed(true);
          setBottomPanelCollapsed(true);
        }}
        onCanvas={() => {
          setLeftSidebarCollapsed(true);
          setRightSidebarCollapsed(true);
          setBottomPanelCollapsed(true);
        }}
        onCode={() => {
          setLeftSidebarCollapsed(true);
          setRightSidebarCollapsed(true);
          setBottomPanelCollapsed(false);
          setBottomPanelMaximized(true);
          setBottomTab("generatedCode");
        }}
        onRun={() => {
          setLeftSidebarCollapsed(true);
          setRightSidebarCollapsed(true);
          setBottomPanelCollapsed(false);
          setBottomPanelMaximized(false);
          setBottomTab("terminal");
          setTimeout(() => runProgram(), 0);
        }}
      />
    </div>
  );
}
