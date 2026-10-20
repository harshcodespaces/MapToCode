import copy
import json
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from app.core.diagnostics import create_diagnostic
from app.domain.adapters import ADAPTER_VERSION, adapt_flowchart_to_ast, adapt_specification_to_ast
from app.domain.ast_validation import validate_ast_semantics
from app.domain.c_generator import C_GENERATOR_VERSION, generate_c_from_ast
from app.domain.canonicalizer import CANONICALIZER_VERSION, canonical_ast_fingerprint, canonicalize_ast
from app.domain.python_generator import PYTHON_GENERATOR_VERSION, generate_python_from_ast
from app.domain.reconciliation import reconcile_ast_candidates


CONTRACT_VALIDATOR_VERSION = "1.0.0"


def generation_diagnostic(code: str, message: str) -> Dict[str, Any]:
    return create_diagnostic(
        code=code,
        category="generation",
        message=message,
        source_refs=[],
    )


def analyze_project(project: Dict[str, Any]) -> Dict[str, Any]:
    spec = project.get("specification", {})
    flow = project.get("flowchart", {})
    pid = project.get("projectId")

    spec_cand = adapt_specification_to_ast(spec, project_id=pid)
    flow_cand = adapt_flowchart_to_ast(flow, project_id=pid)

    reconciliation = reconcile_ast_candidates(spec_cand, flow_cand)
    spec_val = validate_ast_semantics(spec_cand["ast"]) if spec_cand.get("ast") else None
    flow_val = validate_ast_semantics(flow_cand["ast"]) if flow_cand.get("ast") else None

    return {
        "diagnostics": spec_cand.get("diagnostics", []) + flow_cand.get("diagnostics", []),
        "specificationCandidate": spec_cand,
        "flowchartCandidate": flow_cand,
        "specificationValidation": spec_val,
        "flowchartValidation": flow_val,
        "reconciliation": reconciliation,
    }


def current_approval(project: Dict[str, Any], fingerprint: str, approved_at: str) -> Dict[str, Any]:
    return {
        "projectId": project.get("projectId"),
        "semanticRevision": project.get("revisions", {}).get("semantic", 1),
        "specificationRevision": project.get("specification", {}).get("revision", 1),
        "flowchartRevision": project.get("flowchart", {}).get("revision", 1),
        "canonicalAstFingerprint": fingerprint,
        "adapterVersion": ADAPTER_VERSION,
        "canonicalizerVersion": CANONICALIZER_VERSION,
        "validatorVersion": CONTRACT_VALIDATOR_VERSION,
        "generatorVersion": C_GENERATOR_VERSION,
        "approvedAt": approved_at,
    }


def approve_current_project(project: Dict[str, Any], approved_at: Optional[str] = None) -> Dict[str, Any]:
    if approved_at is None:
        approved_at = datetime.now(timezone.utc).isoformat()

    analysis = analyze_project(project)
    diagnostics = list(analysis["diagnostics"])
    recon = analysis.get("reconciliation")

    if not recon or recon.get("status") != "equivalent":
        diagnostics.append(generation_diagnostic(
            "GEN_UNRESOLVED_CONFLICT",
            "Approval is available only after both current sources reconcile as equivalent.",
        ))
        return {"approval": None, "diagnostics": diagnostics, "reconciliation": recon}

    spec_val = analysis.get("specificationValidation")
    flow_val = analysis.get("flowchartValidation")
    if not spec_val or not spec_val.get("valid") or not flow_val or not flow_val.get("valid"):
        diagnostics.append(generation_diagnostic(
            "GEN_VALIDATION_FAILED",
            "Approval requires both AST candidates to pass static validation.",
        ))
        return {"approval": None, "diagnostics": diagnostics, "reconciliation": recon}

    fingerprint = canonical_ast_fingerprint(analysis["specificationCandidate"]["ast"])
    if not fingerprint:
        diagnostics.append(generation_diagnostic(
            "GEN_AST_UNSUPPORTED",
            "The canonical AST could not be fingerprinted.",
        ))
        return {"approval": None, "diagnostics": diagnostics, "reconciliation": recon}

    return {
        "approval": current_approval(project, fingerprint, approved_at),
        "diagnostics": diagnostics,
        "reconciliation": recon,
    }


def same_approval(approval: Optional[Dict[str, Any]], expected: Dict[str, Any]) -> bool:
    if not approval or not isinstance(approval, dict):
        return False
    for k in expected.keys():
        app_val = approval.get(k)
        exp_val = expected.get(k)
        if app_val == exp_val:
            continue
        if k == "canonicalAstFingerprint" and isinstance(app_val, str) and isinstance(exp_val, str):
            try:
                if json.loads(app_val) == json.loads(exp_val):
                    continue
            except Exception:
                pass
        return False
    return True


