import { validateAstSemantics } from "./ast-validation.js";
import { generateCFromAst } from "./c-generator.js";
import { generatePythonFromAst } from "./python-generator.js";

export const TRACE_ENGINE_VERSION = "1.0.0";
export const DEFAULT_MAX_STEPS = 1000;

/**
 * Deterministically evaluates an expression tree against the variable environment.
 */
export function evaluateExpression(expression, environment, symbolsById) {
  if (!expression || typeof expression !== "object") {
    throw new TypeError("Invalid expression node");
  }

  if (expression.kind === "IntegerLiteral" || expression.kind === "FloatingLiteral") {
    return expression.value;
  }

  if (expression.kind === "CharacterLiteral") {
    return expression.value;
  }

  if (expression.kind === "VariableReference") {
    const symbol = symbolsById.get(expression.symbolId);
    if (!symbol) {
      throw new Error(`Reference to undefined variable “${expression.symbolId}”.`);
    }
    const state = environment[symbol.name];
    if (!state || state.status !== "initialized") {
      throw new Error(`Variable “${symbol.name}” is read before being initialized.`);
    }
    return state.value;
  }

  if (expression.kind === "UnaryExpression") {
    const operand = evaluateExpression(expression.operand, environment, symbolsById);
    if (expression.operator === "!") {
      return !Boolean(operand);
    }
    if (expression.operator === "+") {
      return +operand;
    }
    if (expression.operator === "-") {
      return -operand;
    }
    throw new Error(`Unsupported unary operator: ${expression.operator}`);
  }

  if (expression.kind === "BinaryExpression") {
    const left = evaluateExpression(expression.left, environment, symbolsById);
    const right = evaluateExpression(expression.right, environment, symbolsById);

    switch (expression.operator) {
      case "+":
        return typeof left === "string" || typeof right === "string" ? left + right : left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/": {
        if (right === 0) {
          throw new Error("Runtime division by zero.");
        }
        // In M1 integer division, integers truncate towards zero
        if (Number.isInteger(left) && Number.isInteger(right)) {
          return Math.trunc(left / right);
        }
        return left / right;
      }
      case "%": {
        if (right === 0) {
          throw new Error("Runtime remainder by zero (% 0).");
        }
        return left % right;
      }
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case "&&":
        return Boolean(left && right);
      case "||":
        return Boolean(left || right);
      default:
        throw new Error(`Unsupported binary operator: ${expression.operator}`);
    }
  }

  throw new Error(`Unsupported expression node kind: ${expression.kind}`);
}

/**
 * Produces a human-readable string representation of an expression for beginner explanations.
 */
export function formatExpression(expression, symbolsById) {
  if (!expression) return "";
  if (expression.kind === "IntegerLiteral" || expression.kind === "FloatingLiteral") return String(expression.value);
  if (expression.kind === "CharacterLiteral") return `'${expression.value}'`;
  if (expression.kind === "VariableReference") {
    const symbol = symbolsById.get(expression.symbolId);
    return symbol ? symbol.name : expression.symbolId;
  }
  if (expression.kind === "UnaryExpression") {
    return `${expression.operator}${formatExpression(expression.operand, symbolsById)}`;
  }
  if (expression.kind === "BinaryExpression") {
    return `(${formatExpression(expression.left, symbolsById)} ${expression.operator} ${formatExpression(expression.right, symbolsById)})`;
  }
  return "";
}

/**
 * Clones a variable environment object safely.
 */
function cloneEnvironment(env) {
  const next = {};
  for (const [key, val] of Object.entries(env)) {
    next[key] = { ...val };
  }
  return next;
}

/**
 * Builds the initial variable environment from AST symbols.
 */
function buildInitialEnvironment(symbols) {
  const env = {};
  for (const sym of symbols) {
    env[sym.name] = {
      symbolId: sym.id,
      name: sym.name,
      type: sym.type,
      status: "declared", // 'declared' | 'initialized'
      value: undefined,
      previousValue: undefined,
      changed: false,
    };
  }
  return env;
}

/**
 * Validates and casts an input value according to the expected type.
 */
