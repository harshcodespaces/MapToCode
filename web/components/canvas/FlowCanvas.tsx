"use client";

import React, { useRef, useState, useMemo } from "react";
import styles from "../workspace/workspace.module.css";

export interface FlowchartCanvasNode {
  id: string;
  kind: "start" | "end" | "input" | "process" | "decision" | "output" | string;
  payload?: any;
}

export interface FlowchartCanvasEdge {
  id: string;
  from: string;
  to: string;
  branch?: "true" | "false" | string;
}

export type CanvasTheme = "dots" | "grid" | "blueprint" | "blank";
export type EdgeRouting = "curved" | "orthogonal" | "straight";

export function getNodeDimensions(kind: string): { width: number; height: number } {
  if (kind === "start" || kind === "end") return { width: 140, height: 54 };
  if (kind === "decision") return { width: 160, height: 80 };
  return { width: 184, height: 54 };
}

export function getEdgeCoordinates(
  fromNode: FlowchartCanvasNode | undefined,
  toNode: FlowchartCanvasNode | undefined,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  branch?: string
): { x1: number; y1: number; x2: number; y2: number } {
  const fromDims = getNodeDimensions(fromNode?.kind || "");
  const toDims = getNodeDimensions(toNode?.kind || "");

  let x1 = fromPos.x + fromDims.width / 2;
  let y1 = fromPos.y + fromDims.height;

  if (fromNode?.kind === "decision") {
    if (branch === "true") {
      x1 = fromPos.x;
      y1 = fromPos.y + fromDims.height / 2;
    } else if (branch === "false") {
      x1 = fromPos.x + fromDims.width;
      y1 = fromPos.y + fromDims.height / 2;
    }
  }

  const x2 = toPos.x + toDims.width / 2;
  const y2 = toPos.y;

  return { x1, y1, x2, y2 };
}

