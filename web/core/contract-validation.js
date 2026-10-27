import Ajv2020 from "ajv/dist/2020.js";
import {
  astSchema,
  CONTRACT_VERSION,
  diagnosticSchema,
  flowchartSchema,
  projectSchema,
  specificationSchema,
} from "./contracts.js";
import { createDiagnostic } from "./diagnostics.js";

const schemas = [diagnosticSchema, astSchema, specificationSchema, flowchartSchema, projectSchema];
const ajv = new Ajv2020({ allErrors: true, strict: true, discriminator: true });
ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
ajv.addFormat("date-time", {
  type: "string",
  validate: (value) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && Number.isFinite(Date.parse(value)),
});
for (const schema of schemas) ajv.addSchema(schema);

const validators = {
  diagnostic: ajv.getSchema(diagnosticSchema.$id),
  ast: ajv.getSchema(astSchema.$id),
  specification: ajv.getSchema(specificationSchema.$id),
  flowchart: ajv.getSchema(flowchartSchema.$id),
  project: ajv.getSchema(projectSchema.$id),
};
const RESERVED_C_NAMES = new Set("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Alignas _Alignof _Atomic _Bool _Complex _Generic _Imaginary _Noreturn _Static_assert _Thread_local main printf scanf".split(" "));

function formatDiagnosticItem(error, label, value) {
  const path = error.instancePath || "";
  const nodeMatch = path.match(/^(?:\/flowchart)?\/nodes\/(\d+)(?:\/(.*))?$/);
  if (nodeMatch) {
    const nodeIndex = parseInt(nodeMatch[1], 10);
    const subPath = nodeMatch[2] || "";
    const nodes = value?.flowchart?.nodes || value?.nodes;
    const node = Array.isArray(nodes) ? nodes[nodeIndex] : null;
    const nodeId = node?.id ? `“${node.id}”` : `#${nodeIndex}`;
    const nodeKind = node?.kind ? ` (${node.kind})` : "";
    const revision = value?.flowchart?.revision ?? value?.revision ?? 1;
    const sourceRefs = node?.id ? [{ sourceKind: "flowchart", sourceObjectId: node.id, sourceRevision: revision }] : [];

    if (error.keyword === "discriminator") {
      if (error.params?.tag === "kind") {
        const val = error.params?.tagValue !== undefined ? `“${error.params.tagValue}”` : "undefined";
        return {
          message: `Flowchart block ${nodeId} has unsupported kind ${val}. Supported kinds are: start, end, process, initialization, input, output, decision.`,
          sourceRefs,
        };
      }
      if (error.params?.tag === "operation") {
        return {
          message: `Flowchart block ${nodeId}${nodeKind} is missing required operation property ('assignment' or 'declaration').`,
          sourceRefs,
        };
      }
      if (error.params?.tag === "mode") {
        return {
          message: `Flowchart block ${nodeId}${nodeKind} is missing required output mode ('message', 'expression', or 'formatted').`,
          sourceRefs,
        };
      }
    }
    if (error.keyword === "required") {
      return {
        message: `Flowchart block ${nodeId}${nodeKind} is missing required property “${error.params?.missingProperty}”.`,
        sourceRefs,
      };
    }
    if (error.keyword === "additionalProperties") {
      return {
        message: `Flowchart block ${nodeId}${nodeKind} has unsupported property “${error.params?.additionalProperty}”.`,
        sourceRefs,
      };
    }
    if (error.keyword === "maxProperties" && subPath === "payload") {
      return {
        message: `Flowchart block ${nodeId}${nodeKind} payload must be empty.`,
        sourceRefs,
      };
    }
    if (error.keyword === "minLength") {
      const propName = subPath.split("/").pop() || "field";
      return {
        message: `Flowchart block ${nodeId}${nodeKind} property “${propName}” must not be empty.`,
        sourceRefs,
      };
    }
    if (error.keyword === "enum") {
      const propName = subPath.split("/").pop() || "field";
      const allowed = (error.params?.allowedValues || []).join(", ");
      return {
        message: `Flowchart block ${nodeId}${nodeKind} property “${propName}” must be one of: ${allowed}.`,
        sourceRefs,
      };
    }
    if (error.keyword === "const") {
      const propName = subPath.split("/").pop() || "field";
      return {
        message: `Flowchart block ${nodeId}${nodeKind} property “${propName}” must be equal to “${error.params?.allowedValue}”.`,
        sourceRefs,
      };
    }
    return {
      message: `${label} block ${nodeId}${nodeKind} ${subPath ? `${subPath} ` : ""}${error.message || "is invalid"}.`,
      sourceRefs,
    };
  }

  const edgeMatch = path.match(/^(?:\/flowchart)?\/edges\/(\d+)(?:\/(.*))?$/);
  if (edgeMatch) {
    const edgeIndex = parseInt(edgeMatch[1], 10);
    const edges = value?.flowchart?.edges || value?.edges;
    const edge = Array.isArray(edges) ? edges[edgeIndex] : null;
    const edgeId = edge?.id ? `“${edge.id}”` : `#${edgeIndex}`;
    return {
      message: `${label} connection ${edgeId} ${error.message || "is invalid"}.`,
      sourceRefs: [],
    };
  }

  const location = path || "the document";
  const detail = error.message || "does not match the required shape";
  return {
    message: `${label} ${location} ${detail}.`,
    sourceRefs: [],
  };
}