export function parseAndValidateInput(rawValue, type, variableName) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    throw new Error(`Missing input for variable “${variableName}” (${type}).`);
  }

  const str = String(rawValue).trim();

  if (type === "int") {
    if (!/^-?(?:0|[1-9]\d*)$/.test(str)) {
      throw new Error(`Invalid integer for “${variableName}”: expected a whole number, got “${rawValue}”.`);
    }
    const num = Number(str);
    if (!Number.isSafeInteger(num)) {
      throw new Error(`Integer for “${variableName}” is outside safe numeric limits.`);
    }
    return num;
  }

  if (type === "double") {
    const num = Number(str);
    if (!Number.isFinite(num) || isNaN(num)) {
      throw new Error(`Invalid decimal for “${variableName}”: expected a valid floating-point number, got “${rawValue}”.`);
    }
    return num;
  }

  if (type === "char") {
    if (str.length !== 1) {
      throw new Error(`Invalid character for “${variableName}”: expected exactly one ASCII character, got ${str.length} characters.`);
    }
    const code = str.codePointAt(0);
    if (code > 0x7f) {
      throw new Error(`Invalid character for “${variableName}”: only ASCII characters are supported.`);
    }
    return str;
  }

  throw new Error(`Unsupported variable type: ${type}`);
}

/**
 * Creates a beginner-friendly explanation for a trace step.
 */
function createExplanation(statement, action, context) {
  const { variableName, value, conditionText, conditionResult, branchTaken, outputText, whatNext } = context;

  switch (action) {
    case "start":
      return {
        whatIsHappening: "Algorithm execution begins at the Start node.",
        activeBlock: "Start of program",
        variableChanged: null,
        whyBranchTaken: null,
        whatIsNext: whatNext || "The first instruction will run next.",
      };
    case "declaration":
      return {
        whatIsHappening: value !== undefined
          ? `Variable “${variableName}” is declared and initialized to ${JSON.stringify(value)}.`
          : `Variable “${variableName}” is declared in memory (currently uninitialized).`,
        activeBlock: `Declare ${variableName}`,
        variableChanged: value !== undefined ? `${variableName} = ${JSON.stringify(value)}` : null,
        whyBranchTaken: null,
        whatIsNext: whatNext || "Execution moves to the next instruction.",
      };
    case "input":
      return {
        whatIsHappening: `Read input for “${variableName}”. Received value ${JSON.stringify(value)}.`,
        activeBlock: `Input ${variableName}`,
        variableChanged: `${variableName} = ${JSON.stringify(value)}`,
        whyBranchTaken: null,
        whatIsNext: whatNext || "Proceeding to the next instruction.",
      };
    case "assignment":
      return {
        whatIsHappening: `Assigned new value ${JSON.stringify(value)} to variable “${variableName}”.`,
        activeBlock: `Set ${variableName}`,
        variableChanged: `${variableName} = ${JSON.stringify(value)}`,
        whyBranchTaken: null,
        whatIsNext: whatNext || "Proceeding to the next instruction.",
      };
    case "decision":
      return {
        whatIsHappening: `Evaluated decision condition: ${conditionText} ➔ ${conditionResult ? "TRUE" : "FALSE"}.`,
        activeBlock: `Check ${conditionText}`,
        variableChanged: null,
        whyBranchTaken: conditionResult
          ? `Condition evaluated to TRUE, so execution follows the "Yes" (True) branch.`
          : `Condition evaluated to FALSE, so execution follows the "No" (False) branch.`,
        whatIsNext: whatNext || `Executing the ${branchTaken === "true" ? "True (Yes)" : "False (No)"} branch blocks.`,
      };
    case "output":
      return {
        whatIsHappening: `Printed output to console: ${JSON.stringify(outputText)}.`,
        activeBlock: `Display output`,
        variableChanged: null,
        whyBranchTaken: null,
        whatIsNext: whatNext || "Proceeding to the next instruction.",
      };
    case "end":
      return {
        whatIsHappening: "Algorithm execution reached the End node and finished successfully.",
        activeBlock: "End of program",
        variableChanged: null,
        whyBranchTaken: null,
        whatIsNext: "Execution is complete. You can step backward or reset to replay.",
      };
    default:
      return {
        whatIsHappening: "Executing instruction.",
        activeBlock: statement?.kind || "Operation",
        variableChanged: null,
        whyBranchTaken: null,
        whatIsNext: whatNext || "Moving to next step.",
      };
  }
}

/**
 * Main Deterministic AST Trace Engine.
 * Executes the typed AST statement by statement and returns recorded trace snapshots.
 */
