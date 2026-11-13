/**
 * Pseudocode Parser for MapToCode
 *
 * Converts learner-friendly pseudocode into a FlowchartGraph.
 *
 * Supported constructs:
 * - BEGIN / START
 * - END
 * - INPUT / READ
 * - DECLARE / CONSTANT
 * - SET / assignments
 * - IF / ELSE / END IF
 * - WHILE / END WHILE
 * - OUTPUT / PRINT
 *
 * WHILE loops are represented in the flowchart as:
 *
 *              ┌───────────────┐
 *              │   WHILE cond  │
 *              └───────┬───────┘
 *                  true│   │false
 *                      ↓   ↓
 *                   BODY   EXIT
 *                      │
 *                      └──────→ WHILE cond
 */

export function parsePseudocodeToFlowchart(
  text,
  projectId = "parsed-project"
) {
  if (!text || typeof text !== "string") {
    return {
      success: false,
      error: "Pseudocode is empty.",
      flowchart: null,
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("#") &&
        !line.startsWith("//")
    );

  if (lines.length === 0) {
    return {
      success: false,
      error: "Pseudocode is empty.",
      flowchart: null,
    };
  }

  let idCounter = 1;

  const genId = (prefix) =>
    `node-${prefix}-${idCounter++}-${Date.now()
      .toString(36)
      .slice(-4)}`;

  const nodes = [];
  const edges = [];
  const positions = {};

  const startId = "start";
  const endId = "end";

  nodes.push({
    id: startId,
    kind: "start",
    payload: {},
  });

  positions[startId] = {
    x: 380,
    y: 40,
  };

  let cursor = 0;

  /**
   * Parse a block of pseudocode.
   *
   * The function stops without consuming:
   * - ELSE
   * - END IF
   * - END WHILE
   * - END
   *
   * The caller is responsible for consuming the corresponding
   * closing keyword.
   */
  function parseBlock() {
    const block = [];

    while (cursor < lines.length) {
      const line = lines[cursor];

      /*
       * Block terminators.
       *
       * IMPORTANT:
       * Do not consume these here.
       * The parent construct consumes them.
       */
      if (
        /^ELSE$/i.test(line) ||
        /^END\s*IF$/i.test(line) ||
        /^ENDIF$/i.test(line) ||
        /^END\s*WHILE$/i.test(line) ||
        /^END$/i.test(line)
      ) {
        break;
      }

      /*
       * BEGIN / START
       */
      if (/^(BEGIN|START)$/i.test(line)) {
        cursor++;
        continue;
      }

      /*
       * DECLARE / CONSTANT
       *
       * Examples:
       * DECLARE x
       * DECLARE x : int
       * DECLARE x : double = 10.5
       * CONSTANT PI : double = 3.14
       */
      const declarationMatch = line.match(
        /^(?:DECLARE|CONSTANT)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(int|double|float|char))?(?:\s*=\s*(.+))?$/i
      );

      if (declarationMatch) {
        const [, name, declaredType, initializer] =
          declarationMatch;

        const cleanInitializer =
          initializer?.trim();

        const normalizedDeclaredType =
          declaredType?.toLowerCase();

        let inferredType = normalizedDeclaredType;

        if (normalizedDeclaredType === "float") {
          inferredType = "double";
        }

        if (!inferredType) {
          if (
            cleanInitializer &&
            /(?:\.\d|\d[eE][+-]?\d)/.test(
              cleanInitializer
            )
          ) {
            inferredType = "double";
          } else {
            inferredType = "int";
          }
        }

        block.push({
          type: "declaration",
          name,
          valueType: inferredType,
          initializer: cleanInitializer,
        });

        cursor++;
        continue;
      }

      /*
       * INPUT / READ
       *
       * Examples:
       * INPUT x
       * READ x
       * INPUT x PROMPT "Enter number"
       */
      if (
        /^INPUT\b/i.test(line) ||
        /^READ\b/i.test(line)
      ) {
        const afterInput = line
          .replace(/^(INPUT|READ)\s+/i, "")
          .trim();

        const promptMatch = afterInput.match(
          /PROMPT\s+["']([^"']*)["']/i
        );

        const prompt = promptMatch
          ? promptMatch[1]
          : "";

        const namePart = afterInput
          .replace(
            /PROMPT\s+["'][^"']*["']/i,
            ""
          )
          .trim();

        const varName =
          namePart.split(/[\s:]+/)[0] || "x";

        block.push({
          type: "input",
          name: varName,
          prompt:
            prompt || `Enter ${varName}: `,
        });

        cursor++;
        continue;
      }

      /*
       * OUTPUT / PRINT
       *
       * Examples:
       * OUTPUT "Hello"
       * OUTPUT x
       * PRINT x
       * OUTPUT "Value:", x
       */
      if (
        /^OUTPUT\b/i.test(line) ||
        /^PRINT\b/i.test(line)
      ) {
        const raw = line
          .replace(/^(OUTPUT|PRINT)\s+/i, "")
          .trim();

        const formattedMatch = raw.match(
          /^["']([^"']*)["']\s*,\s*(.+)$/
        );

        const stringMatch = raw.match(
          /^["']([^"']*)["']$/
        );

        if (formattedMatch) {
          block.push({
            type: "output",
            mode: "formatted",
            message: formattedMatch[1],
            expression:
              formattedMatch[2].trim(),
          });
        } else if (stringMatch) {
          block.push({
            type: "output",
            mode: "message",
            message: stringMatch[1],
          });
        } else {
          block.push({
            type: "output",
            mode: "expression",
            expression: raw,
          });
        }

        cursor++;
        continue;
      }

      /*
       * IF
       *
       * Examples:
       * IF x > 10 THEN
       * IF x > 10
       */
      if (/^IF\b/i.test(line)) {
        const conditionMatch =
          line.match(
            /^IF\s+(.+?)\s+THEN$/i
          ) ||
          line.match(/^IF\s+(.+)$/i);

        const condition =
          conditionMatch
            ? conditionMatch[1].trim()
            : "";

        if (!condition) {
          return {
            success: false,
            error:
              `Invalid IF statement on line: “${line}”. ` +
              `Use “IF condition THEN”.`,
            flowchart: null,
          };
        }

        cursor++;

        const whenTrue = parseBlock();

        let whenFalse = [];

        /*
         * ELSE
         */
        if (
          cursor < lines.length &&
          /^ELSE$/i.test(lines[cursor])
        ) {
          cursor++;

          whenFalse = parseBlock();
        }

        /*
         * END IF
         */
        if (
          cursor < lines.length &&
          (/^END\s*IF$/i.test(lines[cursor]) ||
            /^ENDIF$/i.test(lines[cursor]))
        ) {
          cursor++;
        } else {
          return {
            success: false,
            error:
              `IF statement is missing “END IF”.`,
            flowchart: null,
          };
        }

        block.push({
          type: "conditional",
          condition,
          whenTrue,
          whenFalse,
        });

        continue;
      }

      /*
       * WHILE
       *
       * Examples:
       * WHILE x < 10
       * WHILE x < 10 DO
       */
      if (/^WHILE\b/i.test(line)) {
        const conditionMatch =
          line.match(
            /^WHILE\s+(.+?)\s+DO$/i
          ) ||
          line.match(
            /^WHILE\s+(.+)$/i
          );

        const condition =
          conditionMatch
            ? conditionMatch[1].trim()
            : "";

        if (!condition) {
          return {
            success: false,
            error:
              `Invalid WHILE statement on line: “${line}”. ` +
              `Use “WHILE condition”.`,
            flowchart: null,
          };
        }

        cursor++;

        /*
         * Parse everything until END WHILE.
         */
        const body = parseBlock();

        /*
         * END WHILE must exist.
         */
        if (
          cursor >= lines.length ||
          !/^END\s*WHILE$/i.test(
            lines[cursor]
          )
        ) {
          return {
            success: false,
            error:
              `WHILE statement is missing “END WHILE”.`,
            flowchart: null,
          };
        }

        cursor++;

        /*
         * Empty loops are not useful for the generated
         * flowchart/code.
         */
        if (
          !Array.isArray(body) ||
          body.length === 0
        ) {
          return {
            success: false,
            error:
              "WHILE loop cannot have an empty body.",
            flowchart: null,
          };
        }

        block.push({
          type: "while",
          condition,
          body,
        });

        continue;
      }

      /*
       * ASSIGNMENT
       *
       * Supported:
       * x = 10
       * x ← 10
       * x <- 10
       * SET x = 10
       *
       * Also preserves the older learner form:
       * 10 ← x
       */
      if (
        line.includes("=") ||
        line.includes("←") ||
        line.includes("<-")
      ) {
        const clean = line
          .replace(/^SET\s+/i, "")
          .trim();

        const standardArrowMatch =
          clean.match(
            /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:←|<-)\s*(.+)$/
          );

        const equalsMatch =
          clean.match(
            /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/
          );

        const legacyArrowMatch =
          clean.match(
            /^(.+?)\s*(?:←|<-)\s*([A-Za-z_][A-Za-z0-9_]*)$/
          );

        const reverseEqualsMatch =
          clean.match(
            /^(.+?)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/
          );

        const target =
          standardArrowMatch?.[1] ||
          equalsMatch?.[1] ||
          legacyArrowMatch?.[2] ||
          reverseEqualsMatch?.[2] ||
          "";

        const expression =
          standardArrowMatch?.[2] ||
          equalsMatch?.[2] ||
          legacyArrowMatch?.[1] ||
          reverseEqualsMatch?.[1] ||
          "";

        if (!target || !expression) {
          return {
            success: false,
            error:
              `Invalid assignment on line: “${line}”. ` +
              `Use “target = expression”.`,
            flowchart: null,
          };
        }

        block.push({
          type: "process",
          target,
          expression,
        });

        cursor++;
        continue;
      }

      /*
       * Unknown line.
       *
       * For compatibility with the existing parser,
       * ignore unrecognized lines rather than crashing.
       */
      cursor++;
    }

    return block;
  }

  /*
   * Parse the entire pseudocode.
   */
  const topBlock = parseBlock();

  /*
   * If we stopped at an unexpected terminator,
   * return a useful error instead of silently generating
   * a broken graph.
   */
  if (cursor < lines.length) {
    const unexpected = lines[cursor];

    if (
      /^ELSE$/i.test(unexpected) ||
      /^END\s*IF$/i.test(unexpected) ||
      /^ENDIF$/i.test(unexpected) ||
      /^END\s*WHILE$/i.test(unexpected)
    ) {
      return {
        success: false,
        error:
          `Unexpected “${unexpected}” in pseudocode.`,
        flowchart: null,
      };
    }
  }

  /*
   * If END was not consumed by parseBlock(),
   * consume it here.
   */
  if (
    cursor < lines.length &&
    /^END$/i.test(lines[cursor])
  ) {
    cursor++;
  }

  /*
   * If there are still lines left, something was malformed.
   */
  if (cursor < lines.length) {
    return {
      success: false,
      error:
        `Unexpected statement on line: “${lines[cursor]}”.`,
      flowchart: null,
    };
  }

  /*
   * Connect two nodes.
   */
  const connect = (
    from,
    to,
    branch
  ) => {
    edges.push({
      id:
        `edge-${from}-${to}-${branch || "next"}-${edges.length}`,
      from,
      to,
      ...(branch
        ? { branch }
        : {}),
    });
  };

  /*
   * Create a flowchart node from a parsed statement.
   */
  function createNode(
    item,
    x,
    y
  ) {
    const id = genId(item.type);

    let kind = item.type;
    let payload = {};

    /*
     * INPUT
     */
    if (item.type === "input") {
      payload = {
        symbolId:
          `symbol-${item.name}`,
        name: item.name,
        type: "int",
        prompt: item.prompt,
      };
    }

    /*
     * DECLARATION
     */
    else if (
      item.type === "declaration"
    ) {
      kind = "initialization";

      payload = {
        symbolId:
          `symbol-${item.name}`,
        name: item.name,
        type: item.valueType,
        ...(item.initializer
          ? {
              initializer:
                item.initializer,
            }
          : {}),
      };
    }

    /*
     * ASSIGNMENT
     */
    else if (
      item.type === "process"
    ) {
      payload = {
        operation: "assignment",
        symbolId:
          `symbol-${item.target}`,
        expression:
          item.expression,
      };
    }

    /*
     * OUTPUT
     */
    else if (
      item.type === "output"
    ) {
      if (
        item.mode === "formatted"
      ) {
        payload = {
          outputId: id,
          mode: "formatted",
          message:
            item.message,
          expression:
            item.expression,
        };
      } else if (
        item.mode === "message"
      ) {
        payload = {
          outputId: id,
          mode: "message",
          message:
            item.message,
        };
      } else {
        payload = {
          outputId: id,
          mode: "expression",
          expression:
            item.expression,
        };
      }
    }

    /*
     * IF / WHILE
     */
    else if (
      item.type ===
        "conditional" ||
      item.type === "while"
    ) {
      kind = "decision";

      payload = {
        condition:
          item.condition,
      };
    }

    nodes.push({
      id,
      kind,
      payload,
    });

    positions[id] = {
      x,
      y,
    };

    return id;
  }

  /**
   * Compile a sequence of statements.
   *
   * Returns:
   * - entryId: first node in this sequence
   * - exits: nodes where the sequence can continue
   * - nextY: next vertical layout position
   */
  function compileSequence(
    items,
    incoming,
    x,
    startY
  ) {
    if (!Array.isArray(items)) {
      return {
        entryId: null,
        exits:
          incoming || [],
        nextY: startY,
      };
    }

    let entryId = null;
    let exits =
      Array.isArray(incoming)
        ? incoming
        : [];

    let y = startY;

    for (const item of items) {
      /*
       * NORMAL STATEMENT
       */
      if (
        item.type !==
          "conditional" &&
        item.type !== "while"
      ) {
        const id =
          createNode(
            item,
            x,
            y
          );

        if (!entryId) {
          entryId = id;
        }

        exits.forEach(
          (exit) => {
            connect(
              exit.id,
              id,
              exit.branch
            );
          }
        );

        exits = [
          { id },
        ];

        y += 110;

        continue;
      }

      /*
       * IF / CONDITIONAL
       */
      if (
        item.type ===
        "conditional"
      ) {
        const decisionId =
          createNode(
            item,
            x,
            y
          );

        if (!entryId) {
          entryId =
            decisionId;
        }

        /*
         * Connect previous statements
         * into the decision.
         */
        exits.forEach(
          (exit) => {
            connect(
              exit.id,
              decisionId,
              exit.branch
            );
          }
        );

        const branchY =
          y + 110;

        /*
         * TRUE branch
         */
        const trueBranch =
          compileSequence(
            item.whenTrue ||
              [],
            [],
            x - 170,
            branchY
          );

        /*
         * FALSE branch
         */
        const falseBranch =
          compileSequence(
            item.whenFalse ||
              [],
            [],
            x + 170,
            branchY
          );

        /*
         * TRUE connection.
         */
        if (
          trueBranch.entryId
        ) {
          connect(
            decisionId,
            trueBranch.entryId,
            "true"
          );
        } else {
          trueBranch.exits =
            [
              {
                id:
                  decisionId,
                branch:
                  "true",
              },
            ];
        }

        /*
         * FALSE connection.
         */
        if (
          falseBranch.entryId
        ) {
          connect(
            decisionId,
            falseBranch.entryId,
            "false"
          );
        } else {
          falseBranch.exits =
            [
              {
                id:
                  decisionId,
                branch:
                  "false",
              },
            ];
        }

        /*
         * Both branches continue
         * to whatever comes next.
         */
        exits = [
          ...trueBranch.exits,
          ...falseBranch.exits,
        ];

        y =
          Math.max(
            trueBranch.nextY,
            falseBranch.nextY
          );

        continue;
      }

      /*
       * WHILE LOOP
       *
       * Graph:
       *
       *          ┌──────────┐
       *          │  WHILE   │
       *          └────┬─────┘
       *           true│ false
       *               ↓
       *             BODY ──────┐
       *               │        │
       *               └────────┘
       *
       * The false branch becomes the
       * exit from the loop.
       */
      if (
        item.type === "while"
      ) {
        const decisionId =
          createNode(
            item,
            x,
            y
          );

        if (!entryId) {
          entryId =
            decisionId;
        }

        /*
         * Connect whatever came before
         * the WHILE into its condition.
         */
        exits.forEach(
          (exit) => {
            connect(
              exit.id,
              decisionId,
              exit.branch
            );
          }
        );

        /*
         * Body starts below the
         * WHILE decision.
         */
        const bodyY =
          y + 110;

        const bodyBranch =
          compileSequence(
            Array.isArray(
              item.body
            )
              ? item.body
              : [],
            [],
            x,
            bodyY
          );

        /*
         * TRUE -> BODY
         */
        if (
          bodyBranch.entryId
        ) {
          connect(
            decisionId,
            bodyBranch.entryId,
            "true"
          );

          /*
           * Every possible body exit
           * loops back to the WHILE
           * condition.
           */
          bodyBranch.exits.forEach(
            (exit) => {
              connect(
                exit.id,
                decisionId
              );
            }
          );
        }

        /*
         * FALSE -> continue after
         * the WHILE.
         *
         * This is intentionally the
         * only exit from the loop.
         */
        exits = [
          {
            id:
              decisionId,
            branch:
              "false",
          },
        ];

        /*
         * Leave enough vertical
         * space for the body.
         */
        y =
          Math.max(
            bodyBranch.nextY,
            y + 110
          ) + 40;

        continue;
      }
    }

    return {
      entryId,
      exits,
      nextY: y,
    };
  }

  /*
   * Compile the complete program.
   */
  const result =
    compileSequence(
      topBlock,
      [
        {
          id: startId,
        },
      ],
      380,
      150
    );

  /*
   * Add END node.
   */
  nodes.push({
    id: endId,
    kind: "end",
    payload: {},
  });

  positions[endId] = {
    x: 380,
    y: result.nextY,
  };

  /*
   * Connect all final paths
   * to END.
   */
  result.exits.forEach(
    (exit) => {
      connect(
        exit.id,
        endId,
        exit.branch
      );
    }
  );

  /*
   * Construct the FlowchartGraph.
   */
  const flowchart = {
    schemaVersion: "1.0.0",
    revision: 1,

    nodes,

    edges,

    layout: {
      positions,
      zoom: 1,
    },
  };

  return {
    success: true,
    flowchart,
    nodeCount:
      nodes.length,
    edgeCount:
      edges.length,
    projectId,
  };
}