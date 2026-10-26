import { validateAstSemantics } from "./ast-validation.js";
import { createDiagnostic } from "./diagnostics.js";

export const JAVA_GENERATOR_VERSION = "1.0.0";

const JAVA_RESERVED_NAMES = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void", "volatile",
  "while", "true", "false", "null", "String", "System", "Scanner", "Main"
]);

function javaString(value) {
  return JSON.stringify(value);
}

function javaCharacter(value) {
  const escapes = { "\\": "\\\\", "'": "\\'", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
  const escaped = escapes[value] ?? value;
  return `'${escaped}'`;
}

function javaNumber(value, kind) {
  const text = String(value);
  if (kind === "FloatingLiteral" && !/[.eE]/.test(text)) return `${text}.0`;
  return text;
}

function javaExpression(expression, symbols) {
  if (expression.kind === "IntegerLiteral" || expression.kind === "FloatingLiteral") {
    return javaNumber(expression.value, expression.kind);
  }
  if (expression.kind === "CharacterLiteral") return javaCharacter(expression.value);
  if (expression.kind === "VariableReference") return symbols.get(expression.symbolId).name;
  if (expression.kind === "UnaryExpression") {
    return `(${expression.operator}${javaExpression(expression.operand, symbols)})`;
  }
  if (expression.kind === "BinaryExpression") {
    return `(${javaExpression(expression.left, symbols)} ${expression.operator} ${javaExpression(expression.right, symbols)})`;
  }
  throw new TypeError(`Unsupported Java expression node: ${expression.kind}`);
}

function failure(message, sourceRefs = []) {
  return createDiagnostic({ code: "GEN_AST_UNSUPPORTED", category: "generation", message, sourceRefs });
}

export function generateJavaFromAst(ast, options = {}) {
  const className = options.className || "Main";
  const validation = validateAstSemantics(ast);
  if (!validation.valid) {
    return { code: "", sourceMap: [], diagnostics: validation.diagnostics, generatorVersion: JAVA_GENERATOR_VERSION };
  }

  const symbols = new Map(ast.symbols.map((symbol) => [symbol.id, symbol]));

  const invalidName = ast.symbols.find((symbol) => JAVA_RESERVED_NAMES.has(symbol.name));
  if (invalidName) {
    return {
      code: "",
      sourceMap: [],
      generatorVersion: JAVA_GENERATOR_VERSION,
      diagnostics: [failure(`“${invalidName.name}” is a Java keyword or reserved name. Rename this variable before generating Java.`)]
    };
  }

  let hasInput = false;
  function checkInput(block) {
    for (const stmt of block.statements) {
      if (stmt.kind === "Input") hasInput = true;
      else if (stmt.kind === "IfStatement") {
        checkInput(stmt.thenBlock);
        checkInput(stmt.elseBlock);
      }
    }
  }
  checkInput(ast.body);

  const lines = [];
  const sourceMap = [];
  let unsupported = null;

  if (hasInput) {
    lines.push("import java.util.Scanner;", "");
  }

  lines.push(`public class ${className} {`);
  lines.push("    public static void main(String[] args) {");

  const emit = (text, indent, node) => {
    const line = `${"    ".repeat(indent)}${text}`;
    lines.push(line);
    if (node?.id) {
      const provenance = ast.provenance.find((entry) => entry.astNodeId === node.id);
      sourceMap.push({ line: lines.length, astNodeId: node.id, sourceRefs: provenance?.origins ?? [] });
    }
  };

  if (hasInput) {
    emit("Scanner scanner = new Scanner(System.in);", 2);
  }

  function javaType(type) {
    if (type === "int") return "int";
    if (type === "double") return "double";
    if (type === "char") return "char";
    if (type === "bool") return "boolean";
    return "String";
  }

  function emitStatement(statement, indent) {
    if (unsupported) return;

    if (statement.kind === "VariableDeclaration") {
      const symbol = symbols.get(statement.symbolId);
      const jType = javaType(symbol.type);
      const initializer = statement.initializer ? ` = ${javaExpression(statement.initializer, symbols)}` : "";
      emit(`${jType} ${symbol.name}${initializer};`, indent, statement);
      return;
    }

    if (statement.kind === "Input") {
      const symbol = symbols.get(statement.symbolId);
      if (statement.prompt) {
        emit(`System.out.print(${javaString(statement.prompt)});`, indent, statement);
      }
      let readExpr = "scanner.next()";
      if (symbol.type === "int") readExpr = "scanner.nextInt()";
      else if (symbol.type === "double") readExpr = "scanner.nextDouble()";
      else if (symbol.type === "char") readExpr = "scanner.next().charAt(0)";
      else if (symbol.type === "bool") readExpr = "scanner.nextBoolean()";

      emit(`${symbol.name} = ${readExpr};`, indent, statement);
      return;
    }

    if (statement.kind === "Assignment") {
      const symbol = symbols.get(statement.symbolId);
      emit(`${symbol.name} = ${javaExpression(statement.expression, symbols)};`, indent, statement);
      return;
    }

    if (statement.kind === "Output") {
      if (statement.mode === "message") {
        emit(`System.out.println(${javaString(statement.message)});`, indent, statement);
        return;
      }
      emit(`System.out.println(${javaExpression(statement.value, symbols)});`, indent, statement);
      return;
    }

    if (statement.kind === "IfStatement") {
      emit(`if (${javaExpression(statement.condition, symbols)}) {`, indent, statement);
      emitBlock(statement.thenBlock, indent + 1);
      emit("} else {", indent, statement);
      emitBlock(statement.elseBlock, indent + 1);
      emit("}", indent, statement);
      return;
    }
  }

  function emitBlock(block, indent) {
    for (const statement of block.statements) {
      emitStatement(statement, indent);
    }
  }

  emitBlock(ast.body, 2);

  if (hasInput) {
    emit("scanner.close();", 2);
  }

  lines.push("    }");
  lines.push("}");
  lines.push("");

  if (unsupported) {
    return { code: "", sourceMap: [], diagnostics: [unsupported], generatorVersion: JAVA_GENERATOR_VERSION };
  }

  return {
    code: lines.join("\n"),
    sourceMap,
    diagnostics: [],
    generatorVersion: JAVA_GENERATOR_VERSION
  };
}
