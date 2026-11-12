/**
 * Transport types for the versioned M1 contract.
 *
 * These types mirror the JavaScript runtime contracts during the incremental
 * migration. They deliberately exclude proposed M1.2 loop support.
 */

export type ScalarType = "int" | "double" | "char";
export type ExpressionType = ScalarType | "bool";
export type SourceKind = "specification" | "flowchart";
export type DiagnosticSeverity = "error" | "warning" | "info";
export type ReconciliationStatus = "equivalent" | "conflict" | "unknown" | "invalid";

export interface SourceReference {
  sourceKind: SourceKind;
  sourceObjectId: string;
  sourceRevision: number;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  category: "schema" | "structure" | "type" | "semantics" | "reconciliation" | "generation";
  message: string;
  sourceRefs: SourceReference[];
  suggestion?: string;
  ruleVersion: string;
}

export interface AstProvenance {
  astNodeId: string;
  origins: SourceReference[];
  transformationRuleId: string;
  adapterVersion: string;
}

export interface IntegerLiteral {
  id: string;
  kind: "IntegerLiteral";
  value: number;
}

export interface FloatingLiteral {
  id: string;
  kind: "FloatingLiteral";
  value: number;
}

export interface CharacterLiteral {
  id: string;
  kind: "CharacterLiteral";
  value: string;
}

export interface VariableReference {
  id: string;
  kind: "VariableReference";
  symbolId: string;
}

export interface UnaryExpression {
  id: string;
  kind: "UnaryExpression";
  operator: "+" | "-" | "!";
  operand: AstExpression;
}

export interface BinaryExpression {
  id: string;
  kind: "BinaryExpression";
  operator: "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||";
  left: AstExpression;
  right: AstExpression;
}

export type AstExpression =
  | IntegerLiteral
  | FloatingLiteral
  | CharacterLiteral
  | VariableReference
  | UnaryExpression
  | BinaryExpression;

export interface VariableDeclaration {
  id: string;
  kind: "VariableDeclaration";
  symbolId: string;
  initializer?: AstExpression;
}

export interface Assignment {
  id: string;
  kind: "Assignment";
  symbolId: string;
  expression: AstExpression;
}

export interface Input {
  id: string;
  kind: "Input";
  symbolId: string;
  prompt: string;
}

export interface MessageOutput {
  id: string;
  kind: "Output";
  mode: "message";
  message: string;
}

export interface ValueOutput {
  id: string;
  kind: "Output";
  mode: "value";
  value: AstExpression;
}

export interface FormattedOutput {
  id: string;
  kind: "Output";
  mode: "formatted";
  message: string;
  value: AstExpression;
}

export interface IfStatement {
  id: string;
  kind: "IfStatement";
  condition: AstExpression;
  thenBlock: AstBlock;
  elseBlock: AstBlock;
}

export interface WhileStatement {
  id: string;
  kind: "WhileStatement";
  condition: AstExpression;
  body: AstBlock;
}

export type AstStatement =
  | VariableDeclaration
  | Assignment
  | Input
  | MessageOutput
  | ValueOutput
  | FormattedOutput
  | IfStatement
  | WhileStatement;

export interface AstBlock {
  id: string;
  kind: "Block";
  statements: AstStatement[];
}

export interface AstSymbol {
  id: string;
  name: string;
  type: ScalarType;
}

export interface TypedAstProgram {
  irVersion: "1.0.0";
  programId: string;
  body: AstBlock;
  symbols: AstSymbol[];
  provenance: AstProvenance[];
}

export interface SpecificationDeclaration {
  id: string;
  name: string;
  type: ScalarType;
  description?: string;
}

export interface SpecificationOutput {
  id: string;
  description: string;
}

export interface DeclarationStep {
  id: string;
  kind: "declaration";
  payload: { symbolId: string; initializer?: string };
}

export interface AssignmentStep {
  id: string;
  kind: "assignment";
  payload: { targetId: string; expression: string };
}

export interface InputStep {
  id: string;
  kind: "input";
  payload: { inputId: string; prompt: string };
}

export interface MessageOutputStep {
  id: string;
  kind: "output";
  payload: { outputId: string; mode: "message"; message: string };
}

export interface ExpressionOutputStep {
  id: string;
  kind: "output";
  payload: { outputId: string; mode: "expression"; expression: string };
}

