from typing import Any, Dict, List, Optional
from app.core.diagnostics import create_diagnostic
from app.domain.ast_validation import validate_ast_semantics


C_GENERATOR_VERSION = "1.0.0"


def c_string(value: str) -> str:
    output = '"'
    for character in value:
        code = ord(character)
        if character == "\\":
            output += "\\\\"
        elif character == '"':
            output += '\\"'
        elif character == "\n":
            output += "\\n"
        elif character == "\r":
            output += "\\r"
        elif character == "\t":
            output += "\\t"
        elif code == 0:
            output += "\\000"
        elif code < 0x20 or code == 0x7F:
            output += f"\\{oct(code)[2:].zfill(3)}"
        else:
            output += character
    return f"{output}\""


def c_character(value: str) -> str:
    escapes = {"\\": "\\\\", "'": "\\'", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\0": "\\0"}
    code = ord(value)
    if value in escapes:
        escaped = escapes[value]
    elif code < 0x20 or code == 0x7F:
        escaped = f"\\{oct(code)[2:].zfill(3)}"
    else:
        escaped = value
    return f"'{escaped}'"


def c_number(value: Any, kind: str) -> str:
    text = str(value)
    if kind == "FloatingLiteral" and "." not in text and "e" not in text and "E" not in text:
        return f"{text}.0"
    return text


def c_expression(expression: Dict[str, Any], symbols: Dict[str, Any]) -> str:
    kind = expression.get("kind")
    if kind in ("IntegerLiteral", "FloatingLiteral"):
        return c_number(expression.get("value"), kind)
    if kind == "CharacterLiteral":
        return c_character(expression.get("value", ""))
    if kind == "VariableReference":
        return symbols[expression.get("symbolId")]["name"]
    if kind == "UnaryExpression":
        operand = c_expression(expression.get("operand", {}), symbols)
        return f"({expression.get('operator')}{operand})"
    if kind == "BinaryExpression":
        left = c_expression(expression.get("left", {}), symbols)
        right = c_expression(expression.get("right", {}), symbols)
        return f"({left} {expression.get('operator')} {right})"
    raise ValueError(f"Unsupported C expression node: {kind}")


def failure(message: str, source_refs: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    return create_diagnostic(
        code="GEN_AST_UNSUPPORTED",
        category="generation",
        message=message,
        source_refs=source_refs or [],
    )


def generate_c_from_ast(ast: Dict[str, Any]) -> Dict[str, Any]:
    validation = validate_ast_semantics(ast)
    if not validation["valid"]:
        return {
            "code": "",
            "sourceMap": [],
            "diagnostics": validation["diagnostics"],
            "generatorVersion": C_GENERATOR_VERSION,
        }

    symbols = {symbol["id"]: symbol for symbol in ast.get("symbols", [])}
    provenance_map = {entry["astNodeId"]: entry.get("origins", []) for entry in ast.get("provenance", [])}

    lines: List[str] = ["#include <stdio.h>", "", "int main(void) {"]
    source_map: List[Dict[str, Any]] = []
    unsupported: Optional[Dict[str, Any]] = None

    def emit(text: str, indent: int, node: Optional[Dict[str, Any]] = None) -> None:
        line = f"{'    ' * indent}{text}"
        lines.append(line)
        if node and node.get("id"):
            nid = node["id"]
            source_map.append({
                "line": len(lines),
                "astNodeId": nid,
                "sourceRefs": provenance_map.get(nid, []),
            })

    def generate_expr(expr: Dict[str, Any]) -> str:
        nonlocal unsupported
        if expr.get("kind") == "CharacterLiteral" and ord(expr.get("value", " ")[0]) > 0x7F:
            nid = expr.get("id")
            unsupported = failure("M1 C output supports ASCII character literals only.", provenance_map.get(nid, []))
        return c_expression(expr, symbols)

    def emit_block(block: Dict[str, Any], indent: int) -> None:
        for statement in block.get("statements", []):
            emit_statement(statement, indent)

    def emit_statement(statement: Dict[str, Any], indent: int) -> None:
        nonlocal unsupported
        if unsupported:
            return

        skind = statement.get("kind")
        sid = statement.get("id")

        if skind == "VariableDeclaration":
            symbol = symbols[statement["symbolId"]]
            initializer = ""
            if statement.get("initializer"):
                initializer = f" = {generate_expr(statement['initializer'])}"
            emit(f"{symbol['type']} {symbol['name']}{initializer};", indent, statement)
            return

        if skind == "Input":
            symbol = symbols[statement["symbolId"]]
            prompt = statement.get("prompt", "")
            if "\0" in prompt:
                unsupported = failure("M1 input prompts cannot contain a null character.", provenance_map.get(sid, []))
                return
            if prompt:
                emit(f"printf({c_string(prompt)});", indent, statement)
            fmt = "%d" if symbol["type"] == "int" else "%lf" if symbol["type"] == "double" else " %c"
            emit(f"if (scanf({c_string(fmt)}, &{symbol['name']}) != 1) return 1;", indent, statement)
            return

        if skind == "Assignment":
            symbol = symbols[statement["symbolId"]]
            emit(f"{symbol['name']} = {generate_expr(statement['expression'])};", indent, statement)
            return

        if skind == "Output":
            if statement.get("mode") == "message":
                msg = statement.get("message", "")
                if "\0" in msg:
                    unsupported = failure("M1 output messages cannot contain a null character.", provenance_map.get(sid, []))
                    return
                emit(f'printf("%s\\n", {c_string(msg)});', indent, statement)
                return

            val_node = statement.get("value", {})
            val_id = val_node.get("id")
            vtype = validation["typeTable"].get(val_id)
            if vtype == "bool" or vtype not in ("int", "double", "char"):
                unsupported = failure("M1 C output supports int, double, and char values.", provenance_map.get(sid, []))
                return
            fmt = "%d\\n" if vtype == "int" else "%.17g\\n" if vtype == "double" else "%c\\n"
            expr_str = generate_expr(val_node)
            arg = f"(double)({expr_str})" if vtype == "double" else expr_str
            emit(f"printf({c_string(fmt)}, {arg});", indent, statement)
            return

        if skind == "IfStatement":
            cond_str = generate_expr(statement.get("condition", {}))
            emit(f"if ({cond_str}) {{", indent, statement)
            emit_block(statement.get("thenBlock", {}), indent + 1)
            emit("} else {", indent, statement)
            emit_block(statement.get("elseBlock", {}), indent + 1)
            emit("}", indent, statement)

    emit_block(ast.get("body", {}), 1)

    if unsupported:
        return {
            "code": "",
            "sourceMap": [],
            "diagnostics": [unsupported],
            "generatorVersion": C_GENERATOR_VERSION,
        }

    lines.extend(["    return 0;", "}", ""])
    return {
        "code": "\n".join(lines),
        "sourceMap": source_map,
        "diagnostics": [],
        "generatorVersion": C_GENERATOR_VERSION,
    }
