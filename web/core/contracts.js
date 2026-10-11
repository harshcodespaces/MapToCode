// Versioned, UI-independent contract definitions for MapToCode M1.
// These JSON-Schema-shaped objects document accepted data; validation is added
// by the core validation phase, rather than being delegated to a UI component.

export const CONTRACT_VERSION = "1.0.0";
export const AST_VERSION = "1.0.0";

const id = { type: "string", minLength: 1, maxLength: 128 };
const revision = { type: "integer", minimum: 0 };
const sourceRef = {
  type: "object",
  additionalProperties: false,
  required: ["sourceKind", "sourceObjectId", "sourceRevision"],
  properties: {
    sourceKind: { enum: ["specification", "flowchart"] },
    sourceObjectId: id,
    sourceRevision: revision,
  },
};

export const diagnosticSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "maptocode://diagnostic/1.0.0",
  type: "object",
  additionalProperties: false,
  required: ["code", "severity", "category", "message", "sourceRefs", "ruleVersion"],
  properties: {
    code: { type: "string", minLength: 1 },
    severity: { enum: ["error", "warning", "info"] },
    category: { enum: ["schema", "structure", "type", "semantics", "reconciliation", "generation"] },
    message: { type: "string", minLength: 1 },
    sourceRefs: { type: "array", items: sourceRef },
    suggestion: { type: "string" },
    ruleVersion: { type: "string", minLength: 1 },
  },
};

export const astSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "maptocode://typed-ast/1.0.0",
  type: "object",
  additionalProperties: false,
  required: ["irVersion", "programId", "body", "symbols", "provenance"],
  properties: {
    irVersion: { const: AST_VERSION },
    programId: id,
    body: { $ref: "#/$defs/block" },
    symbols: { type: "array", items: { $ref: "#/$defs/symbol" } },
    provenance: { type: "array", items: { $ref: "#/$defs/provenance" } },
  },
  $defs: {
    typeName: { enum: ["int", "double", "char"] },
    expression: {
      oneOf: [
        { $ref: "#/$defs/literal" },
        {
          type: "object", additionalProperties: false,
          required: ["id", "kind", "symbolId"],
          properties: { id, kind: { const: "VariableReference" }, symbolId: id },
        },
        {
          type: "object", additionalProperties: false,
          required: ["id", "kind", "operator", "operand"],
          properties: { id, kind: { const: "UnaryExpression" }, operator: { enum: ["+", "-", "!"] }, operand: { $ref: "#/$defs/expression" } },
        },
        {
          type: "object", additionalProperties: false,
          required: ["id", "kind", "operator", "left", "right"],
          properties: { id, kind: { const: "BinaryExpression" }, operator: { enum: ["+", "-", "*", "/", "%", "<", "<=", ">", ">=", "==", "!=", "&&", "||"] }, left: { $ref: "#/$defs/expression" }, right: { $ref: "#/$defs/expression" } },
        },
      ],
    },
    literal: {
      oneOf: [
        { type: "object", additionalProperties: false, required: ["id", "kind", "value"], properties: { id, kind: { const: "IntegerLiteral" }, value: { type: "integer" } } },
        { type: "object", additionalProperties: false, required: ["id", "kind", "value"], properties: { id, kind: { const: "FloatingLiteral" }, value: { type: "number" } } },
        { type: "object", additionalProperties: false, required: ["id", "kind", "value"], properties: { id, kind: { const: "CharacterLiteral" }, value: { type: "string", minLength: 1, maxLength: 1 } } },
      ],
    },
    statement: {
      oneOf: [
        { type: "object", additionalProperties: false, required: ["id", "kind", "symbolId"], properties: { id, kind: { const: "VariableDeclaration" }, symbolId: id, initializer: { $ref: "#/$defs/expression" } } },
        { type: "object", additionalProperties: false, required: ["id", "kind", "symbolId", "expression"], properties: { id, kind: { const: "Assignment" }, symbolId: id, expression: { $ref: "#/$defs/expression" } } },
        { type: "object", additionalProperties: false, required: ["id", "kind", "symbolId", "prompt"], properties: { id, kind: { const: "Input" }, symbolId: id, prompt: { type: "string" } } },
        { type: "object", additionalProperties: false, required: ["id", "kind", "value"], properties: { id, kind: { const: "Output" }, value: { $ref: "#/$defs/expression" } } },
        { type: "object", additionalProperties: false, required: ["id", "kind", "condition", "thenBlock", "elseBlock"], properties: { id, kind: { const: "IfStatement" }, condition: { $ref: "#/$defs/expression" }, thenBlock: { $ref: "#/$defs/block" }, elseBlock: { $ref: "#/$defs/block" } } },
      ],
    },
    block: {
      type: "object", additionalProperties: false,
      required: ["id", "kind", "statements"],
      properties: { id, kind: { const: "Block" }, statements: { type: "array", items: { $ref: "#/$defs/statement" } } },
    },
    symbol: {
      type: "object", additionalProperties: false,
      required: ["id", "name", "type"],
      properties: { id, name: { type: "string", minLength: 1 }, type: { $ref: "#/$defs/typeName" } },
    },
    provenance: {
      type: "object", additionalProperties: false,
      required: ["astNodeId", "origins", "transformationRuleId", "adapterVersion"],
      properties: {
        astNodeId: id,
        origins: { type: "array", minItems: 1, items: sourceRef },
        transformationRuleId: { type: "string", minLength: 1 },
        adapterVersion: { type: "string", minLength: 1 },
      },
    },
  },
};

