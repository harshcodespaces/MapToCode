import test from "node:test";
import assert from "node:assert/strict";
import { parseExpression } from "../core/expressions.js";
import { validateAstSemantics } from "../core/ast-validation.js";

function resolveNames(expression, symbolsByName) {
  if (expression.kind === "VariableReference") expression.symbolId = symbolsByName.get(expression.symbolId) ?? expression.symbolId;
  if (expression.kind === "UnaryExpression") resolveNames(expression.operand, symbolsByName);
  if (expression.kind === "BinaryExpression") {
    resolveNames(expression.left, symbolsByName);
    resolveNames(expression.right, symbolsByName);
  }
  return expression;
}

function makeProgram(statements, symbols = [{ id: "symbol-age", name: "age", type: "int" }]) {
  const body = { id: "block-root", kind: "Block", statements };
  const nodes = [];
  function visit(node) {
    nodes.push(node);
    if (node.kind === "Block") node.statements.forEach(visit);
    else if (node.kind === "VariableDeclaration" && node.initializer) visit(node.initializer);
    else if (node.kind === "Assignment") visit(node.expression);
    else if (node.kind === "Output" && node.mode === "value") visit(node.value);
    else if (node.kind === "IfStatement") { visit(node.condition); visit(node.thenBlock); visit(node.elseBlock); }
    else if (node.kind === "UnaryExpression") visit(node.operand);
    else if (node.kind === "BinaryExpression") { visit(node.left); visit(node.right); }
  }
  visit(body);
  return {
    irVersion: "1.0.0",
    programId: "program-test",
    body,
    symbols,
    provenance: nodes.map((node) => ({
      astNodeId: node.id,
      origins: [{ sourceKind: "flowchart", sourceObjectId: node.id, sourceRevision: 1 }],
      transformationRuleId: "test-origin",
      adapterVersion: "test/1.0.0",
    })),
  };
}

function ageDecisionProgram(condition = "age >= 18") {
  const names = new Map([["age", "symbol-age"]]);
  return makeProgram([
    { id: "declare-age", kind: "VariableDeclaration", symbolId: "symbol-age" },
    { id: "input-age", kind: "Input", symbolId: "symbol-age", prompt: "Age: " },
    {
      id: "check-age", kind: "IfStatement", condition: resolveNames(parseExpression(condition, { idPrefix: "condition" }), names),
      thenBlock: { id: "then", kind: "Block", statements: [{ id: "adult", kind: "Output", mode: "message", message: "Adult" }] },
      elseBlock: { id: "else", kind: "Block", statements: [{ id: "minor", kind: "Output", mode: "message", message: "Minor" }] },
    },
  ]);
}

test("expression parser follows precedence and creates a structured expression tree", () => {
  const expression = parseExpression("age + 2 * 3 >= 18 && !ready", { idPrefix: "expr" });
  assert.equal(expression.kind, "BinaryExpression");
  assert.equal(expression.operator, "&&");
  assert.equal(expression.left.operator, ">=");
  assert.equal(expression.left.left.operator, "+");
  assert.equal(expression.left.left.right.operator, "*");
  assert.equal(expression.right.kind, "UnaryExpression");
  assert.equal(expression.right.operator, "!");
});

test("expression parser supports English logical operators and, or, not", () => {
  const exprAnd = parseExpression("x > 0 and y > 0", { idPrefix: "and-expr" });
  assert.equal(exprAnd.kind, "BinaryExpression");
  assert.equal(exprAnd.operator, "&&");
  assert.equal(exprAnd.left.operator, ">");
  assert.equal(exprAnd.right.operator, ">");

  const exprOr = parseExpression("x <= 0 or y >= 10", { idPrefix: "or-expr" });
  assert.equal(exprOr.kind, "BinaryExpression");
  assert.equal(exprOr.operator, "||");

  const exprNot = parseExpression("not (x == 0)", { idPrefix: "not-expr" });
  assert.equal(exprNot.kind, "UnaryExpression");
  assert.equal(exprNot.operator, "!");

  const exprMixed = parseExpression("x > 0 and not y > 0", { idPrefix: "mix-expr" });
  assert.equal(exprMixed.kind, "BinaryExpression");
  assert.equal(exprMixed.operator, "&&");
  assert.equal(exprMixed.right.kind, "UnaryExpression");
  assert.equal(exprMixed.right.operator, "!");
});

test("expression parser accepts numeric and character literals and rejects unsafe syntax", () => {
  assert.equal(parseExpression("2.5 * -3").kind, "BinaryExpression");
  assert.deepEqual(parseExpression("'\\n'"), { id: "expression:e0", kind: "CharacterLiteral", value: "\n" });
  assert.throws(() => parseExpression("a < b < c"), /Chained comparisons/);
  assert.throws(() => parseExpression("system(\"oops\")"), /not supported/);
  assert.throws(() => parseExpression("'ab'"), /exactly one character/);
});

test("AST semantic validation checks expression types and records provenance", () => {
  const result = validateAstSemantics(ageDecisionProgram());
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.valid, true);
  assert.equal(result.typeTable["condition:e2"], "bool");
});

test("AST validation rejects undeclared and uninitialized references", () => {
  const declaredButEmpty = makeProgram([
    { id: "declare", kind: "VariableDeclaration", symbolId: "symbol-age" },
    { id: "output", kind: "Output", mode: "value", value: { id: "ref", kind: "VariableReference", symbolId: "symbol-age" } },
  ]);
  assert.ok(validateAstSemantics(declaredButEmpty).diagnostics.some(({ code }) => code === "SYMBOL_UNINITIALIZED"));

  const missingSymbol = makeProgram([
    { id: "output", kind: "Output", mode: "value", value: { id: "ref", kind: "VariableReference", symbolId: "symbol-missing" } },
  ], []);
  assert.ok(validateAstSemantics(missingSymbol).diagnostics.some(({ code }) => code === "SYMBOL_UNDECLARED"));
});

test("AST validation rejects narrowing, non-Boolean conditions, and static division by zero", () => {
  const program = ageDecisionProgram("age / 0 >= 18");
  program.body.statements[0].initializer = { id: "float-init", kind: "FloatingLiteral", value: 1.5 };
  const result = validateAstSemantics(program);
  const codes = result.diagnostics.map(({ code }) => code);
  assert.ok(codes.includes("TYPE_ASSIGNMENT_INVALID"));
  assert.ok(codes.includes("SEM_DIVISION_BY_ZERO_STATIC"));
  assert.ok(!codes.includes("TYPE_CONDITION_INVALID"));
});

test("AST validation requires complete provenance and unique symbol declarations", () => {
  const program = ageDecisionProgram();
  program.provenance.pop();
  program.symbols.push({ id: "symbol-age-copy", name: "age", type: "int" });
  const codes = validateAstSemantics(program).diagnostics.map(({ code }) => code);
  assert.ok(codes.includes("AST_PROVENANCE_INVALID"));
  assert.ok(codes.includes("SYMBOL_DUPLICATE"));
  assert.ok(codes.includes("SYMBOL_UNDECLARED"));
});