function deduplicateSchemaErrors(errors, value) {
  if (!Array.isArray(errors) || errors.length <= 1) return errors ?? [];

  // Group errors by instance path prefix up to node level (e.g. /nodes/1)
  const byPrefix = new Map();
  for (const err of errors) {
    const match = (err.instancePath || "").match(/^((?:\/flowchart)?\/nodes\/\d+)/);
    const prefix = match ? match[1] : (err.instancePath || "root");
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(err);
  }

  const result = [];
  for (const [prefix, group] of byPrefix.entries()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // If there are specific leaf errors (e.g. required, additionalProperties, discriminator, minLength),
    // drop redundant generic 'oneOf' container errors
    const hasSpecific = group.some((e) => ["required", "additionalProperties", "discriminator", "minLength", "enum", "type"].includes(e.keyword));
    const filteredGroup = hasSpecific
      ? group.filter((e) => e.keyword !== "oneOf")
      : group;

    // Filter out spurious const errors on other branches when kind is known
    const nodeIndexMatch = prefix.match(/nodes\/(\d+)$/);
    if (nodeIndexMatch) {
      const idx = parseInt(nodeIndexMatch[1], 10);
      const nodes = value?.flowchart?.nodes || value?.nodes;
      const node = Array.isArray(nodes) ? nodes[idx] : null;
      if (node?.kind) {
        const withoutOtherBranches = filteredGroup.filter((e) => {
          if (e.keyword === "const" && e.instancePath.endsWith("/kind") && e.params?.allowedValue !== node.kind) {
            return false;
          }
          return true;
        });
        if (withoutOtherBranches.length > 0) {
          result.push(...withoutOtherBranches);
          continue;
        }
      }
    }

    result.push(...filteredGroup);
  }

  return result;
}

function schemaDiagnostics(validator, value, code, label) {
  if (validator(value)) return [];
  const rawErrors = validator.errors ?? [];
  const cleanedErrors = deduplicateSchemaErrors(rawErrors, value);

  return cleanedErrors.map((error) => {
    const { message, sourceRefs } = formatDiagnosticItem(error, label, value);
    return createDiagnostic({
      code,
      category: "schema",
      message,
      suggestion: "Check the document version, required fields, and field types.",
      sourceRefs,
    });
  });
}

function invariant(code, category, message, sourceRefs = []) {
  return createDiagnostic({ code, category, message, sourceRefs });
}

function duplicateIds(items, label, code, diagnostics) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) diagnostics.push(invariant(code, "structure", `Duplicate ${label} ID “${item.id}”.`));
    seen.add(item.id);
  }
}

function checkFlowchartInvariants(flowchart) {
  const diagnostics = [];
  duplicateIds(flowchart.nodes, "node", "GRAPH_DUPLICATE_ID", diagnostics);
  duplicateIds(flowchart.edges, "edge", "GRAPH_DUPLICATE_ID", diagnostics);

  const nodeById = new Map(flowchart.nodes.map((node) => [node.id, node]));
  const outgoing = new Map(flowchart.nodes.map((node) => [node.id, []]));
  const incoming = new Map(flowchart.nodes.map((node) => [node.id, []]));
  for (const edge of flowchart.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      diagnostics.push(invariant("GRAPH_DANGLING_EDGE", "structure", `Connection “${edge.id}” points to a block that does not exist.`));
      continue;
    }
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
    if (edge.from === edge.to) diagnostics.push(invariant("GRAPH_UNSUPPORTED_CYCLE", "structure", `Connection “${edge.id}” loops a block back to itself.`));
  }

  const starts = flowchart.nodes.filter((node) => node.kind === "start");
  const ends = flowchart.nodes.filter((node) => node.kind === "end");
  if (starts.length !== 1) diagnostics.push(invariant("GRAPH_ENTRYPOINT_INVALID", "structure", "A flowchart must contain exactly one Start block."));
  if (ends.length < 1) diagnostics.push(invariant("GRAPH_ENTRYPOINT_INVALID", "structure", "A flowchart must contain at least one End block."));

  for (const node of flowchart.nodes) {
    const edges = outgoing.get(node.id) ?? [];
    if (node.kind === "decision") {
      const branches = edges.map((edge) => edge.branch).sort();
      if (branches.length !== 2 || branches[0] !== "false" || branches[1] !== "true") {
        diagnostics.push(invariant("GRAPH_BRANCH_INVALID", "structure", `Decision block “${node.id}” needs exactly one True and one False connection.`));
      }
    } else if (node.kind === "end" ? edges.length !== 0 : edges.length !== 1) {
      diagnostics.push(invariant("GRAPH_CONNECTION_COUNT_INVALID", "structure", `Block “${node.id}” needs ${node.kind === "end" ? "no outgoing connections" : "exactly one outgoing connection"}.`));
    }
    if (node.kind !== "start" && (incoming.get(node.id)?.length ?? 0) === 0) {
      diagnostics.push(invariant("GRAPH_UNREACHABLE_NODE", "structure", `Block “${node.id}” has no incoming connection.`));
    }
  }

  if (starts.length === 1) {
    const visited = new Set();
    const active = new Set();
    let cycleFound = false;
    function visit(id) {
      if (active.has(id)) { cycleFound = true; return; }
      if (visited.has(id)) return;
      visited.add(id);
      active.add(id);
      for (const edge of outgoing.get(id) ?? []) visit(edge.to);
      active.delete(id);
    }
    visit(starts[0].id);
    if (cycleFound) diagnostics.push(invariant("GRAPH_UNSUPPORTED_CYCLE", "structure", "This flowchart contains a cycle. Loops are not supported in M1."));
    for (const node of flowchart.nodes) {
      if (!visited.has(node.id)) diagnostics.push(invariant("GRAPH_UNREACHABLE_NODE", "structure", `Block “${node.id}” cannot be reached from Start.`));
    }
    if (ends.length === 1 && !visited.has(ends[0].id)) {
      diagnostics.push(invariant("GRAPH_UNREACHABLE_NODE", "structure", "End cannot be reached from Start."));
    }
  }
  return diagnostics;
}

