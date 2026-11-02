import test from "node:test";
import assert from "node:assert/strict";
import {
  createEligibilityExample,
  createEvenOddExample,
  createNumberComparisonExample,
  createGradeExample,
} from "../core/examples.js";
import { adaptFlowchartToAst, adaptSpecificationToAst } from "../core/adapters.js";
import {
  generateAstTrace,
  evaluateExpression,
  parseAndValidateInput,
  formatExpression,
} from "../core/trace-engine.js";

test("Trace Engine: input validation and type checking", () => {
  // Integer validation
  assert.equal(parseAndValidateInput("42", "int", "x"), 42);
  assert.equal(parseAndValidateInput("-15", "int", "x"), -15);
  assert.equal(parseAndValidateInput("0", "int", "x"), 0);
  assert.throws(() => parseAndValidateInput("3.14", "int", "x"), /expected a whole number/);
  assert.throws(() => parseAndValidateInput("abc", "int", "x"), /expected a whole number/);
  assert.throws(() => parseAndValidateInput("", "int", "x"), /Missing input/);

  // Double validation
  assert.equal(parseAndValidateInput("3.14", "double", "y"), 3.14);
  assert.equal(parseAndValidateInput("10", "double", "y"), 10);
  assert.throws(() => parseAndValidateInput("abc", "double", "y"), /expected a valid floating-point number/);

  // Char validation
  assert.equal(parseAndValidateInput("A", "char", "c"), "A");
  assert.throws(() => parseAndValidateInput("AB", "char", "c"), /expected exactly one ASCII character/);
  assert.throws(() => parseAndValidateInput("", "char", "c"), /Missing input/);
});

test("Trace Engine: evaluateExpression arithmetic, division truncation, and logic", () => {
  const symbols = new Map([
    ["s1", { id: "s1", name: "a", type: "int" }],
    ["s2", { id: "s2", name: "b", type: "int" }],
  ]);
  const env = {
    a: { symbolId: "s1", name: "a", type: "int", status: "initialized", value: 7 },
    b: { symbolId: "s2", name: "b", type: "int", status: "initialized", value: 2 },
  };

  // 7 / 2 = 3 (integer truncation towards 0)
  const divExpr = {
    id: "e1",
    kind: "BinaryExpression",
    operator: "/",
    left: { id: "e2", kind: "VariableReference", symbolId: "s1" },
    right: { id: "e3", kind: "VariableReference", symbolId: "s2" },
  };
  assert.equal(evaluateExpression(divExpr, env, symbols), 3);

  // 7 % 2 = 1
  const modExpr = {
    id: "e4",
    kind: "BinaryExpression",
    operator: "%",
    left: { id: "e2", kind: "VariableReference", symbolId: "s1" },
    right: { id: "e3", kind: "VariableReference", symbolId: "s2" },
  };
  assert.equal(evaluateExpression(modExpr, env, symbols), 1);

  // Runtime division by zero
  const zeroDivExpr = {
    id: "e5",
    kind: "BinaryExpression",
    operator: "/",
    left: { id: "e2", kind: "VariableReference", symbolId: "s1" },
    right: { id: "e6", kind: "IntegerLiteral", value: 0 },
  };
  assert.throws(() => evaluateExpression(zeroDivExpr, env, symbols), /Runtime division by zero/);

  // Comparisons
  const cmpExpr = {
    id: "e7",
    kind: "BinaryExpression",
    operator: ">",
    left: { id: "e2", kind: "VariableReference", symbolId: "s1" },
    right: { id: "e3", kind: "VariableReference", symbolId: "s2" },
  };
  assert.equal(evaluateExpression(cmpExpr, env, symbols), true);
});

test("Trace Engine: Even/Odd algorithm trace execution (Even branch)", () => {
  const project = createEvenOddExample();
  const adapted = adaptFlowchartToAst(project.flowchart);
  assert.ok(adapted.ast);

  const trace = generateAstTrace(adapted.ast, { number: 4 });
  assert.equal(trace.success, true);
  assert.ok(trace.snapshots.length >= 4);

  // Check initial start step
  const startStep = trace.snapshots[0];
  assert.equal(startStep.action, "start");
  assert.equal(startStep.status, "ready");
  assert.equal(startStep.variables.number.status, "declared");

  // Check input step
  const inputStep = trace.snapshots.find((s) => s.action === "input");
  assert.ok(inputStep);
  assert.equal(inputStep.variables.number.value, 4);
  assert.equal(inputStep.variables.number.status, "initialized");
  assert.equal(inputStep.variables.number.changed, true);

  // Check decision step
  const decisionStep = trace.snapshots.find((s) => s.action === "decision");
  assert.ok(decisionStep);
  assert.equal(decisionStep.decision.result, true);
  assert.equal(decisionStep.decision.branch, "true");
  assert.match(decisionStep.explanation.whyBranchTaken, /True/);

  // Check output step
  const outputStep = trace.snapshots.find((s) => s.action === "output");
  assert.ok(outputStep);
  assert.equal(outputStep.newOutput, "This is an even number.");
  assert.deepEqual(trace.outputHistory, ["This is an even number."]);

  // Check completion step
  const lastStep = trace.snapshots[trace.snapshots.length - 1];
  assert.equal(lastStep.action, "end");
  assert.equal(lastStep.status, "completed");
});

