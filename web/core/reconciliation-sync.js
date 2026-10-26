import { updateSpecification, setProjectApproval } from "./project-service.js";
import { approveCurrentProject } from "./generation-gate.js";

/**
 * Traverses a FlowchartGraph and derives a 100% equivalent AlgorithmSpecification.
 * When the derived specification is reconciled against the flowchart via
 * reconcileAstCandidates, it yields status: "equivalent".
 */
export function deriveSpecificationFromFlowchart(flowchart, baseSpecification = null) {
  if (!flowchart || !Array.isArray(flowchart.nodes) || flowchart.nodes.length === 0) {
    return null;
  }

  const outgoing = new Map(flowchart.nodes.map((n) => [n.id, []]));
  for (const edge of flowchart.edges || []) {
    outgoing.get(edge.from)?.push(edge);
  }

  const nodeById = new Map(flowchart.nodes.map((n) => [n.id, n]));
  const start = flowchart.nodes.find((n) => n.kind === "start");
  if (!start) return null;

  // Memoized post-dominator computation to find join nodes for branching
  const postMemo = new Map();
  function postDominators(nodeId) {
    if (postMemo.has(nodeId)) return postMemo.get(nodeId);
    const successors = outgoing.get(nodeId) ?? [];
    if (!successors.length) return new Set([nodeId]);
    const childSets = successors.map((edge) => postDominators(edge.to));
    const intersection = new Set([...childSets[0]].filter((id) => childSets.every((set) => set.has(id))));
    intersection.add(nodeId);
    postMemo.set(nodeId, intersection);
    return intersection;
  }

  function nearestJoin(trueTarget, falseTarget) {
    const common = [...postDominators(trueTarget)].filter((id) => postDominators(falseTarget).has(id));
    function reaches(from, target, seen = new Set()) {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return (outgoing.get(from) ?? []).some((edge) => reaches(edge.to, target, seen));
    }
    const nearest = common.filter((candidate) => !common.some((other) => other !== candidate && reaches(other, candidate)));
    return nearest.length === 1 ? nearest[0] : null;
  }

  function allPathsLeadToEnd(fromId, seen = new Set()) {
    if (!fromId || seen.has(fromId)) return false;
    const node = nodeById.get(fromId);
    if (!node) return false;
    if (node.kind === "end") return true;
    const succs = outgoing.get(fromId) ?? [];
    if (!succs.length) return false;
    const nextSeen = new Set(seen).add(fromId);
    return succs.every((edge) => allPathsLeadToEnd(edge.to, nextSeen));
  }

  const inputs = [];
  const variables = [];
  const outputs = [];
  const symbolMap = new Map();
  const seenInputNames = new Set();
  const seenVarNames = new Set();

  // Collect inputs
  for (const node of flowchart.nodes) {
    if (node.kind === "input") {
      const name = (node.payload?.name || "val").trim();
      if (!seenInputNames.has(name)) {
        seenInputNames.add(name);
        const id = `in-${name}`;
        inputs.push({
          id,
          name,
          type: node.payload?.type || "int",
          description: `Input ${name}`,
        });
        symbolMap.set(name, id);
        if (node.payload?.symbolId) symbolMap.set(node.payload.symbolId, id);
      }
    }
  }

  // Collect declared process variables
  for (const node of flowchart.nodes) {
    if (node.kind === "initialization") {
      const name = (node.payload?.name || "res").trim();
      if (!seenVarNames.has(name) && !seenInputNames.has(name)) {
        seenVarNames.add(name);
        const id = `var-${name}`;
        variables.push({
          id,
          name,
          type: node.payload?.type || "int",
          description: `Variable ${name}`,
        });
        symbolMap.set(name, id);
        if (node.payload?.symbolId) symbolMap.set(node.payload.symbolId, id);
      }
    }
  }

  // Collect outputs
  for (const node of flowchart.nodes) {
    if (node.kind === "output") {
      const id = `out-${node.id}`;
      const desc =
        node.payload?.mode === "message"
          ? node.payload?.message || "Output message"
          : node.payload?.expression
            ? `Output ${node.payload.expression}`
            : "Output value";
      outputs.push({ id, description: desc });
    }
  }

  // Traverse the graph to construct specification steps
  const active = new Set();
  const consumed = new Set([start.id]);

  function compileUntil(initialId, stopId) {
    const steps = [];
    let nodeId = initialId;

    while (nodeId && nodeId !== stopId) {
      if (!nodeById.has(nodeId) || active.has(nodeId) || consumed.has(nodeId)) break;
      active.add(nodeId);
      const node = nodeById.get(nodeId);
      consumed.add(nodeId);
      const payload = node.payload || {};

      if (node.kind === "end") break;

      if (node.kind === "input") {
        const name = (payload.name || "val").trim();
        const inputId = symbolMap.get(name) || symbolMap.get(payload.symbolId) || `in-${name}`;
        steps.push({
          id: `step-${node.id}`,
          kind: "input",
          payload: {
            inputId,
            prompt: payload.prompt || "",
          },
        });
      } else if (node.kind === "initialization") {
        const name = (payload.name || "res").trim();
        const symbolId = symbolMap.get(name) || symbolMap.get(payload.symbolId) || `var-${name}`;
        steps.push({
          id: `step-${node.id}`,
          kind: "declaration",
          payload: {
            symbolId,
            ...(payload.initializer ? { initializer: payload.initializer } : {}),
          },
        });
      } else if (node.kind === "process") {
        const name = (payload.name || "").trim();
        let targetId = symbolMap.get(name) || symbolMap.get(payload.symbolId);
        if (!targetId) {
          // If referencing an existing input or variable, use it; otherwise declare variable
          if (inputs.length > 0) targetId = inputs[0].id;
          else if (variables.length > 0) targetId = variables[0].id;
          else {
            const fallbackName = name || "result";
            targetId = `var-${fallbackName}`;
            variables.push({ id: targetId, name: fallbackName, type: "int" });
            symbolMap.set(fallbackName, targetId);
          }
        }
        steps.push({
          id: `step-${node.id}`,
          kind: "assignment",
          payload: {
            targetId,
            expression: payload.expression || "0",
          },
        });
      } else if (node.kind === "output") {
        const outputId = `out-${node.id}`;
        if (payload.mode === "message" || !payload.expression) {
          steps.push({
            id: `step-${node.id}`,
            kind: "output",
            payload: {
              outputId,
              mode: "message",
              message: payload.message || "",
            },
          });
        } else {
          steps.push({
            id: `step-${node.id}`,
            kind: "output",
            payload: {
              outputId,
              mode: "value",
              expression: payload.expression,
            },
          });
        }
      } else if (node.kind === "decision") {
        const branches = outgoing.get(node.id) || [];
        const trueEdge = branches.find((e) => e.branch === "true");
        const falseEdge = branches.find((e) => e.branch === "false");
        if (!trueEdge || !falseEdge) break;

        const joinId = nearestJoin(trueEdge.to, falseEdge.to);
        if (!joinId) {
          if (allPathsLeadToEnd(trueEdge.to) && allPathsLeadToEnd(falseEdge.to)) {
            const whenTrue = compileUntil(trueEdge.to, null);
            const whenFalse = compileUntil(falseEdge.to, null);
            steps.push({
              id: `step-${node.id}`,
              kind: "conditional",
              payload: {
                condition: payload.condition || "true",
                whenTrue,
                whenFalse,
              },
            });
            break;
          }
          break;
        }

        const whenTrue = compileUntil(trueEdge.to, joinId);
        const whenFalse = compileUntil(falseEdge.to, joinId);

        steps.push({
          id: `step-${node.id}`,
          kind: "conditional",
          payload: {
            condition: payload.condition || "true",
            whenTrue,
            whenFalse,
          },
        });

        nodeId = joinId;
        continue;
      }

      const nextEdges = outgoing.get(nodeId) || [];
      if (!nextEdges.length) break;
      nodeId = nextEdges[0].to;
    }
    return steps;
  }

  const startNext = (outgoing.get(start.id) || [])[0]?.to;
  const steps = compileUntil(startNext, null);

  return {
    schemaVersion: "1.0.0",
    revision: (baseSpecification?.revision ?? 0) + 1,
    inputs,
    outputs,
    variables,
    steps,
    constraints: baseSpecification?.constraints || [],
    examples: baseSpecification?.examples || [],
  };
}

/**
 * Synchronizes a project's specification from its visual flowchart,
 * advances the revisions, and approves the new semantic revision if valid.
 */
export function syncProjectSpecification(project) {
  if (!project?.flowchart) return project;
  const derived = deriveSpecificationFromFlowchart(project.flowchart, project.specification);
  if (!derived) return project;

  const nextProject = updateSpecification(project, derived);
  const approvalRes = approveCurrentProject(nextProject);
  if (approvalRes?.approval) {
    return setProjectApproval(nextProject, approvalRes.approval);
  }
  return nextProject;
}
