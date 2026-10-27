import { parseExpression } from "./expressions.js";
import { validateFlowchartContract, validateSpecificationContract } from "./contract-validation.js";

export const ADAPTER_VERSION = "1.0.0";

function stableAstId(sourceKind, sourceId, role) {
  const text = `${sourceKind}:${sourceId}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of text) {
    const point = character.codePointAt(0);
    first = Math.imul(first ^ point, 0x01000193);
    second = Math.imul(second ^ point, 0x85ebca6b);
  }
  const prefix = encodeURIComponent(String(sourceId)).slice(0, 44);
  const hash = `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
  return `${sourceKind[0]}-${prefix}-${hash}-${role}`;
}

function sourceRef(sourceKind, sourceObjectId, sourceRevision) {
  return { sourceKind, sourceObjectId, sourceRevision };
}

function adapterResult(ast, diagnostics) {
  return { ast, diagnostics, valid: Boolean(ast) && diagnostics.length === 0, adapterVersion: ADAPTER_VERSION };
}

function createAstBuilder(sourceKind, sourceRevision, projectId) {
  const provenance = [];
  function record(node, sourceIds, rule) {
    provenance.push({
      astNodeId: node.id,
      origins: [...new Set(sourceIds)].map((id) => sourceRef(sourceKind, id, sourceRevision)),
      transformationRuleId: rule,
      adapterVersion: ADAPTER_VERSION,
    });
    return node;
  }
  function parse(source, sourceId, role, idMappings) {
    const rootId = stableAstId(sourceKind, sourceId, role);
    const expression = parseExpression(source, { idPrefix: `${rootId}-expr` });
    function resolve(node) {
      if (node.kind === "VariableReference") node.symbolId = idMappings.get(node.symbolId) ?? node.symbolId;
      if (node.kind === "UnaryExpression") resolve(node.operand);
      if (node.kind === "BinaryExpression") { resolve(node.left); resolve(node.right); }
      record(node, [sourceId], "expression-token-to-typed-node");
    }
    resolve(expression);
    return expression;
  }
  function block(sourceId, role, sourceIds = [sourceId]) {
    return record({ id: stableAstId(sourceKind, sourceId, role), kind: "Block", statements: [] }, sourceIds, "source-region-to-ast-block");
  }
  function finish(body, symbols) {
    return {
      irVersion: "1.0.0",
      programId: String(projectId || `${sourceKind}-revision-${sourceRevision}`),
      body,
      symbols,
      provenance,
    };
  }
  return { record, parse, block, finish };
}

function adapterDiagnostic(code, category, message, sourceKind, sourceId, revision, suggestion) {
  return {
    code,
    severity: "error",
    category,
    message,
    sourceRefs: sourceId ? [sourceRef(sourceKind, sourceId, revision)] : [],
    ...(suggestion ? { suggestion } : {}),
    ruleVersion: "1.0.0",
  };
}

function parseWithDiagnostic(builder, text, sourceKind, sourceId, sourceRevision, role, names, diagnostics) {
  try {
    return builder.parse(text, sourceId, role, names);
  } catch (error) {
    diagnostics.push(adapterDiagnostic(
      "ADAPTER_EXPRESSION_INVALID", "schema",
      `Expression in “${sourceId}” is invalid: ${error.message}`,
      sourceKind, sourceId, sourceRevision,
      "Use the supported expression grammar: numeric and character values, parentheses, arithmetic, comparisons, and Boolean operators.",
    ));
    return null;
  }
}

function addSymbol(symbols, byId, byName, symbol, sourceKind, revision, diagnostics, sourceId) {
  if (byId.has(symbol.id) || byName.has(symbol.name)) {
    diagnostics.push(adapterDiagnostic("SYMBOL_DUPLICATE", "structure", `Symbol ID or name “${symbol.name}” is duplicated.`, sourceKind, sourceId, revision));
    return;
  }
  byId.set(symbol.id, symbol);
  byName.set(symbol.name, symbol.id);
  symbols.push(symbol);
}

