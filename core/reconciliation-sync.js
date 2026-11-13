import {
  updateSpecification,
  setProjectApproval,
} from "./project-service.js";

import {
  approveCurrentProject,
} from "./generation-gate.js";

/**
 * Derives an AlgorithmSpecification from a FlowchartGraph.
 *
 * Important:
 * Flowcharts can contain cycles because WHILE loops contain
 * back-edges. Therefore post-dominator calculation MUST NOT
 * use naive recursive traversal.
 */
export function deriveSpecificationFromFlowchart(
  flowchart,
  baseSpecification = null
) {
  if (
    !flowchart ||
    !Array.isArray(flowchart.nodes) ||
    flowchart.nodes.length === 0
  ) {
    return null;
  }

  const outgoing = new Map(
    flowchart.nodes.map((node) => [
      node.id,
      [],
    ])
  );

  for (const edge of flowchart.edges || []) {
    const list =
      outgoing.get(edge.from);

    if (list) {
      list.push(edge);
    }
  }

  const nodeById = new Map(
    flowchart.nodes.map((node) => [
      node.id,
      node,
    ])
  );

  const start = flowchart.nodes.find(
    (node) =>
      node.kind === "start"
  );

  if (!start) {
    return null;
  }

  /*
   * ---------------------------------------------------------
   * CYCLE-SAFE POST-DOMINATORS
   * ---------------------------------------------------------
   *
   * The old implementation recursively called:
   *
   *   postDominators(A)
   *     -> postDominators(B)
   *       -> postDominators(A)
   *
   * for WHILE loops.
   *
   * Instead we solve the post-dominator equations iteratively.
   */
  const postMemo = new Map();

  function computePostDominators() {
    const nodeIds =
      flowchart.nodes.map(
        (node) => node.id
      );

    const allNodes =
      new Set(nodeIds);

    /*
     * Initial approximation:
     *
     * For terminal nodes:
     *   postdom(node) = { node }
     *
     * For non-terminal nodes:
     *   postdom(node) = every node
     *
     * We repeatedly shrink these sets until
     * they reach a fixed point.
     */
    for (const nodeId of nodeIds) {
      const successors =
        outgoing.get(nodeId) || [];

      if (successors.length === 0) {
        postMemo.set(
          nodeId,
          new Set([nodeId])
        );
      } else {
        postMemo.set(
          nodeId,
          new Set(allNodes)
        );
      }
    }

    let changed = true;

    while (changed) {
      changed = false;

      for (const nodeId of nodeIds) {
        const successors =
          outgoing.get(nodeId) || [];

        if (successors.length === 0) {
          continue;
        }

        let intersection =
          new Set(allNodes);

        for (const edge of successors) {
          const successorSet =
            postMemo.get(edge.to) ||
            new Set([edge.to]);

          intersection =
            new Set(
              [
                ...intersection,
              ].filter((id) =>
                successorSet.has(id)
              )
            );
        }

        intersection.add(nodeId);

        const previous =
          postMemo.get(nodeId);

        const unchanged =
          previous &&
          previous.size ===
            intersection.size &&
          [...intersection].every(
            (id) =>
              previous.has(id)
          );

        if (!unchanged) {
          postMemo.set(
            nodeId,
            intersection
          );

          changed = true;
        }
      }
    }
  }

  let postDominatorsReady =
    false;

  function postDominators(
    nodeId
  ) {
    if (!postDominatorsReady) {
      computePostDominators();
      postDominatorsReady =
        true;
    }

    return (
      postMemo.get(nodeId) ||
      new Set([nodeId])
    );
  }

  /*
   * ---------------------------------------------------------
   * GRAPH REACHABILITY
   * ---------------------------------------------------------
   */

  function reaches(
    from,
    target
  ) {
    if (from === target) {
      return true;
    }

    const visited =
      new Set();

    const stack = [from];

    while (stack.length > 0) {
      const current =
        stack.pop();

      if (!current) {
        continue;
      }

      if (current === target) {
        return true;
      }

      if (
        visited.has(current)
      ) {
        continue;
      }

      visited.add(current);

      const edges =
        outgoing.get(current) ||
        [];

      for (const edge of edges) {
        if (
          !visited.has(
            edge.to
          )
        ) {
          stack.push(
            edge.to
          );
        }
      }
    }

    return false;
  }

  /*
   * ---------------------------------------------------------
   * FIND JOIN NODE
   * ---------------------------------------------------------
   */

  function nearestJoin(
    trueTarget,
    falseTarget
  ) {
    const truePosts =
      postDominators(
        trueTarget
      );

    const falsePosts =
      postDominators(
        falseTarget
      );

    const common = [
      ...truePosts,
    ].filter((id) =>
      falsePosts.has(id)
    );

    const nearest =
      common.filter(
        (candidate) =>
          !common.some(
            (other) =>
              other !==
                candidate &&
              reaches(
                other,
                candidate
              )
          )
      );

    return nearest.length === 1
      ? nearest[0]
      : null;
  }

  /*
   * ---------------------------------------------------------
   * DETECT WHILE DECISION
   * ---------------------------------------------------------
   *
   * A WHILE decision has:
   *
   *        decision
   *        /     \
   *     true     false
   *       |        |
   *       |        |
   *       └── back  └── next
   *
   * Therefore the TRUE branch can reach
   * the decision again.
   */
  function isWhileDecision(
    nodeId
  ) {
    const node =
      nodeById.get(nodeId);

    if (
      !node ||
      node.kind !== "decision"
    ) {
      return false;
    }

    const branches =
      outgoing.get(nodeId) ||
      [];

    const trueEdge =
      branches.find(
        (edge) =>
          edge.branch === "true"
      );

    const falseEdge =
      branches.find(
        (edge) =>
          edge.branch === "false"
      );

    if (
      !trueEdge ||
      !falseEdge
    ) {
      return false;
    }

    const trueLoopsBack =
      reaches(
        trueEdge.to,
        nodeId
      );

    const falseLoopsBack =
      reaches(
        falseEdge.to,
        nodeId
      );

    return (
      trueLoopsBack &&
      !falseLoopsBack
    );
  }

  /*
   * ---------------------------------------------------------
   * CHECK WHETHER A PATH EVENTUALLY REACHES END
   * ---------------------------------------------------------
   */

  function allPathsLeadToEnd(
    fromId,
    seen = new Set()
  ) {
    if (!fromId) {
      return false;
    }

    if (seen.has(fromId)) {
      return false;
    }

    const node =
      nodeById.get(fromId);

    if (!node) {
      return false;
    }

    if (
      node.kind === "end"
    ) {
      return true;
    }

    const successors =
      outgoing.get(fromId) ||
      [];

    if (
      successors.length === 0
    ) {
      return false;
    }

    const nextSeen =
      new Set(seen);

    nextSeen.add(fromId);

    return successors.every(
      (edge) =>
        allPathsLeadToEnd(
          edge.to,
          nextSeen
        )
    );
  }

  /*
   * ---------------------------------------------------------
   * SPECIFICATION DATA
   * ---------------------------------------------------------
   */

  const inputs = [];
  const variables = [];
  const outputs = [];

  const symbolMap =
    new Map();

  const seenInputNames =
    new Set();

  const seenVarNames =
    new Set();

  /*
   * Collect inputs.
   */
  for (const node of flowchart.nodes) {
    if (
      node.kind !== "input"
    ) {
      continue;
    }

    const name = String(
      node.payload?.name ||
        "val"
    ).trim();

    if (
      seenInputNames.has(name)
    ) {
      continue;
    }

    seenInputNames.add(name);

    const id =
      node.payload?.symbolId ||
      `in-${name}`;

    inputs.push({
      id,
      name,
      type:
        node.payload?.type ||
        "int",
      description:
        `Input ${name}`,
    });

    symbolMap.set(
      name,
      id
    );

    if (
      node.payload?.symbolId
    ) {
      symbolMap.set(
        node.payload.symbolId,
        id
      );
    }
  }

  /*
   * Collect declared variables.
   */
  for (const node of flowchart.nodes) {
    if (
      node.kind !==
      "initialization"
    ) {
      continue;
    }

    const name = String(
      node.payload?.name ||
        "res"
    ).trim();

    if (
      seenVarNames.has(name) ||
      seenInputNames.has(name)
    ) {
      continue;
    }

    seenVarNames.add(name);

    const id =
      node.payload?.symbolId ||
      `var-${name}`;

    variables.push({
      id,
      name,
      type:
        node.payload?.type ||
        "int",
      description:
        `Variable ${name}`,
    });

    symbolMap.set(
      name,
      id
    );

    if (
      node.payload?.symbolId
    ) {
      symbolMap.set(
        node.payload.symbolId,
        id
      );
    }
  }

  /*
   * Collect outputs.
   */
  for (const node of flowchart.nodes) {
    if (
      node.kind !== "output"
    ) {
      continue;
    }

    const id =
      `out-${node.id}`;

    let description =
      "Output value";

    if (
      node.payload?.mode ===
      "formatted"
    ) {
      description =
        `${node.payload.message || "Output"} ${
          node.payload.expression ||
          "value"
        }`;
    } else if (
      node.payload?.mode ===
      "message"
    ) {
      description =
        node.payload?.message ||
        "Output message";
    } else if (
      node.payload?.expression
    ) {
      description =
        `Output ${node.payload.expression}`;
    }

    outputs.push({
      id,
      description,
    });
  }

  /*
   * ---------------------------------------------------------
   * GRAPH → SPECIFICATION
   * ---------------------------------------------------------
   */

  const active =
    new Set();

  const consumed =
    new Set([
      start.id,
    ]);

  function compileUntil(
    initialId,
    stopId
  ) {
    const steps = [];

    let nodeId =
      initialId;

    while (
      nodeId &&
      nodeId !== stopId
    ) {
      /*
       * Reaching an active node means
       * we found a cycle.
       *
       * WHILE cycles are handled explicitly
       * below, so a cycle here means malformed
       * or unstructured flow.
       */
      if (
        !nodeById.has(nodeId)
      ) {
        break;
      }

      if (
        active.has(nodeId)
      ) {
        break;
      }

      /*
       * A node already consumed by another
       * structured branch should not be
       * traversed again.
       */
      if (
        consumed.has(nodeId)
      ) {
        break;
      }

      active.add(nodeId);

      const node =
        nodeById.get(nodeId);

      consumed.add(nodeId);

      const payload =
        node.payload || {};

      /*
       * -----------------------------------------------------
       * END
       * -----------------------------------------------------
       */

      if (
        node.kind === "end"
      ) {
        active.delete(
          nodeId
        );

        break;
      }

      /*
       * -----------------------------------------------------
       * INPUT
       * -----------------------------------------------------
       */

      if (
        node.kind === "input"
      ) {
        const name =
          String(
            payload.name ||
              "val"
          ).trim();

        const inputId =
          symbolMap.get(
            name
          ) ||
          symbolMap.get(
            payload.symbolId
          ) ||
          `in-${name}`;

        steps.push({
          id:
            `step-${node.id}`,

          kind: "input",

          payload: {
            inputId,
            prompt:
              payload.prompt ||
              "",
          },
        });
      }

      /*
       * -----------------------------------------------------
       * INITIALIZATION
       * -----------------------------------------------------
       */

      else if (
        node.kind ===
        "initialization"
      ) {
        const name =
          String(
            payload.name ||
              "res"
          ).trim();

        const symbolId =
          symbolMap.get(
            name
          ) ||
          symbolMap.get(
            payload.symbolId
          ) ||
          `var-${name}`;

        steps.push({
          id:
            `step-${node.id}`,

          kind:
            "declaration",

          payload: {
            symbolId,

            ...(payload.initializer
              ? {
                  initializer:
                    payload.initializer,
                }
              : {}),
          },
        });
      }

      /*
       * -----------------------------------------------------
       * PROCESS / ASSIGNMENT
       * -----------------------------------------------------
       */

      else if (
        node.kind ===
        "process"
      ) {
        const name =
          String(
            payload.name ||
              ""
          ).trim();

        let targetId =
          payload.symbolId ||
          symbolMap.get(name);

        /*
         * The current flowchart representation
         * may store the assignment target
         * directly inside the expression:
         *
         *   n = n - 1
         *
         * Extract the target if necessary.
         */
        let expression =
          String(
            payload.expression ||
              ""
          ).trim();

        const embeddedAssignment =
          expression.match(
            /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:←|<-|=)\s*(.+)$/
          );

        if (
          embeddedAssignment
        ) {
          const embeddedName =
            embeddedAssignment[1];

          expression =
            embeddedAssignment[2].trim();

          targetId =
            symbolMap.get(
              embeddedName
            ) ||
            payload.symbolId ||
            `var-${embeddedName}`;

          if (
            !symbolMap.has(
              embeddedName
            )
          ) {
            symbolMap.set(
              embeddedName,
              targetId
            );

            if (
              !seenInputNames.has(
                embeddedName
              ) &&
              !seenVarNames.has(
                embeddedName
              )
            ) {
              seenVarNames.add(
                embeddedName
              );

              variables.push({
                id: targetId,
                name:
                  embeddedName,
                type: "int",
                description:
                  `Variable ${embeddedName}`,
              });
            }
          }
        }

        /*
         * Legacy reversed form:
         *
         *   n - 1 = n
         *
         * Preserve support for it.
         */
        if (
          !embeddedAssignment
        ) {
          const legacyAssignment =
            expression.match(
              /^(.+?)\s*(?:←|<-)\s*([A-Za-z_][A-Za-z0-9_]*)$/
            );

          if (
            legacyAssignment
          ) {
            expression =
              legacyAssignment[1].trim();

            const targetName =
              legacyAssignment[2];

            targetId =
              symbolMap.get(
                targetName
              ) ||
              `var-${targetName}`;

            if (
              !symbolMap.has(
                targetName
              )
            ) {
              symbolMap.set(
                targetName,
                targetId
              );

              if (
                !seenInputNames.has(
                  targetName
                ) &&
                !seenVarNames.has(
                  targetName
                )
              ) {
                seenVarNames.add(
                  targetName
                );

                variables.push({
                  id: targetId,
                  name:
                    targetName,
                  type: "int",
                  description:
                    `Variable ${targetName}`,
                });
              }
            }
          }
        }

        if (
          !targetId
        ) {
          const fallbackName =
            name ||
            "result";

          targetId =
            `var-${fallbackName}`;

          if (
            !symbolMap.has(
              fallbackName
            )
          ) {
            symbolMap.set(
              fallbackName,
              targetId
            );

            if (
              !seenInputNames.has(
                fallbackName
              ) &&
              !seenVarNames.has(
                fallbackName
              )
            ) {
              seenVarNames.add(
                fallbackName
              );

              variables.push({
                id:
                  targetId,
                name:
                  fallbackName,
                type: "int",
                description:
                  `Variable ${fallbackName}`,
              });
            }
          }
        }

        steps.push({
          id:
            `step-${node.id}`,

          kind:
            "assignment",

          payload: {
            targetId,
            expression:
              expression ||
              "0",
          },
        });
      }

      /*
       * -----------------------------------------------------
       * OUTPUT
       * -----------------------------------------------------
       */

      else if (
        node.kind ===
        "output"
      ) {
        const outputId =
          `out-${node.id}`;

        if (
          payload.mode ===
          "formatted"
        ) {
          steps.push({
            id:
              `step-${node.id}`,

            kind: "output",

            payload: {
              outputId,
              mode:
                "formatted",
              message:
                payload.message ||
                "",
              expression:
                payload.expression ||
                "0",
            },
          });
        }

        else if (
          payload.mode ===
            "message" ||
          !payload.expression
        ) {
          steps.push({
            id:
              `step-${node.id}`,

            kind: "output",

            payload: {
              outputId,
              mode:
                "message",
              message:
                payload.message ||
                "",
            },
          });
        }

        else {
          steps.push({
            id:
              `step-${node.id}`,

            kind: "output",

            payload: {
              outputId,
              mode:
                "expression",
              expression:
                payload.expression,
            },
          });
        }
      }

      /*
       * -----------------------------------------------------
       * DECISION
       * -----------------------------------------------------
       */

      else if (
        node.kind ===
        "decision"
      ) {
        const branches =
          outgoing.get(
            node.id
          ) || [];

        const trueEdge =
          branches.find(
            (edge) =>
              edge.branch ===
              "true"
          );

        const falseEdge =
          branches.find(
            (edge) =>
              edge.branch ===
              "false"
          );

        if (
          !trueEdge ||
          !falseEdge
        ) {
          active.delete(
            nodeId
          );

          break;
        }

        /*
         * ---------------------------------------------------
         * WHILE
         * ---------------------------------------------------
         */

        if (
          isWhileDecision(
            node.id
          )
        ) {
          /*
           * The TRUE branch is the loop body.
           *
           * It eventually reaches the
           * decision node again.
           *
           * The FALSE branch is what happens
           * after the loop.
           */
          const body =
            compileUntil(
              trueEdge.to,
              node.id
            );

          steps.push({
            id:
              `step-${node.id}`,

            kind: "while",

            payload: {
              condition:
                payload.condition ||
                "true",

              body,
            },
          });

          /*
           * Continue through the FALSE branch.
           */
          nodeId =
            falseEdge.to;

          active.delete(
            node.id
          );

          continue;
        }

        /*
         * ---------------------------------------------------
         * NORMAL IF / ELSE
         * ---------------------------------------------------
         */

        let joinId =
          nearestJoin(
            trueEdge.to,
            falseEdge.to
          );

        /*
         * Some terminal IF/ELSE graphs
         * don't have a traditional join.
         */
        if (!joinId) {
          const trueEnds =
            allPathsLeadToEnd(
              trueEdge.to
            );

          const falseEnds =
            allPathsLeadToEnd(
              falseEdge.to
            );

          if (
            trueEnds &&
            falseEnds
          ) {
            const whenTrue =
              compileUntil(
                trueEdge.to,
                null
              );

            const whenFalse =
              compileUntil(
                falseEdge.to,
                null
              );

            steps.push({
              id:
                `step-${node.id}`,

              kind:
                "conditional",

              payload: {
                condition:
                  payload.condition ||
                  "true",

                whenTrue,
                whenFalse,
              },
            });

            active.delete(
              node.id
            );

            break;
          }

          /*
           * We cannot safely structure
           * this decision.
           */
          active.delete(
            node.id
          );

          break;
        }

        const whenTrue =
          compileUntil(
            trueEdge.to,
            joinId
          );

        const whenFalse =
          compileUntil(
            falseEdge.to,
            joinId
          );

        steps.push({
          id:
            `step-${node.id}`,

          kind:
            "conditional",

          payload: {
            condition:
              payload.condition ||
              "true",

            whenTrue,
            whenFalse,
          },
        });

        /*
         * Continue after the IF/ELSE join.
         */
        nodeId =
          joinId;

        active.delete(
          node.id
        );

        continue;
      }

      /*
       * -----------------------------------------------------
       * NEXT SEQUENTIAL NODE
       * -----------------------------------------------------
       */

      const nextEdges =
        outgoing.get(
          node.id
        ) || [];

      if (
        nextEdges.length === 0
      ) {
        active.delete(
          nodeId
        );

        break;
      }

      nodeId =
        nextEdges[0].to;

      active.delete(
        node.id
      );
    }

    return steps;
  }

  /*
   * ---------------------------------------------------------
   * START TRAVERSAL
   * ---------------------------------------------------------
   */

  const startNext =
    (
      outgoing.get(
        start.id
      ) || []
    )[0]?.to;

  const steps =
    compileUntil(
      startNext,
      null
    );

  /*
   * ---------------------------------------------------------
   * RESULT
   * ---------------------------------------------------------
   */

  return {
    schemaVersion:
      "1.0.0",

    revision:
      (baseSpecification?.revision ??
        0) + 1,

    inputs,

    outputs,

    variables,

    steps,

    constraints:
      baseSpecification?.constraints ||
      [],

    examples:
      baseSpecification?.examples ||
      [],
  };
}

/**
 * Synchronizes the project's specification
 * from its visual flowchart.
 *
 * After synchronization the project is
 * re-analyzed and approved only if both
 * current sources are semantically equivalent
 * and valid.
 */
export function syncProjectSpecification(
  project
) {
  if (
    !project?.flowchart
  ) {
    return project;
  }

  const derived =
    deriveSpecificationFromFlowchart(
      project.flowchart,
      project.specification
    );

  if (!derived) {
    return project;
  }

  const nextProject =
    updateSpecification(
      project,
      derived
    );

  const approvalRes =
    approveCurrentProject(
      nextProject
    );

  if (
    approvalRes?.approval
  ) {
    return setProjectApproval(
      nextProject,
      approvalRes.approval
    );
  }

  return nextProject;
}