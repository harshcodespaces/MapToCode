import { createDiagnostic } from "./diagnostics.js";
import { validateAstContract } from "./contract-validation.js";

const NUMERIC = new Set(["int", "double"]);
const C_RESERVED_IDENTIFIERS = new Set(
  "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Alignas _Alignof _Atomic _Bool _Complex _Generic _Imaginary _Noreturn _Static_assert _Thread_local main printf scanf".split(
    " "
  )
);

function collectNodes(node, result = []) {
  if (!node || typeof node !== "object") return result;

  result.push(node);

  if (node.kind === "Block") {
    node.statements.forEach((child) =>
      collectNodes(child, result)
    );
  }

  else if (
    node.kind === "VariableDeclaration" &&
    node.initializer
  ) {
    collectNodes(
      node.initializer,
      result
    );
  }

  else if (node.kind === "Assignment") {
    collectNodes(
      node.expression,
      result
    );
  }

  else if (
    node.kind === "Output" &&
    node.mode !== "message"
  ) {
    collectNodes(
      node.value,
      result
    );
  }

  else if (
    node.kind === "IfStatement"
  ) {
    collectNodes(
      node.condition,
      result
    );

    collectNodes(
      node.thenBlock,
      result
    );

    collectNodes(
      node.elseBlock,
      result
    );
  }

  /*
   * WHILE SUPPORT
   */
  else if (
    node.kind === "WhileStatement"
  ) {
    collectNodes(
      node.condition,
      result
    );

    collectNodes(
      node.body,
      result
    );
  }

  else if (
    node.kind === "UnaryExpression"
  ) {
    collectNodes(
      node.operand,
      result
    );
  }

  else if (
    node.kind === "BinaryExpression"
  ) {
    collectNodes(
      node.left,
      result
    );

    collectNodes(
      node.right,
      result
    );
  }

  return result;
}

function constantValue(expression) {
  if (
    expression.kind ===
      "IntegerLiteral" ||
    expression.kind ===
      "FloatingLiteral"
  ) {
    return expression.value;
  }

  if (
    expression.kind ===
      "CharacterLiteral" ||
    expression.kind ===
      "VariableReference"
  ) {
    return undefined;
  }

  if (
    expression.kind ===
    "UnaryExpression"
  ) {
    const value =
      constantValue(
        expression.operand
      );

    if (value === undefined) {
      return undefined;
    }

    if (
      expression.operator === "+"
    ) {
      return +value;
    }

    if (
      expression.operator === "-"
    ) {
      return -value;
    }

    if (
      expression.operator === "!"
    ) {
      return !value;
    }

    return undefined;
  }

  if (
    expression.kind !==
    "BinaryExpression"
  ) {
    return undefined;
  }

  const left =
    constantValue(
      expression.left
    );

  const right =
    constantValue(
      expression.right
    );

  if (
    left === undefined ||
    right === undefined
  ) {
    return undefined;
  }

  switch (
    expression.operator
  ) {
    case "+":
      return left + right;

    case "-":
      return left - right;

    case "*":
      return left * right;

    case "/":
      return right === 0
        ? undefined
        : left / right;

    case "%":
      return right === 0
        ? undefined
        : left % right;

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
      return Boolean(
        left && right
      );

    case "||":
      return Boolean(
        left || right
      );

    default:
      return undefined;
  }
}

function canAssign(
  target,
  value
) {
  if (
    target === "double"
  ) {
    return (
      value === "int" ||
      value === "double"
    );
  }

  return target === value;
}