function ensureSymbol(symbols, byId, byName, symbol, sourceKind, revision, diagnostics, sourceId) {
  const existing = byId.get(symbol.id);
  if (existing) {
    if (existing.name !== symbol.name || existing.type !== symbol.type) {
      diagnostics.push(adapterDiagnostic("SYMBOL_DUPLICATE", "structure", `Symbol ID “${symbol.id}” has conflicting definitions.`, sourceKind, sourceId, revision));
    }
    return;
  }
  const sameNameId = byName.get(symbol.name);
  if (sameNameId && sameNameId !== symbol.id) {
    diagnostics.push(adapterDiagnostic("SYMBOL_DUPLICATE", "structure", `Variable name “${symbol.name}” is assigned to more than one symbol.`, sourceKind, sourceId, revision));
    return;
  }
  byId.set(symbol.id, symbol);
  byName.set(symbol.name, symbol.id);
  symbols.push(symbol);
}

function recordStatement(builder, statement, sourceId, rule = "source-operation-to-ast-statement", moreSources = []) {
  return builder.record(statement, [sourceId, ...moreSources], rule);
}

function collectSpecStepIds(steps, ids, diagnostics, revision) {
  for (const step of steps) {
    if (ids.has(step.id)) diagnostics.push(adapterDiagnostic("SPEC_SCHEMA_INVALID", "structure", `Step ID “${step.id}” is duplicated.`, "specification", step.id, revision));
    ids.add(step.id);
    if (step.kind === "conditional") {
      collectSpecStepIds(step.payload.whenTrue, ids, diagnostics, revision);
      collectSpecStepIds(step.payload.whenFalse, ids, diagnostics, revision);
    }
  }
}