export const COLOR_TAG_PRESETS: Record<string, { label: string; bg: string; border: string; text: string }> = {
  emerald: { label: "Emerald", bg: "#ecfdf5", border: "#10b981", text: "#065f46" },
  blue: { label: "Sapphire", bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
  purple: { label: "Amethyst", bg: "#faf5ff", border: "#a855f7", text: "#6b21a8" },
  amber: { label: "Amber", bg: "#fffbeb", border: "#f59e0b", text: "#92400e" },
  rose: { label: "Rose", bg: "#fff1f2", border: "#f43f5e", text: "#9f1239" },
  slate: { label: "Slate", bg: "#f8fafc", border: "#64748b", text: "#334155" },
};

export interface FlowchartCanvasData {
  nodes: FlowchartCanvasNode[];
  edges: FlowchartCanvasEdge[];
  layout: {
    positions: Record<string, { x: number; y: number }>;
  };
}

export interface FlowCanvasProps {
  flowchart?: FlowchartCanvasData | any;
  selected?: string | null;
  setSelected?: (id: string | null) => void;
  moveNode?: (id: string, pos: { x: number; y: number }) => void;
  zoom?: number;
  setZoom?: (zoom: number) => void;
  highlightedNodeId?: string | null;
  activeBranch?: string | null;
  readOnly?: boolean;
  onAddStart?: (() => void) | null;
  selectedEdge?: string | null;
  setSelectedEdge?: (id: string | null) => void;
  onDeleteEdge?: (edgeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  onDuplicate?: (node: FlowchartCanvasNode) => void;
  onInsertNodeOnEdge?: (edgeId: string, kind: "input" | "initialization" | "process" | "decision" | "output") => void;
  onConnect?: (from: string, to: string, branch?: "true" | "false") => void;
  snapToGrid?: boolean;
  showGrid?: boolean;
  canvasTheme?: CanvasTheme;
  edgeRouting?: EdgeRouting;
  showMinimap?: boolean;
  nodeColorTags?: Record<string, string>;
  nodeNotes?: Record<string, string>;
  onAddNodeAtPosition?: (kind: string, pos: { x: number; y: number }) => void;
  emptyWatermark?: React.ReactNode;
}

interface DragState {
  id: string;
  dx: number;
  dy: number;
}

export default function FlowCanvas({
  flowchart,
  selected,
  setSelected = () => {},
  moveNode = () => {},
  zoom = 1,
  setZoom,
  highlightedNodeId = null,
  activeBranch = null,
  readOnly = false,
  onAddStart = null,
  selectedEdge = null,
  setSelectedEdge = () => {},
  onDeleteEdge = () => {},
  onDeleteNode = () => {},
  onDuplicate = () => {},
  onInsertNodeOnEdge = () => {},
  onConnect = () => {},
  snapToGrid = true,
  showGrid = true,
  canvasTheme = "dots",
  edgeRouting = "curved",
  showMinimap = false,
  nodeColorTags = {},
  nodeNotes = {},
  onAddNodeAtPosition,
  emptyWatermark,
}: FlowCanvasProps): React.JSX.Element {
  const nodes: FlowchartCanvasNode[] = useMemo(() => flowchart?.nodes || [], [flowchart?.nodes]);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [insertingOnEdge, setInsertingOnEdge] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ id: string; branch?: "true" | "false" } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-center canvas viewport on flowchart nodes on initial load or revision changes
  React.useEffect(() => {
    if (!viewportRef.current || nodes.length === 0) return;
    const positions = flowchart?.layout?.positions || {};
    let minX = Infinity;
    let maxX = -Infinity;
    nodes.forEach((n) => {
      const p = positions[n.id] || { x: 380, y: 100 };
      const dims = getNodeDimensions(n.kind);
      if (p.x < minX) minX = p.x;
      if (p.x + dims.width > maxX) maxX = p.x + dims.width;
    });
    if (minX !== Infinity && maxX !== -Infinity) {
      const centerX = ((minX + maxX) / 2) * zoom;
      const viewportW = viewportRef.current.clientWidth || 360;
      const targetScroll = Math.max(0, centerX - viewportW / 2);
      viewportRef.current.scrollLeft = targetScroll;
    }
  }, [flowchart?.revision, flowchart?.layout?.positions, nodes, zoom]);

  const pointerDown = (event: React.PointerEvent<HTMLButtonElement>, node: FlowchartCanvasNode) => {
    if (readOnly) {
      setSelected(node.id);
      setSelectedEdge(null);
      return;
    }

    if (connectingFrom) {
      if (connectingFrom.id !== node.id && node.kind !== "start") {
        onConnect(connectingFrom.id, node.id, connectingFrom.branch);
      }
      setConnectingFrom(null);
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target && target !== event.currentTarget && target.closest("button, input, select, textarea")) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const position = flowchart?.layout?.positions?.[node.id] || { x: 24, y: 24 };
    setDragging({
      id: node.id,
      dx: (event.clientX - rect.left) / zoom - position.x,
      dy: (event.clientY - rect.top) / zoom - position.y,
    });
    setSelected(node.id);
    setSelectedEdge(null);
    setInsertingOnEdge(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragging) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // ignore
      }
      setDragging(null);
    }
  };

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || !dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let x = Math.max(12, (event.clientX - rect.left) / zoom - dragging.dx);
    let y = Math.max(12, (event.clientY - rect.top) / zoom - dragging.dy);
    if (snapToGrid) {
      x = Math.round(x / 20) * 20;
      y = Math.round(y / 20) * 20;
    }
    moveNode(dragging.id, { x, y });
  };

  const handleCanvasBackgroundClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === canvasRef.current || target === viewportRef.current || target.tagName.toLowerCase() === "svg") {
      setSelected(null);
      setSelectedEdge(null);
      setInsertingOnEdge(null);
      setConnectingFrom(null);
    }
  };

  const widest = Math.max(900, ...nodes.map((node) => (flowchart?.layout?.positions?.[node.id]?.x || 0) + 240));
  const tallest = Math.max(680, ...nodes.map((node) => (flowchart?.layout?.positions?.[node.id]?.y || 0) + 140));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {connectingFrom && (
        <div className={styles.connectingBanner}>
          <span>
            🔗 Click target block to connect arrow
            {connectingFrom.branch ? ` (${connectingFrom.branch === "true" ? "Yes" : "No"} branch)` : ""}
          </span>
          <button
            type="button"
            className={styles.connectingCancelBtn}
            onClick={(e) => {
              e.stopPropagation();
              setConnectingFrom(null);
            }}
          >
            ✕ Cancel
          </button>
        </div>
      )}
      <div
        ref={viewportRef}
        className={styles.canvasScroll}
        style={{ width: "100%", height: "100%", minHeight: "100%", flex: 1 }}
        onClick={handleCanvasBackgroundClick}
      >
        <div
          style={{
            width: widest * zoom,
            height: Math.max(tallest * zoom, 700),
            minHeight: "100%",
            position: "relative",
            margin: "0 auto",
          }}
        >
          <div
            ref={canvasRef}
            className={`${styles.canvas} ${
              canvasTheme === "grid"
                ? styles.canvasGridLines
                : canvasTheme === "blueprint"
                ? styles.canvasBlueprint
                : canvasTheme === "blank"
                ? styles.canvasBlank
                : showGrid
                ? styles.canvasGrid
                : styles.canvasBlank
            }`}
            style={{ width: widest, height: tallest, transform: `scale(${zoom})`, transformOrigin: "top left" }}
            onPointerMove={pointerMove}
            onPointerUp={() => setDragging(null)}
            onClick={handleCanvasBackgroundClick}
            onDragOver={(e) => {
              if (onAddNodeAtPosition) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={(e) => {
              if (onAddNodeAtPosition && canvasRef.current) {
                e.preventDefault();
                const kind = e.dataTransfer.getData("application/maptocode-node") || e.dataTransfer.getData("text/plain");
                if (kind) {
                  const rect = canvasRef.current.getBoundingClientRect();
                  let x = (e.clientX - rect.left) / zoom;
                  let y = (e.clientY - rect.top) / zoom;
                  if (snapToGrid) {
                    x = Math.round(x / 20) * 20;
                    y = Math.round(y / 20) * 20;
                  }
                  onAddNodeAtPosition(kind, { x: Math.max(20, Math.round(x)), y: Math.max(20, Math.round(y)) });
                }
              }
            }}
          >
            {nodes.length === 0 && (
              emptyWatermark ? emptyWatermark : (
                <div className={styles.canvasEmptyState}>
                  <div className={styles.canvasEmptyIcon}>📋</div>
                  <h3>Your Flowchart Canvas is Ready</h3>
                  <p>
                    Add blocks from the left palette to build your algorithm,
                    or click below to place a <strong>Start Block</strong>.
                  </p>
                  {!readOnly && onAddStart && (
                    <button
                      type="button"
                      className={styles.canvasEmptyAddBtn}
                      onClick={onAddStart}
                    >
                      ＋ Add Start Block
                    </button>
                  )}
                </div>
              )
            )}

            {/* SVG Connector Wires */}
            <svg className={styles.edges} width={widest} height={tallest} aria-hidden="true">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3D4B43" />
                </marker>
                <marker id="arrow-active" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10B981" />
                </marker>
                <marker id="arrow-selected" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563EB" />
                </marker>
                <marker id="arrow-blueprint" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38BDF8" />
                </marker>
              </defs>
              {(flowchart?.edges || []).map((edge: FlowchartCanvasEdge) => {
                const from = flowchart?.layout?.positions?.[edge.from] || { x: 24, y: 24 };
                const to = flowchart?.layout?.positions?.[edge.to] || { x: 24, y: 24 };
                const fromNode = nodes.find((n) => n.id === edge.from);
                const toNode = nodes.find((n) => n.id === edge.to);
                const isDecision = fromNode?.kind === "decision";

                const { x1, y1, x2, y2 } = getEdgeCoordinates(fromNode, toNode, from, to, edge.branch);
                const midY = (y1 + y2) / 2;
                const isEdgeActive =
                  highlightedNodeId &&
                  edge.from === highlightedNodeId &&
                  (!activeBranch || edge.branch === activeBranch);
                const isSelectedEdge = selectedEdge === edge.id;

                let pathD: string;
                if (edgeRouting === "straight") {
                  pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
                } else if (edgeRouting === "orthogonal") {
                  pathD = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
                } else {
                  const c1x = isDecision ? (edge.branch === "true" ? x1 - 36 : x1 + 36) : x1;
                  pathD = `M ${x1} ${y1} C ${c1x} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
                }

                const edgeStroke = isSelectedEdge
                  ? "#2563EB"
                  : isEdgeActive
                  ? "#10B981"
                  : canvasTheme === "blueprint"
                  ? "#38BDF8"
                  : "#3D4B43";

                const edgeMarker = isSelectedEdge
                  ? "url(#arrow-selected)"
                  : isEdgeActive
                  ? "url(#arrow-active)"
                  : canvasTheme === "blueprint"
                  ? "url(#arrow-blueprint)"
                  : "url(#arrow)";

              return (
                <g key={edge.id}>
                  {/* Thick invisible click target path for effortless clicking */}
                  {!readOnly && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="20"
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(null);
                        setSelectedEdge(edge.id);
                        setInsertingOnEdge(null);
                      }}
                    />
                  )}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={edgeStroke}
                    strokeWidth={isSelectedEdge ? "3.5" : isEdgeActive ? "3.5" : "2"}
                    strokeDasharray={isEdgeActive ? "6 3" : undefined}
                    markerEnd={edgeMarker}
                    style={{ cursor: readOnly ? undefined : "pointer" }}
                    onClick={(e) => {
                      if (!readOnly) {
                        e.stopPropagation();
                        setSelected(null);
                        setSelectedEdge(edge.id);
                        setInsertingOnEdge(null);
                      }
                    }}
                  />
                  {edge.branch && (
                    <text
                      x={isDecision ? (edge.branch === "true" ? x1 - 18 : x1 + 18) : (x1 + x2) / 2}
                      y={isDecision ? y1 - 8 : midY}
                      className={edge.branch === "true" ? styles.branchLabelYes : styles.branchLabelNo}
                      style={
                        isSelectedEdge
                          ? { fontWeight: 800, fill: "#2563EB" }
                          : isEdgeActive
                          ? { fontWeight: 800, fill: "#059669", filter: "drop-shadow(0 0 4px #a7f3d0)" }
                          : undefined
                      }
                      onClick={(e) => {
                        if (!readOnly) {
                          e.stopPropagation();
                          setSelected(null);
                          setSelectedEdge(edge.id);
                        }
                      }}
                    >
                      {edge.branch === "true" ? "Yes" : "No"}
                      {isEdgeActive && " ✓"}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Floating Action Menu for Selected Arrow */}
          {selectedEdge && !readOnly && (() => {
            const edge = (flowchart?.edges || []).find((e: FlowchartCanvasEdge) => e.id === selectedEdge);
            if (!edge) return null;
            const from = flowchart?.layout?.positions?.[edge.from] || { x: 24, y: 24 };
            const to = flowchart?.layout?.positions?.[edge.to] || { x: 24, y: 24 };
            const fromNode = nodes.find((n) => n.id === edge.from);
            const toNode = nodes.find((n) => n.id === edge.to);
            const { x1, y1, x2, y2 } = getEdgeCoordinates(fromNode, toNode, from, to, edge.branch);

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <div
                className={styles.edgeFloatingMenu}
                style={{ left: midX, top: midY }}
                onClick={(e) => e.stopPropagation()}
              >
                <span className={styles.edgeMenuBadge}>Arrow</span>
                <div className={styles.insertDropdownContainer}>
                  <button
                    type="button"
                    className={styles.edgeInsertBtn}
                    onClick={() => setInsertingOnEdge((curr) => (curr === edge.id ? null : edge.id))}
                    title="Insert a block on this connection"
                  >
                    ＋ Insert Step ▾
                  </button>
                  {insertingOnEdge === edge.id && (
                    <div className={styles.insertDropdownMenu}>
                      <button
                        type="button"
                        onClick={() => {
                          onInsertNodeOnEdge(edge.id, "input");
                          setInsertingOnEdge(null);
                        }}
                      >
                        📥 Read Input
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onInsertNodeOnEdge(edge.id, "initialization");
                          setInsertingOnEdge(null);
                        }}
                      >
                        🟢 Initialize variable
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onInsertNodeOnEdge(edge.id, "process");
                          setInsertingOnEdge(null);
                        }}
                      >
                        ⚙️ Process / Calculation
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onInsertNodeOnEdge(edge.id, "decision");
                          setInsertingOnEdge(null);
                        }}
                      >
                        🔀 Decision (If / Else)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onInsertNodeOnEdge(edge.id, "output");
                          setInsertingOnEdge(null);
                        }}
                      >
                        📤 Output / Print
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.edgeDeleteBtn}
                  onClick={() => {
                    onDeleteEdge(edge.id);
                    setSelectedEdge(null);
                  }}
                  title="Delete this arrow connection"
                >
                  ✕ Remove
                </button>
              </div>
            );
          })()}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = flowchart?.layout?.positions?.[node.id] || { x: 24, y: 24 };
            const isSelected = selected === node.id;
            const isHighlighted = highlightedNodeId === node.id;
            const kindClass = (styles as Record<string, string>)[`node_${node.kind}`] || "";
            const colorTag = nodeColorTags?.[node.id] ? COLOR_TAG_PRESETS[nodeColorTags[node.id]] : null;
            const noteText = nodeNotes?.[node.id];
            const isConnectTarget = connectingFrom && connectingFrom.id !== node.id && node.kind !== "start";

            return (
              <React.Fragment key={node.id}>
                <button
                  type="button"
                  id={`flow-node-${node.id}`}
                  onPointerDown={(event) => pointerDown(event, node)}
                  onPointerUp={pointerUp}
                  onPointerCancel={pointerUp}
                  onKeyDown={(event) => {
                    if (!readOnly && (event.key === "Delete" || event.key === "Backspace")) {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteNode(node.id);
                    }
                  }}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    if (connectingFrom) {
                      if (connectingFrom.id !== node.id && node.kind !== "start") {
                        onConnect(connectingFrom.id, node.id, connectingFrom.branch);
                      }
                      setConnectingFrom(null);
                    } else {
                      setSelected(node.id);
                    }
                  }}
                  className={`${styles.node} ${kindClass} ${isSelected ? styles.nodeSelected : ""} ${
                    isConnectTarget ? styles.nodeConnectTarget : ""
                  }`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    cursor: readOnly || isConnectTarget ? "pointer" : undefined,
                    outline: isHighlighted
                      ? "3px solid #10b981"
                      : colorTag
                      ? `2.5px solid ${colorTag.border}`
                      : undefined,
                    boxShadow: isHighlighted
                      ? "0 0 20px rgba(16, 185, 129, 0.65)"
                      : colorTag
                      ? `0 3px 12px ${colorTag.border}44`
                      : undefined,
                    borderTop: colorTag ? `4px solid ${colorTag.border}` : undefined,
                    transform: isHighlighted ? "scale(1.03)" : undefined,
                    transition: "all 0.2s ease",
                    zIndex: isHighlighted ? 20 : isSelected ? 15 : 2,
                  }}
                >
                  {isHighlighted && (
                    <span
                      style={{
                        position: "absolute",
                        top: "-14px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: node.kind === "decision" && activeBranch ? (activeBranch === "true" ? "#059669" : "#d97706") : "#10b981",
                        color: "#ffffff",
                        fontSize: "0.68rem",
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {node.kind === "decision" && activeBranch
                        ? `DECISION: ${activeBranch === "true" ? "TRUE ➔ YES" : "FALSE ➔ NO"}`
                        : "ACTIVE STEP"}
                    </span>
                  )}
                  {node.kind === "start" && <span className={styles.nodeLabelText}>Start</span>}
                  {node.kind === "end" && <span className={styles.nodeLabelText}>End</span>}
                  {node.kind === "input" && (
                    <span className={styles.nodeLabelText}>
                      {node.payload?.prompt ? node.payload.prompt.replace(/: ?$/, "") : `Read ${node.payload?.name || "n"}`}
                    </span>
                  )}
                  {node.kind === "decision" && (
                    <span className={styles.nodeLabelText}>{node.payload?.condition || "n % 2 == 0 ?"}</span>
                  )}
                  {node.kind === "process" && (
                    <span className={styles.nodeLabelText}>
                      {node.payload?.operation === "declaration"
                        ? `${node.payload.name} = ${node.payload.initializer || 0}`
                        : `${node.payload?.symbolId === `symbol-${node.id}` ? "result" : String(node.payload?.symbolId || "").replace(/^symbol-/, "") || "result"} = ${node.payload?.expression || "Calculate"}`}
                    </span>
                  )}
                  {node.kind === "initialization" && (
                    <span className={styles.nodeLabelText}>
                      {node.payload?.name || "value"} = {node.payload?.initializer || "0"}
                    </span>
                  )}
                  {node.kind === "output" && (
                    <span className={styles.nodeLabelText}>
                      {node.payload?.mode === "formatted"
                        ? `Print ${node.payload.message || ""} ${node.payload.expression || ""}`
                        : node.payload?.mode === "message"
                        ? `Print "${node.payload.message || ""}"`
                        : `Print ${node.payload?.expression || ""}`}
                    </span>
                  )}
                  {noteText && (
                    <span className={styles.nodeNoteBadge} title={noteText}>
                      💬 {noteText}
                    </span>
                  )}
                </button>

                {/* On-canvas connection handles for selected node */}
                {isSelected && !readOnly && !connectingFrom && node.kind !== "end" && (
                  <>
                    {node.kind === "decision" ? (
                      <>
                        <button
                          type="button"
                          className={`${styles.nodeConnectHandle} ${styles.nodeConnectHandleYes}`}
                          style={{ left: Math.max(8, pos.x - 30), top: pos.y + 28 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConnectingFrom({ id: node.id, branch: "true" });
                          }}
                          title="Connect Yes (True) branch arrow"
                        >
                          ✓ Yes ➔
                        </button>
                        <button
                          type="button"
                          className={`${styles.nodeConnectHandle} ${styles.nodeConnectHandleNo}`}
                          style={{ left: pos.x + 162, top: pos.y + 28 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConnectingFrom({ id: node.id, branch: "false" });
                          }}
                          title="Connect No (False) branch arrow"
                        >
                          ✗ No ➔
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={styles.nodeConnectHandle}
                        style={{
                          left: pos.x + (node.kind === "start" ? 70 : 92) - 46,
                          top: pos.y + 58,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConnectingFrom({ id: node.id });
                        }}
                        title="Connect arrow to another block"
                      >
                        ↓ Connect ➔
                      </button>
                    )}
                  </>
                )}
                {isSelected && !readOnly && !connectingFrom && node.kind !== "start" && (
                  <button
                    type="button"
                    className={`${styles.nodeConnectHandle} ${styles.nodeDuplicateHandle}`}
                    style={{ left: pos.x + 56, top: pos.y + 92 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(node);
                    }}
                    title="Duplicate this block (Ctrl+D)"
                  >
                    ⧉ Duplicate
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
    {showMinimap && (
      <FlowchartMinimap
        nodes={nodes}
        positions={flowchart?.layout?.positions || {}}
        edges={flowchart?.edges || []}
        widest={widest}
        tallest={tallest}
        selected={selected || null}
        onNodeClick={(id) => setSelected(id)}
      />
    )}
  </div>
  );
}

function FlowchartMinimap({
  nodes,
  positions,
  edges,
  widest,
  tallest,
  selected,
  onNodeClick,
}: {
  nodes: FlowchartCanvasNode[];
  positions: Record<string, { x: number; y: number }>;
  edges: FlowchartCanvasEdge[];
  widest: number;
  tallest: number;
  selected: string | null;
  onNodeClick: (id: string) => void;
}): React.JSX.Element {
  const mapWidth = 140;
  const mapHeight = Math.min(105, Math.max(65, Math.round((tallest / widest) * mapWidth)));

  return (
    <div className={styles.canvasMinimap} title="Flowchart Overview Minimap">
      <div className={styles.minimapHeader}>
        <span>🗺 Map</span>
        <span style={{ fontSize: "9px", opacity: 0.7 }}>{nodes.length} blocks</span>
      </div>
      <svg width={mapWidth} height={mapHeight} viewBox={`0 0 ${widest} ${tallest}`}>
        {edges.map((e) => {
          const from = positions[e.from] || { x: 0, y: 0 };
          const to = positions[e.to] || { x: 0, y: 0 };
          return (
            <line
              key={e.id}
              x1={from.x + 90}
              y1={from.y + 35}
              x2={to.x + 90}
              y2={to.y + 35}
              stroke="#94a3b8"
              strokeWidth="5"
              opacity="0.5"
            />
          );
        })}
        {nodes.map((n) => {
          const p = positions[n.id] || { x: 0, y: 0 };
          const isSelected = selected === n.id;
          let fill = "#64748b";
          if (n.kind === "start" || n.kind === "end") fill = "#10b981";
          else if (n.kind === "decision") fill = "#f59e0b";
          else if (n.kind === "input") fill = "#3b82f6";
          else if (n.kind === "output") fill = "#ec4899";

          return (
            <rect
              key={n.id}
              x={p.x}
              y={p.y}
              width={180}
              height={70}
              rx={12}
              fill={isSelected ? "#2563eb" : fill}
              stroke={isSelected ? "#ffffff" : "none"}
              strokeWidth={isSelected ? "8" : "0"}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onNodeClick(n.id);
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
