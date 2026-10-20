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
        { type: "object", additionalProperties: false, required: ["id", "kind", "mode", "message"], properties: { id, kind: { const: "Output" }, mode: { const: "message" }, message: { type: "string", maxLength: 500 } } },
        { type: "object", additionalProperties: false, required: ["id", "kind", "mode", "value"], properties: { id, kind: { const: "Output" }, mode: { const: "value" }, value: { $ref: "#/$defs/expression" } } },
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

const declarationSchema = {
  type: "object", additionalProperties: false, required: ["id", "name", "type"],
  properties: { id, name: { type: "string", maxLength: 64 }, type: { enum: ["int", "double", "char"] }, description: { type: "string", maxLength: 500 } },
};

const specificationStepSchema = {
  oneOf: [
    { type: "object", additionalProperties: false, required: ["id", "kind", "payload"], properties: { id, kind: { const: "declaration" }, payload: { type: "object", additionalProperties: false, required: ["symbolId"], properties: { symbolId: id, initializer: { type: "string", maxLength: 256 } } } } },
    { type: "object", additionalProperties: false, required: ["id", "kind", "payload"], properties: { id, kind: { const: "assignment" }, payload: { type: "object", additionalProperties: false, required: ["targetId", "expression"], properties: { targetId: id, expression: { type: "string", maxLength: 256 } } } } },
    { type: "object", additionalProperties: false, required: ["id", "kind", "payload"], properties: { id, kind: { const: "input" }, payload: { type: "object", additionalProperties: false, required: ["inputId", "prompt"], properties: { inputId: id, prompt: { type: "string", maxLength: 200 } } } } },
    { type: "object", additionalProperties: false, required: ["id", "kind", "payload"], properties: { id, kind: { const: "output" }, payload: { oneOf: [
      { type: "object", additionalProperties: false, required: ["outputId", "mode", "message"], properties: { outputId: id, mode: { const: "message" }, message: { type: "string", maxLength: 500 } } },
      { type: "object", additionalProperties: false, required: ["outputId", "mode", "expression"], properties: { outputId: id, mode: { const: "expression" }, expression: { type: "string", maxLength: 256 } } },
    ] } } },
    { type: "object", additionalProperties: false, required: ["id", "kind", "payload"], properties: { id, kind: { const: "conditional" }, payload: { type: "object", additionalProperties: false, required: ["condition", "whenTrue", "whenFalse"], properties: { condition: { type: "string", maxLength: 256 }, whenTrue: { type: "array", items: { $ref: "#/$defs/step" } }, whenFalse: { type: "array", items: { $ref: "#/$defs/step" } } } } } },
  ],
};

export const specificationSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "maptocode://specification/1.0.0",
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "revision", "inputs", "outputs", "variables", "steps", "constraints", "examples"],
  properties: {
    schemaVersion: { const: CONTRACT_VERSION }, revision,
    inputs: { type: "array", items: { $ref: "#/$defs/declaration" } },
    outputs: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "description"], properties: { id, description: { type: "string", maxLength: 500 } } } },
    variables: { type: "array", items: { $ref: "#/$defs/declaration" } },
    steps: { type: "array", items: { $ref: "#/$defs/step" } },
    constraints: { type: "array", maxItems: 0 },
    examples: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "description"], properties: { id, title: { type: "string", minLength: 1, maxLength: 120 }, description: { type: "string", maxLength: 500 } } } },
  },
  $defs: {
    declaration: declarationSchema,
    step: specificationStepSchema,
  },
};

const graphNode = (kind, payload) => ({ type: "object", additionalProperties: false, required: ["id", "kind", "payload"], properties: { id, kind: { const: kind }, payload } });
const emptyPayload = { type: "object", additionalProperties: false, maxProperties: 0 };
const processPayload = { oneOf: [
  { type: "object", additionalProperties: false, required: ["operation", "symbolId", "name", "type"], properties: { operation: { const: "declaration" }, symbolId: id, name: { type: "string", maxLength: 64 }, type: { enum: ["int", "double", "char"] }, initializer: { type: "string", maxLength: 256 } } },
  { type: "object", additionalProperties: false, required: ["operation", "symbolId", "expression"], properties: { operation: { const: "assignment" }, symbolId: id, expression: { type: "string", maxLength: 256 } } },
] };
const outputPayload = { oneOf: [
  { type: "object", additionalProperties: false, required: ["outputId", "mode", "message"], properties: { outputId: id, mode: { const: "message" }, message: { type: "string", maxLength: 500 } } },
  { type: "object", additionalProperties: false, required: ["outputId", "mode", "expression"], properties: { outputId: id, mode: { const: "expression" }, expression: { type: "string", maxLength: 256 } } },
] };

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
    node: { oneOf: [
      graphNode("start", emptyPayload),
      graphNode("end", emptyPayload),
      graphNode("process", processPayload),
      graphNode("input", { type: "object", additionalProperties: false, required: ["symbolId", "name", "type", "prompt"], properties: { symbolId: id, name: { type: "string", maxLength: 64 }, type: { enum: ["int", "double", "char"] }, prompt: { type: "string", maxLength: 200 } } }),
      graphNode("output", outputPayload),
      graphNode("decision", { type: "object", additionalProperties: false, required: ["condition"], properties: { condition: { type: "string", maxLength: 256 } } }),
    ] },
    edge: { type: "object", additionalProperties: false, required: ["id", "from", "to"], properties: { id, from: id, to: id, branch: { enum: ["true", "false"] } } },
  },
};

export const projectSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "maptocode://project/1.0.0",
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "projectId", "name", "specification", "flowchart", "decisions", "revisions", "createdAt", "updatedAt"],
  properties: {
    schemaVersion: { const: CONTRACT_VERSION }, projectId: { type: "string", format: "uuid" }, name: { type: "string", minLength: 1, maxLength: 120, pattern: "\\S" },
    specification: { $ref: "maptocode://specification/1.0.0" }, flowchart: { $ref: "maptocode://flowchart/1.0.0" },
    decisions: { type: "array", items: { type: "object", additionalProperties: false, required: ["findingId", "specificationRevision", "flowchartRevision", "choice"], properties: { findingId: id, specificationRevision: revision, flowchartRevision: revision, choice: { type: "string", minLength: 1 } } } },
    revisions: { type: "object", additionalProperties: false, required: ["semantic", "presentation"], properties: { semantic: revision, presentation: revision } },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    generationApproval: { type: "object", additionalProperties: false, required: ["projectId", "semanticRevision", "specificationRevision", "flowchartRevision", "canonicalAstFingerprint", "adapterVersion", "canonicalizerVersion", "validatorVersion", "generatorVersion", "approvedAt"], properties: {
      projectId: { type: "string", format: "uuid" }, semanticRevision: revision, specificationRevision: revision, flowchartRevision: revision,
      canonicalAstFingerprint: { type: "string", minLength: 1 }, adapterVersion: { type: "string", minLength: 1 },
      canonicalizerVersion: { type: "string", minLength: 1 }, validatorVersion: { type: "string", minLength: 1 },
      generatorVersion: { type: "string", minLength: 1 }, approvedAt: { type: "string", format: "date-time" },
    } },
    derivedCache: { type: "object", additionalProperties: false, maxProperties: 0 },
  },
};

