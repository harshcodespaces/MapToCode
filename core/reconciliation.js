import { validateAstSemantics } from "./ast-validation.js";
import { createDiagnostic } from "./diagnostics.js";

export const CANONICALIZER_VERSION = "1.0.0";

export function canonicalizeAst(ast) {
  const validation = validateAstSemantics(ast);
  if (!validation.valid) return { status: "invalid", canonical: null, diagnostics: validation.diagnostics, sourcePaths: new Map() };
  const symbols = new Map(ast.symbols.map((symbol) => [symbol.id, symbol]));
  const provenance = new Map(ast.provenance.map((entry) => [entry.astNodeId, entry.origins]));
  const sourcePaths = new Map();
  const nodePaths = new Map();

  function expression(node, path) {
    nodePaths.set(node.id, path);
    sourcePaths.set(path, provenance.get(node.id) ?? []);
    if (["IntegerLiteral", "FloatingLiteral", "CharacterLiteral"].includes(node.kind)) return { kind: node.kind, value: node.value };
    if (node.kind === "VariableReference") {
      const symbol = symbols.get(node.symbolId);
      return symbol ? { kind: node.kind, name: symbol.name, type: symbol.type } : null;
    }
    if (node.kind === "UnaryExpression") return { kind: node.kind, operator: node.operator, operand: expression(node.operand, `${path}/operand`) };
    if (node.kind === "BinaryExpression") return {
      kind: node.kind, operator: node.operator,
      left: expression(node.left, `${path}/left`), right: expression(node.right, `${path}/right`),
    };
    return null;
  }

  function block(node, path) {
    nodePaths.set(node.id, path);
    sourcePaths.set(path, provenance.get(node.id) ?? []);
    return { kind: "Block", statements: node.statements.map((statement, index) => visit(statement, `${path}/statements/${index}`)) };
  }

  function visit(node, path) {
    nodePaths.set(node.id, path);
    sourcePaths.set(path, provenance.get(node.id) ?? []);
    if (node.kind === "VariableDeclaration") {
      const symbol = symbols.get(node.symbolId);
      return { kind: node.kind, name: symbol.name, type: symbol.type, ...(node.initializer ? { initializer: expression(node.initializer, `${path}/initializer`) } : {}) };
    }
    if (node.kind === "Input") {
      const symbol = symbols.get(node.symbolId);
      return { kind: node.kind, name: symbol.name, type: symbol.type, prompt: node.prompt };
    }
    if (node.kind === "Assignment") {
      const symbol = symbols.get(node.symbolId);
      return { kind: node.kind, name: symbol.name, expression: expression(node.expression, `${path}/expression`) };
    }
    if (node.kind === "Output") return node.mode === "message"
      ? { kind: node.kind, mode: "message", message: node.message }
      : node.mode === "formatted"
        ? { kind: node.kind, mode: "formatted", message: node.message, value: expression(node.value, `${path}/value`) }
        : { kind: node.kind, mode: "value", value: expression(node.value, `${path}/value`) };
    if (node.kind === "IfStatement") return {
      kind: node.kind,
      condition: expression(node.condition, `${path}/condition`),
      thenBlock: block(node.thenBlock, `${path}/thenBlock`),
      elseBlock: block(node.elseBlock, `${path}/elseBlock`),
    };
    return null;
  }

  return { status: "canonical", canonical: block(ast.body, "/body"), diagnostics: [], sourcePaths, nodePaths };
}

function stableFindingId(path, left, right) {
  const text = JSON.stringify([path, left, right]);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `finding-${hash.toString(16).padStart(16, "0")}`;
}

function compareValues(left, right, path, differences) {
  if (Object.is(left, right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index += 1) compareValues(left[index], right[index], `${path}/${index}`, differences);
    if (left.length !== right.length) differences.push({ path, specificationValue: left.slice(sharedLength), flowchartValue: right.slice(sharedLength) });
    return;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) differences.push({ path: `${path}/${key}`, specificationValue: left[key], flowchartValue: right[key] });
      else compareValues(left[key], right[key], `${path}/${key}`, differences);
    }
    return;
  }
  differences.push({ path, specificationValue: left, flowchartValue: right });
}