export function adaptSpecificationToAst(specification, { projectId } = {}) {
  const diagnostics = validateSpecificationContract(specification);
  if (diagnostics.length) return adapterResult(null, diagnostics);

  const revision = specification.revision;
  const ids = new Set();
  const symbols = [];
  const symbolById = new Map();
  const symbolByName = new Map();
  const inputById = new Map(specification.inputs.map((value) => [value.id, value]));
  const variableById = new Map(specification.variables.map((value) => [value.id, value]));
  const outputIds = new Set(specification.outputs.map((value) => value.id));
  const allNames = new Map();

  for (const symbol of [...specification.inputs, ...specification.variables]) {
    if (allNames.has(symbol.name)) diagnostics.push(adapterDiagnostic("SYMBOL_DUPLICATE", "structure", `Variable name “${symbol.name}” is duplicated.`, "specification", symbol.id, revision));
    else allNames.set(symbol.name, symbol.id);
  }
  for (const item of [...specification.inputs, ...specification.variables, ...specification.outputs]) {
    if (ids.has(item.id)) diagnostics.push(adapterDiagnostic("SPEC_SCHEMA_INVALID", "structure", `Specification ID “${item.id}” is duplicated.`, "specification", item.id, revision));
    ids.add(item.id);
  }
  collectSpecStepIds(specification.steps, ids, diagnostics, revision);
  if (diagnostics.length) return adapterResult(null, diagnostics);

  const builder = createAstBuilder("specification", revision, projectId);
  const rootSource = String(projectId || `specification-${revision}`);
  const body = builder.block(rootSource, "root", [rootSource]);

  function findInputIds(steps, found = new Set()) {
    for (const step of steps) {
      if (step.kind === "input") found.add(step.payload.inputId);
      if (step.kind === "conditional") {
        findInputIds(step.payload.whenTrue, found);
        findInputIds(step.payload.whenFalse, found);
      }
    }
    return found;
  }
  const usedInputs = findInputIds(specification.steps);
  for (const inputId of usedInputs) {
    const input = inputById.get(inputId);
    if (!input) continue;
    ensureSymbol(symbols, symbolById, symbolByName, { id: input.id, name: input.name, type: input.type }, "specification", revision, diagnostics, input.id);
    body.statements.push(recordStatement(builder, {
      id: stableAstId("specification", input.id, "input-declaration"), kind: "VariableDeclaration", symbolId: input.id,
    }, input.id, "input-definition-to-variable-declaration"));
  }

  function visitSteps(steps, destination) {
    for (const step of steps) {
      const { id, kind, payload } = step;
      if (kind === "declaration") {
        const symbol = variableById.get(payload.symbolId);
        if (!symbol) {
          diagnostics.push(adapterDiagnostic("SPEC_REFERENCE_INVALID", "semantics", `Declaration step “${id}” refers to unknown variable “${payload.symbolId}”.`, "specification", id, revision));
          continue;
        }
        ensureSymbol(symbols, symbolById, symbolByName, { id: symbol.id, name: symbol.name, type: symbol.type }, "specification", revision, diagnostics, id);
        const initializer = payload.initializer
          ? parseWithDiagnostic(builder, payload.initializer, "specification", id, revision, "initializer", allNames, diagnostics)
          : undefined;
        if (payload.initializer && !initializer) continue;
        const declaration = { id: stableAstId("specification", id, "declaration"), kind: "VariableDeclaration", symbolId: symbol.id, ...(initializer ? { initializer } : {}) };
        destination.statements.push(recordStatement(builder, declaration, id));
      } else if (kind === "input") {
        const input = inputById.get(payload.inputId);
        if (!input) {
          diagnostics.push(adapterDiagnostic("SPEC_REFERENCE_INVALID", "semantics", `Input step “${id}” refers to unknown input “${payload.inputId}”.`, "specification", id, revision));
          continue;
        }
        ensureSymbol(symbols, symbolById, symbolByName, { id: input.id, name: input.name, type: input.type }, "specification", revision, diagnostics, id);
        destination.statements.push(recordStatement(builder, {
          id: stableAstId("specification", id, "input"), kind: "Input", symbolId: input.id, prompt: payload.prompt,
        }, id));
      } else if (kind === "assignment") {
        const symbol = [...specification.inputs, ...specification.variables].find((item) => item.id === payload.targetId);
        if (!symbol) {
          diagnostics.push(adapterDiagnostic("SPEC_REFERENCE_INVALID", "semantics", `Assignment step “${id}” refers to unknown variable “${payload.targetId}”.`, "specification", id, revision));
          continue;
        }
        ensureSymbol(symbols, symbolById, symbolByName, { id: symbol.id, name: symbol.name, type: symbol.type }, "specification", revision, diagnostics, id);
        const expression = parseWithDiagnostic(builder, payload.expression, "specification", id, revision, "assignment", allNames, diagnostics);
        if (!expression) continue;
        destination.statements.push(recordStatement(builder, {
          id: stableAstId("specification", id, "assignment"), kind: "Assignment", symbolId: symbol.id, expression,
        }, id));
      } else if (kind === "output") {
        if (!outputIds.has(payload.outputId)) {
          diagnostics.push(adapterDiagnostic("SPEC_REFERENCE_INVALID", "semantics", `Output step “${id}” refers to unknown output “${payload.outputId}”.`, "specification", id, revision));
          continue;
        }
        if (payload.mode === "formatted") {
          const expression = parseWithDiagnostic(builder, payload.expression, "specification", id, revision, "output", allNames, diagnostics);
          if (!expression) continue;
          destination.statements.push(recordStatement(builder, {
            id: stableAstId("specification", id, "output"), kind: "Output", mode: "formatted", message: payload.message, value: expression,
          }, id));
        } else if (payload.mode === "message") {
          destination.statements.push(recordStatement(builder, {
            id: stableAstId("specification", id, "output"), kind: "Output", mode: "message", message: payload.message,
          }, id));
        } else {
          const expression = parseWithDiagnostic(builder, payload.expression, "specification", id, revision, "output", allNames, diagnostics);
          if (!expression) continue;
          destination.statements.push(recordStatement(builder, {
            id: stableAstId("specification", id, "output"), kind: "Output", mode: "value", value: expression,
          }, id));
        }
      } else if (kind === "conditional") {
        const condition = parseWithDiagnostic(builder, payload.condition, "specification", id, revision, "condition", allNames, diagnostics);
        if (!condition) continue;
        const whenTrue = builder.block(id, "then", [id]);
        const whenFalse = builder.block(id, "else", [id]);
        visitSteps(payload.whenTrue, whenTrue);
        visitSteps(payload.whenFalse, whenFalse);
        destination.statements.push(recordStatement(builder, {
          id: stableAstId("specification", id, "conditional"), kind: "IfStatement", condition,
          thenBlock: whenTrue, elseBlock: whenFalse,
        }, id));
      }
    }
  }

  visitSteps(specification.steps, body);
  if (diagnostics.length) return adapterResult(null, diagnostics);
  const ast = builder.finish(body, symbols);
  return adapterResult(ast, []);
}

