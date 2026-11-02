import test from "node:test";
import assert from "node:assert/strict";
import { adaptFlowchartToAst, adaptSpecificationToAst } from "../core/adapters.js";
import { validateAstSemantics } from "../core/ast-validation.js";

const specification = {
  schemaVersion: "1.0.0",
  revision: 4,
  inputs: [{ id: "input-age", name: "age", type: "int" }],
  outputs: [{ id: "adult-output", description: "Adult message" }, { id: "minor-output", description: "Minor message" }],
  variables: [],
  steps: [
    { id: "read-age", kind: "input", payload: { inputId: "input-age", prompt: "Enter age: " } },
    {
      id: "check-age", kind: "conditional", payload: { condition: "age >= 18", whenTrue: [
        { id: "say-adult", kind: "output", payload: { outputId: "adult-output", mode: "message", message: "Adult" } },
      ], whenFalse: [
        { id: "say-minor", kind: "output", payload: { outputId: "minor-output", mode: "message", message: "Minor" } },
      ] },
    },
  ],
  constraints: [],
  examples: [],
};

const flowchart = {
  schemaVersion: "1.0.0",
  revision: 7,
  nodes: [
    { id: "start", kind: "start", payload: {} },
    { id: "read-age", kind: "input", payload: { symbolId: "symbol-age", name: "age", type: "int", prompt: "Enter age: " } },
    { id: "check-age", kind: "decision", payload: { condition: "age >= 18" } },
    { id: "say-adult", kind: "output", payload: { outputId: "adult-output", mode: "message", message: "Adult" } },
    { id: "say-minor", kind: "output", payload: { outputId: "minor-output", mode: "message", message: "Minor" } },
    { id: "finish", kind: "end", payload: {} },
  ],
  edges: [
    { id: "e1", from: "start", to: "read-age" },
    { id: "e2", from: "read-age", to: "check-age" },
    { id: "e3", from: "check-age", to: "say-adult", branch: "true" },
    { id: "e4", from: "check-age", to: "say-minor", branch: "false" },
    { id: "e5", from: "say-adult", to: "finish" },
    { id: "e6", from: "say-minor", to: "finish" },
  ],
  layout: { positions: {}, zoom: 1 },
};

test("guided specification adapter emits the shared Typed AST with provenance", () => {
  const result = adaptSpecificationToAst(specification, { projectId: "project-42" });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.ast.programId, "project-42");
  assert.equal(result.ast.body.statements[2].kind, "IfStatement");
  assert.equal(result.ast.body.statements[2].condition.kind, "BinaryExpression");
  assert.equal(result.ast.body.statements[2].condition.left.symbolId, "input-age");
  assert.ok(result.ast.provenance.every(({ origins }) => origins.length > 0));
  assert.deepEqual(validateAstSemantics(result.ast).diagnostics, []);
});

test("flowchart adapter builds equivalent AST independent of layout positions", () => {
  const first = adaptFlowchartToAst(flowchart, { projectId: "shared-project" });
  const moved = structuredClone(flowchart);
  moved.layout.positions = { start: { x: 900, y: 10 }, "read-age": { x: 12, y: 400 } };
  moved.layout.zoom = 0.6;
  const second = adaptFlowchartToAst(moved, { projectId: "shared-project" });
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(second.diagnostics, []);
  assert.deepEqual(first.ast, second.ast);
  assert.equal(first.ast.body.statements[2].kind, "IfStatement");
  assert.deepEqual(validateAstSemantics(first.ast).diagnostics, []);
});

test("flowchart adapter continues after the unique branch join", () => {
  const joined = structuredClone(flowchart);
  joined.nodes.splice(5, 0, { id: "set-result", kind: "process", payload: { operation: "assignment", symbolId: "symbol-age", expression: "age + 1" } });
  joined.edges = [
    { id: "e1", from: "start", to: "read-age" },
    { id: "e2", from: "read-age", to: "check-age" },
    { id: "e3", from: "check-age", to: "say-adult", branch: "true" },
    { id: "e4", from: "check-age", to: "say-minor", branch: "false" },
    { id: "e5", from: "say-adult", to: "set-result" },
    { id: "e6", from: "say-minor", to: "set-result" },
    { id: "e7", from: "set-result", to: "finish" },
  ];
  const result = adaptFlowchartToAst(joined);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.ast.body.statements[3].kind, "Assignment");
  assert.deepEqual(validateAstSemantics(result.ast).diagnostics, []);
});

test("adapters reject malformed sources and unsafe expressions without an AST", () => {
  const badSpecification = structuredClone(specification);
  badSpecification.steps[0].payload.prompt = "x";
  badSpecification.steps[1].payload.condition = "age >= 18; system('x')";
  const specResult = adaptSpecificationToAst(badSpecification);
  assert.equal(specResult.ast, null);
  assert.ok(specResult.diagnostics.some(({ code }) => code === "ADAPTER_EXPRESSION_INVALID"));

  const badGraph = structuredClone(flowchart);
  badGraph.nodes.find(({ id }) => id === "check-age").payload.condition = "age > 10 > 2";
  const graphResult = adaptFlowchartToAst(badGraph);
  assert.equal(graphResult.ast, null);
  assert.ok(graphResult.diagnostics.some(({ code }) => code === "ADAPTER_EXPRESSION_INVALID"));
});