test("Trace Engine: Even/Odd algorithm trace execution (Odd branch)", () => {
  const project = createEvenOddExample();
  const adapted = adaptFlowchartToAst(project.flowchart);
  assert.ok(adapted.ast);

  const trace = generateAstTrace(adapted.ast, { number: 7 });
  assert.equal(trace.success, true);

  const decisionStep = trace.snapshots.find((s) => s.action === "decision");
  assert.ok(decisionStep);
  assert.equal(decisionStep.decision.result, false);
  assert.equal(decisionStep.decision.branch, "false");
  assert.match(decisionStep.explanation.whyBranchTaken, /False/);

  assert.deepEqual(trace.outputHistory, ["This is an odd number."]);
});

test("Trace Engine: Voting Eligibility example branch selection", () => {
  const project = createEligibilityExample();
  const adapted = adaptFlowchartToAst(project.flowchart);
  assert.ok(adapted.ast);

  // Age = 16 (under 18)
  const minorTrace = generateAstTrace(adapted.ast, { age: 16 });
  assert.equal(minorTrace.success, true);
  const minorDecision = minorTrace.snapshots.find((s) => s.action === "decision");
  assert.equal(minorDecision.decision.result, false);
  assert.deepEqual(minorTrace.outputHistory, ["You are not eligible to vote yet."]);

  // Age = 21 (eligible)
  const adultTrace = generateAstTrace(adapted.ast, { age: 21 });
  assert.equal(adultTrace.success, true);
  const adultDecision = adultTrace.snapshots.find((s) => s.action === "decision");
  assert.equal(adultDecision.decision.result, true);
  assert.deepEqual(adultTrace.outputHistory, ["You are eligible to vote."]);
});

test("Trace Engine: Number Comparison example with nested decisions", () => {
  const project = createNumberComparisonExample();
  const adapted = adaptSpecificationToAst(project.specification);
  assert.ok(adapted.ast);

  // First = 10, Second = 25 -> Second is larger
  const trace = generateAstTrace(adapted.ast, { first: 10, second: 25 });
  assert.equal(trace.success, true);
  assert.deepEqual(trace.outputHistory, ["The second number is larger."]);

  // First = 50, Second = 20 -> First is larger
  const trace2 = generateAstTrace(adapted.ast, { first: 50, second: 20 });
  assert.equal(trace2.success, true);
  assert.deepEqual(trace2.outputHistory, ["The first number is larger."]);

  // First = 15, Second = 15 -> Equal
  const trace3 = generateAstTrace(adapted.ast, { first: 15, second: 15 });
  assert.equal(trace3.success, true);
  assert.deepEqual(trace3.outputHistory, ["The numbers are equal."]);
});

test("Trace Engine: Source line mapping and flowchart node linkage", () => {
  const project = createEvenOddExample();
  const adapted = adaptFlowchartToAst(project.flowchart);
  assert.ok(adapted.ast);

  const trace = generateAstTrace(adapted.ast, { number: 12 });
  assert.equal(trace.success, true);

  // Each statement snapshot should have valid flowchartNodeId or cLine/pythonLine
  for (const step of trace.snapshots) {
    if (step.action === "start" || step.action === "end") continue;
    assert.ok(step.flowchartNodeId || step.cLine || step.pythonLine);
    assert.ok(step.explanation.whatIsHappening);
  }
});

test("Trace Engine: Deterministic replay and no AST mutation", () => {
  const project = createEvenOddExample();
  const adapted = adaptFlowchartToAst(project.flowchart);
  const astBefore = JSON.stringify(adapted.ast);

  const trace1 = generateAstTrace(adapted.ast, { number: 10 });
  const trace2 = generateAstTrace(adapted.ast, { number: 10 });

  // Replay should produce identically matching snapshots
  assert.equal(trace1.snapshots.length, trace2.snapshots.length);
  for (let i = 0; i < trace1.snapshots.length; i++) {
    assert.equal(trace1.snapshots[i].astNodeId, trace2.snapshots[i].astNodeId);
    assert.equal(trace1.snapshots[i].action, trace2.snapshots[i].action);
    assert.deepEqual(trace1.snapshots[i].variables, trace2.snapshots[i].variables);
  }

  // AST must not have been mutated
  const astAfter = JSON.stringify(adapted.ast);
  assert.equal(astBefore, astAfter);
});

test("Trace Engine: Missing input halts gracefully with readable error", () => {
  const project = createEvenOddExample();
  const adapted = adaptFlowchartToAst(project.flowchart);

  // Calling trace without required input
  const trace = generateAstTrace(adapted.ast, {});
  assert.equal(trace.success, false);
  assert.match(trace.error, /Missing input for variable “number”/);
  const errorSnapshot = trace.snapshots[trace.snapshots.length - 1];
  assert.equal(errorSnapshot.status, "error");
});

test("Trace Engine: Step limit enforcement (prevent runaway execution)", () => {
  const project = createEvenOddExample();
  const adapted = adaptFlowchartToAst(project.flowchart);

  // Max steps set to 1
  const trace = generateAstTrace(adapted.ast, { number: 2 }, { maxSteps: 1 });
  assert.equal(trace.success, false);
  assert.match(trace.error, /Execution step limit exceeded/);
  assert.equal(trace.snapshots[trace.snapshots.length - 1].status, "max_steps_exceeded");
});
