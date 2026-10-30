// Core service for explaining an M1 flowchart in simple English and generating
// learning pseudocode.
//
// PEDAGOGICAL BOUNDARY:
// This explanation is strictly a learning aid to help students understand their
// visual blocks. It is NOT an independent algorithm specification and does NOT
// mutate or substitute for the user-authored specification.

function nodeActionEnglish(node) {
  if (!node) return "Unknown step";
  const { kind, payload = {} } = node;
  if (kind === "start") return "Start program execution.";
  if (kind === "end") return "Reach End and terminate execution.";
  if (kind === "input") {
    const name = payload.name || "value";
    const type = payload.type ? ` (${payload.type})` : "";
    const prompt = payload.prompt ? ` with prompt "${payload.prompt}"` : "";
    return `Ask the user to enter ${name}${type}${prompt}.`;
  }
  if (kind === "initialization") {
    return `Initialize ${payload.name || "variable"} as ${payload.type || "int"} with the value ${payload.initializer || "0"}.`;
  }
  if (kind === "process") {
    if (payload.operation === "declaration") {
      const name = payload.name || "result";
      const type = payload.type ? ` of type ${payload.type}` : "";
      const init = payload.initializer !== undefined ? ` initialized to ${payload.initializer}` : "";
      return `Declare variable ${name}${type}${init}.`;
    }
    const target = payload.name || payload.target || String(payload.symbolId || "").replace(/^symbol-/, "");
    const expr = payload.expression || "a calculation";
    return `Set ${target || "the result"} to ${expr}.`;
  }
  if (kind === "output") {
    if (payload.mode === "formatted") {
      return `Display “${payload.message || ""}” followed by the value of ${payload.expression || "expression"}.`;
    }
    if (payload.mode === "message") {
      return `Display message: "${payload.message || ""}".`;
    }
    return `Display calculated value: ${payload.expression || "result"}.`;
  }
  if (kind === "decision") {
    return `Check condition: Is ${payload.condition || "condition true"}?`;
  }
  return `Perform ${kind} action.`;
}

function nodePseudocodeLine(node) {
  if (!node) return "";
  const { kind, payload = {} } = node;
  if (kind === "start") return "BEGIN";
  if (kind === "end") return "END";
  if (kind === "input") {
    const name = payload.name || "value";
    const prompt = payload.prompt ? ` PROMPT "${payload.prompt}"` : "";
    return `INPUT ${name}${prompt}`;
  }
  if (kind === "initialization") {
    return `DECLARE ${payload.name || "variable"}: ${payload.type || "int"} = ${payload.initializer || "0"}`;
  }
  if (kind === "process") {
    if (payload.operation === "declaration") {
      const name = payload.name || "result";
      const init = payload.initializer !== undefined ? payload.initializer : "0";
      return `DECLARE ${name}: ${payload.type || "int"} = ${init}`;
    }
    const expr = String(payload.expression || "0").trim();
    const combined = expr.match(/^(.+?)\s*(?:←|<-)\s*([A-Za-z_][A-Za-z0-9_]*)$/)
      || expr.match(/^(.+?)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/);
    if (combined) return `${combined[2]} = ${combined[1].trim()}`;
    const target = payload.name || payload.target || String(payload.symbolId || "").replace(/^symbol-/, "");
    return `${target || "result"} = ${expr}`;
  }
  if (kind === "output") {
    if (payload.mode === "formatted") {
      return `OUTPUT "${payload.message || ""}", ${payload.expression || "value"}`;
    }
    if (payload.mode === "message") {
      return `OUTPUT "${payload.message || ""}"`;
    }
    return `OUTPUT ${payload.expression || "result"}`;
  }
  return "";
}

function buildExecutionGraph(flowchart) {
  const nodes = flowchart?.nodes || [];
  const edges = flowchart?.edges || [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));

  for (const edge of edges) {
    if (nodeMap.has(edge.from) && nodeMap.has(edge.to)) {
      outgoing.get(edge.from).push(edge);
    }
  }

  return { nodes, edges, nodeMap, outgoing };
}

