import re
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from app.core.diagnostics import create_diagnostic


NUMERIC = {"int", "double"}
C_RESERVED_IDENTIFIERS = set(
    "auto break case char const continue default do double else enum extern float for goto if "
    "inline int long register restrict return short signed sizeof static struct switch typedef "
    "union unsigned void volatile while _Alignas _Alignof _Atomic _Bool _Complex _Generic "
    "_Imaginary _Noreturn _Static_assert _Thread_local main printf scanf".split()
)


def collect_nodes(node: Any, result: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    if result is None:
        result = []
    if not node or not isinstance(node, dict):
        return result

    result.append(node)
    kind = node.get("kind")

    if kind == "Block":
        for child in node.get("statements", []):
            collect_nodes(child, result)
    elif kind == "VariableDeclaration" and node.get("initializer"):
        collect_nodes(node["initializer"], result)
    elif kind == "Assignment":
        collect_nodes(node.get("expression"), result)
    elif kind == "Output" and node.get("mode") == "value":
        collect_nodes(node.get("value"), result)
    elif kind == "IfStatement":
        collect_nodes(node.get("condition"), result)
        collect_nodes(node.get("thenBlock"), result)
        collect_nodes(node.get("elseBlock"), result)
    elif kind == "UnaryExpression":
        collect_nodes(node.get("operand"), result)
    elif kind == "BinaryExpression":
        collect_nodes(node.get("left"), result)
        collect_nodes(node.get("right"), result)

    return result


def constant_value(expression: Dict[str, Any]) -> Optional[Union[int, float, bool]]:
    kind = expression.get("kind")
    if kind in ("IntegerLiteral", "FloatingLiteral"):
        return expression.get("value")
    if kind in ("CharacterLiteral", "VariableReference"):
        return None
    if kind == "UnaryExpression":
        val = constant_value(expression.get("operand", {}))
        if val is None:
            return None
        op = expression.get("operator")
        if op == "+":
            return +val
        if op == "-":
            return -val
        if op == "!":
            return not val
        return None

    if kind != "BinaryExpression":
        return None

    left = constant_value(expression.get("left", {}))
    right = constant_value(expression.get("right", {}))
    if left is None or right is None:
        return None

    op = expression.get("operator")
    if op == "+":
        return left + right
    if op == "-":
        return left - right
    if op == "*":
        return left * right
    if op == "/":
        return None if right == 0 else left / right
    if op == "%":
        return None if right == 0 else left % right
    if op == "<":
        return left < right
    if op == "<=":
        return left <= right
    if op == ">":
        return left > right
    if op == ">=":
        return left >= right
    if op == "==":
        return left == right
    if op == "!=":
        return left != right
    if op == "&&":
        return bool(left and right)
    if op == "||":
        return bool(left or right)

    return None


def can_assign(target: str, value: Optional[str]) -> bool:
    if target == "double":
        return value in ("int", "double")
    return target == value


def validate_ast_semantics(ast: Dict[str, Any]) -> Dict[str, Any]:
    diagnostics: List[Dict[str, Any]] = []

    # Basic contract structure check
    if not isinstance(ast, dict) or "body" not in ast or "symbols" not in ast or "provenance" not in ast:
        diagnostics.append(create_diagnostic(
            code="AST_SCHEMA_INVALID",
            category="schema",
            message="Typed AST is missing required properties.",
        ))
        return {"valid": False, "diagnostics": diagnostics, "typeTable": {}}

    nodes = collect_nodes(ast.get("body", {}))
    provenance_by_node: Dict[str, Any] = {}

    for origin in ast.get("provenance", []):
        ast_node_id = origin.get("astNodeId")
        if ast_node_id in provenance_by_node:
            diagnostics.append(create_diagnostic(
                code="AST_PROVENANCE_INVALID",
                category="semantics",
                message=f"AST node “{ast_node_id}” has more than one provenance record.",
            ))
        provenance_by_node[ast_node_id] = origin

    def source_refs_for(node_id: Optional[str]) -> List[Dict[str, Any]]:
        if not node_id:
            return []
        origin = provenance_by_node.get(node_id)
        return origin.get("origins", []) if origin else []

    def report(code: str, category: str, message: str, node: Optional[Dict[str, Any]] = None) -> None:
        diagnostics.append(create_diagnostic(
            code=code,
            category=category,
            message=message,
            source_refs=source_refs_for(node.get("id") if node else None),
        ))

    node_ids: Set[str] = set()
    for node in nodes:
        nid = node.get("id")
        if nid in node_ids:
            report("AST_NODE_ID_DUPLICATE", "schema", f"AST node ID “{nid}” is duplicated.", node)
        node_ids.add(nid)
        if nid not in provenance_by_node:
            report("AST_PROVENANCE_INVALID", "semantics", f"AST node “{nid}” has no source provenance.", node)

    for entry in provenance_by_node.values():
        if entry.get("astNodeId") not in node_ids:
            report("AST_PROVENANCE_INVALID", "semantics", f"Provenance refers to missing AST node “{entry.get('astNodeId')}”.")

    symbols: Dict[str, Any] = {}
    symbol_names: Dict[str, str] = {}

    for symbol in ast.get("symbols", []):
        sid = symbol.get("id")
        sname = symbol.get("name")
        if sid in symbols or sname in symbol_names:
            report("SYMBOL_DUPLICATE", "structure", f"Symbol ID or name “{sname}” is duplicated.")

        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", sname or "") or sname in C_RESERVED_IDENTIFIERS:
            report("SYMBOL_NAME_INVALID", "schema", f"“{sname}” is not a valid C variable name.")

        symbols[sid] = symbol
        symbol_names[sname] = sid

    declaration_counts: Dict[str, int] = {}
    for node in nodes:
        if node.get("kind") == "VariableDeclaration":
            sid = node.get("symbolId")
            declaration_counts[sid] = declaration_counts.get(sid, 0) + 1

    for symbol in ast.get("symbols", []):
        sid = symbol.get("id")
        sname = symbol.get("name")
        count = declaration_counts.get(sid, 0)
        if count == 0:
            report("SYMBOL_UNDECLARED", "structure", f"Symbol “{sname}” has no declaration in the program.", ast.get("body"))
        if count > 1:
            report("SYMBOL_DUPLICATE", "structure", f"Symbol “{sname}” is declared more than once.")

    type_table: Dict[str, str] = {}
    initialized: Set[str] = set()
    declared: Set[str] = set()

    def set_type(node: Dict[str, Any], t: Optional[str]) -> Optional[str]:
        if t and "id" in node:
            type_table[node["id"]] = t
        return t

    def infer(
        expression: Dict[str, Any],
        initialized_before: Set[str],
        declared_before: Set[str],
    ) -> Optional[str]:
        kind = expression.get("kind")

        if kind == "IntegerLiteral":
            return set_type(expression, "int")
        if kind == "FloatingLiteral":
            return set_type(expression, "double")
        if kind == "CharacterLiteral":
            return set_type(expression, "char")

        if kind == "VariableReference":
            sid = expression.get("symbolId")
            symbol = symbols.get(sid)
            if not symbol:
                report("SYMBOL_UNDECLARED", "semantics", f"Expression references missing symbol “{sid}”.", expression)
                return None
            if sid not in declared_before:
                report("SYMBOL_UNDECLARED", "semantics", f"“{symbol.get('name')}” is used before its declaration.", expression)
            elif sid not in initialized_before:
                report("SYMBOL_UNINITIALIZED", "semantics", f"“{symbol.get('name')}” may be read before it has a value.", expression)
            return set_type(expression, symbol.get("type"))

        if kind == "UnaryExpression":
            operand_type = infer(expression.get("operand", {}), initialized_before, declared_before)
            op = expression.get("operator")
            if op == "!":
                if operand_type != "bool":
                    report("TYPE_OPERAND_INVALID", "type", "Logical ! needs a Boolean condition.", expression)
                return set_type(expression, "bool" if operand_type == "bool" else None)

            if operand_type not in NUMERIC:
                report("TYPE_OPERAND_INVALID", "type", f"Unary {op} needs a numeric value.", expression)
                return set_type(expression, None)
            return set_type(expression, operand_type)

        if kind == "BinaryExpression":
            left = infer(expression.get("left", {}), initialized_before, declared_before)
            right = infer(expression.get("right", {}), initialized_before, declared_before)
            op = expression.get("operator")

            if op in ("+", "-", "*", "/"):
                if left not in NUMERIC or right not in NUMERIC:
                    report("TYPE_OPERAND_INVALID", "type", f"Operator {op} needs numeric operands.", expression)
                    return set_type(expression, None)
                if op == "/" and constant_value(expression.get("right", {})) == 0:
                    report("SEM_DIVISION_BY_ZERO_STATIC", "semantics", "This expression divides by a value that is statically known to be zero.", expression)
                result_type = "double" if left == "double" or right == "double" else "int"
                return set_type(expression, result_type)

            if op == "%":
                if left != "int" or right != "int":
                    report("TYPE_OPERAND_INVALID", "type", "Remainder % needs two int operands.", expression)
                    return set_type(expression, None)
                if constant_value(expression.get("right", {})) == 0:
                    report("SEM_DIVISION_BY_ZERO_STATIC", "semantics", "This expression uses a remainder divisor statically known to be zero.", expression)
                return set_type(expression, "int")

            if op in ("<", "<=", ">", ">="):
                if left not in NUMERIC or right not in NUMERIC:
                    report("TYPE_OPERAND_INVALID", "type", f"Comparison {op} needs numeric operands; character ordering is not supported.", expression)
                    return set_type(expression, None)
                return set_type(expression, "bool")

            if op in ("==", "!="):
                compatible = (left in NUMERIC and right in NUMERIC) or (left == "char" and right == "char")
                if not compatible:
                    report("TYPE_OPERAND_INVALID", "type", f"Comparison {op} needs compatible scalar values.", expression)
                    return set_type(expression, None)
                return set_type(expression, "bool")

            if op in ("&&", "||"):
                if left != "bool" or right != "bool":
                    report("TYPE_OPERAND_INVALID", "type", f"Logical {op} needs Boolean conditions on both sides.", expression)
                    return set_type(expression, None)
                return set_type(expression, "bool")

            report("GEN_AST_UNSUPPORTED", "generation", f"Operator “{op}” is not supported by the M1 expression rules.", expression)
            return set_type(expression, None)

        return None

    def check_assignment_type(symbol_id: str, value_type: Optional[str], node: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        symbol = symbols.get(symbol_id)
        if not symbol:
            report("SYMBOL_UNDECLARED", "semantics", f"Statement targets missing symbol “{symbol_id}”.", node)
            return None
        if not can_assign(symbol.get("type"), value_type):
            report("TYPE_ASSIGNMENT_INVALID", "type", f"Cannot assign {value_type or 'unknown'} to {symbol.get('type')} variable “{symbol.get('name')}”.", node)
        return symbol

    def check_block(block: Dict[str, Any], state_declared: Set[str], state_initialized: Set[str]) -> Tuple[Set[str], Set[str]]:
        current_declared = set(state_declared)
        current_initialized = set(state_initialized)

        for statement in block.get("statements", []):
            skind = statement.get("kind")
            sid = statement.get("symbolId")

            if skind == "VariableDeclaration":
                symbol = symbols.get(sid)
                if not symbol:
                    report("SYMBOL_UNDECLARED", "semantics", f"Declaration references missing symbol “{sid}”.", statement)
                    continue
                if sid in current_declared:
                    report("SYMBOL_DUPLICATE", "structure", f"“{symbol.get('name')}” is declared more than once on this path.", statement)
                current_declared.add(sid)
                if statement.get("initializer"):
                    val_type = infer(statement["initializer"], current_initialized, current_declared)
                    check_assignment_type(sid, val_type, statement)
                    current_initialized.add(sid)

            elif skind == "Input":
                symbol = symbols.get(sid)
                if not symbol:
                    report("SYMBOL_UNDECLARED", "semantics", f"Input references missing symbol “{sid}”.", statement)
                elif sid not in current_declared:
                    report("SYMBOL_UNDECLARED", "semantics", f"“{symbol.get('name')}” needs a declaration before input.", statement)
                else:
                    current_initialized.add(sid)

            elif skind == "Assignment":
                val_type = infer(statement.get("expression", {}), current_initialized, current_declared)
                sym = check_assignment_type(sid, val_type, statement)
                if sym and sid not in current_declared:
                    report("SYMBOL_UNDECLARED", "semantics", f"“{sym.get('name')}” needs a declaration before assignment.", statement)
                elif sym:
                    current_initialized.add(sid)

            elif skind == "Output":
                if statement.get("mode") == "value" and statement.get("value"):
                    infer(statement["value"], current_initialized, current_declared)

            elif skind == "IfStatement":
                cond_type = infer(statement.get("condition", {}), current_initialized, current_declared)
                if cond_type != "bool":
                    report("TYPE_CONDITION_INVALID", "type", "An IfStatement condition must have Boolean type.", statement)

                then_decl, then_init = check_block(statement.get("thenBlock", {}), current_declared, current_initialized)
                else_decl, else_init = check_block(statement.get("elseBlock", {}), current_declared, current_initialized)

                current_declared = then_decl.intersection(else_decl)
                current_initialized = then_init.intersection(else_init)

        return current_declared, current_initialized

    check_block(ast.get("body", {}), declared, initialized)
    return {"valid": len(diagnostics) == 0, "diagnostics": diagnostics, "typeTable": type_table}
