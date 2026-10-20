"""Flowchart Explanation and Learning Aid Service (Domain Layer).

Provides natural language algorithm summaries, step-by-step narrative walkthroughs,
and learning pseudocode for flowcharts.

Pedagogical boundary:
This explanation is strictly a learning aid to help students understand their
visual blocks. It does NOT mutate or substitute for the user-authored specification.
"""

from typing import Any, Dict, List, Optional


def node_action_english(node: Optional[Dict[str, Any]]) -> str:
    if not node:
        return "Unknown step"
    kind = node.get("kind", "")
    payload = node.get("payload") or {}

    if kind == "start":
        return "Start program execution."
    if kind == "end":
        return "Reach End and terminate execution."
    if kind == "input":
        name = payload.get("name") or "value"
        type_str = f" ({payload.get('type')})" if payload.get("type") else ""
        prompt = f' with prompt "{payload.get("prompt")}"' if payload.get("prompt") else ""
        return f"Ask the user to enter {name}{type_str}{prompt}."
    if kind == "process":
        if payload.get("operation") == "declaration":
            name = payload.get("name") or "result"
            type_str = f" of type {payload.get('type')}" if payload.get("type") else ""
            init = f" initialized to {payload.get('initializer')}" if payload.get("initializer") is not None else ""
            return f"Declare variable {name}{type_str}{init}."
        expr = payload.get("expression") or payload.get("name") or "a calculation"
        return f"Calculate or update: {expr}."
    if kind == "output":
        if payload.get("mode") == "message":
            return f'Display message: "{payload.get("message") or ""}".'
        return f'Display calculated value: {payload.get("expression") or "result"}.'
    if kind == "decision":
        return f'Check condition: Is {payload.get("condition") or "condition true"}?'
    return f"Perform {kind} action."


def node_pseudocode_line(node: Optional[Dict[str, Any]]) -> str:
    if not node:
        return ""
    kind = node.get("kind", "")
    payload = node.get("payload") or {}

    if kind == "start":
        return "BEGIN"
    if kind == "end":
        return "END"
    if kind == "input":
        name = payload.get("name") or "value"
        prompt = f' PROMPT "{payload.get("prompt")}"' if payload.get("prompt") else ""
        return f"INPUT {name}{prompt}"
    if kind == "process":
        if payload.get("operation") == "declaration":
            name = payload.get("name") or "result"
            init = payload.get("initializer") if payload.get("initializer") is not None else "0"
            return f"{name} \u2190 {init}"
        expr = payload.get("expression") or payload.get("name") or "0"
        return str(expr).replace("=", "\u2190")
    if kind == "output":
        if payload.get("mode") == "message":
            return f'OUTPUT "{payload.get("message") or ""}"'
        return f'OUTPUT {payload.get("expression") or "result"}'
    return ""


