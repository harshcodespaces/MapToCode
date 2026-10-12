function newId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export const PSEUDOCODE_EXAMPLES = [
  {
    id: "exam-result",
    title: "Decision: Exam result",
    source: `BEGIN
INPUT score PROMPT "Enter the exam score: "
IF score >= 50 THEN
    OUTPUT "Pass"
ELSE
    OUTPUT "Try again"
END IF
END`,
  },
  {
    id: "late-fee",
    title: "Decision: Calculate a late fee",
    source: `BEGIN
INPUT days PROMPT "Days late: "
IF days > 7 THEN
    fee ← days * 2
ELSE
    fee ← 0
END IF
OUTPUT fee
END`,
  },
  {
    id: "budget-check",
    title: "Decision: Check a budget",
    source: `BEGIN
INPUT budget PROMPT "Your budget: "
INPUT cost PROMPT "Item cost: "
IF cost <= budget THEN
    OUTPUT "Within budget"
ELSE
    OUTPUT "Over budget"
END IF
END`,
  },
  {
    id: "order-discount",
    title: "Decision: Apply an order discount",
    source: `BEGIN
INPUT total PROMPT "Order total: "
IF total >= 100 THEN
    total ← total - 10
ELSE
    total ← total
END IF
OUTPUT total
END`,
  },
  {
    id: "welcome",
    title: "Hello, world!",
    source: `BEGIN
OUTPUT "Hello, world!"
END`,
  },
  {
    id: "greeting",
    title: "Personal greeting",
    source: `BEGIN
INPUT name TYPE TEXT PROMPT "What is your name? "
OUTPUT name
END`,
  },
  {
    id: "total",
    title: "Calculate a total",
    source: `BEGIN
INPUT price PROMPT "Enter the price: "
INPUT quantity PROMPT "Enter the quantity: "
total ← price * quantity
OUTPUT total
END`,
  },
  {
    id: "age-check",
    title: "Age check (IF / ELSE)",
    source: `BEGIN
INPUT age PROMPT "Enter your age: "
IF age >= 18 THEN
    OUTPUT "Adult"
ELSE
    OUTPUT "Minor"
END IF
END`,
  },
  {
    id: "number-check",
    title: "Positive or not",
    source: `BEGIN
INPUT number PROMPT "Enter a number: "
IF number > 0 THEN
    OUTPUT "Positive"
ELSE
    OUTPUT "Zero or negative"
END IF
END`,
  },
];

function readAction(line, lineNumber) {
  const input = /^INPUT\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+TYPE\s+(TEXT|NUMBER))?(?:\s+PROMPT\s+(.+))?$/i.exec(line);
  if (input) {
    let prompt = `Enter ${input[1]}: `;
    if (input[3]) {
      try { prompt = JSON.parse(input[3]); }
      catch { throw new Error(`Line ${lineNumber}: write an INPUT prompt as a quoted string.`); }
      if (typeof prompt !== "string") throw new Error(`Line ${lineNumber}: the INPUT prompt must be text.`);
    }
    return { type: "Input", label: `Read ${input[1]}`, variable: input[1], prompt, inputType: input[2]?.toLowerCase() === "text" ? "text" : "number" };
  }

  const output = /^OUTPUT\s+(.+)$/i.exec(line);
  if (output) {
    const value = output[1].trim();
    if (value.startsWith('"')) {
      try {
        const message = JSON.parse(value);
        if (typeof message !== "string") throw new Error();
        return { type: "Output", label: "Show message", outputMode: "message", message, expression: "" };
      } catch { throw new Error(`Line ${lineNumber}: write text output as a quoted string.`); }
    }
    return { type: "Output", label: "Show value", outputMode: "expression", expression: value, message: "" };
  }

  const assignment = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:<-|←|=(?!=))\s*(.+)$/.exec(line);
  if (assignment) return { type: "Process", label: `Set ${assignment[1]}`, assignment: `${assignment[1]} = ${assignment[2]}` };
  throw new Error(`Line ${lineNumber}: use INPUT, OUTPUT, or an assignment such as total ← price * count.`);
}