export const specificationSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "maptocode://specification/1.0.0",
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "revision", "inputs", "outputs", "variables", "steps", "constraints", "examples"],
  properties: {
    schemaVersion: { const: CONTRACT_VERSION }, revision,
    inputs: { type: "array", items: { $ref: "#/$defs/declaration" } },
    outputs: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "description"], properties: { id, description: { type: "string" } } } },
    variables: { type: "array", items: { $ref: "#/$defs/declaration" } },
    steps: { type: "array", items: { type: "object", required: ["id", "kind"], properties: { id, kind: { enum: ["declaration", "assignment", "input", "output", "conditional"] }, payload: { type: "object" } }, additionalProperties: false } },
    constraints: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "kind", "payload"], properties: { id, kind: { type: "string" }, payload: { type: "object" } } } },
    examples: { type: "array", items: { type: "object" } },
  },
  $defs: {
    declaration: { type: "object", additionalProperties: false, required: ["id", "name", "type"], properties: { id, name: { type: "string", minLength: 1 }, type: { enum: ["int", "double", "char"] }, description: { type: "string" } } },
  },
};

export const flowchartSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "maptocode://flowchart/1.0.0",
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "revision", "nodes", "edges", "layout"],
  properties: {
    schemaVersion: { const: CONTRACT_VERSION }, revision,
    nodes: { type: "array", items: { $ref: "#/$defs/node" } },
    edges: { type: "array", items: { $ref: "#/$defs/edge" } },
    layout: { type: "object", additionalProperties: false, required: ["positions", "zoom"], properties: { positions: { type: "object", additionalProperties: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } } }, zoom: { type: "number", exclusiveMinimum: 0 } } },
  },
  $defs: {
    node: { type: "object", additionalProperties: false, required: ["id", "kind", "payload"], properties: { id, kind: { enum: ["start", "end", "process", "input", "output", "decision"] }, payload: { type: "object" } } },
    edge: { type: "object", additionalProperties: false, required: ["id", "from", "to"], properties: { id, from: id, to: id, branch: { enum: ["true", "false"] } } },
  },
};

export const projectSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "maptocode://project/1.0.0",
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "projectId", "name", "specification", "flowchart", "decisions", "revisions", "createdAt", "updatedAt"],
  properties: {
    schemaVersion: { const: CONTRACT_VERSION }, projectId: { type: "string", format: "uuid" }, name: { type: "string", minLength: 1, maxLength: 120 },
    specification: { $ref: "maptocode://specification/1.0.0" }, flowchart: { $ref: "maptocode://flowchart/1.0.0" },
    decisions: { type: "array", items: { type: "object", additionalProperties: false, required: ["findingId", "specificationRevision", "flowchartRevision", "choice"], properties: { findingId: id, specificationRevision: revision, flowchartRevision: revision, choice: { type: "string", minLength: 1 } } } },
    revisions: { type: "object", additionalProperties: false, required: ["semantic", "presentation"], properties: { semantic: revision, presentation: revision } },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    derivedCache: { type: "object" },
  },
};