def explain_flowchart_to_learner(flowchart: Dict[str, Any]) -> Dict[str, Any]:
    nodes: List[Dict[str, Any]] = flowchart.get("nodes") or []
    edges: List[Dict[str, Any]] = flowchart.get("edges") or []

    if not nodes:
        return {
            "status": "empty",
            "summary": "The flowchart canvas is currently empty. Add blocks from the palette to start building your algorithm.",
            "narrativeSteps": [],
            "pseudocode": "# Empty flowchart\nBEGIN\nEND",
            "complexity": {
                "time": "O(1)",
                "space": "O(1)",
                "explanation": "No operations are executed in an empty flowchart.",
            },
            "insights": ["Start by placing a Start block to begin your algorithm."],
        }

    node_map = {n["id"]: n for n in nodes}
    outgoing: Dict[str, List[Dict[str, Any]]] = {n["id"]: [] for n in nodes}
    for e in edges:
        if e.get("from") in outgoing and e.get("to") in node_map:
            outgoing[e["from"]].append(e)

    start_node = next((n for n in nodes if n.get("kind") == "start"), None)
    end_node = next((n for n in nodes if n.get("kind") == "end"), None)
    input_nodes = [n for n in nodes if n.get("kind") == "input"]
    decision_nodes = [n for n in nodes if n.get("kind") == "decision"]
    process_nodes = [n for n in nodes if n.get("kind") == "process"]
    output_nodes = [n for n in nodes if n.get("kind") == "output"]

    # Incomplete flowchart
    if not start_node or not end_node:
        return {
            "status": "incomplete",
            "summary": "The flowchart requires both a Start block and an End block to form a complete executable algorithm.",
            "narrativeSteps": [
                {
                    "stepNumber": 1,
                    "nodeId": n["id"],
                    "kind": n.get("kind", ""),
                    "description": node_action_english(n),
                }
                for n in nodes[:5]
            ],
            "pseudocode": "# Incomplete flowchart\nBEGIN\n  # Missing Start or End terminator\nEND",
            "complexity": {
                "time": "Unknown",
                "space": "Unknown",
                "explanation": "Incomplete flowcharts cannot be analyzed for complexity.",
            },
            "insights": ["Ensure both Start and End terminators are placed on the canvas."],
        }

    # Trace straight-line narrative from start
    narrative_steps: List[Dict[str, Any]] = []
    visited = set()
    current_id: Optional[str] = start_node["id"]
    step_num = 1

    while current_id and current_id not in visited:
        visited.add(current_id)
        node = node_map.get(current_id)
        if not node:
            break

        narrative_steps.append({
            "stepNumber": step_num,
            "nodeId": current_id,
            "kind": node.get("kind", ""),
            "title": f"Step {step_num}: {node.get('kind', '').capitalize()}",
            "description": node_action_english(node),
        })
        step_num += 1

        outs = outgoing.get(current_id, [])
        if not outs or node.get("kind") == "decision":
            break
        current_id = outs[0].get("to")

    # Build summary
    summary_parts = []
    if input_nodes:
        var_names = ", ".join([n.get("payload", {}).get("name", "n") for n in input_nodes])
        summary_parts.append(f"reads input for {var_names}")
    if process_nodes:
        summary_parts.append("performs variable declarations or calculations")
    if decision_nodes:
        conds = ", ".join([n.get("payload", {}).get("condition", "") for n in decision_nodes])
        summary_parts.append(f"evaluates conditions ({conds}) to choose different outcome paths")
    if output_nodes:
        summary_parts.append("displays the final result")

    if summary_parts:
        summary = "This algorithm " + "; then ".join(summary_parts) + "."
    else:
        summary = "This algorithm starts at Start and progresses directly to End."

    # Build pseudocode
    pseudo_lines = ["BEGIN"]
    for step in narrative_steps:
        node = node_map.get(step["nodeId"])
        line = node_pseudocode_line(node)
        if line and line not in ("BEGIN", "END"):
            pseudo_lines.append(f"  {line}")

    if decision_nodes:
        for d in decision_nodes:
            cond = d.get("payload", {}).get("condition", "condition")
            d_outs = outgoing.get(d["id"], [])
            true_edge = next((e for e in d_outs if e.get("branch") == "true"), None)
            false_edge = next((e for e in d_outs if e.get("branch") == "false"), None)

            pseudo_lines.append(f"  IF {cond} THEN")
            if true_edge and true_edge.get("to") in node_map:
                t_node = node_map[true_edge["to"]]
                pseudo_lines.append(f"    {node_pseudocode_line(t_node)}")
            if false_edge and false_edge.get("to") in node_map:
                f_node = node_map[false_edge["to"]]
                pseudo_lines.append("  ELSE")
                pseudo_lines.append(f"    {node_pseudocode_line(f_node)}")
            pseudo_lines.append("  ENDIF")

    pseudo_lines.append("END")
    pseudocode = "\n".join(pseudo_lines)

    # Complexity estimation
    time_complexity = "O(1)"
    space_complexity = "O(1)"
    time_expl = "Sequential control flow with bounded conditional branching executes in constant time O(1)."
    space_expl = f"Uses {max(1, len(input_nodes) + len(process_nodes))} scalar variable(s), requiring constant memory O(1)."

    # Insights
    insights = []
    if input_nodes:
        insights.append(f"Reads {len(input_nodes)} input value(s) from standard input.")
    if decision_nodes:
        insights.append(f"Contains {len(decision_nodes)} branching decision point(s).")
    if len(edges) == len(nodes) - 1 and not decision_nodes:
        insights.append("Linear sequential flow: execution proceeds step-by-step without conditional branching.")
    if end_node:
        insights.append("Guaranteed termination: execution leads cleanly to the End block.")

    return {
        "status": "ok",
        "summary": summary,
        "narrativeSteps": narrative_steps,
        "pseudocode": pseudocode,
        "complexity": {
            "time": time_complexity,
            "space": space_complexity,
            "explanation": f"{time_expl} {space_expl}",
        },
        "insights": insights,
    }