export function explainFlowchartToLearner(flowchart) {
  const { nodes, edges, nodeMap, outgoing } = buildExecutionGraph(flowchart);

  const startNode = nodes.find((n) => n.kind === "start");
  const endNode = nodes.find((n) => n.kind === "end");
  const inputNodes = nodes.filter((n) => n.kind === "input");
  const initializationNodes = nodes.filter((n) => n.kind === "initialization");
  const decisionNodes = nodes.filter((n) => n.kind === "decision");
  const processNodes = nodes.filter((n) => n.kind === "process");
  const outputNodes = nodes.filter((n) => n.kind === "output");

  if (!nodes.length) {
    return {
      status: "empty",
      summary: "The flowchart canvas is currently empty. Add blocks from the palette to start building your algorithm.",
      narrativeSteps: [],
      pseudocode: "# Empty flowchart\nBEGIN\nEND",
      concepts: [],
      inputs: [],
      decisions: [],
      outputs: [],
      disclaimer: "⚠️ Pedagogical Learning Aid: This explanation and pseudocode are generated automatically from your flowchart to aid understanding. To verify your solution, author your independent Algorithm Specification in Step 3.",
    };
  }

  if (!startNode) {
    return {
      status: "incomplete",
      summary: "The flowchart is missing a Start block. Every algorithm begins at a Start block.",
      narrativeSteps: ["Add a Start block to define the beginning of execution."],
      pseudocode: "# Missing Start block\nBEGIN\nEND",
      concepts: [],
      inputs: [],
      decisions: [],
      outputs: [],
      disclaimer: "⚠️ Pedagogical Learning Aid: Add a Start block and connect your algorithm blocks.",
    };
  }

  // Trace execution from Start
  const visited = new Set();
  const narrativeSteps = [];
  const pseudocodeLines = [];
  const postDomMemo = new Map();

  function postDominators(nodeId, active = new Set()) {
    if (postDomMemo.has(nodeId)) return postDomMemo.get(nodeId);
    if (active.has(nodeId)) return new Set([nodeId]);
    const successors = outgoing.get(nodeId) || [];
    if (successors.length === 0) {
      const terminal = new Set([nodeId]);
      postDomMemo.set(nodeId, terminal);
      return terminal;
    }
    const nextActive = new Set(active).add(nodeId);
    const childSets = successors.map((edge) => postDominators(edge.to, nextActive));
    const common = new Set([...childSets[0]].filter((id) => childSets.every((set) => set.has(id))));
    common.add(nodeId);
    postDomMemo.set(nodeId, common);
    return common;
  }

  function reaches(fromId, targetId, seen = new Set()) {
    if (fromId === targetId) return true;
    if (seen.has(fromId)) return false;
    seen.add(fromId);
    return (outgoing.get(fromId) || []).some((edge) => reaches(edge.to, targetId, seen));
  }

  function findDecisionJoin(trueId, falseId) {
    if (trueId === falseId) return trueId;
    const falsePostDominators = postDominators(falseId);
    const common = [...postDominators(trueId)].filter((id) => falsePostDominators.has(id));
    const nearest = common.filter((candidate) => !common.some(
      (other) => other !== candidate && reaches(other, candidate)
    ));
    return nearest.length === 1 ? nearest[0] : null;
  }

  function trace(currentId, depth = 0, stopAt = null) {
    if (!currentId || currentId === stopAt) return;
    if (visited.has(currentId)) {
      narrativeSteps.push({
        id: `cycle-${currentId}`,
        text: `⚠️ Execution loops back to "${nodeMap.get(currentId)?.kind || currentId}". M1 requires a direct forward flow without backward cycles.`,
        depth,
      });
      pseudocodeLines.push(`${"    ".repeat(depth)}# Loop detected to ${currentId}`);
      return;
    }

    visited.add(currentId);
    const node = nodeMap.get(currentId);
    if (!node) return;

    if (node.kind === "start") {
      narrativeSteps.push({ id: node.id, text: nodeActionEnglish(node), depth });
      pseudocodeLines.push("BEGIN");
      const nextEdges = outgoing.get(node.id) || [];
      if (nextEdges.length > 0) {
        trace(nextEdges[0].to, depth, stopAt);
      }
      return;
    }

    if (node.kind === "end") {
      narrativeSteps.push({ id: node.id, text: nodeActionEnglish(node), depth });
      if (depth === 0) {
        pseudocodeLines.push("END");
      }
      return;
    }

    if (node.kind === "decision") {
      const cond = node.payload?.condition || "condition";
      const branchEdges = outgoing.get(node.id) || [];
      const trueEdge = branchEdges.find((e) => e.branch === "true");
      const falseEdge = branchEdges.find((e) => e.branch === "false");
      const joinId = trueEdge && falseEdge ? findDecisionJoin(trueEdge.to, falseEdge.to) : null;

      narrativeSteps.push({
        id: node.id,
        text: `Check decision: Is "${cond}"?`,
        condition: cond,
        depth,
        isDecision: true,
      });

      pseudocodeLines.push(`${"    ".repeat(depth)}IF ${cond} THEN`);

      if (trueEdge) {
        narrativeSteps.push({
          id: `${node.id}-true-branch`,
          text: `Branch Yes (True): When "${cond}" is met:`,
          depth: depth + 1,
          isBranchLabel: true,
          branch: "true",
        });
        trace(trueEdge.to, depth + 1, joinId || stopAt);
      } else {
        pseudocodeLines.push(`${"    ".repeat(depth + 1)}# (No True branch connected)`);
      }

      pseudocodeLines.push(`${"    ".repeat(depth)}ELSE`);

      if (falseEdge) {
        narrativeSteps.push({
          id: `${node.id}-false-branch`,
          text: `Branch No (False): When "${cond}" is not met:`,
          depth: depth + 1,
          isBranchLabel: true,
          branch: "false",
        });
        trace(falseEdge.to, depth + 1, joinId || stopAt);
      } else {
        pseudocodeLines.push(`${"    ".repeat(depth + 1)}# (No False branch connected)`);
      }

      pseudocodeLines.push(`${"    ".repeat(depth)}END IF`);
      if (joinId && joinId !== stopAt) trace(joinId, depth, stopAt);
      return;
    }

    // Standard sequential step (input, process, output)
    narrativeSteps.push({ id: node.id, text: nodeActionEnglish(node), depth });
    const code = nodePseudocodeLine(node);
    if (code) {
      pseudocodeLines.push(`${"    ".repeat(Math.max(1, depth))}${code}`);
    }

    const nextEdges = outgoing.get(node.id) || [];
    if (nextEdges.length > 0) {
      trace(nextEdges[0].to, depth, stopAt);
    }
  }

  trace(startNode.id);

  if (!pseudocodeLines.some((l) => l.trim() === "END")) {
    pseudocodeLines.push("END");
  }

  // Educational Concept definitions
  const concepts = [
    {
      term: "Flowchart Block",
      description: "A graphical symbol representing a single programming action. Arrows between blocks define the exact sequence of execution.",
    },
  ];

  if (inputNodes.length > 0) {
    concepts.push({
      term: "Input (Parallelogram)",
      description: "Prompts the person running the program to enter data (such as numbers or characters) from the keyboard.",
    });
  }

  if (decisionNodes.length > 0) {
    concepts.push({
      term: "Decision (Diamond)",
      description: "Asks a True/False comparison question. Execution splits into two distinct paths: one taken if True, and one if False.",
    });
  }

  if (initializationNodes.length > 0) {
    concepts.push({
      term: "Initialization (Double Rectangle)",
      description: "Creates a variable and gives it a starting value before later calculations use it.",
    });
  }

  if (processNodes.length > 0) {
    concepts.push({
      term: "Process (Rectangle)",
      description: "Performs an internal operation, such as calculating a mathematical formula or saving a value into a variable.",
    });
  }

  if (outputNodes.length > 0) {
    concepts.push({
      term: "Output (Parallelogram)",
      description: "Displays a finished result, message, or computed value to the screen.",
    });
  }

  // High-level summary
  const summaryParts = [];
  if (inputNodes.length > 0) {
    const names = inputNodes.map((n) => `"${n.payload?.name || "n"}" (${n.payload?.type || "int"})`).join(", ");
    summaryParts.push(`takes input for ${names}`);
  }
  if (processNodes.length > 0) {
    summaryParts.push(`computes variable assignments`);
  }
  if (initializationNodes.length > 0) {
    const initialized = initializationNodes.map((node) => `${node.payload?.name || "variable"} = ${node.payload?.initializer || "0"}`).join(", ");
    summaryParts.push(`initializes ${initialized}`);
  }
  if (decisionNodes.length > 0) {
    const conds = decisionNodes.map((d) => `"${d.payload?.condition || "condition"}"`).join(" and ");
    summaryParts.push(`branches based on checking ${conds}`);
  }
  if (outputNodes.length > 0) {
    const outs = outputNodes.map((o) => o.payload?.mode === "message"
      ? `"${o.payload?.message}"`
      : o.payload?.mode === "formatted"
        ? `"${o.payload?.message}" followed by ${o.payload?.expression}`
        : `value of ${o.payload?.expression}`).join(" / ");
    summaryParts.push(`displays ${outs}`);
  }

  const summary = summaryParts.length
    ? `This flowchart starts at Start, ${summaryParts.join(", ")}, and reaches End.`
    : "This flowchart defines a basic control flow from Start to End.";

  return {
    status: endNode ? "complete" : "missing_end",
    summary,
    narrativeSteps,
    pseudocode: pseudocodeLines.join("\n"),
    concepts,
    inputs: inputNodes.map((n) => ({ name: n.payload?.name || "n", type: n.payload?.type || "int", prompt: n.payload?.prompt || "" })),
    decisions: decisionNodes.map((d) => ({ condition: d.payload?.condition || "" })),
    outputs: outputNodes.map((o) => ({ mode: o.payload?.mode || "message", message: o.payload?.message, expression: o.payload?.expression })),
    disclaimer: "⚠️ Pedagogical Learning Aid: This explanation and pseudocode are generated automatically from your visual flowchart to help you learn and understand its structure. They are NOT your independent algorithm specification. In Step 3, you will review or author your separate Algorithm Specification. Comparing your independently authored specification against the flowchart ensures your logic is sound.",
  };
}
