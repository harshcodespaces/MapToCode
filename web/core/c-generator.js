import { validateAstSemantics } from "./ast-validation.js";
import { createDiagnostic } from "./diagnostics.js";

export const C_GENERATOR_VERSION = "1.0.0";

function cString(value) {
  let output = "\"";
  for (const character of value) {
    const code = character.codePointAt(0);
    if (character === "\\") output += "\\\\";
    else if (character === "\"") output += "\\\"";
    else if (character === "\n") output += "\\n";
    else if (character === "\r") output += "\\r";
    else if (character === "\t") output += "\\t";
    else if (code === 0) output += "\\000";
    else if (code < 0x20 || code === 0x7f) output += `\\${code.toString(8).padStart(3, "0")}`;
    else output += character;
  }
  return `${output}\"`;
}

function cCharacter(value) {
  const escapes = { "\\": "\\\\", "'": "\\'", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\0": "\\0" };
  const code = value.codePointAt(0);
  const escaped = escapes[value] ?? (code < 0x20 || code === 0x7f ? `\\${code.toString(8).padStart(3, "0")}` : value);
  return `'${escaped}'`;
}

function cNumber(value, kind) {
  const text = String(value);
  if (kind === "FloatingLiteral" && !/[.eE]/.test(text)) return `${text}.0`;
  return text;
}

function cExpression(expression, symbols) {
  if (expression.kind === "IntegerLiteral" || expression.kind === "FloatingLiteral") return cNumber(expression.value, expression.kind);
  if (expression.kind === "CharacterLiteral") return cCharacter(expression.value);
  if (expression.kind === "VariableReference") return symbols.get(expression.symbolId).name;
  if (expression.kind === "UnaryExpression") return `(${expression.operator}${cExpression(expression.operand, symbols)})`;
  if (expression.kind === "BinaryExpression") return `(${cExpression(expression.left, symbols)} ${expression.operator} ${cExpression(expression.right, symbols)})`;
  throw new TypeError(`Unsupported C expression node: ${expression.kind}`);
}

function failure(message, sourceRefs = []) {
  return createDiagnostic({ code: "GEN_AST_UNSUPPORTED", category: "generation", message, sourceRefs });
}

export function generateCFromAst(ast) {
  const validation = validateAstSemantics(ast);
  if (!validation.valid) return { code: "", sourceMap: [], diagnostics: validation.diagnostics, generatorVersion: C_GENERATOR_VERSION };

  const symbols = new Map(ast.symbols.map((symbol) => [symbol.id, symbol]));
  const lines = ["#include <stdio.h>", "", "int main(void) {"];
  const sourceMap = [];
  let unsupported = null;

  function emit(text, indent, node) {
    const line = `${"    ".repeat(indent)}${text}`;
    lines.push(line);
    if (node?.id) {
      const provenance = ast.provenance.find((entry) => entry.astNodeId === node.id);
      sourceMap.push({ line: lines.length, astNodeId: node.id, sourceRefs: provenance?.origins ?? [] });
    }
  }

  function generateExpression(expression) {
    if (expression.kind === "CharacterLiteral" && expression.value.codePointAt(0) > 0x7f) {
      const provenance = ast.provenance.find((entry) => entry.astNodeId === expression.id);
      unsupported = failure("M1 C output supports ASCII character literals only.", provenance?.origins ?? []);
    }
    return cExpression(expression, symbols);
  }

  function emitBlock(block, indent) {
    for (const statement of block.statements) emitStatement(statement, indent);
  }

  function emitStatement(statement, indent) {
    if (unsupported) return;
    if (statement.kind === "VariableDeclaration") {
      const symbol = symbols.get(statement.symbolId);
      const initializer = statement.initializer ? ` = ${generateExpression(statement.initializer)}` : "";
      emit(`${symbol.type} ${symbol.name}${initializer};`, indent, statement);
      return;
    }
    if (statement.kind === "Input") {
      const symbol = symbols.get(statement.symbolId);
      if (statement.prompt.includes("\0")) {
        const provenance = ast.provenance.find((entry) => entry.astNodeId === statement.id);
        unsupported = failure("M1 input prompts cannot contain a null character.", provenance?.origins ?? []);
        return;
      }
      if (statement.prompt) emit(`printf(${cString(statement.prompt)});`, indent, statement);
      const format = symbol.type === "int" ? "%d" : symbol.type === "double" ? "%lf" : " %c";
      emit(`if (scanf(${cString(format)}, &${symbol.name}) != 1) return 1;`, indent, statement);
      return;
    }
    if (statement.kind === "Assignment") {
      const symbol = symbols.get(statement.symbolId);
      emit(`${symbol.name} = ${generateExpression(statement.expression)};`, indent, statement);
      return;
    }
    if (statement.kind === "Output") {
      if (statement.mode === "message") {
        if (statement.message.includes("\0")) {
          const provenance = ast.provenance.find((entry) => entry.astNodeId === statement.id);
          unsupported = failure("M1 output messages cannot contain a null character.", provenance?.origins ?? []);
          return;
        }
        emit(`printf("%s\\n", ${cString(statement.message)});`, indent, statement);
        return;
      }
      const type = validation.typeTable[statement.value.id];
      if (type === "bool" || !["int", "double", "char"].includes(type)) {
        const provenance = ast.provenance.find((entry) => entry.astNodeId === statement.id);
        unsupported = failure("M1 C output supports int, double, and char values.", provenance?.origins ?? []);
        return;
      }
      const format = type === "int" ? "%d\n" : type === "double" ? "%.17g\n" : "%c\n";
      const expression = generateExpression(statement.value);
      const argument = type === "double" ? `(double)(${expression})` : expression;
      emit(`printf(${cString(format)}, ${argument});`, indent, statement);
      return;
    }
    if (statement.kind === "IfStatement") {
      emit(`if (${generateExpression(statement.condition)}) {`, indent, statement);
      emitBlock(statement.thenBlock, indent + 1);
      emit("} else {", indent, statement);
      emitBlock(statement.elseBlock, indent + 1);
      emit("}", indent, statement);
    }
  }

  emitBlock(ast.body, 1);
  if (unsupported) return { code: "", sourceMap: [], diagnostics: [unsupported], generatorVersion: C_GENERATOR_VERSION };
  lines.push("    return 0;", "}", "");
  return { code: lines.join("\n"), sourceMap, diagnostics: [], generatorVersion: C_GENERATOR_VERSION };
}