def ast_with_combined_provenance(spec_ast: Dict[str, Any], flow_ast: Dict[str, Any]) -> Dict[str, Any]:
    spec_canonical = canonicalize_ast(spec_ast)
    flow_canonical = canonicalize_ast(flow_ast)

    ast = copy.deepcopy(spec_ast)
    new_provenance: List[Dict[str, Any]] = []

    for entry in ast.get("provenance", []):
        nid = entry.get("astNodeId")
        path = spec_canonical.get("nodePaths", {}).get(nid)
        additional = flow_canonical.get("sourcePaths", {}).get(path, []) if path else []
        
        merged: Dict[str, Dict[str, Any]] = {}
        for origin in entry.get("origins", []) + additional:
            key = f"{origin.get('sourceKind')}:{origin.get('sourceObjectId')}:{origin.get('sourceRevision')}"
            merged[key] = origin

        new_entry = dict(entry)
        new_entry["origins"] = list(merged.values())
        new_provenance.append(new_entry)

    ast["provenance"] = new_provenance
    return ast


def generate_for_project(
    project: Dict[str, Any],
    generator: Callable[[Dict[str, Any]], Dict[str, Any]],
) -> Dict[str, Any]:
    analysis = analyze_project(project)
    diagnostics = list(analysis["diagnostics"])
    recon = analysis.get("reconciliation")

    if not recon:
        return {
            "status": "blocked",
            "code": "",
            "sourceMap": [],
            "diagnostics": diagnostics,
            "reconciliation": None,
        }

    if recon.get("status") != "equivalent":
        status_val = recon.get("status")
        msg = (
            "Generation is blocked because equivalence is unknown."
            if status_val == "unknown"
            else "Generation is blocked until the differences between the two sources are resolved."
            if status_val == "conflict"
            else "Generation is blocked because one or both sources are invalid."
        )
        diagnostics.append(generation_diagnostic("GEN_UNRESOLVED_CONFLICT", msg))
        combined_diags = diagnostics + recon.get("diagnostics", [])
        return {
            "status": "blocked",
            "code": "",
            "sourceMap": [],
            "diagnostics": combined_diags,
            "reconciliation": recon,
        }

    spec_ast = analysis["specificationCandidate"].get("ast")
    if not spec_ast:
        return {
            "status": "blocked",
            "code": "",
            "sourceMap": [],
            "diagnostics": diagnostics,
            "reconciliation": recon,
        }

    fingerprint = canonical_ast_fingerprint(spec_ast)
    approved_approval = project.get("generationApproval")
    expected = current_approval(project, fingerprint or "", approved_approval.get("approvedAt", "") if approved_approval else "")

    if not approved_approval:
        diagnostics.append(generation_diagnostic(
            "GEN_APPROVAL_REQUIRED",
            "Review the current reconciliation and validation results, then approve this semantic revision before generating code.",
        ))
        return {
            "status": "blocked",
            "code": "",
            "sourceMap": [],
            "diagnostics": diagnostics,
            "reconciliation": recon,
        }

    if not same_approval(approved_approval, expected):
        diagnostics.append(generation_diagnostic(
            "GEN_STALE_APPROVAL",
            "The approval is stale because the project, source revisions, AST, or tool versions changed. Review and approve the current results again.",
        ))
        return {
            "status": "blocked",
            "code": "",
            "sourceMap": [],
            "diagnostics": diagnostics,
            "reconciliation": recon,
        }

    flow_ast = analysis["flowchartCandidate"].get("ast")
    combined_ast = ast_with_combined_provenance(spec_ast, flow_ast)
    generated = generator(combined_ast)

    if generated.get("diagnostics"):
        return {
            "status": "blocked",
            "code": "",
            "sourceMap": [],
            "diagnostics": diagnostics + generated["diagnostics"],
            "reconciliation": recon,
        }

    return {
        "status": "ready",
        "code": generated.get("code", ""),
        "sourceMap": generated.get("sourceMap", []),
        "diagnostics": diagnostics,
        "reconciliation": recon,
        "metadata": {
            "generatorVersion": generated.get("generatorVersion"),
            "semanticRevision": project.get("revisions", {}).get("semantic"),
            "canonicalAstFingerprint": fingerprint,
        },
    }


def generate_c_for_project(project: Dict[str, Any]) -> Dict[str, Any]:
    return generate_for_project(project, generate_c_from_ast)


def generate_python_for_project(project: Dict[str, Any]) -> Dict[str, Any]:
    return generate_for_project(project, generate_python_from_ast)