export interface FormattedOutputStep {
  id: string;
  kind: "output";
  payload: { outputId: string; mode: "formatted"; message: string; expression: string };
}

export interface ConditionalStep {
  id: string;
  kind: "conditional";
  payload: {
    condition: string;
    whenTrue: SpecificationStep[];
    whenFalse: SpecificationStep[];
  };
}

export interface WhileStep {
  id: string;
  kind: "while";
  payload: {
    condition: string;
    body: SpecificationStep[];
  };
}

export type SpecificationStep =
  | DeclarationStep
  | AssignmentStep
  | InputStep
  | MessageOutputStep
  | ExpressionOutputStep
  | FormattedOutputStep
  | ConditionalStep
  | WhileStep;

export interface AlgorithmSpecification {
  schemaVersion: "1.0.0";
  revision: number;
  inputs: SpecificationDeclaration[];
  outputs: SpecificationOutput[];
  variables: SpecificationDeclaration[];
  steps: SpecificationStep[];
  constraints: [];
  examples: Array<{ id: string; title: string; description: string }>;
}

export interface StartNode {
  id: string;
  kind: "start";
  payload: Record<string, never>;
}

export interface EndNode {
  id: string;
  kind: "end";
  payload: Record<string, never>;
}

export interface InitializationNode {
  id: string;
  kind: "initialization";
  payload: {
    symbolId: string;
    name: string;
    type: ScalarType;
    initializer?: string;
  };
}

export interface AssignmentProcessNode {
  id: string;
  kind: "process";
  payload: { operation: "assignment"; symbolId: string; expression: string };
}

export interface InputNode {
  id: string;
  kind: "input";
  payload: { symbolId: string; name: string; type: ScalarType; prompt: string };
}

export interface MessageOutputNode {
  id: string;
  kind: "output";
  payload: { outputId: string; mode: "message"; message: string };
}

export interface ExpressionOutputNode {
  id: string;
  kind: "output";
  payload: { outputId: string; mode: "expression"; expression: string };
}

export interface FormattedOutputNode {
  id: string;
  kind: "output";
  payload: { outputId: string; mode: "formatted"; message: string; expression: string };
}

export interface DecisionNode {
  id: string;
  kind: "decision";
  payload: { condition: string };
}

export type FlowchartNode =
  | StartNode
  | EndNode
  | InitializationNode
  | AssignmentProcessNode
  | InputNode
  | MessageOutputNode
  | ExpressionOutputNode
  | FormattedOutputNode
  | DecisionNode;

export interface FlowchartEdge {
  id: string;
  from: string;
  to: string;
  branch?: "true" | "false";
}

export interface FlowchartGraph {
  schemaVersion: "1.0.0";
  revision: number;
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  layout: {
    positions: Record<string, { x: number; y: number }>;
    zoom: number;
  };
}

export interface ReconciliationDecision {
  findingId: string;
  specificationRevision: number;
  flowchartRevision: number;
  choice: string;
}

export interface GenerationApproval {
  projectId: string;
  semanticRevision: number;
  specificationRevision: number;
  flowchartRevision: number;
  canonicalAstFingerprint: string;
  adapterVersion: string;
  canonicalizerVersion: string;
  validatorVersion: string;
  generatorVersion: string;
  approvedAt: string;
}

export interface ProjectEnvelope {
  schemaVersion: "1.0.0";
  projectId: string;
  name: string;
  /** Optional for projects saved before code-level choices were introduced. */
  codeLevel?: "beginner" | "intermediate" | "professional";
  specification: AlgorithmSpecification;
  flowchart: FlowchartGraph;
  decisions: ReconciliationDecision[];
  revisions: { semantic: number; presentation: number };
  createdAt: string;
  updatedAt: string;
  generationApproval?: GenerationApproval;
}

export interface AstCandidate {
  ast: TypedAstProgram | null;
  diagnostics: Diagnostic[];
  valid: boolean;
  adapterVersion: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
  typeTable: Record<string, ExpressionType>;
}

export interface ReconciliationFinding {
  id: string;
  path: string;
  specificationValue: unknown;
  flowchartValue: unknown;
  specificationSourceRefs: SourceReference[];
  flowchartSourceRefs: SourceReference[];
  diagnostic: Diagnostic;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  findings: ReconciliationFinding[];
  diagnostics: Diagnostic[];
  unresolvedCount: number;
  canonicalizerVersion: string;
  revisions?: { specification: number | null; flowchart: number | null };
}