test("flowchart adapter supports connecting two input blocks sequentially", () => {
  const sequentialInputsFlowchart = {
    schemaVersion: "1.0.0",
    revision: 1,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "input-x", kind: "input", payload: { symbolId: "symbol-x", name: "x", type: "int", prompt: "Enter x: " } },
      { id: "input-y", kind: "input", payload: { symbolId: "symbol-y", name: "y", type: "int", prompt: "Enter y: " } },
      { id: "output-sum", kind: "output", payload: { outputId: "out-sum", mode: "expression", expression: "x + y" } },
      { id: "finish", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start", to: "input-x" },
      { id: "e2", from: "input-x", to: "input-y" },
      { id: "e3", from: "input-y", to: "output-sum" },
      { id: "e4", from: "output-sum", to: "finish" },
    ],
    layout: { positions: {}, zoom: 1 },
  };

  const result = adaptFlowchartToAst(sequentialInputsFlowchart);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.ast);
  assert.equal(result.ast.symbols.length, 2);
  assert.equal(result.ast.symbols[0].name, "x");
  assert.equal(result.ast.symbols[1].name, "y");
  assert.deepEqual(validateAstSemantics(result.ast).diagnostics, []);
});

test("flowchart adapter supports multiple End blocks terminating branches", () => {
  const multiEndFlowchart = {
    schemaVersion: "1.0.0",
    revision: 1,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "read-x", kind: "input", payload: { symbolId: "symbol-x", name: "x", type: "int", prompt: "Enter x: " } },
      { id: "check-pos", kind: "decision", payload: { condition: "x > 0" } },
      { id: "say-pos", kind: "output", payload: { outputId: "out-pos", mode: "message", message: "Positive" } },
      { id: "say-neg", kind: "output", payload: { outputId: "out-neg", mode: "message", message: "Not positive" } },
      { id: "finish-1", kind: "end", payload: {} },
      { id: "finish-2", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start", to: "read-x" },
      { id: "e2", from: "read-x", to: "check-pos" },
      { id: "e3", from: "check-pos", to: "say-pos", branch: "true" },
      { id: "e4", from: "check-pos", to: "say-neg", branch: "false" },
      { id: "e5", from: "say-pos", to: "finish-1" },
      { id: "e6", from: "say-neg", to: "finish-2" },
    ],
    layout: { positions: {}, zoom: 1 },
  };

  const result = adaptFlowchartToAst(multiEndFlowchart);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.ast);
  assert.deepEqual(validateAstSemantics(result.ast).diagnostics, []);
});

test("flowchart adapter correctly parses standard target = expression in process nodes", () => {
  const flowchart = {
    schemaVersion: "1.0.0",
    revision: 1,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "read-x", kind: "input", payload: { symbolId: "symbol-x", name: "x", type: "int", prompt: "Enter x: " } },
      { id: "calc", kind: "process", payload: { expression: "y = x + 10" } },
      { id: "say-y", kind: "output", payload: { outputId: "out-y", mode: "expression", expression: "y" } },
      { id: "finish", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start", to: "read-x" },
      { id: "e2", from: "read-x", to: "calc" },
      { id: "e3", from: "calc", to: "say-y" },
      { id: "e4", from: "say-y", to: "finish" },
    ],
    layout: { positions: {}, zoom: 1 },
  };

  const result = adaptFlowchartToAst(flowchart);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.ast);
  const ySymbol = result.ast.symbols.find((s) => s.name === "y");
  assert.ok(ySymbol);
  assert.equal(ySymbol.type, "int");
  assert.deepEqual(validateAstSemantics(result.ast).diagnostics, []);
});

test("flowchart adapter handles initialization followed by assignment without duplicate declaration", () => {
  const chart = {
    schemaVersion: "1.0.0",
    revision: 1,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "init-max", kind: "initialization", payload: { symbolId: "symbol-max", name: "max", type: "int", initializer: "0" } },
      { id: "assign-max", kind: "process", payload: { operation: "assignment", symbolId: "symbol-max", expression: "10" } },
      { id: "finish", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start", to: "init-max" },
      { id: "e2", from: "init-max", to: "assign-max" },
      { id: "e3", from: "assign-max", to: "finish" },
    ],
    layout: { positions: {}, zoom: 1 },
  };

  const result = adaptFlowchartToAst(chart);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.ast);
  const astVal = validateAstSemantics(result.ast);
  assert.equal(astVal.valid, true);
  assert.deepEqual(astVal.diagnostics, []);
});

test("flowchart adapter accepts English and, or, not in decision conditions", () => {
  const chart = {
    schemaVersion: "1.0.0",
    revision: 1,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "read-x", kind: "input", payload: { symbolId: "symbol-x", name: "x", type: "int", prompt: "Enter x: " } },
      { id: "read-y", kind: "input", payload: { symbolId: "symbol-y", name: "y", type: "int", prompt: "Enter y: " } },
      { id: "check", kind: "decision", payload: { condition: "x > 0 and not y <= 0" } },
      { id: "out-yes", kind: "output", payload: { outputId: "out-y", mode: "message", message: "Both positive" } },
      { id: "out-no", kind: "output", payload: { outputId: "out-n", mode: "message", message: "Not both positive" } },
      { id: "finish", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start", to: "read-x" },
      { id: "e2", from: "read-x", to: "read-y" },
      { id: "e3", from: "read-y", to: "check" },
      { id: "e4", from: "check", to: "out-yes", branch: "true" },
      { id: "e5", from: "check", to: "out-no", branch: "false" },
      { id: "e6", from: "out-yes", to: "finish" },
      { id: "e7", from: "out-no", to: "finish" },
    ],
    layout: { positions: {}, zoom: 1 },
  };

  const result = adaptFlowchartToAst(chart);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.ast);
  const astVal = validateAstSemantics(result.ast);
  assert.equal(astVal.valid, true);
});
