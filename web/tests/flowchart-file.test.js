import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFlowchartContract } from "../core/contract-validation.js";
import {
  FlowchartFileError,
  migrateFlowchart,
  parseFlowchartFile,
  serializeFlowchartFile,
} from "../core/flowchart-file.js";

const makeFlowchart = (nodes, edges = []) => ({
  schemaVersion: "1.0.0",
  revision: 1,
  nodes,
  edges: edges.length > 0 ? edges : [
    { id: "e-start-end", from: nodes[0]?.id || "start", to: nodes[nodes.length - 1]?.id || "end" },
  ],
  layout: {
    positions: Object.fromEntries(nodes.map((n, i) => [n.id, { x: 100, y: i * 100 }])),
    zoom: 1,
  },
});

test("validates all 7 supported node types against the contract schema", () => {
  const nodes = [
    { id: "start-1", kind: "start", payload: {} },
    { id: "init-1", kind: "initialization", payload: { symbolId: "symbol-val", name: "val", type: "int", initializer: "10" } },
    { id: "in-1", kind: "input", payload: { symbolId: "symbol-x", name: "x", type: "int", prompt: "Enter x: " } },
    { id: "proc-1", kind: "process", payload: { operation: "assignment", symbolId: "symbol-y", expression: "x + val" } },
    { id: "proc-decl", kind: "process", payload: { operation: "declaration", symbolId: "symbol-z", name: "z", type: "double", initializer: "0.5" } },
    { id: "dec-1", kind: "decision", payload: { condition: "x > 0" } },
    { id: "out-msg", kind: "output", payload: { outputId: "out-1", mode: "message", message: "Hello" } },
    { id: "out-expr", kind: "output", payload: { outputId: "out-2", mode: "expression", expression: "y * 2" } },
    { id: "out-fmt", kind: "output", payload: { outputId: "out-3", mode: "formatted", message: "Answer: ", expression: "y" } },
    { id: "end-1", kind: "end", payload: {} },
  ];

  const edges = [
    { id: "e1", from: "start-1", to: "init-1" },
    { id: "e2", from: "init-1", to: "in-1" },
    { id: "e3", from: "in-1", to: "proc-1" },
    { id: "e4", from: "proc-1", to: "proc-decl" },
    { id: "e5", from: "proc-decl", to: "dec-1" },
    { id: "e6", from: "dec-1", to: "out-msg", branch: "true" },
    { id: "e7", from: "dec-1", to: "out-expr", branch: "false" },
    { id: "e8", from: "out-msg", to: "out-fmt" },
    { id: "e9", from: "out-expr", to: "end-1" },
    { id: "e10", from: "out-fmt", to: "end-1" },
  ];

  const flowchart = makeFlowchart(nodes, edges);
  const diagnostics = validateFlowchartContract(flowchart);
  assert.equal(diagnostics.length, 0, `Expected 0 diagnostics, got: ${JSON.stringify(diagnostics)}`);
});

