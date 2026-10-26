/**
 * Pseudocode Parser for MapToCode
 *
 * Converts readable, learner-friendly Pseudocode text into a structured FlowchartGraph
 * with valid nodes, edges, payloads, and visual layout positions.
 *
 * Supported constructs:
 * - BEGIN / START, END
 * - INPUT <name> [PROMPT "<prompt>"] or READ <name>
 * - [SET] <target> = <expression> or <expression> ← <target>
 * - IF <condition> THEN ... [ELSE ...] END IF
 * - OUTPUT "<message>" | OUTPUT <expression> | PRINT ...
 */

export function parsePseudocodeToFlowchart(text, projectId = "parsed-project") {
  if (!text || typeof text !== "string") {
    return {
      success: false,
      error: "Pseudocode is empty.",
      flowchart: null,
    };
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  let idCounter = 1;
  const genId = (prefix) => `node-${prefix}-${idCounter++}-${Date.now().toString(36).slice(-4)}`;

  const nodes = [];
  const edges = [];
  const positions = {};

  const startId = "start";
  nodes.push({ id: startId, kind: "start", payload: {} });
  positions[startId] = { x: 380, y: 40 };

  const endId = "end";

  // Parse lines into structured AST blocks
  let cursor = 0;

  function parseBlock() {
    const block = [];
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line === "BEGIN" || line === "START") {
        cursor++;
        continue;
      }
      if (line === "END") {
        cursor++;
        break;
      }
      if (line === "ELSE" || line === "END IF" || line === "ENDIF") {
        break;
      }

      const declarationMatch = line.match(/^(?:DECLARE|CONSTANT)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(int|double|float|char))?(?:\s*=\s*(.+))?$/i);
      if (declarationMatch) {
        const [, name, declaredType, initializer] = declarationMatch;
        const cleanInitializer = initializer?.trim();
        const inferredType = declaredType?.toLowerCase() === "float"
          ? "double"
          : declaredType?.toLowerCase()
            || (cleanInitializer && /(?:\.\d|\d[eE][+-]?\d)/.test(cleanInitializer) ? "double" : "int");
        block.push({ type: "declaration", name, valueType: inferredType, initializer: cleanInitializer });
        cursor++;
      } else if (/^INPUT\b/i.test(line) || /^READ\b/i.test(line)) {
        // INPUT varName [PROMPT "prompt text"]
        const afterInput = line.replace(/^(INPUT|READ)\s+/i, "").trim();
        const promptMatch = afterInput.match(/PROMPT\s+["']([^"']+)["']/i);
        const prompt = promptMatch ? promptMatch[1] : "";
        const namePart = afterInput.replace(/PROMPT\s+["'][^"']+["']/i, "").trim();
        const varName = namePart.split(/[\s:]+/)[0] || "x";

        block.push({
          type: "input",
          name: varName,
          prompt: prompt || `Enter ${varName}: `,
        });
        cursor++;
      } else if (/^OUTPUT\b/i.test(line) || /^PRINT\b/i.test(line)) {
        // OUTPUT "message" or OUTPUT expression
        const raw = line.replace(/^(OUTPUT|PRINT)\s+/i, "").trim();
        const formattedMatch = raw.match(/^["']([^"']*)["']\s*,\s*(.+)$/);
        const strMatch = raw.match(/^["']([^"']+)["']$/);
        if (formattedMatch) {
          block.push({ type: "output", mode: "formatted", message: formattedMatch[1], expression: formattedMatch[2].trim() });
        } else if (strMatch) {
          block.push({
            type: "output",
            mode: "message",
            message: strMatch[1],
          });
        } else {
          block.push({
            type: "output",
            mode: "expression",
            expression: raw,
          });
        }
        cursor++;
      } else if (/^IF\b/i.test(line)) {
        // IF condition THEN
        const condMatch = line.match(/^IF\s+(.+?)\s+THEN$/i) || line.match(/^IF\s+(.+)$/i);
        const condition = condMatch ? condMatch[1].trim() : "true";
        cursor++;

        const whenTrue = parseBlock();

        let whenFalse = [];
        if (cursor < lines.length && lines[cursor] === "ELSE") {
          cursor++;
          whenFalse = parseBlock();
        }

        if (cursor < lines.length && (lines[cursor] === "END IF" || lines[cursor] === "ENDIF")) {
          cursor++;
        }

        block.push({
          type: "conditional",
          condition,
          whenTrue,
          whenFalse,
        });
      } else if (line.includes("=") || line.includes("←") || line.includes("<-")) {
        // [SET] target = expr, or the legacy learner form expr ← target.
        const clean = line.replace(/^SET\s+/i, "").trim();
        const arrowMatch = clean.match(/^(.+?)\s*(?:←|<-)\s*([A-Za-z_][A-Za-z0-9_]*)$/);
        const equalsMatch = clean.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
        const reverseEqualsMatch = clean.match(/^(.+?)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/);
        const target = arrowMatch?.[2] || equalsMatch?.[1] || reverseEqualsMatch?.[2] || "";
        const expression = arrowMatch?.[1] || equalsMatch?.[2] || reverseEqualsMatch?.[1] || "";

        if (!target || !expression) {
          return { success: false, error: `Invalid assignment on line: “${line}”. Use “target = expression”.`, flowchart: null };
        }

        block.push({
          type: "process",
          target: target || "result",
          expression: expression || "0",
        });
        cursor++;
      } else {
        // Unrecognized statement, treat as generic comment or skip
        cursor++;
      }
    }
    return block;
  }

  const topBlock = parseBlock();

  // Compile sequences forward. Each branch returns all of its exit points so
  // every statement is preserved and branch paths can rejoin before later work.
  const connect = (from, to, branch) => edges.push({
    id: `edge-${from}-${to}-${branch || "next"}-${edges.length}`,
    from,
    to,
    ...(branch ? { branch } : {}),
  });

  function createNode(item, x, y) {
    const id = genId(item.type);
    let kind = item.type;
    let payload;
    if (item.type === "input") {
      payload = { symbolId: `symbol-${item.name}`, name: item.name, type: "int", prompt: item.prompt };
    } else if (item.type === "declaration") {
      kind = "initialization";
      payload = {
        symbolId: `symbol-${item.name}`,
        name: item.name,
        type: item.valueType,
        ...(item.initializer ? { initializer: item.initializer } : {}),
      };
    } else if (item.type === "process") {
      payload = { operation: "assignment", symbolId: `symbol-${item.target}`, expression: item.expression };
    } else if (item.type === "output") {
      payload = item.mode === "formatted"
        ? { outputId: id, mode: "formatted", message: item.message, expression: item.expression }
        : item.mode === "message"
        ? { outputId: id, mode: "message", message: item.message }
        : { outputId: id, mode: "expression", expression: item.expression };
    } else {
      kind = "decision";
      payload = { condition: item.condition };
    }
    nodes.push({ id, kind, payload });
    positions[id] = { x, y };
    return id;
  }

  function compileSequence(items, incoming, x, startY) {
    let entryId = null;
    let exits = incoming;
    let y = startY;

    for (const item of items) {
      if (item.type !== "conditional") {
        const id = createNode(item, x, y);
        if (!entryId) entryId = id;
        exits.forEach((exit) => connect(exit.id, id, exit.branch));
        exits = [{ id }];
        y += 110;
        continue;
      }

      const decisionId = createNode(item, x, y);
      if (!entryId) entryId = decisionId;
      exits.forEach((exit) => connect(exit.id, decisionId, exit.branch));
      const branchY = y + 110;
      const trueBranch = compileSequence(item.whenTrue || [], [], x - 170, branchY);
      const falseBranch = compileSequence(item.whenFalse || [], [], x + 170, branchY);

      if (trueBranch.entryId) connect(decisionId, trueBranch.entryId, "true");
      else trueBranch.exits = [{ id: decisionId, branch: "true" }];
      if (falseBranch.entryId) connect(decisionId, falseBranch.entryId, "false");
      else falseBranch.exits = [{ id: decisionId, branch: "false" }];

      exits = [...trueBranch.exits, ...falseBranch.exits];
      y = Math.max(trueBranch.nextY, falseBranch.nextY);
    }

    return { entryId, exits, nextY: y };
  }

  const result = compileSequence(topBlock, [{ id: startId }], 380, 150);

  // Add End Node
  nodes.push({ id: endId, kind: "end", payload: {} });
  positions[endId] = { x: 380, y: result.nextY };
  result.exits.forEach((exit) => connect(exit.id, endId, exit.branch));

  const flowchart = {
    schemaVersion: "1.0.0",
    revision: 1,
    nodes,
    edges,
    layout: {
      positions,
      zoom: 1,
    },
  };

  return {
    success: true,
    flowchart,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}
