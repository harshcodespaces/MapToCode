"use client";

import { useEffect, useMemo, useRef, useState, useId } from "react";
import Link from "next/link";
import FlowchartDiagram from "../components/FlowchartDiagram";
import { DEFAULT_DIAGRAM, NODE_TYPES, generateC, generatePython, hasDiagramShape, validateConnection } from "../../lib/flowchart";
import styles from "./workspace.module.css";

const STORAGE_KEY = "maptocode:diagram:v1";
const CANVAS = { width: 1360, height: 760 };
const NODE_SIZE = {
  Start: { width: 132, height: 56 },
  End: { width: 132, height: 56 },
  Input: { width: 184, height: 78 },
  Process: { width: 184, height: 78 },
  Output: { width: 184, height: 78 },
  Decision: { width: 154, height: 96 },
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
  const x1 = from.position.x + fromSize.width;
  const y1 = from.position.y + fromSize.height / 2;
  const x2 = to.position.x;
  const y2 = to.position.y + toSize.height / 2;
  const bend = Math.max(36, Math.min(100, Math.abs(x2 - x1) * 0.45));
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export default function WorkspaceClient() {
  const [diagram, setDiagram] = useState(DEFAULT_DIAGRAM);
  const [selectedId, setSelectedId] = useState("adult-check");
  const [hydrated, setHydrated] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Loading local project…");
  const [actionMessage, setActionMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("Python");
  const [connectionSource, setConnectionSource] = useState("start");
  const [connectionTarget, setConnectionTarget] = useState("ask-age");
  const [connectionBranch, setConnectionBranch] = useState("true");
  const [canvasZoom, setCanvasZoom] = useState(1);
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

  function changeCanvasZoom(amount) {
    recenterAfterZoomRef.current = true;
    setCanvasZoom((current) => Math.max(0.45, Math.min(1.5, Math.round((current + amount) * 100) / 100)));
  }

  function selectNode(id) {
    setSelectedId(id);
    setConnectionSource(id);
  }

  function updateNode(id, changes) {
    setDiagram((current) => ({
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
    const node = defaultNode(type, diagram.nodes.length - 2);
    setDiagram((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedId(node.id);
    setActionMessage(`${type} block added. Connect it to the flowchart when you’re ready.`);
  }

  function deleteSelectedNode() {
    if (!selectedNode) return;
    const removedId = selectedNode.id;
    const remainingNodes = diagram.nodes.filter((node) => node.id !== removedId);
    setDiagram((current) => ({
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
    setDiagram((current) => ({ ...current, edges: [...current.edges, edge] }));
    setActionMessage(source.type === "Decision" ? `${branch === "true" ? "True" : "False"} path connected.` : "Blocks connected.");
  }

  function restoreExample() {
    if (!window.confirm("Replace this browser’s current flowchart with the original age check example? Export a JSON copy first if you want to keep it.")) return;
    const example = structuredClone(DEFAULT_DIAGRAM);
    setDiagram(example);
    setSelectedId("adult-check");
    setConnectionSource("start");
    setConnectionTarget("ask-age");
    setConnectionBranch("true");
    setActionMessage("The example flowchart has been restored.");
  }

  function removeEdge(edgeId) {
    setDiagram((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) }));
    setActionMessage("Connection removed.");
  }

  function beginDrag(event, node) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: node.position.x, y: node.position.y, moved: false };
    setSelectedId(node.id);
  }

  function moveNode(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) / canvasZoom;
    const dy = (event.clientY - drag.startY) / canvasZoom;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    if (!drag.moved) return;
    setDragging(true);
    const node = nodeMap.get(drag.id);
    const size = NODE_SIZE[node?.type] ?? { width: 184, height: 78 };
    const x = Math.max(8, Math.min(CANVAS.width - size.width - 8, drag.x + dx));
    const y = Math.max(8, Math.min(CANVAS.height - size.height - 8, drag.y + dy));
    setDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === drag.id ? { ...item, position: { x, y } } : item),
    }));
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
      setDiagram(project);
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
    setDiagram((current) => ({ ...current, name: name.slice(0, 80) }));
  }

  function field(label, value, onChange, options = {}) {
    return (
      <label className={styles.field} key={label}>
        <span>{label}</span>
        {options.multiline ? (
          <textarea value={value ?? ""} maxLength={options.maxLength ?? 240} rows={options.rows ?? 3} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <input value={value ?? ""} maxLength={options.maxLength ?? 200} onChange={(event) => onChange(event.target.value)} />
        )}
        {options.help && <small>{options.help}</small>}
      </label>
    );
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
          <div className={styles.projectActions}><span className={styles.saveStatus} aria-live="polite">{saveLabel}</span><button type="button" onClick={saveProject}>Save</button><button type="button" onClick={exportProject}>Export JSON <span>↓</span></button><button type="button" onClick={() => importRef.current?.click()}>Open JSON <span>↑</span></button><button type="button" onClick={restoreExample}>Restore example</button><input ref={importRef} className={styles.fileInput} type="file" accept=".json,application/json" onChange={importProject} aria-label="Open a MapToCode project file" /></div>
        </div>

        <div className={styles.editorLayout}>
          <section className={styles.canvasPanel} aria-labelledby="canvas-title">
            <div className={styles.panelHeader}><div className={styles.panelTitle}><span className={styles.panelIcon}>⌁</span><div><h2 id="canvas-title">Flowchart canvas</h2><span>{diagram.nodes.length} blocks · {diagram.edges.length} connections</span></div></div><div className={styles.canvasStatus}><span className={generation.errors.length ? styles.invalidDot : styles.validDot} />{generation.errors.length ? "Needs attention" : "Diagram valid"}</div></div>
            <div className={styles.paletteHeader}><span className={styles.sectionEyebrow}>1. ADD A BLOCK</span><span>Choose a shape to add it to your diagram.</span></div>
            <div className={styles.palette} aria-label="Add a flowchart block">{["Start", "Input", "Process", "Decision", "Output", "End"].map((type) => <button key={type} type="button" onClick={() => addNode(type)}><span>＋</span>{type}</button>)}</div>
            <form className={styles.connectionForm} onSubmit={connectBlocks} aria-label="Connect flowchart blocks">
              <div><span className={styles.sectionEyebrow}>2. CONNECT BLOCKS</span><p>Select a block on the canvas, choose its next step, then add the connection.</p></div>
              <label>From<select value={connectionSource} onChange={(event) => setConnectionSource(event.target.value)}>{diagram.nodes.map((node) => <option value={node.id} key={node.id}>{node.label || node.type} · {node.type}</option>)}</select></label>
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
              <div ref={canvasRef} style={{ zoom: canvasZoom }} className={`${styles.canvasSurface} ${dragging ? styles.dragging : ""}`} onPointerMove={moveNode} onPointerUp={finishDrag} onPointerCancel={finishDrag} onKeyDown={(event) => { if (event.key === "Delete") { event.preventDefault(); deleteSelectedNode(); } }}>
                <svg className={styles.connections} viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} aria-label="Connections between flowchart blocks">
                  <defs><marker id={arrowId} viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M1 1 6 4 1 7" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
                  {diagram.edges.map((edge) => {
                    const path = edgePath(edge, nodeMap);
                    if (!path) return null;
                    const source = nodeMap.get(edge.from);
                    const target = nodeMap.get(edge.to);
                    const fromSize = NODE_SIZE[source.type] ?? { width: 184, height: 78 };
                    const toSize = NODE_SIZE[target.type] ?? { width: 184, height: 78 };
                    const labelX = (source.position.x + fromSize.width + target.position.x) / 2;
                    const labelY = (source.position.y + fromSize.height / 2 + target.position.y + toSize.height / 2) / 2;
                    return <g key={edge.id}><path d={path} markerEnd={`url(#${arrowId})`} /><title>{edge.branch ? `${edge.branch} branch` : "Flow"}: ${source.label} to ${target.label}</title>{edge.branch && <text x={labelX} y={labelY - 8} className={styles.branchLabel}>{edge.branch === "true" ? "TRUE" : "FALSE"}</text>}</g>;
                  })}
                </svg>
                {diagram.nodes.map((node) => {
                  const size = NODE_SIZE[node.type] ?? { width: 184, height: 78 };
                  const supported = NODE_TYPES.has(node.type);
                  return (
                    <button key={node.id} type="button" className={`${styles.flowNode} ${styles[`node${node.type}`] ?? styles.nodeUnknown} ${selectedId === node.id ? styles.selectedNode : ""}`} style={{ left: node.position.x, top: node.position.y, width: size.width, height: size.height }} onPointerDown={(event) => beginDrag(event, node)} onClick={() => selectNode(node.id)} aria-pressed={selectedId === node.id} title="Drag to move this block; select to edit and connect it" aria-label={`${node.type}: ${node.label || "Untitled block"}. Select to edit or connect; drag to move.`}>
                      <span className={styles.nodeType}>{supported ? node.type : "Unsupported"}</span><strong>{node.label || "Untitled block"}</strong><span className={styles.nodeDetail}>{nodeDetail(node)}</span>
                    </button>
                  );
                })}
                {!diagram.nodes.length && <div className={styles.emptyCanvas}><strong>Your canvas is ready.</strong><span>Add a Start block to begin building your flowchart.</span><button type="button" onClick={() => addNode("Start")}>＋ Add Start block</button></div>}
              </div>
            </div>

            <div className={styles.canvasBottom}><span>Select a block to edit it · Drag to arrange · Use Fit diagram to see all blocks</span><span>Press Delete to remove the selected block</span></div>

            <div className={styles.connectionsList}><div className={styles.listHeading}><span className={styles.sectionEyebrow}>CONNECTIONS</span><span>{diagram.edges.length}</span></div>{diagram.edges.length ? <ul>{diagram.edges.map((edge) => <li key={edge.id}><span className={styles.edgeSource}>{nodeMap.get(edge.from)?.label ?? "Missing block"}</span><span className={styles.edgeBranch}>{edge.branch ? edge.branch.toUpperCase() : "NEXT"}</span><span className={styles.edgeTarget}>{nodeMap.get(edge.to)?.label ?? "Missing block"}</span><button type="button" aria-label={`Delete connection from ${nodeMap.get(edge.from)?.label ?? "missing block"} to ${nodeMap.get(edge.to)?.label ?? "missing block"}`} onClick={() => removeEdge(edge.id)}>×</button></li>)}</ul> : <p className={styles.emptyEdges}>No connections yet. Use the controls above to join blocks.</p>}</div>
          </section>

          <aside className={styles.sideColumn}>
            <section className={styles.inspectorPanel} aria-labelledby="inspector-title">
              <div className={styles.panelHeader}><div className={styles.panelTitle}><span className={styles.panelIcon}>⌖</span><div><h2 id="inspector-title">Block settings</h2><span>{selectedNode ? selectedNode.type : "Select a block"}</span></div></div>{selectedNode && <button type="button" className={styles.deleteBlock} onClick={deleteSelectedNode}>Delete block</button>}</div>
                {selectedNode ? <div className={styles.inspectorFields}>
                {field("Block label", selectedNode.label, (value) => updateNode(selectedNode.id, { label: value }), { maxLength: 80 })}
                {selectedNode.type === "Input" && <>
                  {field("Variable name", selectedNode.variable, (value) => updateNode(selectedNode.id, { variable: value }), { help: "Use a simple Python name, like age or score." })}
                  {field("Question to ask", selectedNode.prompt, (value) => updateNode(selectedNode.id, { prompt: value }), { multiline: true, rows: 2, maxLength: 240 })}
                  <label className={styles.field}><span>Answer type</span><select value={selectedNode.inputType} onChange={(event) => updateNode(selectedNode.id, { inputType: event.target.value })}><option value="number">Whole number</option><option value="text">Text</option></select></label>
                </>}
                {selectedNode.type === "Process" && field("Assignment", selectedNode.assignment, (value) => updateNode(selectedNode.id, { assignment: value }), { help: "One simple assignment, e.g. total = price * count." })}
                {selectedNode.type === "Decision" && field("Condition", selectedNode.condition, (value) => updateNode(selectedNode.id, { condition: value }), { help: "Compare values, e.g. age >= 18." })}
                {selectedNode.type === "Output" && <>
                  <label className={styles.field}><span>What to print</span><select value={selectedNode.outputMode ?? "message"} onChange={(event) => updateNode(selectedNode.id, { outputMode: event.target.value })}><option value="message">Text message</option><option value="expression">Value or calculation</option></select></label>
                  {selectedNode.outputMode === "expression" ? field("Value / expression", selectedNode.expression, (value) => updateNode(selectedNode.id, { expression: value }), { help: "Use a value or safe arithmetic, e.g. total or price * count." }) : field("Message to show", selectedNode.message, (value) => updateNode(selectedNode.id, { message: value }), { multiline: true, rows: 3, maxLength: 500 })}
                </>}
                {(selectedNode.type === "Start" || selectedNode.type === "End") && <p className={styles.fixedBlockNote}>Start and End mark where the program begins and finishes.</p>}
                </div> : <p className={styles.selectHint}>Choose a block in the canvas to edit its content. You can also drag a block to move it.</p>}
            </section>

            <section className={styles.pythonPanel} aria-labelledby="python-title">
              <div className={styles.codePanelHeader}><div className={styles.panelTitle}><span className={styles.codePanelIcon}>{"{ }"}</span><div><h2 id="code-title">Generated code</h2><span>Created from your flowchart</span></div></div><label><span className={styles.pythonTag}>{codeLanguage === "Python" ? "PYTHON" : "C"}</span><select aria-label="Programming language" value={codeLanguage} onChange={(event) => { setCodeLanguage(event.target.value); setCopied(false); }}><option>Python</option><option>C</option></select></label></div>
              <div className={styles.codeActions}><button type="button" onClick={refreshCode}>Generate code ↻</button><div><button type="button" disabled={!generation.code} onClick={copyCode}>{copied ? "Copied ✓" : "Copy"}</button><button type="button" disabled={!generation.code} onClick={() => downloadFile(`maptocode.${codeLanguage === "C" ? "c" : "py"}`, generation.code, codeLanguage === "C" ? "text/x-c;charset=utf-8" : "text/x-python;charset=utf-8")}>Download .{codeLanguage === "C" ? "c" : "py"} ↓</button></div></div>
              {generation.errors.length ? <div className={styles.validationBox} role="status"><div><span>!</span><strong>Fix these items to generate {codeLanguage}</strong></div><ul>{generation.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div> : <div className={styles.validMessage}><span>✓</span> Diagram checks passed. Preview updates as you edit.</div>}
              {generation.code ? <pre className={styles.generatedCode} aria-label="Generated Python code"><code>{generation.code}</code></pre> : <div className={styles.codeEmpty}>Your Python will appear here once the flowchart is complete.</div>}
              <div className={styles.codeScope}>{codeLanguage === "C" ? "C supports whole-number arithmetic (+, -, *) and one comparison per Decision. Text input reads one word. Division, decimals, loops, and multiple decisions are not supported yet." : "Python supports one Start and End, straight-line blocks, and one True/False Decision. Loops and multiple decisions are not supported yet."}</div>
            </section>
          </aside>
        </div>

        {actionMessage && <div className={styles.actionMessage} role="status"><span>✳</span>{actionMessage}<button type="button" onClick={() => setActionMessage("")} aria-label="Dismiss message">×</button></div>}
        <p className={styles.localNote}>Your diagram stays in this browser. Export a JSON copy to move it to another device.</p>
      </div>
    </main>
  );
}
