import json
from typing import Any, Dict, List, Optional
from app.core.diagnostics import create_diagnostic
from app.domain.canonicalizer import CANONICALIZER_VERSION, canonicalize_ast


def stable_finding_id(path: str, left: Any, right: Any) -> str:
    text = json.dumps([path, left, right], separators=(",", ":"))
    hash_val = 0xcbf29ce484222325
    for ch in text:
        hash_val ^= ord(ch)
        hash_val = (hash_val * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF
    return f"finding-{hash_val:016x}"


def compare_values(
    left: Any,
    right: Any,
    path: str,
    differences: List[Dict[str, Any]],
) -> None:
    if left == right:
        return

    if isinstance(left, list) and isinstance(right, list):
        shared_length = min(len(left), len(right))
        for index in range(shared_length):
            compare_values(left[index], right[index], f"{path}/{index}", differences)
        if len(left) != len(right):
            differences.append({
                "path": path,
                "specificationValue": left[shared_length:],
                "flowchartValue": right[shared_length:],
            })
        return

    if isinstance(left, dict) and isinstance(right, dict):
        all_keys = sorted(set(left.keys()) | set(right.keys()))
        for key in all_keys:
            if key not in left or key not in right:
                differences.append({
                    "path": f"{path}/{key}",
                    "specificationValue": left.get(key),
                    "flowchartValue": right.get(key),
                })
            else:
                compare_values(left[key], right[key], f"{path}/{key}", differences)
        return

    differences.append({
        "path": path,
        "specificationValue": left,
        "flowchartValue": right,
    })


def source_refs_at(path: str, source_paths: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    candidate = path
    while candidate:
        refs = source_paths.get(candidate)
        if refs:
            return refs
        idx = candidate.rfind("/")
        if idx <= 0:
            break
        candidate = candidate[:idx]
    return []


def reconcile_ast_candidates(
    specification_candidate: Dict[str, Any],
    flowchart_candidate: Dict[str, Any],
    canonicalizer_version: str = CANONICALIZER_VERSION,
) -> Dict[str, Any]:
    if not specification_candidate.get("valid") or not flowchart_candidate.get("valid"):
        diagnostic = create_diagnostic(
            code="RECON_INPUT_INVALID",
            category="reconciliation",
            message="Reconciliation requires both source adapters to produce a valid Typed AST.",
        )
        return {
            "status": "invalid",
            "findings": [],
            "diagnostics": [diagnostic],
            "unresolvedCount": 0,
            "canonicalizerVersion": canonicalizer_version,
            "revisions": {},
        }

    spec_canonical = canonicalize_ast(specification_candidate["ast"])
    flow_canonical = canonicalize_ast(flowchart_candidate["ast"])

    if spec_canonical["status"] != "canonical" or flow_canonical["status"] != "canonical":
        diagnostic = create_diagnostic(
            code="RECON_INPUT_INVALID",
            category="reconciliation",
            message="Reconciliation requires both AST candidates to pass semantic validation.",
        )
        combined_diags = list(spec_canonical.get("diagnostics", [])) + list(flow_canonical.get("diagnostics", [])) + [diagnostic]
        return {
            "status": "invalid",
            "findings": [],
            "diagnostics": combined_diags,
            "unresolvedCount": 0,
            "canonicalizerVersion": canonicalizer_version,
            "revisions": {},
        }

    differences: List[Dict[str, Any]] = []
    compare_values(spec_canonical["canonical"], flow_canonical["canonical"], "/body", differences)

    findings: List[Dict[str, Any]] = []
    for diff in differences:
        spec_refs = source_refs_at(diff["path"], spec_canonical["sourcePaths"])
        flow_refs = source_refs_at(diff["path"], flow_canonical["sourcePaths"])
        fid = stable_finding_id(diff["path"], diff.get("specificationValue"), diff.get("flowchartValue"))
        combined_refs = spec_refs + flow_refs
        
        diag = create_diagnostic(
            code="RECON_CONFLICT",
            category="reconciliation",
            message=f"Semantic difference at {diff['path']}.",
            source_refs=combined_refs,
            suggestion="Align the two source representations or correct the mismatched block.",
        )
        findings.append({
            "id": fid,
            "code": "RECON_CONFLICT",
            "severity": "error",
            "difference": f"Semantic difference at {diff['path']}.",
            "specificationSourceRefs": spec_refs,
            "flowchartSourceRefs": flow_refs,
            "suggestion": "Align the two source representations or correct the mismatched block.",
            "diagnostic": diag,
        })

    def get_rev(candidate: Dict[str, Any], kind: str) -> Optional[int]:
        ast = candidate.get("ast", {})
        prov = ast.get("provenance", [])
        if prov:
            for origin in prov[0].get("origins", []):
                if origin.get("sourceKind") == kind:
                    return origin.get("sourceRevision")
        return None

    return {
        "status": "conflict" if findings else "equivalent",
        "findings": findings,
        "diagnostics": [f["diagnostic"] for f in findings],
        "unresolvedCount": len(findings),
        "canonicalizerVersion": canonicalizer_version,
        "revisions": {
            "specification": get_rev(specification_candidate, "specification"),
            "flowchart": get_rev(flowchart_candidate, "flowchart"),
        },
    }