export function pseudocodeToDiagram(source, name = "Untitled flowchart") {
  const rawLines = String(source).split(/\r?\n/);
  const lines = rawLines.map((text, index) => ({ text: text.trim(), number: index + 1 })).filter(({ text }) => text && !text.startsWith("//"));
  if (!lines.length || !/^(BEGIN|START)$/i.test(lines[0].text)) throw new Error("Start pseudocode with BEGIN.");
  if (!/^END$/i.test(lines.at(-1).text)) throw new Error("Finish pseudocode with END.");

  const body = lines.slice(1, -1);
  const decisionAt = body.findIndex(({ text }) => /^IF\b/i.test(text));
  if (body.filter(({ text }) => /^IF\b/i.test(text)).length > 1) throw new Error("Only one IF/ELSE decision is supported in this version.");
  let before = body;
  let trueActions = [];
  let falseActions = [];
  let condition = "";
  if (decisionAt >= 0) {
    before = body.slice(0, decisionAt);
    const match = /^IF\s+(.+?)\s+THEN$/i.exec(body[decisionAt].text);
    if (!match) throw new Error(`Line ${body[decisionAt].number}: write the decision as IF condition THEN.`);
    condition = match[1];
    const elseAt = body.findIndex(({ text }, index) => index > decisionAt && /^ELSE$/i.test(text));
    const endIfAt = body.findIndex(({ text }, index) => index > decisionAt && /^END\s+IF$/i.test(text));
    if (elseAt < 0 || endIfAt < 0 || elseAt > endIfAt) throw new Error("An IF decision needs ELSE and END IF lines.");
    if (body.slice(elseAt + 1, endIfAt).some(({ text }) => /^(IF|ELSE|END\s+IF)\b/i.test(text))) {
      throw new Error("Nested or repeated decisions are not supported yet.");
    }
    trueActions = body.slice(decisionAt + 1, elseAt);
    falseActions = body.slice(elseAt + 1, endIfAt);
    if (!trueActions.length || !falseActions.length) throw new Error("Add at least one action under both IF and ELSE.");
    const sharedActions = body.slice(endIfAt + 1);
    if (sharedActions.some(({ text }) => /^(IF|ELSE|END\s+IF)\b/i.test(text))) {
      throw new Error("Nested or repeated decisions are not supported yet.");
    }
    trueActions = [...trueActions, ...sharedActions];
    falseActions = [...falseActions, ...sharedActions];
  } else if (body.some(({ text }) => /^(ELSE|END\s+IF)\b/i.test(text))) {
    throw new Error("ELSE and END IF need a matching IF condition.");
  }

  const nodes = [];
  const edges = [];
  let previous = null;
  let cursorX = 55;
  const centerY = 320;
  const addNode = (data, position) => {
    const node = { id: newId(data.type.toLowerCase()), ...data, position };
    nodes.push(node);
    if (previous) edges.push({ id: newId("edge"), from: previous, to: node.id });
    previous = node.id;
    return node;
  };
  const start = addNode({ type: "Start", label: "Start" }, { x: cursorX, y: centerY });
  previous = start.id;

  for (const actionLine of before) {
    cursorX += 225;
    addNode(readAction(actionLine.text, actionLine.number), { x: cursorX, y: centerY });
  }

  if (decisionAt >= 0) {
    cursorX += 225;
    const decision = addNode({ type: "Decision", label: "Check condition", condition }, { x: cursorX, y: centerY - 30 });
    const afterDecision = previous;
    const branchResults = [];
    for (const [branch, actions, branchY] of [["true", trueActions, centerY - 190], ["false", falseActions, centerY + 150]]) {
      let branchPrevious = afterDecision;
      let branchX = cursorX + 235;
      for (const actionLine of actions) {
        const nodeData = readAction(actionLine.text, actionLine.number);
        const node = { id: newId(nodeData.type.toLowerCase()), ...nodeData, position: { x: branchX, y: branchY } };
        nodes.push(node);
        edges.push({ id: newId("edge"), from: branchPrevious, to: node.id, ...(branchPrevious === decision.id ? { branch } : {}) });
        branchPrevious = node.id;
        branchX += 205;
      }
      branchResults.push(branchPrevious);
    }
    const end = { id: newId("end"), type: "End", label: "End", position: { x: cursorX + 520, y: centerY } };
    nodes.push(end);
    branchResults.forEach((from) => edges.push({ id: newId("edge"), from, to: end.id }));
  } else {
    const end = addNode({ type: "End", label: "End" }, { x: cursorX + 225, y: centerY });
  }
  return { id: newId("project"), name, nodes, edges };
}

export function diagramToPseudocode(diagram) {
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const outgoing = new Map(diagram.nodes.map((node) => [node.id, diagram.edges.filter((edge) => edge.from === node.id)]));
  const actionText = (node) => {
    if (node.type === "Input") return `INPUT ${node.variable ?? "value"}${node.inputType === "text" ? " TYPE TEXT" : ""}${node.prompt ? ` PROMPT ${JSON.stringify(node.prompt)}` : ""}`;
    if (node.type === "Process") return String(node.assignment ?? "").replace(/\s*=\s*/, " ← ");
    if (node.type === "Output") return node.outputMode === "expression" ? `OUTPUT ${node.expression ?? "value"}` : `OUTPUT ${JSON.stringify(node.message ?? "")}`;
    return "";
  };
  const start = diagram.nodes.find((node) => node.type === "Start");
  if (!start) return "BEGIN\nEND";
  const lines = ["BEGIN"];
  let current = outgoing.get(start.id)?.[0]?.to;
  const safety = diagram.nodes.length + 1;
  let remaining = safety;
  while (current && remaining-- > 0) {
    const node = nodes.get(current);
    if (!node || node.type === "End") break;
    if (node.type === "Decision") {
      lines.push(`IF ${node.condition ?? "condition"} THEN`);
      for (const branch of ["true", "false"]) {
        if (branch === "false") lines.push("ELSE");
        let branchNode = outgoing.get(node.id)?.find((edge) => edge.branch === branch)?.to;
        let branchSafety = safety;
        while (branchNode && branchSafety-- > 0 && nodes.get(branchNode)?.type !== "End") {
          const nextNode = nodes.get(branchNode);
          lines.push(`    ${actionText(nextNode)}`);
          branchNode = outgoing.get(branchNode)?.[0]?.to;
        }
      }
      lines.push("END IF");
      break;
    }
    lines.push(actionText(node));
    current = outgoing.get(current)?.[0]?.to;
  }
  lines.push("END");
  return lines.join("\n");
}

export function tidyPseudocode(source) {
  let indent = 0;
  return String(source).split(/\r?\n/).map((line) => {
    const text = line.trim();
    if (/^(ELSE|END\s+IF|END)$/i.test(text)) indent = Math.max(0, indent - 1);
    const formatted = `${"    ".repeat(indent)}${text}`;
    if (/^IF\b.*\bTHEN$/i.test(text)) indent += 1;
    if (/^ELSE$/i.test(text)) indent += 1;
    return formatted;
  }).join("\n");
}
