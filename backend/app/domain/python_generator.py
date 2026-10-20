import json
from typing import Any, Dict, List, Optional
from app.core.diagnostics import create_diagnostic
from app.domain.ast_validation import validate_ast_semantics


PYTHON_GENERATOR_VERSION = "1.0.0"

PYTHON_RESERVED_NAMES = set(
    "False None True and as assert async await break class continue def del elif else except "
    "finally for from global if import in is lambda nonlocal not or pass raise return try while "
    "with yield abs float input int len print ValueError".split()
)


def failure(message: str, source_refs: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    return create_diagnostic(
        code="GEN_AST_UNSUPPORTED",
        category="generation",
        message=message,
        source_refs=source_refs or [],
    )


def python_expression(
    expression: Dict[str, Any],
    symbols: Dict[str, Any],
    type_table: Dict[str, str],
    integer_division_helper: str,
) -> str:
    kind = expression.get("kind")
    if kind in ("IntegerLiteral", "FloatingLiteral"):
        return str(expression.get("value"))
    if kind == "CharacterLiteral":
        return json.dumps(expression.get("value", ""))
    if kind == "VariableReference":
        return symbols[expression.get("symbolId")]["name"]
    if kind == "UnaryExpression":
        op = expression.get("operator")
        operand = python_expression(expression.get("operand", {}), symbols, type_table, integer_division_helper)
        if op == "!":
            return f"(not {operand})"
        return f"({op}{operand})"
    if kind == "BinaryExpression":
        op = expression.get("operator")
        eid = expression.get("id")
        if op == "/" and type_table.get(eid) == "int":
            left = python_expression(expression.get("left", {}), symbols, type_table, integer_division_helper)
            right = python_expression(expression.get("right", {}), symbols, type_table, integer_division_helper)
            return f"{integer_division_helper}({left}, {right})"
        
        py_op = "and" if op == "&&" else "or" if op == "||" else op
        left = python_expression(expression.get("left", {}), symbols, type_table, integer_division_helper)
        right = python_expression(expression.get("right", {}), symbols, type_table, integer_division_helper)
        return f"({left} {py_op} {right})"
    raise ValueError(f"Unsupported Python expression node: {kind}")


def generate_python_from_ast(ast: Dict[str, Any]) -> Dict[str, Any]:
    validation = validate_ast_semantics(ast)
    if not validation["valid"]:
        return {
            "code": "",
            "sourceMap": [],
            "diagnostics": validation["diagnostics"],
            "generatorVersion": PYTHON_GENERATOR_VERSION,
        }

    symbols = {symbol["id"]: symbol for symbol in ast.get("symbols", [])}
    provenance_map = {entry["astNodeId"]: entry.get("origins", []) for entry in ast.get("provenance", [])}

    invalid_symbol = next((s for s in ast.get("symbols", []) if s["name"] in PYTHON_RESERVED_NAMES), None)
    if invalid_symbol:
        def find_declaration(block: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            for stmt in block.get("statements", []):
                if stmt.get("kind") == "VariableDeclaration" and stmt.get("symbolId") == invalid_symbol["id"]:
                    return stmt
                if stmt.get("kind") == "IfStatement":
                    nested = find_declaration(stmt.get("thenBlock", {})) or find_declaration(stmt.get("elseBlock", {}))
                    if nested:
                        return nested
            return None

        decl = find_declaration(ast.get("body", {}))
        origins = provenance_map.get(decl.get("id") if decl else "", [])
        return {
            "code": "",
            "sourceMap": [],
            "generatorVersion": PYTHON_GENERATOR_VERSION,
            "diagnostics": [failure(
                f"“{invalid_symbol['name']}” is a Python keyword or generated built-in. Rename this variable before generating Python.",
                origins,
            )],
        }

    lines: List[str] = []
    source_map: List[Dict[str, Any]] = []
    unsupported: Optional[Dict[str, Any]] = None

    helper_base = "_maptocode_trunc_div"
    integer_division_helper = helper_base
    suffix = 1
    existing_names = {s["name"] for s in ast.get("symbols", [])}
    while integer_division_helper in existing_names:
        integer_division_helper = f"{helper_base}_{suffix}"
        suffix += 1

    uses_integer_division = False

    def inspect_expr(expr: Dict[str, Any]) -> None:
        nonlocal uses_integer_division
        if expr.get("kind") == "BinaryExpression":
            if expr.get("operator") == "/" and validation["typeTable"].get(expr.get("id")) == "int":
                uses_integer_division = True
            inspect_expr(expr.get("left", {}))
            inspect_expr(expr.get("right", {}))
        elif expr.get("kind") == "UnaryExpression":
            inspect_expr(expr.get("operand", {}))

    def inspect_block(block: Dict[str, Any]) -> None:
        for stmt in block.get("statements", []):
            skind = stmt.get("kind")
            if skind == "VariableDeclaration" and stmt.get("initializer"):
                inspect_expr(stmt["initializer"])
            elif skind == "Assignment":
                inspect_expr(stmt.get("expression", {}))
            elif skind == "Output" and stmt.get("mode") == "value":
                inspect_expr(stmt.get("value", {}))
            elif skind == "IfStatement":
                inspect_expr(stmt.get("condition", {}))
                inspect_block(stmt.get("thenBlock", {}))
                inspect_block(stmt.get("elseBlock", {}))

    inspect_block(ast.get("body", {}))

    if uses_integer_division:
        lines.extend([
            f"def {integer_division_helper}(a, b):",
            "    quotient = abs(a) // abs(b)",
            "    return -quotient if (a < 0) != (b < 0) else quotient",
            "",
        ])

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

    def emit_block(block: Dict[str, Any], indent: int) -> None:
        stmts = block.get("statements", [])
        if not stmts:
            emit("pass", indent)
            return
        for stmt in stmts:
            emit_statement(stmt, indent)

    def emit_statement(statement: Dict[str, Any], indent: int) -> None:
        nonlocal unsupported
        if unsupported:
            return

        skind = statement.get("kind")
        sid = statement.get("id")

        if skind == "VariableDeclaration":
            if statement.get("initializer"):
                var_name = symbols[statement["symbolId"]]["name"]
                expr_str = python_expression(statement["initializer"], symbols, validation["typeTable"], integer_division_helper)
                emit(f"{var_name} = {expr_str}", indent, statement)
            return

        if skind == "Input":
            symbol = symbols[statement["symbolId"]]
            prompt = json.dumps(statement.get("prompt", ""))
            if symbol["type"] == "char":
                emit(f"{symbol['name']} = input({prompt})", indent, statement)
                emit(f"if len({symbol['name']}) != 1:", indent, statement)
                err_msg = json.dumps(f"Enter exactly one character for {symbol['name']}.")
                emit(f"raise ValueError({err_msg})", indent + 1, statement)
            else:
                conv = "int" if symbol["type"] == "int" else "float"
                emit(f"{symbol['name']} = {conv}(input({prompt}))", indent, statement)
            return

        if skind == "Assignment":
            var_name = symbols[statement["symbolId"]]["name"]
            expr_str = python_expression(statement.get("expression", {}), symbols, validation["typeTable"], integer_division_helper)
            emit(f"{var_name} = {expr_str}", indent, statement)
            return

        if skind == "Output":
            if statement.get("mode") == "message":
                msg = json.dumps(statement.get("message", ""))
                emit(f"print({msg})", indent, statement)
            else:
                expr_str = python_expression(statement.get("value", {}), symbols, validation["typeTable"], integer_division_helper)
                emit(f"print({expr_str})", indent, statement)
            return

        if skind == "IfStatement":
            cond_str = python_expression(statement.get("condition", {}), symbols, validation["typeTable"], integer_division_helper)
            emit(f"if {cond_str}:", indent, statement)
            emit_block(statement.get("thenBlock", {}), indent + 1)
            emit("else:", indent, statement)
            emit_block(statement.get("elseBlock", {}), indent + 1)
            return

        unsupported = failure(f"M1 Python output does not support “{skind}”.", provenance_map.get(sid, []))

    emit_block(ast.get("body", {}), 0)

    if unsupported:
        return {
            "code": "",
            "sourceMap": [],
            "diagnostics": [unsupported],
            "generatorVersion": PYTHON_GENERATOR_VERSION,
        }

    return {
        "code": "\n".join(lines) + "\n",
        "sourceMap": source_map,
        "diagnostics": [],
        "generatorVersion": PYTHON_GENERATOR_VERSION,
    }