export function validateAstSemantics(
  ast
) {
  const diagnostics =
    validateAstContract(ast);

  if (diagnostics.length) {
    return {
      valid: false,
      diagnostics,
      typeTable: {},
    };
  }

  const nodes =
    collectNodes(ast.body);

  const provenanceByNode =
    new Map();

  for (
    const origin of ast.provenance
  ) {
    if (
      provenanceByNode.has(
        origin.astNodeId
      )
    ) {
      diagnostics.push(
        createDiagnostic({
          code:
            "AST_PROVENANCE_INVALID",
          category:
            "semantics",
          message:
            `AST node “${origin.astNodeId}” has more than one provenance record.`,
        })
      );
    }

    provenanceByNode.set(
      origin.astNodeId,
      origin
    );
  }

  const sourceRefsFor =
    (nodeId) =>
      provenanceByNode.get(
        nodeId
      )?.origins ?? [];

  const report = (
    code,
    category,
    message,
    node
  ) =>
    diagnostics.push(
      createDiagnostic({
        code,
        category,
        message,
        sourceRefs:
          node?.id
            ? sourceRefsFor(
                node.id
              )
            : [],
      })
    );

  const nodeIds =
    new Set();

  for (
    const node of nodes
  ) {
    if (
      nodeIds.has(node.id)
    ) {
      report(
        "AST_NODE_ID_DUPLICATE",
        "schema",
        `AST node ID “${node.id}” is duplicated.`,
        node
      );
    }

    nodeIds.add(node.id);

    if (
      !provenanceByNode.has(
        node.id
      )
    ) {
      report(
        "AST_PROVENANCE_INVALID",
        "semantics",
        `AST node “${node.id}” has no source provenance.`,
        node
      );
    }
  }

  for (
    const entry of
      provenanceByNode.values()
  ) {
    if (
      !nodeIds.has(
        entry.astNodeId
      )
    ) {
      report(
        "AST_PROVENANCE_INVALID",
        "semantics",
        `Provenance refers to missing AST node “${entry.astNodeId}”.`
      );
    }
  }

  const symbols =
    new Map();

  const symbolNames =
    new Map();

  for (
    const symbol of ast.symbols
  ) {
    if (
      symbols.has(
        symbol.id
      ) ||
      symbolNames.has(
        symbol.name
      )
    ) {
      report(
        "SYMBOL_DUPLICATE",
        "structure",
        `Symbol ID or name “${symbol.name}” is duplicated.`
      );
    }

    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
        symbol.name
      ) ||
      C_RESERVED_IDENTIFIERS.has(
        symbol.name
      )
    ) {
      report(
        "SYMBOL_NAME_INVALID",
        "schema",
        `“${symbol.name}” is not a valid C variable name.`
      );
    }

    symbols.set(
      symbol.id,
      symbol
    );

    symbolNames.set(
      symbol.name,
      symbol.id
    );
  }

  const declarationCounts =
    new Map();

  for (
    const node of nodes
  ) {
    if (
      node.kind ===
      "VariableDeclaration"
    ) {
      declarationCounts.set(
        node.symbolId,
        (
          declarationCounts.get(
            node.symbolId
          ) ?? 0
        ) + 1
      );
    }
  }

  for (
    const symbol of ast.symbols
  ) {
    const count =
      declarationCounts.get(
        symbol.id
      ) ?? 0;

    if (count === 0) {
      report(
        "SYMBOL_UNDECLARED",
        "structure",
        `Symbol “${symbol.name}” has no declaration in the program.`,
        ast.body
      );
    }

    if (count > 1) {
      report(
        "SYMBOL_DUPLICATE",
        "structure",
        `Symbol “${symbol.name}” is declared more than once.`
      );
    }
  }

  const typeTable = {};

  const initialized =
    new Set();

  const declared =
    new Set();

  function infer(
    expression,
    initializedBefore,
    declaredBefore = declared
  ) {
    if (
      expression.kind ===
      "IntegerLiteral"
    ) {
      return setType(
        expression,
        "int"
      );
    }

    if (
      expression.kind ===
      "FloatingLiteral"
    ) {
      return setType(
        expression,
        "double"
      );
    }

    if (
      expression.kind ===
      "CharacterLiteral"
    ) {
      return setType(
        expression,
        "char"
      );
    }

    if (
      expression.kind ===
      "VariableReference"
    ) {
      const symbol =
        symbols.get(
          expression.symbolId
        );

      if (!symbol) {
        report(
          "SYMBOL_UNDECLARED",
          "semantics",
          `Expression references missing symbol “${expression.symbolId}”.`,
          expression
        );

        return undefined;
      }

      if (
        !declaredBefore.has(
          symbol.id
        )
      ) {
        report(
          "SYMBOL_UNDECLARED",
          "semantics",
          `“${symbol.name}” is used before its declaration.`,
          expression
        );
      }

      else if (
        !initializedBefore.has(
          symbol.id
        )
      ) {
        report(
          "SYMBOL_UNINITIALIZED",
          "semantics",
          `“${symbol.name}” may be read before it has a value.`,
          expression
        );
      }

      return setType(
        expression,
        symbol.type
      );
    }

    if (
      expression.kind ===
      "UnaryExpression"
    ) {
      const operand =
        infer(
          expression.operand,
          initializedBefore,
          declaredBefore
        );

      if (
        expression.operator ===
        "!"
      ) {
        if (
          operand !== "bool"
        ) {
          report(
            "TYPE_OPERAND_INVALID",
            "type",
            "Logical ! needs a Boolean condition.",
            expression
          );
        }

        return setType(
          expression,
          operand === "bool"
            ? "bool"
            : undefined
        );
      }

      if (
        !NUMERIC.has(
          operand
        )
      ) {
        report(
          "TYPE_OPERAND_INVALID",
          "type",
          `Unary ${expression.operator} needs a numeric value.`,
          expression
        );

        return setType(
          expression,
          undefined
        );
      }

      return setType(
        expression,
        operand
      );
    }

    const left =
      infer(
        expression.left,
        initializedBefore,
        declaredBefore
      );

    const right =
      infer(
        expression.right,
        initializedBefore,
        declaredBefore
      );

    const op =
      expression.operator;

    if (
      [
        "+",
        "-",
        "*",
        "/",
      ].includes(op)
    ) {
      if (
        !NUMERIC.has(left) ||
        !NUMERIC.has(right)
      ) {
        if (
          left !== undefined &&
          right !== undefined
        ) {
          report(
            "TYPE_OPERAND_INVALID",
            "type",
            `Operator ${op} needs numeric operands.`,
            expression
          );
        }

        return setType(
          expression,
          undefined
        );
      }

      if (
        op === "/" &&
        constantValue(
          expression.right
        ) === 0
      ) {
        report(
          "SEM_DIVISION_BY_ZERO_STATIC",
          "semantics",
          "This expression divides by a value that is statically known to be zero.",
          expression
        );
      }

      return setType(
        expression,
        left === "double" ||
          right === "double"
          ? "double"
          : "int"
      );
    }

    if (op === "%") {
      if (
        left !== "int" ||
        right !== "int"
      ) {
        if (
          left !== undefined &&
          right !== undefined
        ) {
          report(
            "TYPE_OPERAND_INVALID",
            "type",
            "Remainder % needs two int operands.",
            expression
          );
        }

        return setType(
          expression,
          undefined
        );
      }

      if (
        constantValue(
          expression.right
        ) === 0
      ) {
        report(
          "SEM_DIVISION_BY_ZERO_STATIC",
          "semantics",
          "This expression uses a remainder divisor statically known to be zero.",
          expression
        );
      }

      return setType(
        expression,
        "int"
      );
    }

    if (
      [
        "<",
        "<=",
        ">",
        ">=",
      ].includes(op)
    ) {
      if (
        !NUMERIC.has(left) ||
        !NUMERIC.has(right)
      ) {
        if (
          left !== undefined &&
          right !== undefined
        ) {
          report(
            "TYPE_OPERAND_INVALID",
            "type",
            `Comparison ${op} needs numeric operands; character ordering is not supported.`,
            expression
          );
        }

        return setType(
          expression,
          undefined
        );
      }

      return setType(
        expression,
        "bool"
      );
    }

    if (
      [
        "==",
        "!=",
      ].includes(op)
    ) {
      const compatible =
        (
          NUMERIC.has(left) &&
          NUMERIC.has(right)
        ) ||
        (
          left === "char" &&
          right === "char"
        );

      if (!compatible) {
        if (
          left !== undefined &&
          right !== undefined
        ) {
          report(
            "TYPE_OPERAND_INVALID",
            "type",
            `Comparison ${op} needs compatible scalar values.`,
            expression
          );
        }

        return setType(
          expression,
          undefined
        );
      }

      return setType(
        expression,
        "bool"
      );
    }

    if (
      [
        "&&",
        "||",
      ].includes(op)
    ) {
      if (
        left !== "bool" ||
        right !== "bool"
      ) {
        if (
          left !== undefined &&
          right !== undefined
        ) {
          report(
            "TYPE_OPERAND_INVALID",
            "type",
            `Logical ${op} needs Boolean conditions on both sides.`,
            expression
          );
        }

        return setType(
          expression,
          undefined
        );
      }

      return setType(
        expression,
        "bool"
      );
    }

    report(
      "GEN_AST_UNSUPPORTED",
      "generation",
      `Operator “${op}” is not supported by the M1 expression rules.`,
      expression
    );

    return setType(
      expression,
      undefined
    );
  }

  function setType(
    node,
    type
  ) {
    if (type) {
      typeTable[node.id] =
        type;
    }

    return type;
  }

  function checkAssignmentType(
    symbolId,
    valueType,
    node
  ) {
    const symbol =
      symbols.get(
        symbolId
      );

    if (!symbol) {
      report(
        "SYMBOL_UNDECLARED",
        "semantics",
        `Statement targets missing symbol “${symbolId}”.`,
        node
      );

      return null;
    }

    if (
      valueType !== undefined &&
      !canAssign(
        symbol.type,
        valueType
      )
    ) {
      report(
        "TYPE_ASSIGNMENT_INVALID",
        "type",
        `Cannot assign ${valueType ?? "unknown"} to ${symbol.type} variable “${symbol.name}”.`,
        node
      );
    }

    return symbol;
  }

  function checkBlock(
    block,
    state
  ) {
    let currentDeclared =
      new Set(
        state.declared
      );

    let currentInitialized =
      new Set(
        state.initialized
      );

    for (
      const statement of
        block.statements
    ) {
      if (
        statement.kind ===
        "VariableDeclaration"
      ) {
        const symbol =
          symbols.get(
            statement.symbolId
          );

        if (!symbol) {
          report(
            "SYMBOL_UNDECLARED",
            "semantics",
            `Declaration references missing symbol “${statement.symbolId}”.`,
            statement
          );

          continue;
        }

        if (
          currentDeclared.has(
            symbol.id
          )
        ) {
          report(
            "SYMBOL_DUPLICATE",
            "structure",
            `“${symbol.name}” is declared more than once on this path.`,
            statement
          );
        }

        currentDeclared.add(
          symbol.id
        );

        if (
          statement.initializer
        ) {
          const valueType =
            infer(
              statement.initializer,
              currentInitialized,
              currentDeclared
            );

          checkAssignmentType(
            symbol.id,
            valueType,
            statement
          );

          currentInitialized.add(
            symbol.id
          );
        }
      }

      else if (
        statement.kind ===
        "Input"
      ) {
        const symbol =
          symbols.get(
            statement.symbolId
          );

        if (!symbol) {
          report(
            "SYMBOL_UNDECLARED",
            "semantics",
            `Input references missing symbol “${statement.symbolId}”.`,
            statement
          );
        }

        else if (
          !currentDeclared.has(
            symbol.id
          )
        ) {
          report(
            "SYMBOL_UNDECLARED",
            "semantics",
            `“${symbol.name}” needs a declaration before input.`,
            statement
          );
        }

        else {
          currentInitialized.add(
            symbol.id
          );
        }
      }

      else if (
        statement.kind ===
        "Assignment"
      ) {
        const valueType =
          infer(
            statement.expression,
            currentInitialized,
            currentDeclared
          );

        const symbol =
          checkAssignmentType(
            statement.symbolId,
            valueType,
            statement
          );

        if (
          symbol &&
          !currentDeclared.has(
            symbol.id
          )
        ) {
          report(
            "SYMBOL_UNDECLARED",
            "semantics",
            `“${symbol.name}” needs a declaration before assignment.`,
            statement
          );
        }

        else if (symbol) {
          currentInitialized.add(
            symbol.id
          );
        }
      }

      else if (
        statement.kind ===
        "Output"
      ) {
        if (
          statement.mode !==
          "message"
        ) {
          infer(
            statement.value,
            currentInitialized,
            currentDeclared
          );
        }
      }

      else if (
        statement.kind ===
        "IfStatement"
      ) {
        const conditionType =
          infer(
            statement.condition,
            currentInitialized,
            currentDeclared
          );

        if (
          conditionType !==
            undefined &&
          conditionType !==
            "bool"
        ) {
          report(
            "TYPE_CONDITION_INVALID",
            "type",
            "An IfStatement condition must have Boolean type.",
            statement
          );
        }

        const thenState =
          checkBlock(
            statement.thenBlock,
            {
              declared:
                currentDeclared,
              initialized:
                currentInitialized,
            }
          );

        const elseState =
          checkBlock(
            statement.elseBlock,
            {
              declared:
                currentDeclared,
              initialized:
                currentInitialized,
            }
          );

        currentDeclared =
          new Set(
            [
              ...thenState.declared,
            ].filter((id) =>
              elseState.declared.has(
                id
              )
            )
          );

        currentInitialized =
          new Set(
            [
              ...thenState.initialized,
            ].filter((id) =>
              elseState.initialized.has(
                id
              )
            )
          );
      }

      /*
       * WHILE STATEMENT
       *
       * The loop condition must be Boolean.
       * The body is validated using the state
       * that exists before entering the loop.
       *
       * We deliberately do NOT merge the loop
       * body's initialized state into the outer
       * state because a WHILE loop can execute
       * zero times.
       */
      else if (
        statement.kind ===
        "WhileStatement"
      ) {
        const conditionType =
          infer(
            statement.condition,
            currentInitialized,
            currentDeclared
          );

        if (
          conditionType !==
            undefined &&
          conditionType !==
            "bool"
        ) {
          report(
            "TYPE_CONDITION_INVALID",
            "type",
            "A WhileStatement condition must have Boolean type.",
            statement
          );
        }

        checkBlock(
          statement.body,
          {
            declared:
              currentDeclared,
            initialized:
              currentInitialized,
          }
        );
      }
    }

    return {
      declared:
        currentDeclared,

      initialized:
        currentInitialized,
    };
  }

  checkBlock(
    ast.body,
    {
      declared,
      initialized,
    }
  );

  return {
    valid:
      diagnostics.length ===
      0,

    diagnostics,

    typeTable,
  };
}