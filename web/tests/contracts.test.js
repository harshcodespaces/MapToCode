import { test } from "node:test";
import assert from "node:assert/strict";
import { astSchema, CONTRACT_VERSION, diagnosticSchema, flowchartSchema, projectSchema, specificationSchema } from "../core/contracts.js";
import { createDiagnostic, DIAGNOSTIC_CODES } from "../core/diagnostics.js";
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

test("phase-one fixtures identify required negative coverage without claiming validation", () => {
  assert.deepEqual(invalidCases.map(({ expectedCode }) => expectedCode), [
    "SPEC_SCHEMA_INVALID", "GRAPH_DANGLING_EDGE", "SYMBOL_UNDECLARED", "RECON_EQUIVALENCE_UNKNOWN",
  ]);
  assert.equal(validProjectEnvelope.flowchart.layout.zoom, 1);
  assert.equal(validAstCandidate.body.kind, "Block");
});
