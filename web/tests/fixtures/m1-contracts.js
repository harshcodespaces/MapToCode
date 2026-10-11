export const validProjectEnvelope = {
  schemaVersion: "1.0.0",
  projectId: "5f0a5f3c-1d9a-4f99-a134-9194f0ae4123",
  name: "Compare two values",
  specification: {
    schemaVersion: "1.0.0", revision: 0,
    inputs: [], outputs: [], variables: [], steps: [], constraints: [], examples: [],
  },
  flowchart: {
    schemaVersion: "1.0.0", revision: 0, nodes: [], edges: [], layout: { positions: {}, zoom: 1 },
  },
  decisions: [],
  revisions: { semantic: 0, presentation: 0 },
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

export const validAstCandidate = {
  irVersion: "1.0.0",
  programId: "program-compare-two-values",
  body: { id: "block-root", kind: "Block", statements: [] },
  symbols: [],
  provenance: [],
};

// Negative examples are kept as source data so validator tests can assert the
// exact diagnostic code when the corresponding core phase is implemented.
export const invalidCases = [
  { name: "unsupported specification version", layer: "specification", mutate: (value) => ({ ...value, schemaVersion: "9.0.0" }), expectedCode: "SPEC_SCHEMA_INVALID" },
  { name: "dangling graph edge", layer: "flowchart", mutate: (value) => ({ ...value, edges: [{ id: "edge-missing", from: "absent-a", to: "absent-b" }] }), expectedCode: "GRAPH_DANGLING_EDGE" },
  { name: "undeclared AST symbol", layer: "ast", expectedCode: "SYMBOL_UNDECLARED" },
  { name: "unknown equivalence", layer: "reconciliation", expectedCode: "RECON_EQUIVALENCE_UNKNOWN" },
];
