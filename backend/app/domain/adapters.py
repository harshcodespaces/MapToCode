import urllib.parse
from typing import Any, Dict, List, Optional, Set
from app.core.diagnostics import create_diagnostic
from app.domain.expressions import parse_expression, ExpressionSyntaxError


ADAPTER_VERSION = "1.0.0"


def stable_ast_id(source_kind: str, source_id: str, role: str) -> str:
    text = f"{source_kind}:{source_id}"
    first = 0x811c9dc5
    second = 0x9e3779b9
    for ch in text:
        point = ord(ch)
        first = ((first ^ point) * 0x01000193) & 0xFFFFFFFF
        second = ((second ^ point) * 0x85ebca6b) & 0xFFFFFFFF
    prefix = urllib.parse.quote(str(source_id), safe="")[:44]
    hash_str = f"{first:08x}{second:08x}"
    return f"{source_kind[0]}-{prefix}-{hash_str}-{role}"


def source_ref(source_kind: str, source_object_id: str, source_revision: int) -> Dict[str, Any]:
    return {
        "sourceKind": source_kind,
        "sourceObjectId": source_object_id,
        "sourceRevision": source_revision,
    }


def adapter_result(ast: Optional[Dict[str, Any]], diagnostics: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "ast": ast,
        "diagnostics": diagnostics,
        "valid": bool(ast) and len(diagnostics) == 0,
        "adapterVersion": ADAPTER_VERSION,
    }


