import { CONTRACT_VERSION } from "./contracts.js";
import { validateFlowchartContract } from "./contract-validation.js";

export class FlowchartFileError extends Error {
  constructor(message, diagnostics = []) {
    super(message);
    this.name = "FlowchartFileError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Deliberate, safe migration for older or legacy flowchart files.
 * Transforms recognized earlier shapes into canonical 1.0.0 schema:
 * - Ensures schemaVersion is 1.0.0
 * - Ensures revision is an integer
 * - Normalizes legacy node payloads (e.g. process nodes missing operation or with raw target)
 * - Sets default layout if missing
 */
export function migrateFlowchart(flowchart) {
  if (!flowchart || typeof flowchart !== "object") {
    throw new FlowchartFileError("Flowchart document must be a JSON object.");
  }

  const nodes = Array.isArray(flowchart.nodes) ? flowchart.nodes.map((node) => {
    if (!node || typeof node !== "object") return node;
    const kind = node.kind;
    const payload = node.payload && typeof node.payload === "object" ? { ...node.payload } : {};

    if (kind === "start" || kind === "end") {
      return { id: node.id, kind, payload: {} };
    }

    if (kind === "input") {
      const name = String(payload.name || "x").trim();
      return {
        id: node.id,
        kind: "input",
        payload: {
          symbolId: payload.symbolId || `symbol-${name || node.id}`,
          name: name || "x",
          type: ["int", "double", "char"].includes(payload.type) ? payload.type : "int",
          prompt: String(payload.prompt ?? `Enter ${name || "value"}: `),
        },
      };
    }

    if (kind === "initialization") {
      const name = String(payload.name || "value").trim();
      return {
        id: node.id,
        kind: "initialization",
        payload: {
          symbolId: payload.symbolId || `symbol-${name || node.id}`,
          name: name || "value",
          type: ["int", "double", "char"].includes(payload.type) ? payload.type : "int",
          initializer: String(payload.initializer || "0").trim() || "0",
        },
      };
    }

    if (kind === "process") {
      // Legacy declaration format
      if (payload.operation === "declaration") {
        const name = String(payload.name || "result").trim();
        return {
          id: node.id,
          kind: "process",
          payload: {
            operation: "declaration",
            symbolId: payload.symbolId || `symbol-${name || node.id}`,
            name: name || "result",
            type: ["int", "double", "char"].includes(payload.type) ? payload.type : "int",
            ...(payload.initializer !== undefined ? { initializer: String(payload.initializer) } : {}),
          },
        };
      }

      // Assignment
      const rawExpr = String(payload.expression ?? "").trim();
      const match = rawExpr.match(/^(.+?)\s*(?:←|<-)\s*([A-Za-z_][A-Za-z0-9_]*)$/)
        || rawExpr.match(/^(.+?)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/);
      const target = match ? match[2] : (payload.target || payload.name || String(payload.symbolId || "").replace(/^symbol-/, "") || "x");
      const expression = match ? match[1].trim() : (rawExpr || "0");
      const symbolId = payload.symbolId && !match ? payload.symbolId : `symbol-${target}`;

      return {
        id: node.id,
        kind: "process",
        payload: {
          operation: "assignment",
          symbolId,
          expression,
        },
      };
    }

    if (kind === "decision") {
      return {
        id: node.id,
        kind: "decision",
        payload: {
          condition: String(payload.condition ?? "true").trim() || "true",
        },
      };
    }

    if (kind === "output") {
      const outputId = payload.outputId || `output-${node.id}`;
      const mode = payload.mode === "formatted" ? "formatted" : payload.mode === "message" ? "message" : "expression";
      if (mode === "formatted") {
        return {
          id: node.id,
          kind: "output",
          payload: {
            outputId,
            mode: "formatted",
            message: String(payload.message ?? ""),
            expression: String(payload.expression ?? "0").trim() || "0",
          },
        };
      }
      if (mode === "message") {
        return {
          id: node.id,
          kind: "output",
          payload: {
            outputId,
            mode: "message",
            message: String(payload.message ?? payload.expression ?? ""),
          },
        };
      }
      return {
        id: node.id,
        kind: "output",
        payload: {
          outputId,
          mode: "expression",
          expression: String(payload.expression ?? payload.message ?? "0").trim() || "0",
        },
      };
    }

    return node;
  }) : [];

  return {
    schemaVersion: CONTRACT_VERSION,
    revision: Number.isInteger(flowchart.revision) ? flowchart.revision : 1,
    nodes,
    edges: Array.isArray(flowchart.edges) ? flowchart.edges : [],
    layout: {
      positions: flowchart.layout?.positions && typeof flowchart.layout.positions === "object"
        ? flowchart.layout.positions
        : {},
      zoom: typeof flowchart.layout?.zoom === "number" && flowchart.layout.zoom > 0
        ? flowchart.layout.zoom
        : 1,
    },
  };
}

/**
 * Parses raw JSON string into a validated FlowchartGraph.
 * Throws FlowchartFileError if the file is invalid.
 */
export function parseFlowchartFile(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new FlowchartFileError("Flowchart file is empty.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FlowchartFileError("This .fc flowchart file is not valid JSON.");
  }

  // If missing canonical schema properties, migrate older format
  const candidate = (!parsed.schemaVersion || !Array.isArray(parsed.nodes))
    ? migrateFlowchart(parsed)
    : parsed;

  const diagnostics = validateFlowchartContract(candidate);
  if (diagnostics.length > 0) {
    throw new FlowchartFileError(
      `Flowchart validation failed: ${diagnostics.map((d) => d.message).join(" ")}`,
      diagnostics
    );
  }

  return candidate;
}

/**
 * Serializes a FlowchartGraph into formatted .fc JSON text.
 * Strictly validates against flowchart schema before writing.
 */
export function serializeFlowchartFile(flowchart) {
  if (!flowchart || typeof flowchart !== "object") {
    throw new FlowchartFileError("Cannot serialize: flowchart is not an object.");
  }

  const diagnostics = validateFlowchartContract(flowchart);
  if (diagnostics.length > 0) {
    throw new FlowchartFileError(
      `Cannot serialize invalid flowchart: ${diagnostics.map((d) => d.message).join(" ")}`,
      diagnostics
    );
  }

  return JSON.stringify(flowchart, null, 2) + "\n";
}
