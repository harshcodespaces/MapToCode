import { test } from "node:test";
import assert from "node:assert/strict";
import { astSchema, CONTRACT_VERSION, diagnosticSchema, flowchartSchema, projectSchema, specificationSchema } from "../core/contracts.js";
import { createDiagnostic, DIAGNOSTIC_CODES } from "../core/diagnostics.js";
import { validateAstContract, validateDiagnosticContract, validateFlowchartContract, validateProjectContract, validateSpecificationContract } from "../core/contract-validation.js";
import { invalidCases, validAstCandidate, validProjectEnvelope } from "./fixtures/m1-contracts.js";

test("M1 contract documents declare versions and closed top-level objects", () => {
  for (const schema of [astSchema, diagnosticSchema, flowchartSchema, projectSchema, specificationSchema]) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.match(schema.$id, /\/1\.0\.0$/);
  }
  assert.equal(CONTRACT_VERSION, "1.0.0");
  assert.equal(validProjectEnvelope.schemaVersion, CONTRACT_VERSION);
  assert.equal(validAstCandidate.irVersion, "1.0.0");
});

test("diagnostic registry creates stable versioned diagnostics and rejects unknown codes", () => {
  const diagnostic = createDiagnostic({ code: "GRAPH_DANGLING_EDGE", category: "structure", message: "An edge endpoint is missing." });
  assert.deepEqual(diagnostic, {
    code: "GRAPH_DANGLING_EDGE", severity: "error", category: "structure",
    message: "An edge endpoint is missing.", sourceRefs: [], ruleVersion: "1.0.0",
  });
  assert.ok(Object.hasOwn(DIAGNOSTIC_CODES, "GEN_STALE_APPROVAL"));
  assert.throws(() => createDiagnostic({ code: "NOT_A_REAL_CODE", category: "structure", message: "No." }), /Unknown diagnostic code/);
});

test("runtime contract validators accept complete versioned fixtures", () => {
  assert.deepEqual(validateProjectContract(validProjectEnvelope), []);
  assert.deepEqual(validateFlowchartContract(validProjectEnvelope.flowchart), []);
  assert.deepEqual(validateSpecificationContract(validProjectEnvelope.specification), []);
  assert.deepEqual(validateAstContract(validAstCandidate), []);
  assert.equal(validProjectEnvelope.flowchart.layout.zoom, 1);
  assert.equal(validAstCandidate.body.kind, "Block");
});

test("project imports reject unknown fields and malformed IDs or timestamps", () => {
  assert.ok(validateProjectContract({ ...validProjectEnvelope, injected: true }).some(({ code }) => code === "PROJECT_SCHEMA_INVALID"));
  assert.ok(validateProjectContract({ ...validProjectEnvelope, projectId: "not-a-uuid" }).some(({ code }) => code === "PROJECT_SCHEMA_INVALID"));
  assert.ok(validateProjectContract({ ...validProjectEnvelope, updatedAt: "yesterday" }).some(({ code }) => code === "PROJECT_SCHEMA_INVALID"));
});

test("schema validation closes nested flowchart payloads and specification operations", () => {
  const badGraph = structuredClone(validProjectEnvelope.flowchart);
  badGraph.nodes[0].payload.injected = "unexpected";
  assert.ok(validateFlowchartContract(badGraph).some(({ code }) => code === "GRAPH_SCHEMA_INVALID"));

  const badSpecification = structuredClone(validProjectEnvelope.specification);
  badSpecification.steps.push({ id: "bad", kind: "assignment", payload: { targetId: "x", expression: "1", extra: true } });
  assert.ok(validateSpecificationContract(badSpecification).some(({ code }) => code === "SPEC_SCHEMA_INVALID"));
});

test("flowchart validation diagnoses dangling edges, incomplete branches, and cycles", () => {
  const dangling = structuredClone(validProjectEnvelope.flowchart);
  dangling.edges[0].to = "missing";
  assert.ok(validateFlowchartContract(dangling).some(({ code }) => code === "GRAPH_DANGLING_EDGE"));

  const branch = {
    schemaVersion: "1.0.0", revision: 0,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "decision", kind: "decision", payload: { condition: "1 < 2" } },
      { id: "end", kind: "end", payload: {} },
    ],
    edges: [{ id: "a", from: "start", to: "decision" }, { id: "b", from: "decision", to: "end", branch: "true" }],
    layout: { positions: { start: { x: 1, y: 1 }, decision: { x: 1, y: 2 }, end: { x: 1, y: 3 } }, zoom: 1 },
  };
  assert.ok(validateFlowchartContract(branch).some(({ code }) => code === "GRAPH_BRANCH_INVALID"));

  const cycle = structuredClone(validProjectEnvelope.flowchart);
  cycle.nodes.splice(1, 0, { id: "process", kind: "process", payload: { operation: "assignment", symbolId: "x", expression: "1" } });
  cycle.edges = [{ id: "a", from: "start", to: "process" }, { id: "b", from: "process", to: "start" }, { id: "c", from: "process", to: "end" }];
  cycle.layout.positions.process = { x: 32, y: 96 };
  assert.ok(validateFlowchartContract(cycle).some(({ code }) => code === "GRAPH_UNSUPPORTED_CYCLE"));
});

test("diagnostic data is checked against its versioned contract", () => {
  const valid = createDiagnostic({ code: "GRAPH_DANGLING_EDGE", category: "structure", message: "An endpoint is missing." });
  assert.deepEqual(validateDiagnosticContract(valid), []);
  assert.ok(validateDiagnosticContract({ ...valid, severity: "fatal" }).some(({ code }) => code === "DIAGNOSTIC_SCHEMA_INVALID"));
});

test("flowchart validation accepts multiple End blocks and rejects zero End blocks", () => {
  const noEnd = {
    schemaVersion: "1.0.0", revision: 0,
    nodes: [{ id: "start", kind: "start", payload: {} }],
    edges: [],
    layout: { positions: { start: { x: 1, y: 1 } }, zoom: 1 },
  };
  assert.ok(validateFlowchartContract(noEnd).some(({ code }) => code === "GRAPH_ENTRYPOINT_INVALID"));

  const multiEnd = {
    schemaVersion: "1.0.0", revision: 0,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "decision", kind: "decision", payload: { condition: "1 < 2" } },
      { id: "end1", kind: "end", payload: {} },
      { id: "end2", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start", to: "decision" },
      { id: "e2", from: "decision", to: "end1", branch: "true" },
      { id: "e3", from: "decision", to: "end2", branch: "false" },
    ],
    layout: { positions: { start: { x: 1, y: 1 }, decision: { x: 1, y: 2 }, end1: { x: 0, y: 3 }, end2: { x: 2, y: 3 } }, zoom: 1 },
  };
  assert.deepEqual(validateFlowchartContract(multiEnd), []);
});

test("fixture inventory includes invalid examples for later M1 phases", () => {
  assert.deepEqual(invalidCases.map(({ expectedCode }) => expectedCode), [
    "SPEC_SCHEMA_INVALID", "GRAPH_DANGLING_EDGE", "SYMBOL_UNDECLARED", "RECON_EQUIVALENCE_UNKNOWN",
  ]);
});