class AstBuilder:
    def __init__(self, source_kind: str, source_revision: int, project_id: Optional[str] = None):
        self.source_kind = source_kind
        self.source_revision = source_revision
        self.project_id = project_id
        self.provenance: List[Dict[str, Any]] = []

    def record(self, node: Dict[str, Any], source_ids: List[str], rule: str) -> Dict[str, Any]:
        unique_sources = list(dict.fromkeys(source_ids))
        self.provenance.append({
            "astNodeId": node["id"],
            "origins": [source_ref(self.source_kind, sid, self.source_revision) for sid in unique_sources],
            "transformationRuleId": rule,
            "adapterVersion": ADAPTER_VERSION,
        })
        return node

    def parse(self, source: str, source_id: str, role: str, id_mappings: Dict[str, str]) -> Dict[str, Any]:
        root_id = stable_ast_id(self.source_kind, source_id, role)
        expression = parse_expression(source, id_prefix=f"{root_id}-expr")

        def resolve(node: Dict[str, Any]) -> None:
            if node.get("kind") == "VariableReference":
                node["symbolId"] = id_mappings.get(node["symbolId"], node["symbolId"])
            elif node.get("kind") == "UnaryExpression":
                resolve(node["operand"])
            elif node.get("kind") == "BinaryExpression":
                resolve(node["left"])
                resolve(node["right"])
            self.record(node, [source_id], "expression-token-to-typed-node")

        resolve(expression)
        return expression

    def block(self, source_id: str, role: str, source_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        sids = source_ids if source_ids is not None else [source_id]
        return self.record(
            {
                "id": stable_ast_id(self.source_kind, source_id, role),
                "kind": "Block",
                "statements": [],
            },
            sids,
            "source-region-to-ast-block",
        )

    def finish(self, body: Dict[str, Any], symbols: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            "irVersion": "1.0.0",
            "programId": str(self.project_id or f"{self.source_kind}-revision-{self.source_revision}"),
            "body": body,
            "symbols": symbols,
            "provenance": self.provenance,
        }


def adapter_diagnostic(
    code: str,
    category: str,
    message: str,
    source_kind: str,
    source_id: Optional[str],
    revision: int,
    suggestion: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "code": code,
        "severity": "error",
        "category": category,
        "message": message,
        "sourceRefs": [source_ref(source_kind, source_id, revision)] if source_id else [],
        **({"suggestion": suggestion} if suggestion else {}),
        "ruleVersion": "1.0.0",
    }


def parse_with_diagnostic(
    builder: AstBuilder,
    text: str,
    source_kind: str,
    source_id: str,
    source_revision: int,
    role: str,
    names: Dict[str, str],
    diagnostics: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    try:
        return builder.parse(text, source_id, role, names)
    except ExpressionSyntaxError as error:
        diagnostics.append(adapter_diagnostic(
            "ADAPTER_EXPRESSION_INVALID",
            "schema",
            f"Expression in “{source_id}” is invalid: {error.message}",
            source_kind,
            source_id,
            source_revision,
            "Use the supported expression grammar: numeric and character values, parentheses, arithmetic, comparisons, and Boolean operators.",
        ))
        return None


def add_symbol(
    symbols: List[Dict[str, Any]],
    by_id: Dict[str, Any],
    by_name: Dict[str, str],
    symbol: Dict[str, Any],
    source_kind: str,
    revision: int,
    diagnostics: List[Dict[str, Any]],
    source_id: str,
) -> None:
    sid = symbol["id"]
    sname = symbol["name"]
    if sid in by_id or sname in by_name:
        diagnostics.append(adapter_diagnostic(
            "SYMBOL_DUPLICATE",
            "structure",
            f"Symbol ID or name “{sname}” is duplicated.",
            source_kind,
            source_id,
            revision,
        ))
        return
    by_id[sid] = symbol
    by_name[sname] = sid
    symbols.append(symbol)


def ensure_symbol(
    symbols: List[Dict[str, Any]],
    by_id: Dict[str, Any],
    by_name: Dict[str, str],
    symbol: Dict[str, Any],
    source_kind: str,
    revision: int,
    diagnostics: List[Dict[str, Any]],
    source_id: str,
) -> None:
    sid = symbol["id"]
    sname = symbol["name"]
    existing = by_id.get(sid)
    if existing:
        if existing["name"] != sname or existing["type"] != symbol["type"]:
            diagnostics.append(adapter_diagnostic(
                "SYMBOL_DUPLICATE",
                "structure",
                f"Symbol ID “{sid}” has conflicting definitions.",
                source_kind,
                source_id,
                revision,
            ))
        return

    same_name_id = by_name.get(sname)
    if same_name_id and same_name_id != sid:
        diagnostics.append(adapter_diagnostic(
            "SYMBOL_DUPLICATE",
            "structure",
            f"Variable name “{sname}” is assigned to more than one symbol.",
            source_kind,
            source_id,
            revision,
        ))
        return

    by_id[sid] = symbol
    by_name[sname] = sid
    symbols.append(symbol)


def record_statement(
    builder: AstBuilder,
    statement: Dict[str, Any],
    source_id: str,
    rule: str = "source-operation-to-ast-statement",
    more_sources: Optional[List[str]] = None,
) -> Dict[str, Any]:
    sources = [source_id] + (more_sources or [])
    return builder.record(statement, sources, rule)


def collect_spec_step_ids(
    steps: List[Dict[str, Any]],
    ids: Set[str],
    diagnostics: List[Dict[str, Any]],
    revision: int,
) -> None:
    for step in steps:
        sid = step.get("id")
        if sid in ids:
            diagnostics.append(adapter_diagnostic(
                "SPEC_SCHEMA_INVALID",
                "structure",
                f"Step ID “{sid}” is duplicated.",
                "specification",
                sid,
                revision,
            ))
        ids.add(sid)
        if step.get("kind") == "conditional":
            payload = step.get("payload", {})
            collect_spec_step_ids(payload.get("whenTrue", []), ids, diagnostics, revision)
            collect_spec_step_ids(payload.get("whenFalse", []), ids, diagnostics, revision)


def adapt_specification_to_ast(
    specification: Dict[str, Any],
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    diagnostics: List[Dict[str, Any]] = []
    revision = int(specification.get("revision", 1))
    ids: Set[str] = set()
    symbols: List[Dict[str, Any]] = []
    symbol_by_id: Dict[str, Any] = {}
    symbol_by_name: Dict[str, str] = {}

    inputs = specification.get("inputs", [])
    variables = specification.get("variables", [])
    outputs = specification.get("outputs", [])
    steps = specification.get("steps", [])

    input_by_id = {inp["id"]: inp for inp in inputs if isinstance(inp, dict) and "id" in inp}
    variable_by_id = {var["id"]: var for var in variables if isinstance(var, dict) and "id" in var}
    output_ids = {out["id"] for out in outputs if isinstance(out, dict) and "id" in out}
    all_names: Dict[str, str] = {}

    for symbol in inputs + variables:
        sname = symbol.get("name")
        sid = symbol.get("id")
        if sname in all_names:
            diagnostics.append(adapter_diagnostic(
                "SYMBOL_DUPLICATE",
                "structure",
                f"Variable name “{sname}” is duplicated.",
                "specification",
                sid,
                revision,
            ))
        else:
            all_names[sname] = sid

    for item in inputs + variables + outputs:
        iid = item.get("id")
        if iid in ids:
            diagnostics.append(adapter_diagnostic(
                "SPEC_SCHEMA_INVALID",
                "structure",
                f"Specification ID “{iid}” is duplicated.",
                "specification",
                iid,
                revision,
            ))
        ids.add(iid)

    collect_spec_step_ids(steps, ids, diagnostics, revision)
    if diagnostics:
        return adapter_result(None, diagnostics)

    builder = AstBuilder("specification", revision, project_id)
    root_source = str(project_id or f"specification-{revision}")
    body = builder.block(root_source, "root", [root_source])

    def find_input_ids(step_list: List[Dict[str, Any]], found: Optional[Set[str]] = None) -> Set[str]:
        if found is None:
            found = set()
        for s in step_list:
            if s.get("kind") == "input":
                found.add(s.get("payload", {}).get("inputId"))
            elif s.get("kind") == "conditional":
                payload = s.get("payload", {})
                find_input_ids(payload.get("whenTrue", []), found)
                find_input_ids(payload.get("whenFalse", []), found)
        return found

    used_inputs = find_input_ids(steps)
    for input_id in used_inputs:
        inp = input_by_id.get(input_id)
        if not inp:
            continue
        ensure_symbol(
            symbols,
            symbol_by_id,
            symbol_by_name,
            {"id": inp["id"], "name": inp["name"], "type": inp["type"]},
            "specification",
            revision,
            diagnostics,
            inp["id"],
        )
        body["statements"].append(record_statement(
            builder,
            {
                "id": stable_ast_id("specification", inp["id"], "input-declaration"),
                "kind": "VariableDeclaration",
                "symbolId": inp["id"],
            },
            inp["id"],
            "input-definition-to-variable-declaration",
        ))

    def visit_steps(step_list: List[Dict[str, Any]], destination: Dict[str, Any]) -> None:
        for s in step_list:
            sid = s.get("id")
            skind = s.get("kind")
            payload = s.get("payload", {})

            if skind == "declaration":
                sym = variable_by_id.get(payload.get("symbolId"))
                if not sym:
                    diagnostics.append(adapter_diagnostic(
                        "SPEC_REFERENCE_INVALID",
                        "semantics",
                        f"Declaration step “{sid}” refers to unknown variable “{payload.get('symbolId')}”.",
                        "specification",
                        sid,
                        revision,
                    ))
                    continue
                ensure_symbol(
                    symbols,
                    symbol_by_id,
                    symbol_by_name,
                    {"id": sym["id"], "name": sym["name"], "type": sym["type"]},
                    "specification",
                    revision,
                    diagnostics,
                    sid,
                )
                initializer = None
                if payload.get("initializer"):
                    initializer = parse_with_diagnostic(
                        builder,
                        payload["initializer"],
                        "specification",
                        sid,
                        revision,
                        "initializer",
                        all_names,
                        diagnostics,
                    )
                    if not initializer:
                        continue
                decl_node: Dict[str, Any] = {
                    "id": stable_ast_id("specification", sid, "declaration"),
                    "kind": "VariableDeclaration",
                    "symbolId": sym["id"],
                }
                if initializer:
                    decl_node["initializer"] = initializer
                destination["statements"].append(record_statement(builder, decl_node, sid))

            elif skind == "input":
                inp = input_by_id.get(payload.get("inputId"))
                if not inp:
                    diagnostics.append(adapter_diagnostic(
                        "SPEC_REFERENCE_INVALID",
                        "semantics",
                        f"Input step “{sid}” refers to unknown input “{payload.get('inputId')}”.",
                        "specification",
                        sid,
                        revision,
                    ))
                    continue
                ensure_symbol(
                    symbols,
                    symbol_by_id,
                    symbol_by_name,
                    {"id": inp["id"], "name": inp["name"], "type": inp["type"]},
                    "specification",
                    revision,
                    diagnostics,
                    sid,
                )
                destination["statements"].append(record_statement(
                    builder,
                    {
                        "id": stable_ast_id("specification", sid, "input"),
                        "kind": "Input",
                        "symbolId": inp["id"],
                        "prompt": payload.get("prompt", ""),
                    },
                    sid,
                ))

            elif skind == "assignment":
                sym_all = {**input_by_id, **variable_by_id}
                sym = sym_all.get(payload.get("targetId"))
                if not sym:
                    diagnostics.append(adapter_diagnostic(
                        "SPEC_REFERENCE_INVALID",
                        "semantics",
                        f"Assignment step “{sid}” refers to unknown variable “{payload.get('targetId')}”.",
                        "specification",
                        sid,
                        revision,
                    ))
                    continue
                ensure_symbol(
                    symbols,
                    symbol_by_id,
                    symbol_by_name,
                    {"id": sym["id"], "name": sym["name"], "type": sym["type"]},
                    "specification",
                    revision,
                    diagnostics,
                    sid,
                )
                expr = parse_with_diagnostic(
                    builder,
                    payload.get("expression", ""),
                    "specification",
                    sid,
                    revision,
                    "assignment",
                    all_names,
                    diagnostics,
                )
                if not expr:
                    continue
                destination["statements"].append(record_statement(
                    builder,
                    {
                        "id": stable_ast_id("specification", sid, "assignment"),
                        "kind": "Assignment",
                        "symbolId": sym["id"],
                        "expression": expr,
                    },
                    sid,
                ))

            elif skind == "output":
                if payload.get("outputId") not in output_ids:
                    diagnostics.append(adapter_diagnostic(
                        "SPEC_REFERENCE_INVALID",
                        "semantics",
                        f"Output step “{sid}” refers to unknown output “{payload.get('outputId')}”.",
                        "specification",
                        sid,
                        revision,
                    ))
                    continue
                if payload.get("mode") == "message":
                    destination["statements"].append(record_statement(
                        builder,
                        {
                            "id": stable_ast_id("specification", sid, "output"),
                            "kind": "Output",
                            "mode": "message",
                            "message": payload.get("message", ""),
                        },
                        sid,
                    ))
                else:
                    expr = parse_with_diagnostic(
                        builder,
                        payload.get("expression", ""),
                        "specification",
                        sid,
                        revision,
                        "output",
                        all_names,
                        diagnostics,
                    )
                    if not expr:
                        continue
                    destination["statements"].append(record_statement(
                        builder,
                        {
                            "id": stable_ast_id("specification", sid, "output"),
                            "kind": "Output",
                            "mode": "value",
                            "value": expr,
                        },
                        sid,
                    ))

            elif skind == "conditional":
                cond = parse_with_diagnostic(
                    builder,
                    payload.get("condition", ""),
                    "specification",
                    sid,
                    revision,
                    "condition",
                    all_names,
                    diagnostics,
                )
                if not cond:
                    continue
                when_true = builder.block(sid, "then", [sid])
                when_false = builder.block(sid, "else", [sid])
                visit_steps(payload.get("whenTrue", []), when_true)
                visit_steps(payload.get("whenFalse", []), when_false)
                destination["statements"].append(record_statement(
                    builder,
                    {
                        "id": stable_ast_id("specification", sid, "conditional"),
                        "kind": "IfStatement",
                        "condition": cond,
                        "thenBlock": when_true,
                        "elseBlock": when_false,
                    },
                    sid,
                ))

    visit_steps(steps, body)
    if diagnostics:
        return adapter_result(None, diagnostics)

    ast = builder.finish(body, symbols)
    return adapter_result(ast, [])


def graph_maps(graph: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    outgoing: Dict[str, List[Dict[str, Any]]] = {
        node["id"]: [] for node in graph.get("nodes", []) if isinstance(node, dict) and "id" in node
    }
    for edge in graph.get("edges", []):
        from_id = edge.get("from") or edge.get("from_node")
        if from_id in outgoing:
            outgoing[from_id].append(edge)
    return outgoing


def nearest_join(
    true_target: str,
    false_target: str,
    outgoing: Dict[str, List[Dict[str, Any]]],
    post_dominators_fn: Any,
) -> Optional[str]:
    common = [nid for nid in post_dominators_fn(true_target) if nid in post_dominators_fn(false_target)]

    def reaches(from_id: str, target: str, seen: Optional[Set[str]] = None) -> bool:
        if seen is None:
            seen = set()
        if from_id == target:
            return True
        if from_id in seen:
            return False
        seen.add(from_id)
        return any(
            reaches(edge.get("to") or edge.get("to_node"), target, seen)
            for edge in outgoing.get(from_id, [])
        )

    nearest = [
        cand for cand in common
        if not any(other != cand and reaches(other, cand) for other in common)
    ]
    return nearest[0] if len(nearest) == 1 else None


def adapt_flowchart_to_ast(
    flowchart: Dict[str, Any],
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    diagnostics: List[Dict[str, Any]] = []
    revision = int(flowchart.get("revision", 1))
    nodes = flowchart.get("nodes", [])
    edges = flowchart.get("edges", [])

    node_by_id: Dict[str, Any] = {node["id"]: node for node in nodes if isinstance(node, dict) and "id" in node}
    outgoing = graph_maps(flowchart)

    start = next((node for node in nodes if node.get("kind") == "start"), None)
    end = next((node for node in nodes if node.get("kind") == "end"), None)

    if not start or not end:
        diagnostics.append(adapter_diagnostic(
            "GRAPH_SCHEMA_INVALID",
            "structure",
            "Flowchart must contain exactly one Start and one End node.",
            "flowchart",
            None,
            revision,
        ))
        return adapter_result(None, diagnostics)

    symbols: List[Dict[str, Any]] = []
    symbol_by_id: Dict[str, Any] = {}
    symbol_by_name: Dict[str, str] = {}

    for node in nodes:
        payload = node.get("payload", {})
        if node.get("kind") == "input":
            add_symbol(
                symbols,
                symbol_by_id,
                symbol_by_name,
                {"id": payload["symbolId"], "name": payload["name"], "type": payload["type"]},
                "flowchart",
                revision,
                diagnostics,
                node["id"],
            )
        elif node.get("kind") == "process" and payload.get("operation") == "declaration":
            add_symbol(
                symbols,
                symbol_by_id,
                symbol_by_name,
                {"id": payload["symbolId"], "name": payload["name"], "type": payload["type"]},
                "flowchart",
                revision,
                diagnostics,
                node["id"],
            )

    if diagnostics:
        return adapter_result(None, diagnostics)

    builder = AstBuilder("flowchart", revision, project_id)
    post_memo: Dict[str, Set[str]] = {}

    def post_dominators(node_id: str) -> Set[str]:
        if node_id in post_memo:
            return post_memo[node_id]
        successors = outgoing.get(node_id, [])
        if not successors:
            return {node_id}
        child_sets = [post_dominators(edge.get("to") or edge.get("to_node")) for edge in successors]
        intersection = set(child_sets[0])
        for s in child_sets[1:]:
            intersection.intersection_update(s)
        intersection.add(node_id)
        post_memo[node_id] = intersection
        return intersection

    body = builder.block(start["id"], "root")

    for node in [n for n in nodes if n.get("kind") == "input"]:
        body["statements"].append(record_statement(
            builder,
            {
                "id": stable_ast_id("flowchart", node["id"], "declaration"),
                "kind": "VariableDeclaration",
                "symbolId": node["payload"]["symbolId"],
            },
            node["id"],
            "input-node-to-variable-declaration",
        ))

    start_edges = outgoing.get(start["id"], [])
    if not start_edges:
        diagnostics.append(adapter_diagnostic(
            "GRAPH_CONNECTION_COUNT_INVALID",
            "structure",
            "Start node must connect to a subsequent node.",
            "flowchart",
            start["id"],
            revision,
        ))
        return adapter_result(None, diagnostics)

    current_id = start_edges[0].get("to") or start_edges[0].get("to_node")
    consumed: Set[str] = {start["id"]}

    def compile_until(
        initial_id: str,
        stop_id: str,
        destination: Dict[str, Any],
        active: Set[str],
        incoming_edge: Optional[Dict[str, Any]] = None,
    ) -> str:
        node_id = initial_id
        while node_id != stop_id:
            if node_id not in node_by_id or node_id in active or node_id in consumed:
                edge_id = incoming_edge.get("id") if incoming_edge else node_id
                diagnostics.append(adapter_diagnostic(
                    "GRAPH_JOIN_AMBIGUOUS",
                    "semantics",
                    f"Flowchart path reaches “{node_id}” more than once before its join can be established.",
                    "flowchart",
                    edge_id,
                    revision,
                ))
                return stop_id

            active.add(node_id)
            node = node_by_id[node_id]
            consumed.add(node_id)
            payload = node.get("payload", {})
            nkind = node.get("kind")

            if nkind == "end":
                return node["id"]

            if nkind == "input":
                destination["statements"].append(record_statement(
                    builder,
                    {
                        "id": stable_ast_id("flowchart", node["id"], "input"),
                        "kind": "Input",
                        "symbolId": payload["symbolId"],
                        "prompt": payload.get("prompt", ""),
                    },
                    node["id"],
                    "input-node-to-ast-input",
                ))
            elif nkind == "process" and payload.get("operation") == "declaration":
                initializer = None
                if payload.get("initializer"):
                    initializer = parse_with_diagnostic(
                        builder,
                        payload["initializer"],
                        "flowchart",
                        node["id"],
                        revision,
                        "initializer",
                        symbol_by_name,
                        diagnostics,
                    )
                    if not initializer:
                        return stop_id
                decl_node: Dict[str, Any] = {
                    "id": stable_ast_id("flowchart", node["id"], "declaration"),
                    "kind": "VariableDeclaration",
                    "symbolId": payload["symbolId"],
                }
                if initializer:
                    decl_node["initializer"] = initializer
                destination["statements"].append(record_statement(builder, decl_node, node["id"]))

            elif nkind == "process":
                expr = parse_with_diagnostic(
                    builder,
                    payload.get("expression", ""),
                    "flowchart",
                    node["id"],
                    revision,
                    "assignment",
                    symbol_by_name,
                    diagnostics,
                )
                if not expr:
                    return stop_id
                destination["statements"].append(record_statement(
                    builder,
                    {
                        "id": stable_ast_id("flowchart", node["id"], "assignment"),
                        "kind": "Assignment",
                        "symbolId": payload["symbolId"],
                        "expression": expr,
                    },
                    node["id"],
                ))

            elif nkind == "output":
                if payload.get("mode") == "message":
                    destination["statements"].append(record_statement(
                        builder,
                        {
                            "id": stable_ast_id("flowchart", node["id"], "output"),
                            "kind": "Output",
                            "mode": "message",
                            "message": payload.get("message", ""),
                        },
                        node["id"],
                    ))
                else:
                    expr = parse_with_diagnostic(
                        builder,
                        payload.get("expression", ""),
                        "flowchart",
                        node["id"],
                        revision,
                        "output",
                        symbol_by_name,
                        diagnostics,
                    )
                    if not expr:
                        return stop_id
                    destination["statements"].append(record_statement(
                        builder,
                        {
                            "id": stable_ast_id("flowchart", node["id"], "output"),
                            "kind": "Output",
                            "mode": "value",
                            "value": expr,
                        },
                        node["id"],
                    ))

            elif nkind == "decision":
                branches = outgoing.get(node["id"], [])
                true_edge = next((e for e in branches if e.get("branch") == "true"), None)
                false_edge = next((e for e in branches if e.get("branch") == "false"), None)

                if not true_edge or not false_edge:
                    diagnostics.append(adapter_diagnostic(
                        "GRAPH_BRANCH_INVALID",
                        "structure",
                        f"Decision “{node['id']}” must have both True and False branches.",
                        "flowchart",
                        node["id"],
                        revision,
                    ))
                    return stop_id

                true_target = true_edge.get("to") or true_edge.get("to_node")
                false_target = false_edge.get("to") or false_edge.get("to_node")
                join_id = nearest_join(true_target, false_target, outgoing, post_dominators)

                if not join_id:
                    diagnostics.append(adapter_diagnostic(
                        "GRAPH_JOIN_AMBIGUOUS",
                        "semantics",
                        f"Decision “{node['id']}” has no unique nearest common post-dominator.",
                        "flowchart",
                        node["id"],
                        revision,
                        "Connect both decision paths to one unambiguous join before continuing.",
                    ))
                    return stop_id

                condition = parse_with_diagnostic(
                    builder,
                    payload.get("condition", ""),
                    "flowchart",
                    node["id"],
                    revision,
                    "condition",
                    symbol_by_name,
                    diagnostics,
                )
                if not condition:
                    return stop_id

                true_block = builder.block(node["id"], "then", [node["id"], true_edge["id"], join_id])
                false_block = builder.block(node["id"], "else", [node["id"], false_edge["id"], join_id])

                compile_until(true_target, join_id, true_block, set(active), true_edge)
                compile_until(false_target, join_id, false_block, set(active), false_edge)

                destination["statements"].append(record_statement(
                    builder,
                    {
                        "id": stable_ast_id("flowchart", node["id"], "conditional"),
                        "kind": "IfStatement",
                        "condition": condition,
                        "thenBlock": true_block,
                        "elseBlock": false_block,
                    },
                    node["id"],
                ))
                node_id = join_id
                continue

            node_out = outgoing.get(node["id"], [])
            if not node_out:
                return stop_id
            edge = node_out[0]
            incoming_edge = edge
            node_id = edge.get("to") or edge.get("to_node")

        return node_id

    compile_until(current_id, end["id"], body, set())
    consumed.add(end["id"])

    if diagnostics:
        return adapter_result(None, diagnostics)

    if len(consumed) != len(nodes):
        unvisited = next((n for n in nodes if n["id"] not in consumed), None)
        unvisited_id = unvisited["id"] if unvisited else "unknown"
        return adapter_result(None, [adapter_diagnostic(
            "GRAPH_JOIN_AMBIGUOUS",
            "semantics",
            f"Block “{unvisited_id}” was not assigned to a unique structured path.",
            "flowchart",
            unvisited_id,
            revision,
        )])

    ast = builder.finish(body, symbols)
    return adapter_result(ast, [])
