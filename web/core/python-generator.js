import { validateAstSemantics } from "./ast-validation.js";
import { createDiagnostic } from "./diagnostics.js";
import { beginnerComment, normalizeCodeLevel } from "./code-level.js";

export const PYTHON_GENERATOR_VERSION = "1.0.0";

const PYTHON_RESERVED_NAMES = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield abs float input int len print ValueError".split(" "));

function failure(message, sourceRefs = []) {
  return createDiagnostic({ code: "GEN_AST_UNSUPPORTED", category: "generation", message, sourceRefs });
}

function pythonExpression(expression, symbols, typeTable, integerDivisionHelper, compact = false) {
  if (expression.kind === "IntegerLiteral" || expression.kind === "FloatingLiteral") return String(expression.value);
  if (expression.kind === "CharacterLiteral") return JSON.stringify(expression.value);
  if (expression.kind === "VariableReference") return symbols.get(expression.symbolId).name;
  if (expression.kind === "UnaryExpression") {
    if (expression.operator === "!") return `(not ${pythonExpression(expression.operand, symbols, typeTable, integerDivisionHelper, compact)})`;
    return `(${expression.operator}${pythonExpression(expression.operand, symbols, typeTable, integerDivisionHelper, compact)})`;
  }
  if (expression.kind === "BinaryExpression") {
    if (expression.operator === "/" && typeTable[expression.id] === "int") {
      return `${integerDivisionHelper}(${pythonExpression(expression.left, symbols, typeTable, integerDivisionHelper, compact)}, ${pythonExpression(expression.right, symbols, typeTable, integerDivisionHelper, compact)})`;
    }
    const operators = { "&&": "and", "||": "or" };
    const operator = operators[expression.operator] ?? expression.operator;
    const separator = compact && !["and", "or"].includes(operator) ? operator : ` ${operator} `;
    return `(${pythonExpression(expression.left, symbols, typeTable, integerDivisionHelper, compact)}${separator}${pythonExpression(expression.right, symbols, typeTable, integerDivisionHelper, compact)})`;
  }
  throw new TypeError(`Unsupported Python expression node: ${expression.kind}`);
}

