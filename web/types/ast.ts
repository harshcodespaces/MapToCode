export type AstType = "int" | "double" | "char" | "bool";

export interface AstProvenance {
  source: "specification" | "flowchart";
  elementId: string;
  field?: string;
}

export interface AstLiteral {
  id: string;
  kind: "Literal";
  type: AstType;
  value: number | string | boolean;
  provenance?: AstProvenance;
}

export interface AstVariableReference {
  id: string;
  kind: "VariableReference";
  name: string;
  provenance?: AstProvenance;
}

export interface AstUnaryExpression {
  id: string;
  kind: "UnaryExpression";
  operator: "+" | "-" | "!";
  argument: AstExpression;
  provenance?: AstProvenance;
}

export interface AstBinaryExpression {
  id: string;
  kind: "BinaryExpression";
  operator: "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||";
  left: AstExpression;
  right: AstExpression;
  provenance?: AstProvenance;
}

export type AstExpression =
  | AstLiteral
  | AstVariableReference
  | AstUnaryExpression
  | AstBinaryExpression;

export interface AstDeclarationStatement {
  id: string;
  kind: "DeclarationStatement";
  variable: string;
  type: AstType;
  initialValue?: AstExpression;
  provenance?: AstProvenance;
}

export interface AstAssignmentStatement {
  id: string;
  kind: "AssignmentStatement";
  variable: string;
  expression: AstExpression;
  provenance?: AstProvenance;
}

export interface AstInputStatement {
  id: string;
  kind: "InputStatement";
  variable: string;
  type: AstType;
  prompt: string;
  provenance?: AstProvenance;
}

export interface AstOutputStatement {
  id: string;
  kind: "OutputStatement";
  mode: "message" | "expression" | "variable" | "formatted";
  value: AstExpression | string;
  message?: string;
  provenance?: AstProvenance;
}

export interface AstIfStatement {
  id: string;
  kind: "IfStatement";
  condition: AstExpression;
  thenBlock: AstStatement[];
  elseBlock: AstStatement[];
  provenance?: AstProvenance;
}

export interface AstWhileStatement {
  id: string;
  kind: "WhileStatement";
  condition: AstExpression;
  body: AstStatement[];
  provenance?: AstProvenance;
}

export type AstStatement =
  | AstDeclarationStatement
  | AstAssignmentStatement
  | AstInputStatement
  | AstOutputStatement
  | AstIfStatement
  | AstWhileStatement;

export interface TypedAstProgram {
  schemaVersion: string;
  projectId: string;
  sourceType: "specification" | "flowchart";
  sourceRevision: number;
  body: AstStatement[];
}
