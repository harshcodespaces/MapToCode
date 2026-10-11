const NODE_TYPES = new Set(["Start", "Input", "Process", "Decision", "Output", "End"]);
const PYTHON_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally", "for",
  "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
  "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);
const C_KEYWORDS = new Set("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Alignas _Alignof _Atomic _Bool _Complex _Generic _Imaginary _Noreturn _Static_assert _Thread_local printf scanf main".split(" "));

export const DEFAULT_DIAGRAM = {
  id: "age-check",
  name: "Age check",
  nodes: [
    { id: "start", type: "Start", label: "Start", position: { x: 55, y: 304 } },
    { id: "ask-age", type: "Input", label: "Ask for age", variable: "age", prompt: "Enter your age: ", inputType: "number", position: { x: 245, y: 294 } },
    { id: "adult-check", type: "Decision", label: "Adult?", condition: "age >= 18", position: { x: 510, y: 286 } },
    { id: "adult-output", type: "Output", label: "Show adult", message: "Adult", position: { x: 790, y: 154 } },
    { id: "minor-output", type: "Output", label: "Show minor", message: "Minor", position: { x: 790, y: 448 } },
    { id: "end", type: "End", label: "End", position: { x: 1070, y: 304 } },
  ],
  edges: [
    { id: "edge-start-input", from: "start", to: "ask-age" },
    { id: "edge-input-decision", from: "ask-age", to: "adult-check" },
    { id: "edge-decision-true", from: "adult-check", to: "adult-output", branch: "true" },
    { id: "edge-decision-false", from: "adult-check", to: "minor-output", branch: "false" },
    { id: "edge-adult-end", from: "adult-output", to: "end" },
    { id: "edge-minor-end", from: "minor-output", to: "end" },
  ],
};

function tokenizeExpression(source) {
  const tokens = [];
  const pattern = /\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|\/\/|[()+\-*/%<>]/y;
  let index = 0;

  while (index < source.length) {
    const whitespace = /^\s+/.exec(source.slice(index));
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }

    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (!match) throw new Error(`“${source[index]}” is not allowed in this expression.`);
    tokens.push(match[0]);
    index = pattern.lastIndex;
  }

  if (!tokens.length) throw new Error("Enter an expression.");
  return tokens;
}

function parseExpression(source) {
  const tokens = tokenizeExpression(source);
  let cursor = 0;
  let hasComparison = false;
  const identifiers = new Set();
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const accept = (value) => (peek() === value ? (take(), true) : false);

  function atom() {
    const token = take();
    if (token === undefined) throw new Error("The expression ends too early.");
    if (token === "(") {
      logicalOr();
      if (!accept(")")) throw new Error("Add a closing parenthesis.");
      return;
    }
    if (/^\d/.test(token) || token === "True" || token === "False") return;
    if (/^[A-Za-z_]/.test(token)) {
      if (["and", "or", "not"].includes(token)) throw new Error(`“${token}” needs a value beside it.`);
      identifiers.add(token);
      return;
    }
    throw new Error(`“${token}” needs a value before it.`);
  }

  function unary() {
    if (["+", "-"].includes(peek())) {
      take();
      unary();
    } else {
      atom();
    }
  }

  function product() {
    unary();
    while (["*", "/", "//", "%"].includes(peek())) {
      take();
      unary();
    }
  }

  function sum() {
    product();
    while (["+", "-"].includes(peek())) {
      take();
      product();
    }
  }

  function comparison() {
    sum();
    while (["==", "!=", "<", "<=", ">", ">="].includes(peek())) {
      hasComparison = true;
      take();
      sum();
    }
  }

  function logicalNot() {
    if (accept("not")) logicalNot();
    else comparison();
  }

  function logicalAnd() {
    logicalNot();
    while (accept("and")) logicalNot();
  }

  function logicalOr() {
    logicalAnd();
    while (accept("or")) logicalAnd();
  }

  logicalOr();
  if (cursor < tokens.length) throw new Error(`Unexpected “${peek()}”.`);
  return { tokens, identifiers, hasComparison, python: tokens.join(" ") };
}

function isIdentifier(value) {
  return typeof value === "string"
    && value.length <= 64
    && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
    && !PYTHON_KEYWORDS.has(value);
}