export function generateAstTrace(ast, inputs = {}, options = {}) {
  const maxSteps = options.maxSteps || DEFAULT_MAX_STEPS;

  // 1. Validate AST Semantics
  const validation = validateAstSemantics(ast);
  if (!validation.valid) {
    return {
      success: false,
      diagnostics: validation.diagnostics,
      snapshots: [],
      error: "AST failed semantic validation.",
      engineVersion: TRACE_ENGINE_VERSION,
    };
  }

  // 2. Pre-generate C and Python line maps if possible
  let cSourceMap = [];
  let pySourceMap = [];
  try {
    const cResult = generateCFromAst(ast);
    cSourceMap = cResult.sourceMap || [];
  } catch {}
  try {
    const pyResult = generatePythonFromAst(ast);
    pySourceMap = pyResult.sourceMap || [];
  } catch {}

  const findLineForNode = (nodeId, map) => {
    const match = map.find((m) => m.astNodeId === nodeId);
    return match ? match.line : null;
  };

  const symbolsById = new Map(ast.symbols.map((s) => [s.id, s]));
  const symbolsByName = new Map(ast.symbols.map((s) => [s.name, s]));
  const provenanceByNodeId = new Map(ast.provenance.map((p) => [p.astNodeId, p]));

  const getSourceRefs = (nodeId) => {
    return provenanceByNodeId.get(nodeId)?.origins || [];
  };

  const getFlowchartNodeId = (nodeId) => {
    const prov = provenanceByNodeId.get(nodeId);
    if (!prov) return null;
    const flowRef = prov.origins.find((o) => o.sourceKind === "flowchart");
    return flowRef ? flowRef.sourceObjectId : null;
  };

  // 3. Prepare Execution State
  let currentEnv = buildInitialEnvironment(ast.symbols);
  const outputHistory = [];
  const snapshots = [];
  let stepIndex = 0;
  let hasRuntimeError = false;
  let runtimeErrorMessage = null;

  function pushSnapshot({
    astNodeId,
    action,
    context = {},
    status = "running",
    decision = null,
    newOutput = null,
    error = null,
  }) {
    const cLine = findLineForNode(astNodeId, cSourceMap);
    const pythonLine = findLineForNode(astNodeId, pySourceMap);
    const sourceRefs = getSourceRefs(astNodeId);
    const flowchartNodeId = getFlowchartNodeId(astNodeId);

    const explanation = createExplanation(null, action, context);

    snapshots.push({
      stepIndex,
      astNodeId,
      flowchartNodeId,
      sourceRefs,
      cLine,
      pythonLine,
      lineMappingAvailable: Boolean(cLine || pythonLine),
      variables: cloneEnvironment(currentEnv),
      decision,
      outputHistory: [...outputHistory],
      newOutput,
      action,
      explanation,
      status,
      error,
    });

    stepIndex += 1;
  }

  // Record initial START snapshot
  pushSnapshot({
    astNodeId: ast.body.id,
    action: "start",
    context: { whatNext: "Declaring variables and evaluating initial statements." },
    status: "ready",
  });

  // 4. Recursive Statement Execution
  function executeBlock(block) {
    for (let i = 0; i < block.statements.length; i++) {
      if (snapshots.length >= maxSteps) {
        hasRuntimeError = true;
        runtimeErrorMessage = `Execution step limit exceeded (${maxSteps} steps). Possible infinite loop or excessive statements.`;
        pushSnapshot({
          astNodeId: block.statements[i].id,
          action: "error",
          context: { whatNext: "Execution halted." },
          status: "max_steps_exceeded",
          error: runtimeErrorMessage,
        });
        return;
      }

      const stmt = block.statements[i];
      const nextStmt = block.statements[i + 1];
      const nextDesc = nextStmt ? `Next: ${nextStmt.kind}` : "Moving forward";

      try {
        executeStatement(stmt, nextDesc);
      } catch (err) {
        hasRuntimeError = true;
        runtimeErrorMessage = err.message;
        pushSnapshot({
          astNodeId: stmt.id,
          action: "error",
          context: { whatNext: "Execution halted due to runtime error." },
          status: "error",
          error: err.message,
        });
        return;
      }

      if (hasRuntimeError) return;
    }
  }

  function executeStatement(stmt, whatNext) {
    // Reset all changed flags before this statement
    for (const v of Object.values(currentEnv)) {
      v.changed = false;
    }

    if (stmt.kind === "VariableDeclaration") {
      const sym = symbolsById.get(stmt.symbolId);
      if (!sym) throw new Error(`Declaration references missing symbol: ${stmt.symbolId}`);

      let initVal = undefined;
      if (stmt.initializer) {
        initVal = evaluateExpression(stmt.initializer, currentEnv, symbolsById);
        // Cast if required (e.g. int vs double)
        if (sym.type === "int") initVal = Math.trunc(initVal);
        else if (sym.type === "double") initVal = Number(initVal);
      }

      const prev = currentEnv[sym.name].value;
      currentEnv[sym.name] = {
        ...currentEnv[sym.name],
        status: initVal !== undefined ? "initialized" : "declared",
        value: initVal,
        previousValue: prev,
        changed: initVal !== undefined,
      };

      pushSnapshot({
        astNodeId: stmt.id,
        action: "declaration",
        context: {
          variableName: sym.name,
          value: initVal,
          whatNext,
        },
      });
      return;
    }

    if (stmt.kind === "Input") {
      const sym = symbolsById.get(stmt.symbolId);
      if (!sym) throw new Error(`Input references missing symbol: ${stmt.symbolId}`);

      // Look up input value by variable name or symbol ID
      const rawInput = inputs[sym.name] !== undefined ? inputs[sym.name] : inputs[sym.id];
      const parsedValue = parseAndValidateInput(rawInput, sym.type, sym.name);

      const prev = currentEnv[sym.name].value;
      currentEnv[sym.name] = {
        ...currentEnv[sym.name],
        status: "initialized",
        value: parsedValue,
        previousValue: prev,
        changed: true,
      };

      pushSnapshot({
        astNodeId: stmt.id,
        action: "input",
        context: {
          variableName: sym.name,
          value: parsedValue,
          whatNext,
        },
      });
      return;
    }

    if (stmt.kind === "Assignment") {
      const sym = symbolsById.get(stmt.symbolId);
      if (!sym) throw new Error(`Assignment references missing symbol: ${stmt.symbolId}`);

      let val = evaluateExpression(stmt.expression, currentEnv, symbolsById);
      if (sym.type === "int") val = Math.trunc(val);
      else if (sym.type === "double") val = Number(val);

      const prev = currentEnv[sym.name].value;
      currentEnv[sym.name] = {
        ...currentEnv[sym.name],
        status: "initialized",
        value: val,
        previousValue: prev,
        changed: true,
      };

      pushSnapshot({
        astNodeId: stmt.id,
        action: "assignment",
        context: {
          variableName: sym.name,
          value: val,
          whatNext,
        },
      });
      return;
    }

    if (stmt.kind === "Output") {
      let outText = "";
      if (stmt.mode === "message") {
        outText = stmt.message;
      } else {
        const val = evaluateExpression(stmt.value, currentEnv, symbolsById);
        outText = String(val);
      }

      outputHistory.push(outText);

      pushSnapshot({
        astNodeId: stmt.id,
        action: "output",
        newOutput: outText,
        context: {
          outputText: outText,
          whatNext,
        },
      });
      return;
    }

    if (stmt.kind === "IfStatement") {
      const conditionVal = evaluateExpression(stmt.condition, currentEnv, symbolsById);
      const isTrue = Boolean(conditionVal);
      const branchTaken = isTrue ? "true" : "false";
      const condText = formatExpression(stmt.condition, symbolsById);

      pushSnapshot({
        astNodeId: stmt.id,
        action: "decision",
        decision: {
          conditionText: condText,
          result: isTrue,
          branch: branchTaken,
          branchTaken,
        },
        context: {
          conditionText: condText,
          conditionResult: isTrue,
          branchTaken,
          whatNext: isTrue ? "Entering the YES/True branch." : "Entering the NO/False branch.",
        },
      });

      // Execute chosen branch block
      if (isTrue) {
        executeBlock(stmt.thenBlock);
      } else {
        executeBlock(stmt.elseBlock);
      }
      return;
    }

    throw new Error(`Unsupported statement kind in trace engine: ${stmt.kind}`);
  }

  // Execute entire body
  executeBlock(ast.body);

  // If no error occurred, push final END snapshot
  if (!hasRuntimeError) {
    for (const v of Object.values(currentEnv)) {
      v.changed = false;
    }
    pushSnapshot({
      astNodeId: ast.body.id,
      action: "end",
      context: { whatNext: "Program finished successfully." },
      status: "completed",
    });
  }

  return {
    success: !hasRuntimeError,
    error: runtimeErrorMessage,
    snapshots,
    totalSteps: snapshots.length,
    finalEnvironment: currentEnv,
    outputHistory,
    engineVersion: TRACE_ENGINE_VERSION,
  };
}