function graphMaps(graph) {
  const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) outgoing.get(edge.from)?.push(edge);
  return outgoing;
}

function flowchartAssignment(payload = {}) {
  const rawExpression = String(payload.expression ?? "").trim();
  // Standard assignment: target = expression or target ← expression
  const standard = rawExpression.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:←|<-|=)\s*(.+)$/);
  if (standard) {
    return { target: standard[1].trim(), expression: standard[2].trim(), embeddedTarget: true };
  }
  // Legacy reversed assignment fallback: expression ← target or expression = target
  const legacy = rawExpression.match(/^(.+?)\s*(?:←|<-)\s*([A-Za-z_][A-Za-z0-9_]*)$/)
    || rawExpression.match(/^(.+?)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/);
  if (legacy) {
    return { target: legacy[2], expression: legacy[1].trim(), embeddedTarget: true };
  }
  const symbolName = typeof payload.symbolId === "string" ? payload.symbolId.replace(/^symbol-/, "") : "";
  return { target: payload.target || payload.name || symbolName, expression: rawExpression, embeddedTarget: false };
}

function normalizeLegacyFlowchart(flowchart) {
  if (!flowchart || !Array.isArray(flowchart.nodes)) return flowchart;
  const nodes = flowchart.nodes.map((node) => {
    const payload = node.payload && typeof node.payload === "object" ? node.payload : {};
    if (node.kind === "start" || node.kind === "end") return { ...node, payload: {} };
    if (node.kind === "input") {
      const name = String(payload.name || "x");
      return { ...node, payload: {
        symbolId: payload.symbolId || `symbol-${name}`, name,
        type: ["int", "double", "char"].includes(payload.type) ? payload.type : "int",
        prompt: String(payload.prompt || `Enter ${name}: `),
      } };
    }
    if ((node.kind === "process" && payload.operation === "declaration") || node.kind === "initialization") {
      const name = String(payload.name || "result");
      return { ...node, kind: "initialization", payload: {
        symbolId: payload.symbolId || `symbol-${name}`, name,
        type: ["int", "double", "char"].includes(payload.type) ? payload.type : "int",
        initializer: String(payload.initializer || "0").trim() || "0",
      } };
    }
    if (node.kind === "process") {
      const assignment = flowchartAssignment(payload);
      const storedSymbolName = typeof payload.symbolId === "string" ? payload.symbolId.replace(/^symbol-/, "") : "";
      const symbolId = assignment.embeddedTarget || (assignment.target && storedSymbolName && storedSymbolName !== assignment.target)
        ? `symbol-${assignment.target}`
        : payload.symbolId || `symbol-${assignment.target || node.id}`;
      return { ...node, payload: { operation: "assignment", symbolId, expression: assignment.expression || "0" } };
    }
    if (node.kind === "output") {
      const outputId = String(payload.outputId || `output-${node.id}`);
      if (payload.mode === "formatted") return { ...node, payload: {
        outputId, mode: "formatted", message: String(payload.message ?? ""), expression: String(payload.expression ?? "0").trim() || "0",
      } };
      return payload.mode === "message"
        ? { ...node, payload: { outputId, mode: "message", message: String(payload.message ?? payload.expression ?? "") } }
        : { ...node, payload: { outputId, mode: "expression", expression: String(payload.expression ?? payload.message ?? "0").trim() || "0" } };
    }
    if (node.kind === "decision") return { ...node, payload: { condition: String(payload.condition || "true").trim() || "true" } };
    return node;
  });
  return {
    ...flowchart,
    nodes,
    layout: {
      ...(flowchart.layout || {}),
      positions: flowchart.layout?.positions || {},
      zoom: flowchart.layout?.zoom || 1,
    },
  };
}