export function generatePythonFromAst(ast, options = {}) {
  const codeLevel = normalizeCodeLevel(options.codeLevel);
  const compact = codeLevel === "professional";
  const validation = validateAstSemantics(ast);
  if (!validation.valid) return { code: "", sourceMap: [], diagnostics: validation.diagnostics, generatorVersion: PYTHON_GENERATOR_VERSION };

  const symbols = new Map(ast.symbols.map((symbol) => [symbol.id, symbol]));
  const invalidName = ast.symbols.find((symbol) => PYTHON_RESERVED_NAMES.has(symbol.name));
  if (invalidName) {
    function findDeclaration(block) {
      for (const statement of block.statements) {
        if (statement.kind === "VariableDeclaration" && statement.symbolId === invalidName.id) return statement;
        if (statement.kind === "IfStatement") {
          const nested = findDeclaration(statement.thenBlock) || findDeclaration(statement.elseBlock);
          if (nested) return nested;
        }
      }
      return null;
    }
    const declaration = findDeclaration(ast.body);
    const provenance = ast.provenance.find((entry) => entry.astNodeId === declaration?.id);
    return {
      code: "", sourceMap: [], generatorVersion: PYTHON_GENERATOR_VERSION,
      diagnostics: [failure(`“${invalidName.name}” is a Python keyword or generated built-in. Rename this variable before generating Python.`, provenance?.origins ?? [])],
    };
  }

  const lines = [];
  const sourceMap = [];
  let unsupported = null;
  const helperBase = "_maptocode_trunc_div";
  let integerDivisionHelper = helperBase;
  let helperSuffix = 1;
  while (ast.symbols.some((symbol) => symbol.name === integerDivisionHelper)) integerDivisionHelper = `${helperBase}_${helperSuffix++}`;
  let usesIntegerDivision = false;
  function inspectExpression(expression) {
    if (expression.kind === "BinaryExpression") {
      if (expression.operator === "/" && validation.typeTable[expression.id] === "int") usesIntegerDivision = true;
      inspectExpression(expression.left);
      inspectExpression(expression.right);
    } else if (expression.kind === "UnaryExpression") inspectExpression(expression.operand);
  }
  function inspectBlock(block) {
    for (const statement of block.statements) {
      if (statement.kind === "VariableDeclaration" && statement.initializer) inspectExpression(statement.initializer);
      else if (statement.kind === "Assignment") inspectExpression(statement.expression);
      else if (statement.kind === "Output" && statement.mode !== "message") inspectExpression(statement.value);
      else if (statement.kind === "IfStatement") {
        inspectExpression(statement.condition);
        inspectBlock(statement.thenBlock);
        inspectBlock(statement.elseBlock);
      }
    }
  }
  inspectBlock(ast.body);
  const emit = (text, indent, node) => {
    lines.push(`${"    ".repeat(indent)}${text}`);
    if (node?.id) {
      const provenance = ast.provenance.find((entry) => entry.astNodeId === node.id);
      sourceMap.push({ line: lines.length, astNodeId: node.id, sourceRefs: provenance?.origins ?? [] });
    }
  };

  function emitBlock(block, indent) {
    if (!block.statements.length) {
      emit("pass", indent);
      return;
    }
    for (const statement of block.statements) emitStatement(statement, indent);
  }

  if (usesIntegerDivision) {
    lines.push(
      `def ${integerDivisionHelper}(a, b):`,
      "    quotient = abs(a) // abs(b)",
      "    return -quotient if (a < 0) != (b < 0) else quotient",
      "",
    );
  }

  function emitStatement(statement, indent) {
    if (unsupported) return;
    if (codeLevel === "beginner") emit(`# ${beginnerComment(statement)}`, indent);
    if (statement.kind === "VariableDeclaration") {
      if (statement.initializer) {
        emit(`${symbols.get(statement.symbolId).name} = ${pythonExpression(statement.initializer, symbols, validation.typeTable, integerDivisionHelper, compact)}`, indent, statement);
      }
      return;
    }
    if (statement.kind === "Input") {
      const symbol = symbols.get(statement.symbolId);
      const prompt = JSON.stringify(statement.prompt);
      if (symbol.type === "char") {
        emit(`${symbol.name} = input(${prompt})`, indent, statement);
        emit(`if len(${symbol.name}) != 1:`, indent, statement);
        emit(`raise ValueError(${JSON.stringify(`Enter exactly one character for ${symbol.name}.`)})`, indent + 1, statement);
      } else {
        const conversion = symbol.type === "int" ? "int" : "float";
        emit(`${symbol.name} = ${conversion}(input(${prompt}))`, indent, statement);
      }
      return;
    }
    if (statement.kind === "Assignment") {
      emit(`${symbols.get(statement.symbolId).name} = ${pythonExpression(statement.expression, symbols, validation.typeTable, integerDivisionHelper, compact)}`, indent, statement);
      return;
    }
    if (statement.kind === "Output") {
      const value = statement.mode === "message" ? JSON.stringify(statement.message) : pythonExpression(statement.value, symbols, validation.typeTable, integerDivisionHelper, compact);
      const printArgs = statement.mode === "formatted"
        ? `${JSON.stringify(statement.message)}, ${value}`
        : value;
      emit(`print(${printArgs})`, indent, statement);
      return;
    }
    if (statement.kind === "IfStatement") {
      emit(`if ${pythonExpression(statement.condition, symbols, validation.typeTable, integerDivisionHelper, compact)}:`, indent, statement);
      emitBlock(statement.thenBlock, indent + 1);
      emit("else:", indent, statement);
      emitBlock(statement.elseBlock, indent + 1);
      return;
    }
    unsupported = failure(`M1 Python output does not support “${statement.kind}”.`);
  }

  emitBlock(ast.body, 0);
  if (unsupported) return { code: "", sourceMap: [], diagnostics: [unsupported], generatorVersion: PYTHON_GENERATOR_VERSION };
  return { code: `${lines.join("\n")}\n`, sourceMap, diagnostics: [], generatorVersion: PYTHON_GENERATOR_VERSION };
}