function checkSpecificationIds(specification) {
  const diagnostics = [];
  const ids = new Set();
  const names = new Set();
  for (const declaration of [...specification.inputs, ...specification.variables]) {
    if (ids.has(declaration.id)) diagnostics.push(invariant("SPEC_SCHEMA_INVALID", "structure", `Duplicate specification ID “${declaration.id}”.`));
    ids.add(declaration.id);
    if (declaration.name) {
      if (names.has(declaration.name)) diagnostics.push(invariant("SYMBOL_DUPLICATE", "structure", `Duplicate variable name “${declaration.name}”.`));
      names.add(declaration.name);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(declaration.name) || RESERVED_C_NAMES.has(declaration.name)) {
      diagnostics.push(invariant("SPEC_IDENTIFIER_INVALID", "schema", `“${declaration.name || "(empty)"}” is not a supported C variable name.`));
    }
  }
  for (const output of specification.outputs) {
    if (ids.has(output.id)) diagnostics.push(invariant("SPEC_SCHEMA_INVALID", "structure", `Duplicate specification ID “${output.id}”.`));
    ids.add(output.id);
  }
  return diagnostics;
}

export function validateDiagnosticContract(value) {
  return schemaDiagnostics(validators.diagnostic, value, "DIAGNOSTIC_SCHEMA_INVALID", "Diagnostic");
}

export function validateAstContract(value) {
  return schemaDiagnostics(validators.ast, value, "AST_SCHEMA_INVALID", "AST");
}

export function validateSpecificationContract(value) {
  const diagnostics = schemaDiagnostics(validators.specification, value, "SPEC_SCHEMA_INVALID", "Specification");
  if (diagnostics.length || value.schemaVersion !== CONTRACT_VERSION) return diagnostics;
  diagnostics.push(...checkSpecificationIds(value));
  return diagnostics;
}

export function validateFlowchartContract(value) {
  const diagnostics = schemaDiagnostics(validators.flowchart, value, "GRAPH_SCHEMA_INVALID", "Flowchart");
  if (diagnostics.length || value.schemaVersion !== CONTRACT_VERSION) return diagnostics;
  return checkFlowchartInvariants(value);
}

export function validateProjectContract(value) {
  const diagnostics = schemaDiagnostics(validators.project, value, "PROJECT_SCHEMA_INVALID", "Project");
  if (diagnostics.length || value.schemaVersion !== CONTRACT_VERSION) return diagnostics;
  diagnostics.push(...validateSpecificationContract(value.specification).filter(({ code }) => [
    "SPEC_SCHEMA_INVALID",
  ].includes(code)));
  diagnostics.push(...validateFlowchartContract(value.flowchart).filter(({ code }) => [
    "GRAPH_DUPLICATE_ID", "GRAPH_DANGLING_EDGE",
  ].includes(code)));
  const findingIds = new Set();
  for (const decision of value.decisions) {
    if (findingIds.has(decision.findingId)) diagnostics.push(invariant("PROJECT_SCHEMA_INVALID", "schema", `Duplicate decision for finding “${decision.findingId}”.`));
    findingIds.add(decision.findingId);
  }
  if (value.generationApproval && value.generationApproval.projectId !== value.projectId) {
    diagnostics.push(invariant("PROJECT_SCHEMA_INVALID", "semantics", "The generation approval belongs to a different project."));
  }
  return diagnostics;
}

export const CONTRACT_VALIDATOR_VERSION = "1.0.0";
