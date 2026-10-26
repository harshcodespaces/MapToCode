import test from "node:test";
import assert from "node:assert/strict";
import { parseExpression } from "../core/expressions.js";
import { generateJavaFromAst } from "../core/java-generator.js";

function resolveNames(expression, symbolsByName) {
  if (expression.kind === "VariableReference") expression.symbolId = symbolsByName.get(expression.symbolId) ?? expression.symbolId;
  if (expression.kind === "UnaryExpression") resolveNames(expression.operand, symbolsByName);
  if (expression.kind === "BinaryExpression") {
    resolveNames(expression.left, symbolsByName);
    resolveNames(expression.right, symbolsByName);
  }
  return expression;
}

function makeProgram(statements, symbols = [{ id: "symbol-n", name: "n", type: "int" }]) {
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

function createEvenOddAst() {
  const names = new Map([["n", "symbol-n"]]);
  return makeProgram([
    { id: "stmt-decl", kind: "VariableDeclaration", symbolId: "symbol-n", initializer: { id: "expr-zero", kind: "IntegerLiteral", value: 0 } },
    { id: "stmt-input", kind: "Input", symbolId: "symbol-n", prompt: "Enter a number: " },
    {
      id: "stmt-if",
      kind: "IfStatement",
      condition: resolveNames(parseExpression("n % 2 == 0", { idPrefix: "cond" }), names),
      thenBlock: {
        id: "block-then",
        kind: "Block",
        statements: [{ id: "stmt-even", kind: "Output", mode: "message", message: "Even" }],
      },
      elseBlock: {
        id: "block-else",
        kind: "Block",
        statements: [{ id: "stmt-odd", kind: "Output", mode: "message", message: "Odd" }],
      },
    },
  ]);
}

test("Java generator emits valid Java class with Scanner and main method", () => {
  const ast = createEvenOddAst();
  const res = generateJavaFromAst(ast);

  assert.equal(res.diagnostics.length, 0);
  assert.ok(res.code.includes("import java.util.Scanner;"));
  assert.ok(res.code.includes("public class Main {"));
  assert.ok(res.code.includes("public static void main(String[] args) {"));
  assert.ok(res.code.includes("Scanner scanner = new Scanner(System.in);"));
  assert.ok(res.code.includes("int n = 0;"));
  assert.ok(res.code.includes('System.out.print("Enter a number: ");'));
  assert.ok(res.code.includes("n = scanner.nextInt();"));
  assert.ok(res.code.includes("if (((n % 2) == 0)) {"));
  assert.ok(res.code.includes('System.out.println("Even");'));
  assert.ok(res.code.includes('System.out.println("Odd");'));
  assert.ok(res.code.includes("scanner.close();"));
});

test("Java generator rejects Java reserved keywords gracefully", () => {
  const ast = createEvenOddAst();
  ast.symbols[0].name = "class"; // reserved in Java
  const res = generateJavaFromAst(ast);

  assert.equal(res.code, "");
  assert.ok(res.diagnostics.length > 0);
  assert.ok(res.diagnostics[0].message.includes("is a Java keyword or reserved name"));
});