test("rejects invalid payloads: missing required fields", () => {
  // Input node missing prompt
  const missingPromptFlow = makeFlowchart([
    { id: "start-1", kind: "start", payload: {} },
    { id: "in-1", kind: "input", payload: { symbolId: "symbol-x", name: "x", type: "int" } },
    { id: "end-1", kind: "end", payload: {} },
  ], [
    { id: "e1", from: "start-1", to: "in-1" },
    { id: "e2", from: "in-1", to: "end-1" },
  ]);
  const diagsPrompt = validateFlowchartContract(missingPromptFlow);
  assert.ok(diagsPrompt.length > 0);
  assert.ok(diagsPrompt.some((d) => d.message.includes("missing required property “prompt”")));

  // Initialization node missing initializer
  const missingInitFlow = makeFlowchart([
    { id: "start-1", kind: "start", payload: {} },
    { id: "init-1", kind: "initialization", payload: { symbolId: "symbol-n", name: "n", type: "int" } },
    { id: "end-1", kind: "end", payload: {} },
  ], [
    { id: "e1", from: "start-1", to: "init-1" },
    { id: "e2", from: "init-1", to: "end-1" },
  ]);
  const diagsInit = validateFlowchartContract(missingInitFlow);
  assert.ok(diagsInit.length > 0);
  assert.ok(diagsInit.some((d) => d.message.includes("missing required property “initializer”")));

  // Decision node missing condition
  const missingCondFlow = makeFlowchart([
    { id: "start-1", kind: "start", payload: {} },
    { id: "dec-1", kind: "decision", payload: {} },
    { id: "end-1", kind: "end", payload: {} },
  ], [
    { id: "e1", from: "start-1", to: "dec-1" },
    { id: "e2", from: "dec-1", to: "end-1", branch: "true" },
    { id: "e3", from: "dec-1", to: "end-1", branch: "false" },
  ]);
  const diagsCond = validateFlowchartContract(missingCondFlow);
  assert.ok(diagsCond.length > 0);
  assert.ok(diagsCond.some((d) => d.message.includes("missing required property “condition”")));
});

test("rejects unsupported additional fields on node payloads", () => {
  const badStartFlow = makeFlowchart([
    { id: "start-1", kind: "start", payload: { unexpected: true } },
    { id: "end-1", kind: "end", payload: {} },
  ]);
  const diags = validateFlowchartContract(badStartFlow);
  assert.ok(diags.length > 0);
  assert.ok(diags.some((d) => d.message.includes("unsupported property “unexpected”") || d.message.includes("payload must be empty")));

  const badProcessFlow = makeFlowchart([
    { id: "start-1", kind: "start", payload: {} },
    { id: "p-1", kind: "process", payload: { operation: "assignment", symbolId: "symbol-x", expression: "1", target: "x" } },
    { id: "end-1", kind: "end", payload: {} },
  ], [
    { id: "e1", from: "start-1", to: "p-1" },
    { id: "e2", from: "p-1", to: "end-1" },
  ]);
  const diagsProc = validateFlowchartContract(badProcessFlow);
  assert.ok(diagsProc.length > 0);
  assert.ok(diagsProc.some((d) => d.message.includes("unsupported property “target”")));
});

test("rejects invalid node-kind values with a single clear diagnostic", () => {
  const invalidKindFlow = makeFlowchart([
    { id: "start-1", kind: "start", payload: {} },
    { id: "unknown-1", kind: "custom_transform", payload: {} },
    { id: "end-1", kind: "end", payload: {} },
  ], [
    { id: "e1", from: "start-1", to: "unknown-1" },
    { id: "e2", from: "unknown-1", to: "end-1" },
  ]);
  const diags = validateFlowchartContract(invalidKindFlow);
  assert.ok(diags.length >= 1);
  assert.ok(diags.some((d) => d.message.includes("unsupported kind “custom_transform”")));
});

test("prevents oneOf diagnostic explosion: single node defect generates concise errors, not 41+ spam", () => {
  // A process node missing symbolId
  const singleDefectFlow = makeFlowchart([
    { id: "start-1", kind: "start", payload: {} },
    { id: "calc-1", kind: "process", payload: { operation: "assignment", expression: "x + 1" } },
    { id: "end-1", kind: "end", payload: {} },
  ], [
    { id: "e1", from: "start-1", to: "calc-1" },
    { id: "e2", from: "calc-1", to: "end-1" },
  ]);

  const diags = validateFlowchartContract(singleDefectFlow);
  // Before fix, this generated 41 errors. Now it must be concise and actionable.
  assert.ok(diags.length <= 2, `Expected <= 2 diagnostics for single defect, got ${diags.length}`);
  assert.ok(diags.some((d) => d.message.includes("calc-1") && d.message.includes("symbolId")));

  // Verify that false branch errors from other node types do NOT appear
  assert.ok(!diags.some((d) => d.message.includes("must be equal to constant")));
  assert.ok(!diags.some((d) => d.message.includes("must match exactly one schema in oneOf")));
});