function inferFlowchartExpressionType(source, symbolByName, symbolById) {
  try {
    const expression = parseExpression(source);
    function infer(node) {
      if (node.kind === "IntegerLiteral") return "int";
      if (node.kind === "FloatingLiteral") return "double";
      if (node.kind === "CharacterLiteral") return "char";
      if (node.kind === "VariableReference") {
        const symbolId = symbolByName.get(node.symbolId);
        return symbolById.get(symbolId)?.type || "int";
      }
      if (node.kind === "UnaryExpression") return infer(node.operand);
      if (node.kind === "BinaryExpression") {
        const left = infer(node.left);
        const right = infer(node.right);
        if (["<", "<=", ">", ">=", "==", "!=", "&&", "||"].includes(node.operator)) return "bool";
        if (left === "double" || right === "double") return "double";
        if (left === "char" || right === "char") return "char";
      }
      return "int";
    }
    return infer(expression);
  } catch {
    return "int";
  }
}

function nearestJoin(trueTarget, falseTarget, outgoing, postDominators) {
  const common = [...postDominators(trueTarget)].filter((id) => postDominators(falseTarget).has(id));
  function reaches(from, target, seen = new Set()) {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (outgoing.get(from) ?? []).some((edge) => reaches(edge.to, target, seen));
  }
  const nearest = common.filter((candidate) => !common.some((other) => other !== candidate && reaches(other, candidate)));
  return nearest.length === 1 ? nearest[0] : null;
}