function sourceRefsAt(path, sourcePaths) {
  let candidate = path;
  while (candidate) {
    const refs = sourcePaths.get(candidate);
    if (refs?.length) return refs;
    candidate = candidate.slice(0, candidate.lastIndexOf("/"));
  }
  return [];
}

function adapterIsKnown(ast) {
  return ast.provenance.every((entry) => entry.adapterVersion === "1.0.0");
}

export function reconcileAstCandidates(specificationCandidate, flowchartCandidate, { canonicalizerVersion = CANONICALIZER_VERSION } = {}) {
  if (!specificationCandidate?.ast || !flowchartCandidate?.ast) {
    const diagnostic = createDiagnostic({
      code: "RECON_INPUT_INVALID", category: "reconciliation",
      message: "Both the guided specification and flowchart must produce AST candidates before comparison.",
    });
    return { status: "invalid", findings: [], diagnostics: [diagnostic], unresolvedCount: 0, canonicalizerVersion };
  }

  const specification = canonicalizeAst(specificationCandidate.ast);
  const flowchart = canonicalizeAst(flowchartCandidate.ast);
  if (specification.status === "invalid" || flowchart.status === "invalid") {
    const diagnostic = createDiagnostic({
      code: "RECON_INPUT_INVALID", category: "reconciliation",
      message: "At least one AST candidate failed static validation, so the inputs cannot be compared yet.",
    });
    return {
      status: "invalid", findings: [],
      diagnostics: [...specification.diagnostics, ...flowchart.diagnostics, diagnostic],
      unresolvedCount: 0, canonicalizerVersion,
    };
  }

  if (canonicalizerVersion !== CANONICALIZER_VERSION
      || !adapterIsKnown(specificationCandidate.ast)
      || !adapterIsKnown(flowchartCandidate.ast)) {
    const diagnostic = createDiagnostic({
      code: "RECON_CANONICALIZATION_UNKNOWN", severity: "warning", category: "reconciliation",
      message: "The comparison rules do not support one of the adapter or canonicalizer versions, so equivalence is unknown.",
    });
    return { status: "unknown", findings: [], diagnostics: [diagnostic], unresolvedCount: 1, canonicalizerVersion };
  }

  const differences = [];
  compareValues(specification.canonical, flowchart.canonical, "/body", differences);
  const findings = differences.map((difference) => {
    const specificationSourceRefs = sourceRefsAt(difference.path, specification.sourcePaths);
    const flowchartSourceRefs = sourceRefsAt(difference.path, flowchart.sourcePaths);
    const id = stableFindingId(difference.path, difference.specificationValue, difference.flowchartValue);
    const diagnostic = createDiagnostic({
      code: "RECON_CONFLICT", category: "reconciliation",
      message: `The authored inputs differ at ${difference.path}.`,
      sourceRefs: [...specificationSourceRefs, ...flowchartSourceRefs],
      suggestion: "Edit one or both source documents, then compare them again.",
    });
    return { id, ...difference, specificationSourceRefs, flowchartSourceRefs, diagnostic };
  });
  return {
    status: findings.length ? "conflict" : "equivalent",
    findings,
    diagnostics: findings.map((finding) => finding.diagnostic),
    unresolvedCount: findings.length,
    canonicalizerVersion,
    revisions: {
      specification: specificationCandidate.ast.provenance[0]?.origins.find((origin) => origin.sourceKind === "specification")?.sourceRevision ?? null,
      flowchart: flowchartCandidate.ast.provenance[0]?.origins.find((origin) => origin.sourceKind === "flowchart")?.sourceRevision ?? null,
    },
  };
}
