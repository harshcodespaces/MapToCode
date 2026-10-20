const OPERATORS = ["<=", ">=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", "<", ">", "!"];
const PRECEDENCE = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
const ESCAPES = { n: "\n", r: "\r", t: "\t", "0": "\0", "\\": "\\", "'": "'", '"': '"' };

export class ExpressionSyntaxError extends Error {
  constructor(message, offset) {
    super(message);
    this.name = "ExpressionSyntaxError";
    this.offset = offset;
  }
}

function tokenize(source) {
  if (typeof source !== "string" || !source.trim()) throw new ExpressionSyntaxError("Enter an expression.", 0);
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    const start = index;
    const rest = source.slice(index);
    const number = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      const raw = number[0];
      const value = Number(raw);
      if (!Number.isFinite(value) || (!raw.includes(".") && !/[eE]/.test(raw) && !Number.isSafeInteger(value))) {
        throw new ExpressionSyntaxError("Use a finite number within the supported range.", start);
      }
      tokens.push({ type: "number", raw, value, valueType: raw.includes(".") || /[eE]/.test(raw) ? "double" : "int", offset: start });
      index += raw.length;
      continue;
    }
    if (source[index] === "'") {
      index += 1;
      let value;
      if (index >= source.length || source[index] === "'" || source[index] === "\n" || source[index] === "\r") {
        throw new ExpressionSyntaxError("A character literal must contain exactly one character.", start);
      }
      if (source[index] === "\\") {
        const escaped = source[index + 1];
        if (!Object.hasOwn(ESCAPES, escaped)) throw new ExpressionSyntaxError("That character escape is not supported.", index);
        value = ESCAPES[escaped];
        index += 2;
      } else {
        const point = String.fromCodePoint(source.codePointAt(index));
        if (point.codePointAt(0) > 0x7f) throw new ExpressionSyntaxError("M1 character literals must be one ASCII character or a supported escape.", index);
        value = point;
        index += point.length;
      }
      if (source[index] !== "'") throw new ExpressionSyntaxError("A character literal must contain exactly one character and a closing quote.", start);
      index += 1;
      tokens.push({ type: "character", value, offset: start });
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0], offset: start });
      index += identifier[0].length;
      continue;
    }
    if (rest.startsWith("++")) {
      throw new ExpressionSyntaxError("“++” is not supported; write “x + 1” instead.", start);
    }
    if (rest.startsWith("--")) {
      throw new ExpressionSyntaxError("“--” is not supported; write “x - 1” instead.", start);
    }
    if (rest.startsWith("**")) {
      throw new ExpressionSyntaxError("Exponentiation “**” is not supported in M1 expressions.", start);
    }
    if (rest.startsWith("===")) {
      throw new ExpressionSyntaxError("Use “==” for comparison instead of “===”.", start);
    }
    if (rest.startsWith("!==")) {
      throw new ExpressionSyntaxError("Use “!=” for comparison instead of “!==”.", start);
    }
    if (rest.startsWith("=") && !rest.startsWith("==")) {
      throw new ExpressionSyntaxError("Use “==” to test equality; “=” is only used in assignments.", start);
    }
    const operator = OPERATORS.find((candidate) => rest.startsWith(candidate));
    if (operator) {
      tokens.push({ type: "operator", value: operator, offset: start });
      index += operator.length;
      continue;
    }
    if (source[index] === "(" || source[index] === ")") {
      tokens.push({ type: "paren", value: source[index], offset: start });
      index += 1;
      continue;
    }
    throw new ExpressionSyntaxError(`“${source[index]}” is not supported in expressions.`, start);
  }
  return tokens;
}

export function parseExpression(source, { idPrefix = "expression" } = {}) {
  const tokens = tokenize(source);
  let cursor = 0;
  let nodeIndex = 0;
  const nextId = () => `${idPrefix}:e${nodeIndex++}`;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];

  function primary() {
    const token = take();
    if (!token) throw new ExpressionSyntaxError("The expression ends before its value.", source.length);
    if (token.type === "number") {
      return { id: nextId(), kind: token.valueType === "int" ? "IntegerLiteral" : "FloatingLiteral", value: token.value };
    }
    if (token.type === "character") return { id: nextId(), kind: "CharacterLiteral", value: token.value };
    if (token.type === "identifier") return { id: nextId(), kind: "VariableReference", symbolId: token.value };
    if (token.value === "(") {
      const expression = binary(1);
      if (peek()?.value !== ")") throw new ExpressionSyntaxError("Add a closing parenthesis.", token.offset);
      take();
      return expression;
    }
    throw new ExpressionSyntaxError(`“${token.value}” needs a value before it.`, token.offset);
  }

  function unary() {
    const token = peek();
    if (token?.type === "operator" && ["+", "-", "!"].includes(token.value)) {
      take();
      if (!peek()) throw new ExpressionSyntaxError(`“${token.value}” needs a value after it.`, source.length);
      return { id: nextId(), kind: "UnaryExpression", operator: token.value, operand: unary() };
    }
    return primary();
  }

  function binary(minimum) {
    let left = unary();
    let sawComparison = false;
    while (peek()?.type === "operator" && Object.hasOwn(PRECEDENCE, peek().value) && PRECEDENCE[peek().value] >= minimum) {
      const token = take();
      const isComparison = ["<", "<=", ">", ">=", "==", "!="].includes(token.value);
      if (isComparison && sawComparison) throw new ExpressionSyntaxError("Chained comparisons are not supported; combine comparisons with && or ||.", token.offset);
      const nextMinimum = PRECEDENCE[token.value] + 1;
      const right = binary(nextMinimum);
      left = { id: nextId(), kind: "BinaryExpression", operator: token.value, left, right };
      sawComparison ||= isComparison;
    }
    return left;
  }

  const expression = binary(1);
  if (cursor !== tokens.length) throw new ExpressionSyntaxError(`Unexpected “${peek().value}”.`, peek().offset);
  return expression;
}
