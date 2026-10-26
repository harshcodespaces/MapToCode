import test from "node:test";
import assert from "node:assert/strict";
import { parsePseudocodeToFlowchart } from "../core/pseudocode-parser.js";
import { validateFlowchartContract } from "../core/contract-validation.js";
import { adaptFlowchartToAst } from "../core/adapters.js";
import { generatePythonFromAst } from "../core/python-generator.js";
import { generateCFromAst } from "../core/c-generator.js";
import { explainFlowchartToLearner } from "../core/flowchart-explanation.js";

test("parses linear sequential pseudocode into connected flowchart", () => {
  const code = `
BEGIN
    INPUT x PROMPT "Enter x: "
    y = x + 10
    OUTPUT "Result is ready"
END
  `;
  const result = parsePseudocodeToFlowchart(code);
  assert.equal(result.success, true);
  assert.equal(result.flowchart.nodes.length, 5); // start, input, process, output, end
  assert.equal(result.flowchart.edges.length, 4);

  const startNode = result.flowchart.nodes.find((n) => n.kind === "start");
  const inputNode = result.flowchart.nodes.find((n) => n.kind === "input");
  const procNode = result.flowchart.nodes.find((n) => n.kind === "process");
  const outNode = result.flowchart.nodes.find((n) => n.kind === "output");
  const endNode = result.flowchart.nodes.find((n) => n.kind === "end");

  assert.ok(startNode && inputNode && procNode && outNode && endNode);
  assert.equal(inputNode.payload.name, "x");
  assert.equal(inputNode.payload.symbolId, "symbol-x");
  assert.equal(procNode.payload.symbolId, "symbol-y");
  assert.equal(procNode.payload.expression, "x + 10");
  assert.equal(outNode.payload.message, "Result is ready");
  assert.equal(validateFlowchartContract(result.flowchart).length, 0);
});

test("parses legacy expr-left assignment arrow and generates valid Python", () => {
  const result = parsePseudocodeToFlowchart(`
BEGIN
  INPUT x PROMPT "Enter x: "
  INPUT y PROMPT "Enter y: "
  x + y ← z
  OUTPUT z
END
  `);

  assert.equal(result.success, true);
  assert.deepEqual(validateFlowchartContract(result.flowchart), []);
  const adapted = adaptFlowchartToAst(result.flowchart, { projectId: "sum-example" });
  assert.deepEqual(adapted.diagnostics, []);
  assert.ok(adapted.ast);
  const generated = generatePythonFromAst(adapted.ast);
  assert.deepEqual(generated.diagnostics, []);
  assert.match(generated.code, /z = \(x \+ y\)/);
  assert.match(generated.code, /print\(z\)/);

  const legacyGraph = structuredClone(result.flowchart);
  legacyGraph.nodes.find(({ kind }) => kind === "process").payload = {
    operation: "assignment", symbolId: "symbol-x", target: "z", name: "z", expression: "x + y",
  };
  legacyGraph.nodes.find(({ kind }) => kind === "output").payload = { mode: "expression", expression: "z" };
  const legacyAdapted = adaptFlowchartToAst(legacyGraph, { projectId: "legacy-sum-example" });
  assert.deepEqual(legacyAdapted.diagnostics, []);
  assert.match(generatePythonFromAst(legacyAdapted.ast).code, /z = \(x \+ y\)/);
});

test("parses branching IF/ELSE pseudocode into decision flowchart with true and false edges", () => {
  const code = `
BEGIN
    INPUT number PROMPT "Enter number: "
    IF number % 2 == 0 THEN
        OUTPUT "Even"
    ELSE
        OUTPUT "Odd"
    END IF
END
  `;
  const result = parsePseudocodeToFlowchart(code);
  assert.equal(result.success, true);

  const decNode = result.flowchart.nodes.find((n) => n.kind === "decision");
  assert.ok(decNode);
  assert.equal(decNode.payload.condition, "number % 2 == 0");

  const trueEdge = result.flowchart.edges.find((e) => e.from === decNode.id && e.branch === "true");
  const falseEdge = result.flowchart.edges.find((e) => e.from === decNode.id && e.branch === "false");
  assert.ok(trueEdge);
  assert.ok(falseEdge);

  const endNode = result.flowchart.nodes.find((n) => n.kind === "end");
  assert.ok(endNode);
  const endEdges = result.flowchart.edges.filter((e) => e.to === endNode.id);
  assert.equal(endEdges.length, 2);
});

