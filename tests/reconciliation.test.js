import test from "node:test";
import assert from "node:assert/strict";
import { adaptFlowchartToAst, adaptSpecificationToAst } from "../core/adapters.js";
import { reconcileAstCandidates } from "../core/reconciliation.js";

const spec = {
  schemaVersion: "1.0.0", revision: 2,
  inputs: [{ id: "spec-age", name: "age", type: "int" }],
  outputs: [{ id: "yes-output", description: "True result" }, { id: "no-output", description: "False result" }],
  variables: [],
  steps: [
    { id: "get-age", kind: "input", payload: { inputId: "spec-age", prompt: "Age: " } },
    { id: "adult-check", kind: "conditional", payload: { condition: "age >= 18", whenTrue: [
      { id: "adult", kind: "output", payload: { outputId: "yes-output", mode: "message", message: "Adult" } },
    ], whenFalse: [
      { id: "minor", kind: "output", payload: { outputId: "no-output", mode: "message", message: "Minor" } },
    ] } },
  ], constraints: [], examples: [],
};
const graph = {
  schemaVersion: "1.0.0", revision: 5,
  nodes: [
    { id: "begin", kind: "start", payload: {} },
    { id: "input", kind: "input", payload: { symbolId: "graph-age", name: "age", type: "int", prompt: "Age: " } },
    { id: "decision", kind: "decision", payload: { condition: "age >= 18" } },
    { id: "yes", kind: "output", payload: { outputId: "g-yes", mode: "message", message: "Adult" } },
    { id: "no", kind: "output", payload: { outputId: "g-no", mode: "message", message: "Minor" } },
    { id: "end", kind: "end", payload: {} },
  ],
  edges: [
    { id: "a", from: "begin", to: "input" }, { id: "b", from: "input", to: "decision" },
    { id: "c", from: "decision", to: "yes", branch: "true" }, { id: "d", from: "decision", to: "no", branch: "false" },
    { id: "e", from: "yes", to: "end" }, { id: "f", from: "no", to: "end" },
  ],
  layout: { positions: {}, zoom: 1 },
};

function candidates(currentSpec = spec, currentGraph = graph) {
  return [adaptSpecificationToAst(currentSpec), adaptFlowchartToAst(currentGraph)];
}

test("independently authored matching inputs reconcile as equivalent", () => {
  const result = reconcileAstCandidates(...candidates());
  assert.equal(result.status, "equivalent");
  assert.equal(result.unresolvedCount, 0);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.revisions, { specification: 2, flowchart: 5 });
});

test("a known operator mismatch produces a stable conflict and source trace", () => {
  const changedGraph = structuredClone(graph);
  changedGraph.nodes.find(({ id }) => id === "decision").payload.condition = "age > 18";
  const result = reconcileAstCandidates(...candidates(spec, changedGraph));
  const repeated = reconcileAstCandidates(...candidates(spec, changedGraph));
  assert.equal(result.status, "conflict");
  assert.ok(result.findings.some(({ path }) => path.endsWith("/operator")));
  assert.equal(result.findings[0].id, repeated.findings[0].id);
  assert.ok(result.findings[0].specificationSourceRefs.some(({ sourceKind }) => sourceKind === "specification"));
  assert.ok(result.findings[0].flowchartSourceRefs.some(({ sourceKind }) => sourceKind === "flowchart"));
  assert.equal(result.unresolvedCount, result.findings.length);
});

test("unsupported comparison-rule versions return unknown instead of equivalent", () => {
  const result = reconcileAstCandidates(...candidates(), { canonicalizerVersion: "99.0.0" });
  assert.equal(result.status, "unknown");
  assert.ok(result.diagnostics.some(({ code }) => code === "RECON_CANONICALIZATION_UNKNOWN"));
});

test("missing and invalid AST candidates produce invalid reconciliation", () => {
  assert.equal(reconcileAstCandidates(null, null).status, "invalid");
  const [first, second] = candidates();
  const invalid = structuredClone(second);
  invalid.ast.symbols[0].type = "not-a-type";
  const result = reconcileAstCandidates(first, invalid);
  assert.equal(result.status, "invalid");
  assert.ok(result.diagnostics.some(({ code }) => code === "RECON_INPUT_INVALID"));
});

test("conflicts in output content are not hidden by matching control flow", () => {
  const changed = structuredClone(graph);
  changed.nodes.find(({ id }) => id === "yes").payload.message = "Eligible";
  const report = reconcileAstCandidates(...candidates(spec, changed));
  assert.equal(report.status, "conflict");
  assert.ok(report.findings.some(({ path }) => path.endsWith("/message")));
});
