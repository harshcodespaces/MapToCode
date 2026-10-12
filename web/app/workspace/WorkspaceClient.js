"use client";

import { useEffect, useMemo, useRef, useState, useId } from "react";
import Link from "next/link";
import FlowchartDiagram from "../components/FlowchartDiagram";
import { DEFAULT_DIAGRAM, NODE_TYPES, generateC, generatePython, hasDiagramShape, previewFlowchart, validateConnection } from "../../lib/flowchart";
import { diagramToPseudocode, pseudocodeToDiagram, PSEUDOCODE_EXAMPLES, tidyPseudocode } from "../../lib/pseudocode";
import styles from "./workspace.module.css";

const STORAGE_KEY = "maptocode:diagram:v1";
const CANVAS = { width: 1360, height: 760 };
const NODE_SIZE = {
  Start: { width: 132, height: 56 },
  End: { width: 132, height: 56 },
  Input: { width: 184, height: 78 },
  Process: { width: 184, height: 78 },
  Output: { width: 184, height: 78 },
  Decision: { width: 180, height: 128 },
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function defaultNode(type, index) {
  const position = { x: 110 + (index % 4) * 250, y: 90 + Math.floor(index / 4) * 145 };
  const common = { id: makeId(), type, position };
  if (type === "Start" || type === "End") return { ...common, label: type };
  if (type === "Input") return { ...common, label: "Read input", variable: "value", prompt: "Enter a value: ", inputType: "text" };
  if (type === "Process") return { ...common, label: "Update value", assignment: "value = 1" };
  if (type === "Decision") return { ...common, label: "Check condition", condition: "value == 1" };
  return { ...common, label: "Show message", outputMode: "message", message: "Done", expression: "value" };
}

function normalizeProject(value) {
  if (!hasDiagramShape(value) || value.nodes.length > 80 || value.edges.length > 160) {
    throw new Error("That project file does not have a supported MapToCode structure.");
  }
  const nodeIds = new Set();
  const nodes = value.nodes.map((node) => {
    if (!node || typeof node.id !== "string" || typeof node.type !== "string") {
      throw new Error("Every block in the project file needs a text ID and type.");
    }
    if (!node.id || nodeIds.has(node.id)) throw new Error("The project file contains duplicate or empty block IDs.");
    nodeIds.add(node.id);
    const size = NODE_SIZE[node.type] ?? { width: 184, height: 78 };
    const rawX = Number(node.position?.x);
    const rawY = Number(node.position?.y);
    const position = {
      x: Number.isFinite(rawX) ? Math.max(8, Math.min(CANVAS.width - size.width - 8, rawX)) : 60,
      y: Number.isFinite(rawY) ? Math.max(8, Math.min(CANVAS.height - size.height - 8, rawY)) : 60,
    };
    return { ...node, id: node.id, type: node.type, label: typeof node.label === "string" ? node.label.slice(0, 80) : "", position };
  });
  const edgeIds = new Set();
  const edges = value.edges.map((edge) => {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") {
      throw new Error("Every connection in the project file needs a starting and ending block.");
    }
    const id = typeof edge.id === "string" && edge.id ? edge.id : makeId();
    if (edgeIds.has(id)) throw new Error("The project file contains duplicate connection IDs.");
    edgeIds.add(id);
    return { ...edge, id, from: edge.from, to: edge.to };
  });
  return {
    id: typeof value.id === "string" ? value.id : makeId(),
    name: typeof value.name === "string" ? value.name.slice(0, 80) : "Untitled flowchart",
    nodes,
    edges,
  };
}

function nodeDetail(node) {
  if (node.type === "Input") return `${node.variable || "variable"} ← input`;
  if (node.type === "Process") return node.assignment || "Set a value";
  if (node.type === "Decision") return node.condition || "Add a condition";
  if (node.type === "Output") return node.outputMode === "expression" ? node.expression || "Add a value" : `“${node.message || "Your message"}”`;
  return node.type === "Start" ? "Program begins" : node.type === "End" ? "Program ends" : "Unsupported block";
}

