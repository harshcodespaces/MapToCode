// Stable diagnostic identifiers from the M1 architecture specification.
export const DIAGNOSTIC_CODES = Object.freeze({
  SPEC_SCHEMA_INVALID: "SPEC_SCHEMA_INVALID",
  GRAPH_DANGLING_EDGE: "GRAPH_DANGLING_EDGE",
  GRAPH_BRANCH_INVALID: "GRAPH_BRANCH_INVALID",
  GRAPH_UNREACHABLE_NODE: "GRAPH_UNREACHABLE_NODE",
  GRAPH_UNSUPPORTED_CYCLE: "GRAPH_UNSUPPORTED_CYCLE",
  AST_SCHEMA_INVALID: "AST_SCHEMA_INVALID",
  SYMBOL_UNDECLARED: "SYMBOL_UNDECLARED",
  SYMBOL_DUPLICATE: "SYMBOL_DUPLICATE",
  TYPE_ASSIGNMENT_INVALID: "TYPE_ASSIGNMENT_INVALID",
  TYPE_OPERAND_INVALID: "TYPE_OPERAND_INVALID",
  TYPE_CONDITION_INVALID: "TYPE_CONDITION_INVALID",
  SEM_DIVISION_BY_ZERO_STATIC: "SEM_DIVISION_BY_ZERO_STATIC",
  RECON_CONFLICT: "RECON_CONFLICT",
  RECON_EQUIVALENCE_UNKNOWN: "RECON_EQUIVALENCE_UNKNOWN",
  RECON_INPUT_INVALID: "RECON_INPUT_INVALID",
  GEN_STALE_APPROVAL: "GEN_STALE_APPROVAL",
  GEN_UNRESOLVED_CONFLICT: "GEN_UNRESOLVED_CONFLICT",
  GEN_AST_UNSUPPORTED: "GEN_AST_UNSUPPORTED",
  GEN_VALIDATION_FAILED: "GEN_VALIDATION_FAILED",
});

export const DIAGNOSTIC_RULE_VERSION = "1.0.0";

export function createDiagnostic({ code, severity = "error", category, message, sourceRefs = [], suggestion }) {
  if (!Object.hasOwn(DIAGNOSTIC_CODES, code)) throw new TypeError(`Unknown diagnostic code: ${code}`);
  if (!category || !message) throw new TypeError("A diagnostic needs a category and message.");
  return {
    code,
    severity,
    category,
    message,
    sourceRefs,
    ...(suggestion ? { suggestion } : {}),
    ruleVersion: DIAGNOSTIC_RULE_VERSION,
  };
}