test("round-trips valid .fc file through save and load without loss of information", () => {
  const original = makeFlowchart([
    { id: "start-1", kind: "start", payload: {} },
    { id: "in-1", kind: "input", payload: { symbolId: "symbol-num", name: "num", type: "int", prompt: "Enter number: " } },
    { id: "proc-1", kind: "process", payload: { operation: "assignment", symbolId: "symbol-res", expression: "num * 2" } },
    { id: "out-1", kind: "output", payload: { outputId: "out-res", mode: "formatted", message: "Double: ", expression: "res" } },
    { id: "end-1", kind: "end", payload: {} },
  ], [
    { id: "e1", from: "start-1", to: "in-1" },
    { id: "e2", from: "in-1", to: "proc-1" },
    { id: "e3", from: "proc-1", to: "out-1" },
    { id: "e4", from: "out-1", to: "end-1" },
  ]);

  const serialized = serializeFlowchartFile(original);
  assert.equal(typeof serialized, "string");
  assert.ok(serialized.includes('"schemaVersion": "1.0.0"'));

  const parsed = parseFlowchartFile(serialized);
  assert.deepEqual(parsed, original);
});

test("migrates legacy / unversioned flowchart files into valid canonical .fc structure", () => {
  // Legacy format: missing schemaVersion, process node with raw target/expression without operation
  const legacy = {
    revision: 1,
    nodes: [
      { id: "start-1", kind: "start", payload: {} },
      { id: "p-1", kind: "process", payload: { target: "total", expression: "a + b" } },
      { id: "init-1", kind: "initialization", payload: { name: "pi", type: "double" } },
      { id: "out-1", kind: "output", payload: { mode: "formatted", message: "Total is" } },
      { id: "end-1", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start-1", to: "p-1" },
      { id: "e2", from: "p-1", to: "init-1" },
      { id: "e3", from: "init-1", to: "out-1" },
      { id: "e4", from: "out-1", to: "end-1" },
    ],
  };

  const migrated = migrateFlowchart(legacy);
  assert.equal(migrated.schemaVersion, "1.0.0");
  assert.equal(migrated.nodes[1].payload.operation, "assignment");
  assert.equal(migrated.nodes[1].payload.symbolId, "symbol-total");
  assert.equal(migrated.nodes[1].payload.expression, "a + b");
  assert.equal(migrated.nodes[2].payload.initializer, "0");
  assert.equal(migrated.nodes[3].payload.expression, "0");

  const diags = validateFlowchartContract(migrated);
  assert.equal(diags.length, 0, `Migrated flowchart must be valid, got: ${JSON.stringify(diags)}`);
});

test("parseFlowchartFile automatically migrates and validates older JSON text", () => {
  const legacyText = JSON.stringify({
    nodes: [
      { id: "start-1", kind: "start", payload: {} },
      { id: "p-1", kind: "process", payload: { target: "x", expression: "10" } },
      { id: "end-1", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start-1", to: "p-1" },
      { id: "e2", from: "p-1", to: "end-1" },
    ],
  });

  const parsed = parseFlowchartFile(legacyText);
  assert.equal(parsed.schemaVersion, "1.0.0");
  assert.equal(parsed.nodes[1].payload.operation, "assignment");
  assert.equal(parsed.nodes[1].payload.symbolId, "symbol-x");
  assert.equal(parsed.nodes[1].payload.expression, "10");
});

test("serializeFlowchartFile throws FlowchartFileError when given invalid flowchart", () => {
  const invalid = {
    schemaVersion: "1.0.0",
    revision: 1,
    nodes: [{ id: "n1", kind: "unknown", payload: {} }],
    edges: [],
    layout: { positions: {}, zoom: 1 },
  };

  assert.throws(
    () => serializeFlowchartFile(invalid),
    (err) => err instanceof FlowchartFileError && err.diagnostics.length > 0
  );
});