function pythonString(value) {
  return JSON.stringify(value);
}

function validateAndBuild(diagram) {
  const errors = [];
  const addError = (message) => errors.push(message);

  if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
    return { errors: ["This project file is missing its node or connection list."], code: "" };
  }

  const nodes = diagram.nodes;
  const edges = diagram.edges;
  const nodeMap = new Map();
  for (const node of nodes) {
    if (!node || typeof node !== "object" || typeof node.id !== "string" || !node.id.trim()) {
      addError("Every block needs an ID. Try adding the block again.");
      continue;
    }
    if (nodeMap.has(node.id)) addError(`Two blocks share the ID “${node.id}”.`);
    else nodeMap.set(node.id, node);
    if (!NODE_TYPES.has(node.type)) addError(`“${node.type ?? "Unknown"}” is not a supported block type.`);
    if (typeof node.label !== "string" || !node.label.trim()) addError(`${node.type} block needs a label.`);
    if (typeof node.label === "string" && node.label.length > 80) addError(`Block label “${node.label.slice(0, 30)}…” is longer than 80 characters.`);
  }

  const startNodes = nodes.filter((node) => node?.type === "Start");
  const endNodes = nodes.filter((node) => node?.type === "End");
  const decisionNodes = nodes.filter((node) => node?.type === "Decision");
  if (startNodes.length !== 1) addError("A flowchart must have exactly one Start block.");
  if (endNodes.length !== 1) addError("A flowchart must have exactly one End block.");
  if (decisionNodes.length > 1) addError("This version supports one Decision block per flowchart. Split a larger program into smaller diagrams for now.");

  const outgoing = new Map(nodes.map((node) => [node?.id, []]));
  const incoming = new Map(nodes.map((node) => [node?.id, []]));
  const edgeKeys = new Set();
  const edgeIds = new Set();
  for (const edge of edges) {
    if (!edge || !nodeMap.has(edge.from) || !nodeMap.has(edge.to)) {
      addError("A connection points to a block that no longer exists. Remove it or reconnect it.");
      continue;
    }
    if (typeof edge.id !== "string" || !edge.id) addError("Every connection needs an ID. Recreate the connection to fix it.");
    else if (edgeIds.has(edge.id)) addError("Two connections share the same ID. Recreate the duplicate connection.");
    else edgeIds.add(edge.id);
    if (edge.from === edge.to) addError("A block cannot connect back to itself.");
    const source = nodeMap.get(edge.from);
    const isDecision = source.type === "Decision";
    if (isDecision && !["true", "false"].includes(edge.branch)) {
      addError(`Choose a True or False branch for the connection leaving “${source.label}”.`);
    }
    if (!isDecision && edge.branch != null) addError("Only a Decision block can have True or False connections.");
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.branch ?? ""}`;
    if (edgeKeys.has(key)) addError("This connection appears more than once.");
    edgeKeys.add(key);
    outgoing.get(edge.from)?.push(edge);
    incoming.get(edge.to)?.push(edge);
  }

  for (const node of nodes) {
    if (!nodeMap.has(node?.id) || !NODE_TYPES.has(node.type)) continue;
    const ins = incoming.get(node.id) ?? [];
    const outs = outgoing.get(node.id) ?? [];
    if (node.type === "Start" && ins.length !== 0) addError("The Start block cannot have an incoming connection.");
    if (!['Start', 'End'].includes(node.type) && ins.length !== 1) addError(ins.length === 0 ? `“${node.label}” has no incoming connection.` : `“${node.label}” has more than one incoming connection, which is not supported yet.`);
    if (node.type === "Start" && outs.length !== 1) addError("Connect Start to exactly one next block.");
    if (["Input", "Process", "Output"].includes(node.type) && outs.length !== 1) addError(`Connect “${node.label}” to exactly one next block.`);
    if (node.type === "Decision") {
      const branches = new Set(outs.map((edge) => edge.branch));
      if (outs.length !== 2 || !branches.has("true") || !branches.has("false")) {
        addError(`Decision “${node.label}” needs one True connection and one False connection.`);
      }
      if (ins.length !== 1) addError(`Decision “${node.label}” must have exactly one incoming connection.`);
    }
    if (node.type === "End" && outs.length !== 0) addError("The End block cannot have an outgoing connection.");
    if (node.type === "End" && ins.length === 0) addError("Connect at least one path to End.");
  }

  if (startNodes.length === 1) {
    const reachable = new Set();
    const pending = [startNodes[0].id];
    while (pending.length) {
      const id = pending.pop();
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const edge of outgoing.get(id) ?? []) pending.push(edge.to);
    }
    for (const node of nodes) {
      if (node?.id && !reachable.has(node.id)) addError(`“${node.label || node.id}” cannot be reached from Start.`);
    }

    const visiting = new Set();
    const visited = new Set();
    let hasCycle = false;
    function detectCycle(id) {
      if (visiting.has(id)) { hasCycle = true; return; }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const edge of outgoing.get(id) ?? []) detectCycle(edge.to);
      visiting.delete(id);
      visited.add(id);
    }
    for (const node of nodes) if (node?.id) detectCycle(node.id);
    if (hasCycle) addError("This flowchart loops back on itself. Loops are not supported yet.");
  }

  // Validate user-entered expressions before they can become Python source.
  const parsedByNode = new Map();
  for (const node of nodes) {
    if (node?.type === "Input") {
      if (!isIdentifier(node.variable)) addError(`Input “${node.label}” needs a simple variable name, such as age or score.`);
      if (typeof node.prompt !== "string") addError(`Input “${node.label}” needs a text prompt.`);
      if (typeof node.prompt === "string" && node.prompt.length > 240) addError(`Input “${node.label}” prompt must be 240 characters or fewer.`);
      if (!['number', 'text'].includes(node.inputType)) addError(`Choose whether input “${node.label}” is a number or text.`);
    } else if (node?.type === "Process") {
      if (typeof node.assignment === "string" && node.assignment.length > 200) addError(`Process “${node.label}” assignment must be 200 characters or fewer.`);
      const match = typeof node.assignment === "string" && /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.+?)\s*$/.exec(node.assignment);
      if (!match || !isIdentifier(match[1])) {
        addError(`Process “${node.label}” needs one safe assignment, such as total = price * count.`);
      } else {
        try {
          parsedByNode.set(node.id, { target: match[1], ...parseExpression(match[2]) });
        } catch (error) {
          addError(`Process “${node.label}”: ${error.message}`);
        }
      }
    } else if (node?.type === "Decision") {
      if (typeof node.condition !== "string") addError(`Decision “${node.label}” needs a condition.`);
      else if (node.condition.length > 200) addError(`Decision “${node.label}” condition must be 200 characters or fewer.`);
      else {
        try {
          const parsed = parseExpression(node.condition);
          parsedByNode.set(node.id, parsed);
          if (!parsed.hasComparison) addError(`Decision “${node.label}” needs a comparison, such as age >= 18.`);
        } catch (error) {
          addError(`Decision “${node.label}”: ${error.message}`);
        }
      }
    } else if (node?.type === "Output") {
      const outputMode = node.outputMode ?? "message";
      if (!['message', 'expression'].includes(outputMode)) addError(`Choose text or a value for Output “${node.label}”.`);
      else if (outputMode === "message") {
        if (typeof node.message !== "string") addError(`Output “${node.label}” needs a text message.`);
        else if (node.message.length > 500) addError(`Output “${node.label}” message must be 500 characters or fewer.`);
      } else if (typeof node.expression !== "string") {
        addError(`Output “${node.label}” needs a value or expression.`);
      } else if (node.expression.length > 200) {
        addError(`Output “${node.label}” expression must be 200 characters or fewer.`);
      } else {
        try {
          const parsed = parseExpression(node.expression);
          if (parsed.hasComparison) addError(`Output “${node.label}” should print a value, not a comparison.`);
          parsedByNode.set(node.id, parsed);
        } catch (error) {
          addError(`Output “${node.label}”: ${error.message}`);
        }
      }
    }
  }

  if (errors.length) return { errors: [...new Set(errors)], code: "" };

  const endId = endNodes[0].id;
  function followBranch(firstEdge, stopAtDecision = false) {
    const path = [];
    const pathIds = new Set();
    let id = firstEdge.to;
    while (id !== endId) {
      const node = nodeMap.get(id);
      if (!node || node.type === "Decision" || pathIds.has(id)) break;
      path.push(node);
      pathIds.add(id);
      id = outgoing.get(id)[0].to;
    }
    return { path, endReached: id === endId, pathIds };
  }

  if (decisionNodes.length === 1) {
    const decision = decisionNodes[0];
    const truePath = followBranch(outgoing.get(decision.id).find((edge) => edge.branch === "true"));
    const falsePath = followBranch(outgoing.get(decision.id).find((edge) => edge.branch === "false"));
    const sharedBeforeEnd = [...truePath.pathIds].filter((id) => falsePath.pathIds.has(id));
    if (!truePath.endReached || !falsePath.endReached) addError("Both Decision paths must lead to the End block.");
    if (sharedBeforeEnd.length) addError("The True and False paths can only rejoin at End in this version.");
  }

  if (errors.length) return { errors: [...new Set(errors)], code: "" };

  const lines = [];
  const knownVariables = new Set();
  function emitNode(node, destination, indent = "") {
    if (node.type === "Input") {
      const prompt = pythonString(node.prompt);
      destination.push(`${indent}${node.variable} = ${node.inputType === "number" ? "int(" : ""}input(${prompt})${node.inputType === "number" ? ")" : ""}`);
      knownVariables.add(node.variable);
    } else if (node.type === "Process") {
      const parsed = parsedByNode.get(node.id);
      const missing = [...parsed.identifiers].filter((name) => !knownVariables.has(name));
      if (missing.length) addError(`Process “${node.label}” uses ${missing.map((name) => `“${name}”`).join(", ")} before it has a value.`);
      else destination.push(`${indent}${parsed.target} = ${parsed.python}`);
      knownVariables.add(parsed.target);
    } else if (node.type === "Output") {
      if ((node.outputMode ?? "message") === "expression") {
        const parsed = parsedByNode.get(node.id);
        const missing = [...parsed.identifiers].filter((name) => !knownVariables.has(name));
        if (missing.length) addError(`Output “${node.label}” uses ${missing.map((name) => `“${name}”`).join(", ")} before it has a value.`);
        else destination.push(`${indent}print(${parsed.python})`);
      } else {
        destination.push(`${indent}print(${pythonString(node.message)})`);
      }
    }
  }

  let current = outgoing.get(startNodes[0].id)[0].to;
  while (nodeMap.get(current).type !== "Decision" && nodeMap.get(current).type !== "End") {
    const node = nodeMap.get(current);
    emitNode(node, lines);
    current = outgoing.get(current)[0].to;
  }

  if (nodeMap.get(current).type === "Decision") {
    const decision = nodeMap.get(current);
    const condition = parsedByNode.get(decision.id);
    const missing = [...condition.identifiers].filter((name) => !knownVariables.has(name));
    if (missing.length) addError(`Decision “${decision.label}” uses ${missing.map((name) => `“${name}”`).join(", ")} before it has a value.`);
    if (lines.length) lines.push("");
    lines.push(`if ${condition.python}:`);
    const variablesBeforeBranches = new Set(knownVariables);
    for (const branch of ["true", "false"]) {
      knownVariables.clear();
      for (const name of variablesBeforeBranches) knownVariables.add(name);
      const output = [];
      const path = followBranch(outgoing.get(decision.id).find((edge) => edge.branch === branch));
      for (const node of path.path) emitNode(node, output, "    ");
      if (!output.length) output.push("    pass");
      lines.push(...output);
      if (branch === "true") lines.push("else:");
    }
  }

  return errors.length ? { errors: [...new Set(errors)], code: "" } : { errors: [], code: `${lines.join("\n")}\n` };
}

export function validateDiagram(diagram) {
  const { errors } = validateAndBuild(diagram);
  return errors;
}

export function generatePython(diagram) {
  return validateAndBuild(diagram);
}

function cString(value) {
  const escaped = [...String(value)].map((character) => {
    const code = character.charCodeAt(0);
    if (character === "\\") return "\\\\";
    if (character === '"') return '\\"';
    if (character === "\n") return "\\n";
    if (character === "\r") return "\\r";
    if (character === "\t") return "\\t";
    if (code < 32 || code === 127) return `\\${code.toString(8).padStart(3, "0")}`;
    return character;
  }).join("");
  return `"${escaped}"`;
}

function cExpression(parsed) {
  if (parsed.tokens.includes("not")) throw new Error("C generation does not support ‘not’ yet. Rewrite the condition with a comparison such as age != 18.");
  if (parsed.tokens.some((token) => token.includes(".") || ["/", "//", "%"].includes(token))) {
    throw new Error("C generation currently supports whole-number arithmetic with +, -, and *. Use Python for decimals or division.");
  }
  const comparisons = parsed.tokens.filter((token) => ["==", "!=", "<", "<=", ">", ">="].includes(token)).length;
  if (comparisons > 1) throw new Error("C generation currently supports one comparison in each Decision condition.");
  if ([...parsed.identifiers].some((name) => C_KEYWORDS.has(name))) {
    throw new Error("This expression uses a word reserved by C. Rename the variable.");
  }
  return parsed.tokens.map((token) => ({ and: "&&", or: "||", not: "!", True: "1", False: "0" })[token] ?? token).join(" ");
}

export function generateC(diagram) {
  const checked = validateAndBuild(diagram);
  if (checked.errors.length) return checked;

  const nodes = diagram.nodes;
  const edges = diagram.edges;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) outgoing.get(edge.from).push(edge);
  const start = nodes.find((node) => node.type === "Start");
  const decision = nodes.find((node) => node.type === "Decision");
  const errors = [];
  const parsed = new Map();
  for (const node of nodes) {
    if (node.type === "Input" && C_KEYWORDS.has(node.variable)) errors.push(`Input “${node.label}” uses “${node.variable}”, which is reserved by C. Choose another variable name.`);
    if (node.type === "Process") {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.+?)\s*$/.exec(node.assignment ?? "");
      if (match && C_KEYWORDS.has(match[1])) errors.push(`Process “${node.label}” uses “${match[1]}”, which is reserved by C. Choose another variable name.`);
      if (match) {
        try { parsed.set(node.id, { target: match[1], ...parseExpression(match[2]) }); cExpression(parsed.get(node.id)); }
        catch (error) { errors.push(`Process “${node.label}”: ${error.message}`); }
      }
    } else if (node.type === "Decision") {
      try { parsed.set(node.id, parseExpression(node.condition)); cExpression(parsed.get(node.id)); }
      catch (error) { errors.push(`Decision “${node.label}”: ${error.message}`); }
    } else if (node.type === "Output" && (node.outputMode ?? "message") === "expression") {
      try { parsed.set(node.id, parseExpression(node.expression)); cExpression(parsed.get(node.id)); }
      catch (error) { errors.push(`Output “${node.label}”: ${error.message}`); }
    }
  }
  if (errors.length) return { errors: [...new Set(errors)], code: "" };

  const lines = ["#include <stdio.h>", "", "int main(void) {"];
  const variableTypes = new Map();
  function emit(node, destination, indent = "    ") {
    if (node.type === "Input") {
      const name = node.variable;
      if (variableTypes.has(name)) {
        errors.push(`Input “${node.label}” reuses “${name}”, which already has a value. Choose a new variable name.`);
        return;
      }
      if (node.inputType === "number") {
        destination.push(`${indent}int ${name};`, `${indent}printf("%s", ${cString(node.prompt)});`, `${indent}scanf("%d", &${name});`);
        variableTypes.set(name, "number");
      } else {
        destination.push(`${indent}char ${name}[256];`, `${indent}printf("%s", ${cString(node.prompt)});`, `${indent}scanf("%255s", ${name});`);
        variableTypes.set(name, "text");
      }
    } else if (node.type === "Process") {
      const value = parsed.get(node.id);
      if ([...value.identifiers].some((name) => variableTypes.get(name) !== "number")) {
        errors.push(`Process “${node.label}” can only use whole-number variables that already have a value.`);
        return;
      }
      if (variableTypes.get(value.target) === "text") {
        errors.push(`Process “${node.label}” cannot replace the text variable “${value.target}” with a number.`);
        return;
      }
      const declaration = variableTypes.has(value.target) ? "" : "int ";
      destination.push(`${indent}${declaration}${value.target} = ${cExpression(value)};`);
      variableTypes.set(value.target, "number");
    } else if (node.type === "Output") {
      if ((node.outputMode ?? "message") === "message") destination.push(`${indent}printf("%s\\n", ${cString(node.message)});`);
      else {
        const value = parsed.get(node.id);
        if ([...value.identifiers].some((name) => !variableTypes.has(name))) {
          errors.push(`Output “${node.label}” uses a variable before it has a value.`);
          return;
        }
        if (value.identifiers.size === 1 && variableTypes.get([...value.identifiers][0]) === "text") {
          destination.push(`${indent}printf("%s\\n", ${cExpression(value)});`);
        } else if ([...value.identifiers].some((name) => variableTypes.get(name) !== "number")) {
          errors.push(`Output “${node.label}” cannot calculate with a text variable.`);
        } else {
          destination.push(`${indent}printf("%d\\n", ${cExpression(value)});`);
        }
      }
    }
  }

  let current = outgoing.get(start.id)[0].to;
  while (nodeMap.get(current).type !== "Decision" && nodeMap.get(current).type !== "End") {
    const node = nodeMap.get(current);
    emit(node, lines);
    current = outgoing.get(current)[0].to;
  }
  if (decision) {
    if (lines.length > 3) lines.push("");
    const condition = parsed.get(decision.id);
    if ([...condition.identifiers].some((name) => variableTypes.get(name) !== "number")) {
      errors.push(`Decision “${decision.label}” can only compare whole-number variables in C.`);
    }
    lines.push(`    if (${cExpression(condition)}) {`);
    const variablesBeforeBranches = new Map(variableTypes);
    for (const branch of ["true", "false"]) {
      variableTypes.clear();
      for (const [name, type] of variablesBeforeBranches) variableTypes.set(name, type);
      if (branch === "false") lines.push("    } else {");
      const edge = outgoing.get(decision.id).find((item) => item.branch === branch);
      let branchNode = edge.to;
      while (nodeMap.get(branchNode).type !== "End") {
        const node = nodeMap.get(branchNode);
        emit(node, lines, "        ");
        branchNode = outgoing.get(branchNode)[0].to;
      }
    }
    lines.push("    }");
  }
  lines.push("    return 0;", "}");
  return errors.length ? { errors: [...new Set(errors)], code: "" } : { errors: [], code: `${lines.join("\n")}\n` };
}

export function validateConnection(diagram, fromId, toId, branch) {
  const source = diagram.nodes.find((node) => node.id === fromId);
  const target = diagram.nodes.find((node) => node.id === toId);
  if (!source || !target) return "Choose blocks that still exist in the flowchart.";
  if (fromId === toId) return "A block cannot connect back to itself. Choose a different destination.";
  if (source.type === "End") return "End blocks cannot have an outgoing connection.";
  if (target.type === "Start") return "Connections cannot lead back to Start.";

  const outgoing = diagram.edges.filter((edge) => edge.from === fromId);
  const incoming = diagram.edges.filter((edge) => edge.to === toId);
  if (source.type === "Decision") {
    if (!["true", "false"].includes(branch)) return "Choose the True or False path for this Decision.";
    if (outgoing.some((edge) => edge.branch === branch)) {
      return `The ${branch === "true" ? "True" : "False"} path already has a connection. Delete it before choosing another destination.`;
    }
  } else if (outgoing.length) {
    return "This block already has a next step. Delete its connection before replacing it.";
  }
  if (target.type !== "End" && incoming.length) {
    return `“${target.label || target.type}” already has an incoming connection. Delete it before connecting another block here.`;
  }
  if (diagram.edges.some((edge) => edge.from === fromId && edge.to === toId && edge.branch === (source.type === "Decision" ? branch : undefined))) {
    return "Those blocks are already connected on that path.";
  }

  const pending = [toId];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (current === fromId) return "That connection would create a loop. Connect it to a later block instead.";
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of diagram.edges) if (edge.from === current) pending.push(edge.to);
  }
  return "";
}

export function hasDiagramShape(value) {
  return Boolean(value && typeof value === "object" && Array.isArray(value.nodes) && Array.isArray(value.edges));
}

export { NODE_TYPES };
