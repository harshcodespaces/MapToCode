import json
from typing import Any, Dict, List, Optional
from app.domain.ast_validation import validate_ast_semantics


CANONICALIZER_VERSION = "1.0.0"


def canonicalize_ast(ast: Dict[str, Any]) -> Dict[str, Any]:
    validation = validate_ast_semantics(ast)
    if not validation["valid"]:
        return {
            "status": "invalid",
            "canonical": None,
            "diagnostics": validation["diagnostics"],
            "sourcePaths": {},
            "nodePaths": {},
        }

    symbols = {symbol["id"]: symbol for symbol in ast.get("symbols", [])}
    provenance = {entry["astNodeId"]: entry.get("origins", []) for entry in ast.get("provenance", [])}

    source_paths: Dict[str, List[Dict[str, Any]]] = {}
    node_paths: Dict[str, str] = {}

    def expression(node: Dict[str, Any], path: str) -> Optional[Dict[str, Any]]:
        nid = node.get("id")
        if nid:
            node_paths[nid] = path
            source_paths[path] = provenance.get(nid, [])

        kind = node.get("kind")
        if kind in ("IntegerLiteral", "FloatingLiteral", "CharacterLiteral"):
            return {"kind": kind, "value": node.get("value")}

        if kind == "VariableReference":
            symbol = symbols.get(node.get("symbolId"))
            if symbol:
                return {"kind": kind, "name": symbol["name"], "type": symbol["type"]}
            return None

        if kind == "UnaryExpression":
            return {
                "kind": kind,
                "operator": node.get("operator"),
                "operand": expression(node.get("operand", {}), f"{path}/operand"),
            }

        if kind == "BinaryExpression":
            return {
                "kind": kind,
                "operator": node.get("operator"),
                "left": expression(node.get("left", {}), f"{path}/left"),
                "right": expression(node.get("right", {}), f"{path}/right"),
            }

        return None

    def block(node: Dict[str, Any], path: str) -> Dict[str, Any]:
        nid = node.get("id")
        if nid:
            node_paths[nid] = path
            source_paths[path] = provenance.get(nid, [])

        statements = [
            visit(stmt, f"{path}/statements/{idx}")
            for idx, stmt in enumerate(node.get("statements", []))
        ]
        return {"kind": "Block", "statements": statements}

    def visit(node: Dict[str, Any], path: str) -> Optional[Dict[str, Any]]:
        nid = node.get("id")
        if nid:
            node_paths[nid] = path
            source_paths[path] = provenance.get(nid, [])

        kind = node.get("kind")
        if kind == "VariableDeclaration":
            symbol = symbols.get(node.get("symbolId"))
            res: Dict[str, Any] = {
                "kind": kind,
                "name": symbol["name"] if symbol else "unknown",
                "type": symbol["type"] if symbol else "unknown",
            }
            if node.get("initializer"):
                res["initializer"] = expression(node["initializer"], f"{path}/initializer")
            return res

        if kind == "Input":
            symbol = symbols.get(node.get("symbolId"))
            return {
                "kind": kind,
                "name": symbol["name"] if symbol else "unknown",
                "type": symbol["type"] if symbol else "unknown",
                "prompt": node.get("prompt", ""),
            }

        if kind == "Assignment":
            symbol = symbols.get(node.get("symbolId"))
            return {
                "kind": kind,
                "name": symbol["name"] if symbol else "unknown",
                "expression": expression(node.get("expression", {}), f"{path}/expression"),
            }

        if kind == "Output":
            if node.get("mode") == "message":
                return {
                    "kind": kind,
                    "mode": "message",
                    "message": node.get("message", ""),
                }
            return {
                "kind": kind,
                "mode": "value",
                "value": expression(node.get("value", {}), f"{path}/value"),
            }

        if kind == "IfStatement":
            return {
                "kind": kind,
                "condition": expression(node.get("condition", {}), f"{path}/condition"),
                "thenBlock": block(node.get("thenBlock", {}), f"{path}/thenBlock"),
                "elseBlock": block(node.get("elseBlock", {}), f"{path}/elseBlock"),
            }

        return None

    canonical = block(ast.get("body", {}), "/body")
    return {
        "status": "canonical",
        "canonical": canonical,
        "diagnostics": [],
        "sourcePaths": source_paths,
        "nodePaths": node_paths,
    }


def canonical_ast_fingerprint(ast: Dict[str, Any]) -> Optional[str]:
    result = canonicalize_ast(ast)
    if result["status"] != "canonical":
        return None
    return json.dumps(result["canonical"], sort_keys=True, separators=(",", ":"))