export function adaptFlowchartToAst(flowchart, { projectId } = {}) {
  flowchart = normalizeLegacyFlowchart(flowchart);
  const diagnostics = validateFlowchartContract(flowchart);
  if (diagnostics.length) return adapterResult(null, diagnostics);
  const revision = flowchart.revision;
  const nodeById = new Map(flowchart.nodes.map((node) => [node.id, node]));
  const outgoing = graphMaps(flowchart);
  const start = flowchart.nodes.find((node) => node.kind === "start");
  const symbols = [];
  const symbolById = new Map();
  const symbolByName = new Map();
  for (const node of flowchart.nodes) {
    if (node.kind === "input") {
      const symId = node.payload?.symbolId || `symbol-${node.payload?.name || node.id}`;
      addSymbol(symbols, symbolById, symbolByName, { id: symId, name: node.payload?.name, type: node.payload?.type || "int" }, "flowchart", revision, diagnostics, node.id);
    }
    if (node.kind === "initialization") {
      const symId = node.payload?.symbolId || `symbol-${node.payload?.name || node.id}`;
      addSymbol(symbols, symbolById, symbolByName, { id: symId, name: node.payload?.name, type: node.payload?.type || "int" }, "flowchart", revision, diagnostics, node.id);
    }
  }
  for (const node of flowchart.nodes) {
    if (node.kind === "process") {
      const assignment = flowchartAssignment(node.payload);
      if (assignment.target && !symbolByName.has(assignment.target)) {
        const symId = assignment.embeddedTarget ? `symbol-${assignment.target}` : node.payload?.symbolId || `symbol-${assignment.target}`;
        const type = inferFlowchartExpressionType(assignment.expression, symbolByName, symbolById);
        addSymbol(symbols, symbolById, symbolByName, { id: symId, name: assignment.target, type }, "flowchart", revision, diagnostics, node.id);
      }
    }
  }
  if (diagnostics.length) return adapterResult(null, diagnostics);

  const builder = createAstBuilder("flowchart", revision, projectId);
  const postMemo = new Map();
  function postDominators(nodeId) {
    if (postMemo.has(nodeId)) return postMemo.get(nodeId);
    const successors = outgoing.get(nodeId) ?? [];
    if (!successors.length) return new Set([nodeId]);
    const childSets = successors.map((edge) => postDominators(edge.to));
    const intersection = new Set([...childSets[0]].filter((id) => childSets.every((set) => set.has(id))));
    intersection.add(nodeId);
    postMemo.set(nodeId, intersection);
    return intersection;
  }

  function allPathsLeadToEnd(fromId, seen = new Set()) {
    if (!fromId || seen.has(fromId)) return false;
    const node = nodeById.get(fromId);
    if (!node) return false;
    if (node.kind === "end") return true;
    const succs = outgoing.get(fromId) ?? [];
    if (!succs.length) return false;
    const nextSeen = new Set(seen).add(fromId);
    return succs.every((edge) => allPathsLeadToEnd(edge.to, nextSeen));
  }

  const body = builder.block(start.id, "root");
  // Input symbols are declared before executable steps in both source adapters.
  // Keeping this prelude ordered by visual graph order makes the canonical AST
  // independent of where the input arrows sit in the traversal.
  for (const node of flowchart.nodes.filter((item) => item.kind === "input")) {
    const symId = node.payload?.symbolId || `symbol-${node.payload?.name || node.id}`;
    body.statements.push(recordStatement(builder, {
      id: stableAstId("flowchart", node.id, "declaration"), kind: "VariableDeclaration", symbolId: symId,
    }, node.id, "input-node-to-variable-declaration"));
  }
  const declaredSymbolIds = new Set([
    ...flowchart.nodes.filter((item) => item.kind === "input").map((item) => item.payload?.symbolId || `symbol-${item.payload?.name || item.id}`),
    ...flowchart.nodes.filter((item) => item.kind === "initialization").map((item) => item.payload?.symbolId || `symbol-${item.payload?.name || item.id}`),
  ]);
  const declaredProcessTargets = new Set();
  for (const node of flowchart.nodes.filter((item) => item.kind === "process")) {
    const assignment = flowchartAssignment(node.payload);
    const symId = symbolByName.get(assignment.target);
    if (symId && !declaredSymbolIds.has(symId) && !declaredProcessTargets.has(symId)) {
      declaredProcessTargets.add(symId);
      body.statements.push(recordStatement(builder, {
        id: stableAstId("flowchart", node.id, "assignment-target-declaration"), kind: "VariableDeclaration", symbolId: symId,
      }, node.id, "assignment-target-to-variable-declaration"));
    }
  }
  let currentId = outgoing.get(start.id)[0].to;
  const consumed = new Set([start.id]);

  function compileUntil(initialId, stopId, destination, active, incomingEdge) {
    let nodeId = initialId;
    while (nodeId && nodeId !== stopId) {
      if (!nodeById.has(nodeId) || active.has(nodeId) || consumed.has(nodeId)) {
        diagnostics.push(adapterDiagnostic("GRAPH_JOIN_AMBIGUOUS", "semantics", `Flowchart path reaches “${nodeId}” more than once before its join can be established.`, "flowchart", incomingEdge?.id ?? nodeId, revision));
        return stopId;
      }
      active.add(nodeId);
      const node = nodeById.get(nodeId);
      consumed.add(nodeId);
      const payload = node.payload;
      if (node.kind === "end") return node.id;
      if (node.kind === "input") {
        const symId = payload?.symbolId || `symbol-${payload?.name || node.id}`;
        destination.statements.push(recordStatement(builder, {
          id: stableAstId("flowchart", node.id, "input"), kind: "Input", symbolId: symId, prompt: payload?.prompt || "",
        }, node.id, "input-node-to-ast-input"));
      } else if (node.kind === "initialization") {
        const symId = payload?.symbolId || `symbol-${payload?.name || node.id}`;
        const initializer = payload.initializer
          ? parseWithDiagnostic(builder, payload.initializer, "flowchart", node.id, revision, "initializer", symbolByName, diagnostics)
          : undefined;
        if (payload.initializer && !initializer) return stopId;
        destination.statements.push(recordStatement(builder, {
          id: stableAstId("flowchart", node.id, "declaration"), kind: "VariableDeclaration", symbolId: symId, ...(initializer ? { initializer } : {}),
        }, node.id));
      } else if (node.kind === "process") {
        const assignment = flowchartAssignment(payload);
        const targetSymId = symbolByName.get(assignment.target);
        const expression = parseWithDiagnostic(builder, assignment.expression, "flowchart", node.id, revision, "assignment", symbolByName, diagnostics);
        if (!expression) return stopId;
        destination.statements.push(recordStatement(builder, {
          id: stableAstId("flowchart", node.id, "assignment"), kind: "Assignment", symbolId: targetSymId || payload.symbolId, expression,
        }, node.id));
      } else if (node.kind === "output") {
        if (payload.mode === "formatted") {
          const expression = parseWithDiagnostic(builder, payload.expression, "flowchart", node.id, revision, "output", symbolByName, diagnostics);
          if (!expression) return stopId;
          destination.statements.push(recordStatement(builder, {
            id: stableAstId("flowchart", node.id, "output"), kind: "Output", mode: "formatted", message: payload.message, value: expression,
          }, node.id));
        } else if (payload.mode === "message") {
          destination.statements.push(recordStatement(builder, {
            id: stableAstId("flowchart", node.id, "output"), kind: "Output", mode: "message", message: payload.message,
          }, node.id));
        } else {
          const expression = parseWithDiagnostic(builder, payload.expression, "flowchart", node.id, revision, "output", symbolByName, diagnostics);
          if (!expression) return stopId;
          destination.statements.push(recordStatement(builder, {
            id: stableAstId("flowchart", node.id, "output"), kind: "Output", mode: "value", value: expression,
          }, node.id));
        }
      } else if (node.kind === "decision") {
        const branches = outgoing.get(node.id) || [];
        const trueEdge = branches.find((edge) => edge.branch === "true");
        const falseEdge = branches.find((edge) => edge.branch === "false");
        let joinId = nearestJoin(trueEdge.to, falseEdge.to, outgoing, postDominators);
        if (!joinId) {
          if (allPathsLeadToEnd(trueEdge.to) && allPathsLeadToEnd(falseEdge.to)) {
            joinId = null;
          } else {
            diagnostics.push(adapterDiagnostic("GRAPH_JOIN_AMBIGUOUS", "semantics", `Decision “${node.id}” has no unique nearest common post-dominator.`, "flowchart", node.id, revision,
              "Connect both decision paths to one unambiguous join before continuing."));
            return stopId;
          }
        }
        const condition = parseWithDiagnostic(builder, payload.condition, "flowchart", node.id, revision, "condition", symbolByName, diagnostics);
        if (!condition) return stopId;
        const trueBlock = builder.block(node.id, "then", [node.id, trueEdge.id, ...(joinId ? [joinId] : [])]);
        const falseBlock = builder.block(node.id, "else", [node.id, falseEdge.id, ...(joinId ? [joinId] : [])]);
        compileUntil(trueEdge.to, joinId, trueBlock, new Set(active), trueEdge);
        compileUntil(falseEdge.to, joinId, falseBlock, new Set(active), falseEdge);
        destination.statements.push(recordStatement(builder, {
          id: stableAstId("flowchart", node.id, "conditional"), kind: "IfStatement", condition,
          thenBlock: trueBlock, elseBlock: falseBlock,
        }, node.id));
        if (!joinId) {
          nodeId = null;
          break;
        }
        nodeId = joinId;
        continue;
      }
      const edge = (outgoing.get(node.id) ?? [])[0];
      if (!edge) return stopId;
      incomingEdge = edge;
      nodeId = edge.to;
    }
    return nodeId;
  }

  compileUntil(currentId, null, body, new Set());
  if (diagnostics.length) return adapterResult(null, diagnostics);
  if (consumed.size !== flowchart.nodes.length) {
    const remaining = flowchart.nodes.find((node) => !consumed.has(node.id));
    return adapterResult(null, [adapterDiagnostic("GRAPH_JOIN_AMBIGUOUS", "semantics", `Block “${remaining.id}” was not assigned to a unique structured path.`, "flowchart", remaining.id, revision)]);
  }
  const ast = builder.finish(body, symbols);
  return adapterResult(ast, []);
}
