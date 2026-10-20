import re
from typing import Any, Dict, List, Optional, Union


OPERATORS = ["<=", ">=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", "<", ">", "!"]
PRECEDENCE = {
    "||": 1,
    "&&": 2,
    "==": 3,
    "!=": 3,
    "<": 4,
    "<=": 4,
    ">": 4,
    ">=": 4,
    "+": 5,
    "-": 5,
    "*": 6,
    "/": 6,
    "%": 6,
}
ESCAPES = {"n": "\n", "r": "\r", "t": "\t", "0": "\0", "\\": "\\", "'": "'", '"': '"'}


class ExpressionSyntaxError(ValueError):
    def __init__(self, message: str, offset: int = 0):
        super().__init__(message)
        self.message = message
        self.offset = offset


class Token:
    def __init__(
        self,
        type_: str,
        value: Any,
        offset: int,
        raw: Optional[str] = None,
        value_type: Optional[str] = None,
    ):
        self.type = type_
        self.value = value
        self.offset = offset
        self.raw = raw
        self.value_type = value_type

    def __repr__(self) -> str:
        return f"Token({self.type}, {self.value!r})"


def tokenize(source: str) -> List[Token]:
    if not isinstance(source, str) or not source.strip():
        raise ExpressionSyntaxError("Enter an expression.", 0)

    tokens: List[Token] = []
    index = 0
    length = len(source)

    while index < length:
        char = source[index]
        if char.isspace():
            index += 1
            continue

        start = index
        rest = source[index:]

        # Number literal
        num_match = re.match(r"^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?", rest)
        if num_match:
            raw = num_match.group(0)
            try:
                if "." in raw or "e" in raw or "E" in raw:
                    value = float(raw)
                    value_type = "double"
                else:
                    value = int(raw)
                    value_type = "int"
            except ValueError:
                raise ExpressionSyntaxError("Use a finite number within the supported range.", start)

            tokens.append(Token("number", value, start, raw=raw, value_type=value_type))
            index += len(raw)
            continue

        # Character literal
        if char == "'":
            index += 1
            if index >= length or source[index] in ("'", "\n", "\r"):
                raise ExpressionSyntaxError("A character literal must contain exactly one character.", start)

            if source[index] == "\\":
                index += 1
                if index >= length:
                    raise ExpressionSyntaxError("A character literal must contain exactly one character and a closing quote.", start)
                escaped = source[index]
                if escaped not in ESCAPES:
                    raise ExpressionSyntaxError("That character escape is not supported.", index - 1)
                val = ESCAPES[escaped]
                index += 1
            else:
                code_point = ord(source[index])
                if code_point > 0x7F:
                    raise ExpressionSyntaxError("M1 character literals must be one ASCII character or a supported escape.", index)
                val = source[index]
                index += 1

            if index >= length or source[index] != "'":
                raise ExpressionSyntaxError("A character literal must contain exactly one character and a closing quote.", start)
            index += 1
            tokens.append(Token("character", val, start))
            continue

        # Identifier
        id_match = re.match(r"^[A-Za-z_][A-Za-z0-9_]*", rest)
        if id_match:
            val = id_match.group(0)
            tokens.append(Token("identifier", val, start))
            index += len(val)
            continue

        if rest.startswith("++"):
            raise ExpressionSyntaxError("“++” is not supported; write “x + 1” instead.", start)
        if rest.startswith("--"):
            raise ExpressionSyntaxError("“--” is not supported; write “x - 1” instead.", start)
        if rest.startswith("**"):
            raise ExpressionSyntaxError("Exponentiation “**” is not supported in M1 expressions.", start)
        if rest.startswith("==="):
            raise ExpressionSyntaxError("Use “==” for comparison instead of “===”.", start)
        if rest.startswith("!=="):
            raise ExpressionSyntaxError("Use “!=” for comparison instead of “!==”.", start)
        if rest.startswith("=") and not rest.startswith("=="):
            raise ExpressionSyntaxError("Use “==” to test equality; “=” is only used in assignments.", start)

        # Multi-char and single-char operators
        op_found = False
        for op in OPERATORS:
            if rest.startswith(op):
                tokens.append(Token("operator", op, start))
                index += len(op)
                op_found = True
                break
        if op_found:
            continue

        if char in ("(", ")"):
            tokens.append(Token("paren", char, start))
            index += 1
            continue

        raise ExpressionSyntaxError(f"“{char}” is not supported in expressions.", start)

    return tokens


def parse_expression(source: str, id_prefix: str = "expression") -> Dict[str, Any]:
    tokens = tokenize(source)
    cursor = 0
    node_index = 0

    def next_id() -> str:
        nonlocal node_index
        nid = f"{id_prefix}:e{node_index}"
        node_index += 1
        return nid

    def peek() -> Optional[Token]:
        return tokens[cursor] if cursor < len(tokens) else None

    def take() -> Optional[Token]:
        nonlocal cursor
        if cursor < len(tokens):
            tok = tokens[cursor]
            cursor += 1
            return tok
        return None

    def primary() -> Dict[str, Any]:
        token = take()
        if not token:
            raise ExpressionSyntaxError("The expression ends before its value.", len(source))

        if token.type == "number":
            return {
                "id": next_id(),
                "kind": "IntegerLiteral" if token.value_type == "int" else "FloatingLiteral",
                "value": token.value,
            }
        if token.type == "character":
            return {
                "id": next_id(),
                "kind": "CharacterLiteral",
                "value": token.value,
            }
        if token.type == "identifier":
            return {
                "id": next_id(),
                "kind": "VariableReference",
                "symbolId": token.value,
            }
        if token.value == "(":
            expr = binary(1)
            p = peek()
            if not p or p.value != ")":
                raise ExpressionSyntaxError("Add a closing parenthesis.", token.offset)
            take()
            return expr

        raise ExpressionSyntaxError(f"“{token.value}” needs a value before it.", token.offset)

    def unary() -> Dict[str, Any]:
        token = peek()
        if token and token.type == "operator" and token.value in ("+", "-", "!"):
            take()
            if not peek():
                raise ExpressionSyntaxError(f"“{token.value}” needs a value after it.", len(source))
            return {
                "id": next_id(),
                "kind": "UnaryExpression",
                "operator": token.value,
                "operand": unary(),
            }
        return primary()

    def binary(minimum: int) -> Dict[str, Any]:
        left = unary()
        saw_comparison = False

        while True:
            token = peek()
            if not token or token.type != "operator" or token.value not in PRECEDENCE or PRECEDENCE[token.value] < minimum:
                break

            take()
            is_comp = token.value in ("<", "<=", ">", ">=", "==", "!=")
            if is_comp and saw_comparison:
                raise ExpressionSyntaxError("Chained comparisons are not supported; combine comparisons with && or ||.", token.offset)

            next_min = PRECEDENCE[token.value] + 1
            right = binary(next_min)
            left = {
                "id": next_id(),
                "kind": "BinaryExpression",
                "operator": token.value,
                "left": left,
                "right": right,
            }
            saw_comparison = saw_comparison or is_comp

        return left

    expression = binary(1)
    if cursor != len(tokens):
        p = peek()
        offset = p.offset if p else len(source)
        val = p.value if p else ""
        raise ExpressionSyntaxError(f"Unexpected “{val}”.", offset)

    return expression