function edgePath(edge, nodeMap) {
  const from = nodeMap.get(edge.from);
  const to = nodeMap.get(edge.to);
  if (!from || !to) return null;
  const fromSize = NODE_SIZE[from.type] ?? { width: 184, height: 78 };
  const toSize = NODE_SIZE[to.type] ?? { width: 184, height: 78 };
  const fromInset = ["Input", "Output"].includes(from.type) ? fromSize.width * 0.07 : 0;
  const toInset = ["Input", "Output"].includes(to.type) ? toSize.width * 0.07 : 0;
  const x1 = from.position.x + fromSize.width - fromInset;
  const y1 = from.position.y + fromSize.height / 2;
  const x2 = to.position.x + toInset;
  const y2 = to.position.y + toSize.height / 2;
  const bend = Math.max(36, Math.min(100, Math.abs(x2 - x1) * 0.45));
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export default function WorkspaceClient() {
  const [diagram, setDiagram] = useState(DEFAULT_DIAGRAM);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [selectedId, setSelectedId] = useState("adult-check");
  const [hydrated, setHydrated] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Loading local project…");
  const [actionMessage, setActionMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("Python");
  const [editorMode, setEditorMode] = useState("flowchart");
  const [pseudocode, setPseudocode] = useState(() => diagramToPseudocode(DEFAULT_DIAGRAM));
  const [pseudocodeHistory, setPseudocodeHistory] = useState([]);
  const [pseudocodeDirty, setPseudocodeDirty] = useState(false);
  const [connectionSource, setConnectionSource] = useState("start");
  const [connectionTarget, setConnectionTarget] = useState("ask-age");
  const [connectionBranch, setConnectionBranch] = useState("true");
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [sampleInputs, setSampleInputs] = useState(() => Object.fromEntries(DEFAULT_DIAGRAM.nodes.filter((node) => node.type === "Input").map((node) => [node.id, "18"])));
  const [previewRun, setPreviewRun] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const recenterAfterZoomRef = useRef(false);
  const importRef = useRef(null);
  const arrowId = `editor-arrow-${useId().replaceAll(":", "")}`;

  const generation = useMemo(() => codeLanguage === "C" ? generateC(diagram) : generatePython(diagram), [diagram, codeLanguage]);
  const nodeMap = useMemo(() => new Map(diagram.nodes.map((node) => [node.id, node])), [diagram.nodes]);
  const selectedNode = nodeMap.get(selectedId);
  const previewSteps = previewRun?.diagram === diagram ? previewRun.steps : null;
  const activePreviewStep = previewSteps?.[previewIndex];

  function updateDiagram(nextOrUpdate, { record = true } = {}) {
    const current = diagram;
    const next = typeof nextOrUpdate === "function" ? nextOrUpdate(current) : nextOrUpdate;
    if (next === current) return;
    if (record) {
      setHistory((currentHistory) => ({
        past: [...currentHistory.past, current].slice(-100),
        future: [],
      }));
    }
    setDiagram(next);
  }

  function undoDiagram() {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory((currentHistory) => ({
      past: currentHistory.past.slice(0, -1),
      future: [...currentHistory.future, diagram].slice(-100),
    }));
    setDiagram(previous);
    setActionMessage("Last diagram change undone.");
  }

  function redoDiagram() {
    const next = history.future.at(-1);
    if (!next) return;
    setHistory((currentHistory) => ({
      past: [...currentHistory.past, diagram].slice(-100),
      future: currentHistory.future.slice(0, -1),
    }));
    setDiagram(next);
    setActionMessage("Diagram change restored.");
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const project = normalizeProject(JSON.parse(stored));
          setDiagram(project);
          setSelectedId(project.nodes[0]?.id ?? "");
          setConnectionSource(project.nodes[0]?.id ?? "");
          setConnectionTarget(project.nodes[1]?.id ?? project.nodes[0]?.id ?? "");
          setSaveLabel("Your local project is open");
        } else {
          setSaveLabel("Example flowchart loaded");
        }
      } catch {
        setSaveLabel("Could not read the saved project; using the example instead");
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram));
        setSaveLabel("Saved in this browser");
      } catch {
        setSaveLabel("Browser storage is full; export a JSON backup");
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [diagram, hydrated]);

  useEffect(() => {
    if (!recenterAfterZoomRef.current) return undefined;
    recenterAfterZoomRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const viewport = canvasViewportRef.current;
      if (!viewport || !diagram.nodes.length) return;
      const bounds = diagram.nodes.reduce((result, node) => {
        const size = NODE_SIZE[node.type] ?? { width: 184, height: 78 };
        return {
          left: Math.min(result.left, node.position.x),
          top: Math.min(result.top, node.position.y),
          right: Math.max(result.right, node.position.x + size.width),
          bottom: Math.max(result.bottom, node.position.y + size.height),
        };
      }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
      const centerX = ((bounds.left + bounds.right) / 2) * canvasZoom;
      const centerY = ((bounds.top + bounds.bottom) / 2) * canvasZoom;
      viewport.scrollLeft = Math.max(0, centerX - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, centerY - viewport.clientHeight / 2);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canvasZoom, diagram.nodes]);

  function fitCanvas() {
    const viewport = canvasViewportRef.current;
    if (!viewport || !diagram.nodes.length) {
      setCanvasZoom(1);
      return;
    }
    const bounds = diagram.nodes.reduce((result, node) => {
      const size = NODE_SIZE[node.type] ?? { width: 184, height: 78 };
      return {
        left: Math.min(result.left, node.position.x),
        top: Math.min(result.top, node.position.y),
        right: Math.max(result.right, node.position.x + size.width),
        bottom: Math.max(result.bottom, node.position.y + size.height),
      };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    const availableWidth = Math.max(240, viewport.clientWidth - 48);
    const availableHeight = Math.max(200, viewport.clientHeight - 48);
    const zoom = Math.min(1.2, availableWidth / width, availableHeight / height);
    recenterAfterZoomRef.current = true;
    setCanvasZoom(Math.max(0.45, zoom));
  }
  useEffect(() => {
    if (!hydrated) return undefined;
    const frame = window.requestAnimationFrame(fitCanvas);
    return () => window.cancelAnimationFrame(frame);
    // Run once after browser storage and the canvas layout are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function changeCanvasZoom(amount) {
    recenterAfterZoomRef.current = true;
    setCanvasZoom((current) => Math.max(0.45, Math.min(1.5, Math.round((current + amount) * 100) / 100)));
  }

  function selectNode(id) {
    setSelectedId(id);
    setConnectionSource(id);
    const sourceNode = nodeMap.get(id);
    const availableTarget = diagram.nodes.find((node) => node.id !== id && !diagram.edges.some((edge) =>
      edge.from === id && edge.to === node.id && (sourceNode?.type !== "Decision" || edge.branch === connectionBranch),
    ));
    if (availableTarget) setConnectionTarget(availableTarget.id);
    if (sourceNode?.type === "Decision") {
      const usedBranches = new Set(diagram.edges.filter((edge) => edge.from === id).map((edge) => edge.branch));
      if (usedBranches.has(connectionBranch)) setConnectionBranch(usedBranches.has("true") ? "false" : "true");
    }
  }

  function changeConnectionSource(id) {
    selectNode(id);
  }

  function updateNode(id, changes) {
    updateDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === id ? { ...node, ...changes } : node),
    }));
    setActionMessage("");
  }

  function addNode(type) {
    if (diagram.nodes.length >= 80) {
      setActionMessage("A project can contain up to 80 blocks.");
      return;
    }
    const node = defaultNode(type, Math.max(0, diagram.nodes.length - 2));
    updateDiagram((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedId(node.id);
    setActionMessage(`${type} block added. Connect it to the flowchart when you’re ready.`);
  }

  function deleteSelectedNode() {
    if (!selectedNode) return;
    const removedId = selectedNode.id;
    const remainingNodes = diagram.nodes.filter((node) => node.id !== removedId);
    updateDiagram((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== removedId),
      edges: current.edges.filter((edge) => edge.from !== removedId && edge.to !== removedId),
    }));
    if (connectionSource === removedId) setConnectionSource(remainingNodes[0]?.id ?? "");
    if (connectionTarget === removedId) setConnectionTarget(remainingNodes[1]?.id ?? remainingNodes[0]?.id ?? "");
    setSelectedId("");
    setActionMessage("Block and its connections removed.");
  }

  function connectBlocks(event) {
    event.preventDefault();
    const source = nodeMap.get(connectionSource);
    const branch = source?.type === "Decision" ? connectionBranch : undefined;
    const issue = validateConnection(diagram, connectionSource, connectionTarget, branch);
    if (issue) {
      setActionMessage(issue);
      return;
    }
    const edge = { id: makeId(), from: connectionSource, to: connectionTarget, ...(branch ? { branch } : {}) };
    updateDiagram((current) => ({ ...current, edges: [...current.edges, edge] }));
    setActionMessage(source.type === "Decision" ? `${branch === "true" ? "True" : "False"} path connected.` : "Blocks connected.");
  }

  function restoreExample() {
    if (!window.confirm("Replace this browser’s current flowchart with the original age check example? Export a JSON copy first if you want to keep it.")) return;
    const example = structuredClone(DEFAULT_DIAGRAM);
    updateDiagram(example);
    setSelectedId("adult-check");
    setConnectionSource("start");
    setConnectionTarget("ask-age");
    setConnectionBranch("true");
    setPseudocodeDirty(false);
    setActionMessage("The example flowchart has been restored.");
  }

  function createNewFlowchart() {
    if (!window.confirm("Start a new blank flowchart? This replaces the current project in this browser. Export a JSON copy first if you want to keep it.")) return;
    updateDiagram({ id: makeId(), name: "Untitled flowchart", nodes: [], edges: [] });
    setSelectedId("");
    setConnectionSource("");
    setConnectionTarget("");
    setPseudocode("BEGIN\nEND");
    setPseudocodeHistory([]);
    setPseudocodeDirty(false);
    setActionMessage("Blank flowchart created. Add a Start block to begin.");
  }

  function changeEditorMode(mode) {
    if (mode === "pseudocode" && !pseudocodeDirty) {
      setPseudocode(diagramToPseudocode(diagram));
      setPseudocodeHistory([]);
    }
    setEditorMode(mode);
  }

  function updatePseudocode(value) {
    setPseudocodeHistory((historyItems) => [...historyItems, pseudocode].slice(-80));
    setPseudocode(value);
    setPseudocodeDirty(true);
  }

  function undoPseudocode() {
    const previous = pseudocodeHistory.at(-1);
    if (previous == null) return;
    setPseudocodeHistory((historyItems) => historyItems.slice(0, -1));
    setPseudocode(previous);
    setPseudocodeDirty(true);
  }

  function insertPseudocode(template) {
    const lines = pseudocode.split(/\r?\n/);
    const endIndex = lines.findLastIndex((line) => /^\s*END\s*$/i.test(line));
    lines.splice(endIndex >= 0 ? endIndex : lines.length, 0, ...template.split("\n"));
    updatePseudocode(lines.join("\n"));
  }

  function loadPseudocodeExample(exampleId) {
    const example = PSEUDOCODE_EXAMPLES.find((item) => item.id === exampleId);
    if (!example) return;
    if (editorMode === "flowchart") {
      if ((diagram.nodes.length || pseudocodeDirty) && !window.confirm(`Replace the current flowchart or unapplied pseudocode with “${example.title}”? Export a JSON copy first if you want to keep your current project.`)) return;
      try {
        const nextDiagram = pseudocodeToDiagram(example.source, example.title);
        const validation = generatePython(nextDiagram);
        if (validation.errors.length) throw new Error(validation.errors[0]);
        updateDiagram(nextDiagram);
        setSelectedId(nextDiagram.nodes[0]?.id ?? "");
        setConnectionSource(nextDiagram.nodes[0]?.id ?? "");
        setConnectionTarget(nextDiagram.nodes[1]?.id ?? "");
        setPseudocode(example.source);
        setPseudocodeDirty(false);
        setActionMessage(`${example.title} loaded as a flowchart.`);
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : "This example could not be loaded.");
      }
      return;
    }
    if (pseudocodeDirty && !window.confirm("Replace the pseudocode you have edited with this example?")) return;
    updatePseudocode(example.source);
    setActionMessage(`${example.title} loaded into the pseudocode editor. Apply it to update your flowchart.`);
  }

  function applyPseudocode() {
    try {
      const nextDiagram = pseudocodeToDiagram(pseudocode, diagram.name);
      const validation = generatePython(nextDiagram);
      if (validation.errors.length) throw new Error(validation.errors[0]);
      updateDiagram(nextDiagram);
      setSelectedId(nextDiagram.nodes[0]?.id ?? "");
      setConnectionSource(nextDiagram.nodes[0]?.id ?? "");
      setConnectionTarget(nextDiagram.nodes[1]?.id ?? "");
      setPseudocode(diagramToPseudocode(nextDiagram));
      setPseudocodeDirty(false);
      setActionMessage("Pseudocode applied. The flowchart and code preview are updated.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Check the pseudocode format and try again.");
    }
  }

  function removeEdge(edgeId) {
    updateDiagram((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) }));
    setActionMessage("Connection removed.");
  }

  function beginDrag(event, node) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: node.position.x, y: node.position.y, moved: false, historyStarted: false, startDiagram: diagram };
    setSelectedId(node.id);
  }

  function moveNode(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) / canvasZoom;
    const dy = (event.clientY - drag.startY) / canvasZoom;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    if (!drag.moved) return;
    if (!drag.historyStarted) {
      setHistory((currentHistory) => ({
        past: [...currentHistory.past, drag.startDiagram].slice(-100),
        future: [],
      }));
      drag.historyStarted = true;
    }
    setDragging(true);
    const node = nodeMap.get(drag.id);
    const size = NODE_SIZE[node?.type] ?? { width: 184, height: 78 };
    const x = Math.max(8, Math.min(CANVAS.width - size.width - 8, drag.x + dx));
    const y = Math.max(8, Math.min(CANVAS.height - size.height - 8, drag.y + dy));
    updateDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === drag.id ? { ...item, position: { x, y } } : item),
    }), { record: false });
  }

  function finishDrag(event) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  function refreshCode() {
    const result = codeLanguage === "C" ? generateC(diagram) : generatePython(diagram);
    setActionMessage(result.errors.length ? result.errors[0] : `${codeLanguage} refreshed from your current flowchart.`);
  }

  function startPreview() {
    try {
      const steps = previewFlowchart(diagram, sampleInputs);
      setPreviewRun({ diagram, steps });
      setPreviewIndex(0);
      setActionMessage("Flow preview started. Step through the highlighted path to follow the logic.");
    } catch (error) {
      setPreviewRun(null);
      setActionMessage(error instanceof Error ? error.message : "This flowchart could not be previewed.");
    }
  }

  async function copyCode() {
    if (!generation.code) return;
    try {
      await navigator.clipboard.writeText(generation.code);
      setCopied(true);
      setActionMessage(`Generated ${codeLanguage} copied to the clipboard.`);
      window.setTimeout(() => setCopied(false), 1700);
    } catch {
      setActionMessage("Clipboard access is unavailable. Select the code and copy it instead.");
    }
  }

  function downloadFile(filename, content, mimeType) {
    const file = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveProject() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram));
      setSaveLabel("Saved in this browser");
      setActionMessage("Your flowchart is saved in this browser.");
    } catch {
      setSaveLabel("Browser storage is full; export a JSON backup");
    }
  }

  function exportProject() {
    downloadFile("maptocode-flowchart.json", `${JSON.stringify(diagram, null, 2)}\n`, "application/json;charset=utf-8");
    setActionMessage("Flowchart data exported as JSON.");
  }

  async function importProject(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Choose a project file smaller than 1 MB.");
      const project = normalizeProject(JSON.parse(await file.text()));
      updateDiagram(project);
      setSelectedId(project.nodes[0]?.id ?? "");
      setConnectionSource(project.nodes[0]?.id ?? "");
      setConnectionTarget(project.nodes[1]?.id ?? project.nodes[0]?.id ?? "");
      setActionMessage("Project opened. Check the validation panel for any incomplete blocks.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "That file could not be opened.");
    } finally {
      event.target.value = "";
    }
  }

  function updateProjectName(name) {
    updateDiagram((current) => ({ ...current, name: name.slice(0, 80) }));
  }

  function field(label, value, nodeId, property, options = {}) {
    return (
      <label className={styles.field}>
        <span>{label}</span>
        {options.multiline ? (
          <textarea value={value ?? ""} maxLength={options.maxLength ?? 240} rows={options.rows ?? 3} onChange={(event) => updateNode(nodeId, { [property]: event.target.value })} />
        ) : (
          <input value={value ?? ""} maxLength={options.maxLength ?? 200} onChange={(event) => updateNode(nodeId, { [property]: event.target.value })} />
        )}
        {options.help && <small>{options.help}</small>}
      </label>
    );
  }

  function handleCanvasKeyDown(event) {
    const target = event.target;
    const isEditingText = target instanceof HTMLElement && (
      target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );
    if (isEditingText) return;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redoDiagram();
      else undoDiagram();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoDiagram();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelectedNode();
    }
  }

  return (
    <main className={styles.workspacePage}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="MapToCode home"><span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>MapToCode</Link>
        <nav className={styles.headerNav} aria-label="Workspace navigation"><Link href="/">← Home</Link><span className={styles.localBadge}><i /> SAVED LOCALLY</span></nav>
      </header>

      <div className={styles.workspaceBody}>
        <div className={styles.breadcrumb}><Link href="/">MapToCode</Link><span>/</span><strong>Workspace</strong></div>
        <div className={styles.titleRow}>
          <div><div className={styles.eyebrow}>FLOWCHART WORKSPACE</div><label className={styles.projectNameLabel} htmlFor="project-name">Project name</label><input id="project-name" className={styles.projectName} value={diagram.name} maxLength={80} onChange={(event) => updateProjectName(event.target.value)} /><p>Build a diagram, connect its blocks, and see generated code as you work.</p></div>
          <div className={styles.projectActions}><span className={styles.saveStatus} aria-live="polite">{saveLabel}</span><button type="button" onClick={createNewFlowchart}>New flowchart <span>＋</span></button><button type="button" onClick={undoDiagram} disabled={history.past.length === 0} title="Undo (Ctrl/⌘+Z)">Undo <span>↶</span></button><button type="button" onClick={redoDiagram} disabled={history.future.length === 0} title="Redo (Ctrl/⌘+Shift+Z)">Redo <span>↷</span></button><button type="button" onClick={saveProject}>Save</button><button type="button" onClick={exportProject}>Export JSON <span>↓</span></button><button type="button" onClick={() => importRef.current?.click()}>Open JSON <span>↑</span></button><button type="button" onClick={restoreExample}>Restore example</button><input ref={importRef} className={styles.fileInput} type="file" accept=".json,application/json" onChange={importProject} aria-label="Open a MapToCode project file" /></div>
        </div>

        <div className={styles.editorLayout}>
          <section className={styles.canvasPanel} aria-labelledby="canvas-title">
            <div className={styles.panelHeader}><div className={styles.panelTitle}><span className={styles.panelIcon}>⌁</span><div><h2 id="canvas-title">{editorMode === "pseudocode" ? "Pseudocode editor" : "Flowchart canvas"}</h2><span>{diagram.nodes.length} blocks · {diagram.edges.length} connections</span></div></div><div className={styles.canvasStatus}><span className={generation.errors.length || pseudocodeDirty ? styles.invalidDot : styles.validDot} />{pseudocodeDirty ? "Not applied" : generation.errors.length ? "Needs attention" : "Diagram valid"}</div></div>
            <div className={styles.editorTabs} role="group" aria-label="Choose an editor">
              <button type="button" aria-pressed={editorMode === "flowchart"} className={editorMode === "flowchart" ? styles.activeEditorTab : ""} onClick={() => changeEditorMode("flowchart")}>Flowchart</button>
              <button type="button" aria-pressed={editorMode === "pseudocode"} className={editorMode === "pseudocode" ? styles.activeEditorTab : ""} onClick={() => changeEditorMode("pseudocode")}>Pseudocode</button>
            </div>
            <label className={styles.examplePicker}><span>Examples</span>
              <select value="" onChange={(event) => loadPseudocodeExample(event.target.value)}>
                <option value="" disabled>Choose an example…</option>
                {PSEUDOCODE_EXAMPLES.map((example) => <option value={example.id} key={example.id}>{example.title}</option>)}
              </select>
            </label>
            {editorMode === "pseudocode" ? <div className={styles.pseudocodeEditor}>
              <div className={styles.pseudocodeTools} aria-label="Pseudocode editing tools">
                <button type="button" onClick={() => insertPseudocode('INPUT value PROMPT "Enter a value: "')}>INPUT</button>
                <button type="button" onClick={() => insertPseudocode("value ← value + 1")}>Step</button>
                <button type="button" onClick={() => insertPseudocode('OUTPUT "Done"')}>OUTPUT</button>
                <button type="button" onClick={() => insertPseudocode(`IF value > 10 THEN\n    OUTPUT "Large"\nELSE\n    OUTPUT "Small"\nEND IF`)}>IF / ELSE</button>
                <button type="button" onClick={undoPseudocode} disabled={!pseudocodeHistory.length} aria-label="Undo pseudocode edit">←</button>
                <button type="button" onClick={() => { updatePseudocode(tidyPseudocode(pseudocode)); }}>Tidy up</button>
                <button type="button" onClick={() => updatePseudocode("BEGIN\nEND")}>Clear all</button>
              </div>
              <label className={styles.pseudocodeLabel} htmlFor="pseudocode-input">Write pseudocode <span>{pseudocodeDirty ? "Unapplied edits · apply to update the flowchart." : "Use BEGIN, INPUT, assignments, OUTPUT, and one IF / ELSE decision, then END."}</span></label>
              <textarea id="pseudocode-input" className={styles.pseudocodeInput} spellCheck="false" value={pseudocode} onChange={(event) => updatePseudocode(event.target.value)} aria-describedby="pseudocode-help" />
              <p id="pseudocode-help" className={styles.pseudocodeHelp}>Assignments accept ←, &lt;-, or =. Put one action on each line. Pseudocode is checked before it updates your flowchart.</p>
              <div className={styles.pseudocodeFooter}><button type="button" className={styles.applyPseudocode} onClick={applyPseudocode}>Apply to flowchart <span>↗</span></button><span>Your Python/C preview updates after you apply.</span></div>
            </div> : <>
            <div className={styles.paletteHeader}><span className={styles.sectionEyebrow}>1. ADD A BLOCK</span><span>Choose a shape to add it to your diagram.</span></div>
            <div className={styles.palette} aria-label="Add a flowchart block">{["Start", "Input", "Process", "Decision", "Output", "End"].map((type) => <button key={type} type="button" onClick={() => addNode(type)}><span>＋</span>{type}</button>)}</div>
            <form className={styles.connectionForm} onSubmit={connectBlocks} aria-label="Connect flowchart blocks">
              <div><span className={styles.sectionEyebrow}>2. CONNECT BLOCKS</span><p>{nodeMap.get(connectionSource) ? <>Selected source: <strong>{nodeMap.get(connectionSource).label || nodeMap.get(connectionSource).type}</strong>. Choose its next block, then add the connection.</> : "Select a source block, choose its next step, then add the connection."}</p></div>
              <label>From<select value={connectionSource} onChange={(event) => changeConnectionSource(event.target.value)}>{diagram.nodes.map((node) => <option value={node.id} key={node.id}>{node.label || node.type} · {node.type}</option>)}</select></label>
              {nodeMap.get(connectionSource)?.type === "Decision" && <label>Path<select value={connectionBranch} onChange={(event) => setConnectionBranch(event.target.value)}><option value="true">True</option><option value="false">False</option></select></label>}
              <span className={styles.toArrow} aria-hidden="true">→</span>
              <label>To<select value={connectionTarget} onChange={(event) => setConnectionTarget(event.target.value)}>{diagram.nodes.map((node) => <option value={node.id} key={node.id}>{node.label || node.type} · {node.type}</option>)}</select></label>
              <button className={styles.connectButton} type="submit" disabled={diagram.nodes.length < 2}>Add connection</button>
            </form>
            <div className={styles.canvasTools} aria-label="Canvas view controls">
              <span>3. Arrange your flowchart</span>
              <div>
                <button type="button" onClick={() => changeCanvasZoom(-0.1)} disabled={canvasZoom <= 0.45} aria-label="Zoom out">−</button>
                <output aria-live="polite">{Math.round(canvasZoom * 100)}%</output>
                <button type="button" onClick={() => changeCanvasZoom(0.1)} disabled={canvasZoom >= 1.5} aria-label="Zoom in">＋</button>
                <button type="button" onClick={fitCanvas}>Fit diagram</button>
              </div>
            </div>
            <div ref={canvasViewportRef} className={styles.canvasViewport}>
              <div ref={canvasRef} style={{ zoom: canvasZoom }} className={`${styles.canvasSurface} ${dragging ? styles.dragging : ""}`} onPointerMove={moveNode} onPointerUp={finishDrag} onPointerCancel={finishDrag} onKeyDown={handleCanvasKeyDown}>
                <svg className={styles.connections} viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} aria-label="Connections between flowchart blocks">
                  <defs><marker id={arrowId} viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M1 1 6 4 1 7" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
                  {diagram.edges.map((edge) => {
                    const path = edgePath(edge, nodeMap);
                    if (!path) return null;
                    const source = nodeMap.get(edge.from);
                    const target = nodeMap.get(edge.to);
                    const fromSize = NODE_SIZE[source.type] ?? { width: 184, height: 78 };
                    const toSize = NODE_SIZE[target.type] ?? { width: 184, height: 78 };
                    const fromInset = ["Input", "Output"].includes(source.type) ? fromSize.width * 0.07 : 0;
                    const toInset = ["Input", "Output"].includes(target.type) ? toSize.width * 0.07 : 0;
                    const labelX = (source.position.x + fromSize.width - fromInset + target.position.x + toInset) / 2;
                    const labelY = (source.position.y + fromSize.height / 2 + target.position.y + toSize.height / 2) / 2;
                    return <g key={edge.id}><path d={path} markerEnd={`url(#${arrowId})`} /><title>{edge.branch ? `${edge.branch} branch` : "Flow"}: ${source.label} to ${target.label}</title>{edge.branch && <text x={labelX} y={labelY - 8} className={styles.branchLabel}>{edge.branch === "true" ? "TRUE" : "FALSE"}</text>}</g>;
                  })}
                </svg>
                {diagram.nodes.map((node) => {
                  const size = NODE_SIZE[node.type] ?? { width: 184, height: 78 };
                  const supported = NODE_TYPES.has(node.type);
                  return (
                    <button key={node.id} type="button" className={`${styles.flowNode} ${styles[`node${node.type}`] ?? styles.nodeUnknown} ${selectedId === node.id ? styles.selectedNode : ""} ${activePreviewStep?.nodeId === node.id ? styles.previewNode : ""}`} style={{ left: node.position.x, top: node.position.y, width: size.width, height: size.height }} onPointerDown={(event) => beginDrag(event, node)} onClick={() => selectNode(node.id)} aria-pressed={selectedId === node.id} title="Drag to move this block; select to edit and connect it" aria-label={`${node.type}: ${node.label || "Untitled block"}. Select to edit or connect; drag to move.`}>
                      <span className={styles.nodeType}>{supported ? node.type : "Unsupported"}</span><strong>{node.label || "Untitled block"}</strong><span className={styles.nodeDetail}>{nodeDetail(node)}</span>
                    </button>
                  );
                })}
                {!diagram.nodes.length && <div className={styles.emptyCanvas}><strong>Your canvas is ready.</strong><span>Add a Start block to begin building your flowchart.</span><button type="button" onClick={() => addNode("Start")}>＋ Add Start block</button></div>}
              </div>
            </div>

            <div className={styles.canvasBottom}><span>Select a block to edit it · Drag to arrange · Use Fit diagram to see all blocks</span><span>Undo/redo: Ctrl/⌘+Z · Delete removes a selected block</span></div>

            <div className={styles.connectionsList}><div className={styles.listHeading}><span className={styles.sectionEyebrow}>CONNECTIONS</span><span>{diagram.edges.length}</span></div>{diagram.edges.length ? <ul>{diagram.edges.map((edge) => <li key={edge.id}><span className={styles.edgeSource}>{nodeMap.get(edge.from)?.label ?? "Missing block"}</span><span className={styles.edgeBranch}>{edge.branch ? edge.branch.toUpperCase() : "NEXT"}</span><span className={styles.edgeTarget}>{nodeMap.get(edge.to)?.label ?? "Missing block"}</span><button type="button" aria-label={`Delete connection from ${nodeMap.get(edge.from)?.label ?? "missing block"} to ${nodeMap.get(edge.to)?.label ?? "missing block"}`} onClick={() => removeEdge(edge.id)}>×</button></li>)}</ul> : <p className={styles.emptyEdges}>No connections yet. Use the controls above to join blocks.</p>}</div>
            </>}
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.inspectorPanel} aria-labelledby="inspector-title">
              <div className={styles.panelHeader}><div className={styles.panelTitle}><span className={styles.panelIcon}>⌖</span><div><h2 id="inspector-title">Block settings</h2><span>{selectedNode ? selectedNode.type : "Select a block"}</span></div></div>{selectedNode && <button type="button" className={styles.deleteBlock} onClick={deleteSelectedNode}>Delete block</button>}</div>
                {selectedNode ? <div className={styles.inspectorFields}>
                {field("Block label", selectedNode.label, selectedNode.id, "label", { maxLength: 80 })}
                {selectedNode.type === "Input" && <>
                  {field("Variable name", selectedNode.variable, selectedNode.id, "variable", { help: "Use a simple Python name, like age or score." })}
                  {field("Question to ask", selectedNode.prompt, selectedNode.id, "prompt", { multiline: true, rows: 2, maxLength: 240 })}
                  <label className={styles.field}><span>Answer type</span><select value={selectedNode.inputType} onChange={(event) => updateNode(selectedNode.id, { inputType: event.target.value })}><option value="number">Whole number</option><option value="text">Text</option></select></label>
                </>}
                {selectedNode.type === "Process" && field("Assignment", selectedNode.assignment, selectedNode.id, "assignment", { help: "One simple assignment, e.g. total = price * count." })}
                {selectedNode.type === "Decision" && field("Condition", selectedNode.condition, selectedNode.id, "condition", { help: "Compare values, e.g. age >= 18." })}
                {selectedNode.type === "Output" && <>
                  <label className={styles.field}><span>What to print</span><select value={selectedNode.outputMode ?? "message"} onChange={(event) => updateNode(selectedNode.id, { outputMode: event.target.value })}><option value="message">Text message</option><option value="expression">Value or calculation</option></select></label>
                  {selectedNode.outputMode === "expression" ? field("Value / expression", selectedNode.expression, selectedNode.id, "expression", { help: "Use a value or safe arithmetic, e.g. total or price * count." }) : field("Message to show", selectedNode.message, selectedNode.id, "message", { multiline: true, rows: 3, maxLength: 500 })}
                </>}
                {(selectedNode.type === "Start" || selectedNode.type === "End") && <p className={styles.fixedBlockNote}>Start and End mark where the program begins and finishes.</p>}
                </div> : <p className={styles.selectHint}>Choose a block in the canvas to edit its content. You can also drag a block to move it.</p>}
            </section>

            <section className={styles.pythonPanel} aria-labelledby="python-title">
              <div className={styles.codePanelHeader}><div className={styles.panelTitle}><span className={styles.codePanelIcon}>{"{ }"}</span><div><h2 id="code-title">Generated code</h2><span>Created from your flowchart</span></div></div><label><span className={styles.pythonTag}>{codeLanguage === "Python" ? "PYTHON" : "C"}</span><select aria-label="Programming language" value={codeLanguage} onChange={(event) => { setCodeLanguage(event.target.value); setCopied(false); }}><option>Python</option><option>C</option></select></label></div>
              <div className={styles.codeActions}><button type="button" onClick={refreshCode}>Generate code ↻</button><div><button type="button" disabled={!generation.code} onClick={copyCode}>{copied ? "Copied ✓" : "Copy"}</button><button type="button" disabled={!generation.code} onClick={() => downloadFile(`maptocode.${codeLanguage === "C" ? "c" : "py"}`, generation.code, codeLanguage === "C" ? "text/x-c;charset=utf-8" : "text/x-python;charset=utf-8")}>Download .{codeLanguage === "C" ? "c" : "py"} ↓</button></div></div>
              {generation.errors.length ? <div className={styles.validationBox} role="status"><div><span>!</span><strong>Fix these items to generate {codeLanguage}</strong></div><ul>{generation.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div> : <div className={styles.validMessage}><span>✓</span> Diagram checks passed. Preview updates as you edit.</div>}
              {generation.code ? <pre className={styles.generatedCode} aria-label={`Generated ${codeLanguage} code`}><code>{generation.code}</code></pre> : <div className={styles.codeEmpty}>Your Python will appear here once the flowchart is complete.</div>}
              <div className={styles.codeScope}>{codeLanguage === "C" ? "C supports whole-number arithmetic (+, -, *) and one comparison per Decision. Text input reads one word. Division, decimals, loops, and multiple decisions are not supported yet." : "Python supports one Start and End, straight-line blocks, and one True/False Decision. Loops and multiple decisions are not supported yet."}</div>
            </section>

                <section className={styles.previewPanel} aria-labelledby="preview-title">
              <div className={styles.panelHeader}><div className={styles.panelTitle}><span className={styles.panelIcon}>▷</span><div><h2 id="preview-title">Walk through the flow</h2><span>Try sample values and follow the selected path</span></div></div></div>
              <p className={styles.previewExplanation}>This is a local diagram preview. It does not execute the generated code.</p>
              {diagram.nodes.filter((node) => node.type === "Input").map((node) => <label className={styles.previewInput} key={node.id}><span>{node.prompt || node.label}</span><input value={sampleInputs[node.id] ?? ""} onChange={(event) => { setSampleInputs((current) => ({ ...current, [node.id]: event.target.value })); setPreviewRun(null); }} placeholder={node.inputType === "number" ? "Enter a whole number" : "Enter sample text"} /></label>)}
              <div className={styles.previewActions}><button type="button" onClick={startPreview} disabled={generation.errors.length > 0}>Start preview</button>{previewSteps && <><button type="button" onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))} disabled={previewIndex === 0}>← Back</button><button type="button" onClick={() => setPreviewIndex((index) => Math.min(previewSteps.length - 1, index + 1))} disabled={previewIndex >= previewSteps.length - 1}>Next →</button></>}</div>
              {previewSteps && <div className={styles.previewResult} aria-live="polite"><div><strong>Step {previewIndex + 1} of {previewSteps.length}</strong><span>{activePreviewStep.type}: {activePreviewStep.label}{activePreviewStep.branch ? ` · ${activePreviewStep.branch === "true" ? "True" : "False"} path` : ""}</span></div>{activePreviewStep.output && <p>Output: <strong>{activePreviewStep.output}</strong></p>}{previewSteps.filter((step) => step.output).length > 0 && <small>Outputs so far: {previewSteps.slice(0, previewIndex + 1).filter((step) => step.output).map((step) => step.output).join(" · ")}</small>}</div>}
              {generation.errors.length > 0 && <p className={styles.previewHint}>Fix the validation issues above to start a walkthrough.</p>}
            </section>
          </aside>
        </div>

        {actionMessage && <div className={styles.actionMessage} role="status"><span>✳</span>{actionMessage}<button type="button" onClick={() => setActionMessage("")} aria-label="Dismiss message">×</button></div>}
        <p className={styles.localNote}>Your diagram stays in this browser. Export a JSON copy to move it to another device.</p>
      </div>
    </main>
  );
}