test("preserves multiple statements and sequential decisions through both conversions", () => {
  const result = parsePseudocodeToFlowchart(`
BEGIN
  INPUT n PROMPT "Enter n: "
  IF n > 0 THEN
    result = n + 1
    OUTPUT result
  ELSE
    result = 0
    OUTPUT result
  END IF
  IF n == 0 THEN
    OUTPUT "zero"
  ELSE
    OUTPUT "nonzero"
  END IF
  OUTPUT "done"
END
  `);

  assert.equal(result.success, true);
  assert.deepEqual(validateFlowchartContract(result.flowchart), []);
  assert.equal(result.flowchart.nodes.filter(({ kind }) => kind === "decision").length, 2);
  assert.equal(result.flowchart.nodes.filter(({ kind }) => kind === "process").length, 2);
  assert.equal(result.flowchart.nodes.filter(({ kind }) => kind === "output").length, 5);

  const adapted = adaptFlowchartToAst(result.flowchart, { projectId: "multi-logic-example" });
  assert.deepEqual(adapted.diagnostics, []);
  const generated = generatePythonFromAst(adapted.ast);
  assert.deepEqual(generated.diagnostics, []);
  assert.equal((generated.code.match(/^[\t ]*if /gm) || []).length, 2);
  assert.match(generated.code, /result = \(n \+ 1\)/);
  assert.match(generated.code, /print\("done"\)/);

  const regeneratedPseudocode = explainFlowchartToLearner(result.flowchart).pseudocode;
  assert.equal((regeneratedPseudocode.match(/^\s*IF /gm) || []).length, 2);
  assert.match(regeneratedPseudocode, /OUTPUT "nonzero"/);
  assert.match(regeneratedPseudocode, /OUTPUT "done"/);
});

test("preserves nested decisions and the logic that follows them", () => {
  const result = parsePseudocodeToFlowchart(`
BEGIN
  INPUT n
  IF n > 0 THEN
    IF n > 10 THEN
      OUTPUT "large positive"
    ELSE
      OUTPUT "small positive"
    END IF
  ELSE
    OUTPUT "not positive"
  END IF
  OUTPUT "finished"
END
  `);

  assert.equal(result.success, true);
  assert.deepEqual(validateFlowchartContract(result.flowchart), []);
  const adapted = adaptFlowchartToAst(result.flowchart, { projectId: "nested-logic-example" });
  assert.deepEqual(adapted.diagnostics, []);
  const generated = generatePythonFromAst(adapted.ast);
  assert.deepEqual(generated.diagnostics, []);
  assert.equal((generated.code.match(/^[\t ]*if /gm) || []).length, 2);
  assert.match(generated.code, /print\("finished"\)/);

  const pseudocode = explainFlowchartToLearner(result.flowchart).pseudocode;
  assert.equal((pseudocode.match(/^\s*IF /gm) || []).length, 2);
  assert.match(pseudocode, /OUTPUT "small positive"/);
  assert.match(pseudocode, /OUTPUT "not positive"/);
  assert.match(pseudocode, /OUTPUT "finished"/);
});

test("initializes non-input constants and infers decimal calculation types", () => {
  const result = parsePseudocodeToFlowchart(`
BEGIN
  DECLARE pi: double = 3.14159
  INPUT radius PROMPT "Radius: "
  area = pi * radius * radius
  OUTPUT area
END
  `);

  assert.equal(result.success, true);
  assert.deepEqual(validateFlowchartContract(result.flowchart), []);
  const declaration = result.flowchart.nodes.find((node) => node.kind === "initialization");
  assert.deepEqual(declaration.payload, {
    symbolId: "symbol-pi",
    name: "pi",
    type: "double",
    initializer: "3.14159",
  });

  const adapted = adaptFlowchartToAst(result.flowchart, { projectId: "circle-area-example" });
  assert.deepEqual(adapted.diagnostics, []);
  assert.ok(adapted.ast.symbols.some((symbol) => symbol.name === "pi" && symbol.type === "double"));
  assert.ok(adapted.ast.symbols.some((symbol) => symbol.name === "area" && symbol.type === "double"));
  const python = generatePythonFromAst(adapted.ast);
  assert.deepEqual(python.diagnostics, []);
  assert.match(python.code, /pi = 3\.14159/);
  assert.match(python.code, /area = .*pi.*radius/);
  const c = generateCFromAst(adapted.ast);
  assert.deepEqual(c.diagnostics, []);
  assert.match(c.code, /double pi = 3\.14159;/);
  assert.match(c.code, /double area;/);

  const regenerated = explainFlowchartToLearner(result.flowchart).pseudocode;
  assert.match(regenerated, /DECLARE pi: double = 3\.14159/);
  assert.match(regenerated, /area = pi \* radius \* radius/);
  assert.equal(validateFlowchartContract(parsePseudocodeToFlowchart(regenerated).flowchart).length, 0);
});

test("infers a decimal type when a value is initialized with a plain assignment", () => {
  const result = parsePseudocodeToFlowchart(`BEGIN
DECLARE radius: double = 2.5
pi = 3.14159
area = pi * radius * radius
OUTPUT area
END`);
  const adapted = adaptFlowchartToAst(result.flowchart);
  assert.deepEqual(adapted.diagnostics, []);
  assert.ok(adapted.ast.symbols.some((symbol) => symbol.name === "pi" && symbol.type === "double"));
  assert.ok(adapted.ast.symbols.some((symbol) => symbol.name === "area" && symbol.type === "double"));
  assert.deepEqual(generatePythonFromAst(adapted.ast).diagnostics, []);
});

test("rejects empty pseudocode gracefully", () => {
  assert.equal(parsePseudocodeToFlowchart("").success, false);
  assert.equal(parsePseudocodeToFlowchart(null).success, false);
});
