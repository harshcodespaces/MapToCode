import copy
from app.domain.adapters import adapt_flowchart_to_ast, adapt_specification_to_ast
from app.domain.reconciliation import reconcile_ast_candidates


def test_matching_inputs_reconcile_as_equivalent(even_odd_project):
    spec_cand = adapt_specification_to_ast(even_odd_project["specification"], project_id=even_odd_project["projectId"])
    flow_cand = adapt_flowchart_to_ast(even_odd_project["flowchart"], project_id=even_odd_project["projectId"])
    
    recon = reconcile_ast_candidates(spec_cand, flow_cand)
    assert recon["status"] == "equivalent"
    assert len(recon["findings"]) == 0
    assert len(recon["diagnostics"]) == 0


def test_mismatched_inputs_reconcile_as_conflict(even_odd_project):
    flow_cand = adapt_flowchart_to_ast(even_odd_project["flowchart"], project_id=even_odd_project["projectId"])
    
    # Change specification comparison operator: n % 2 != 0 instead of == 0
    mismatched_spec = copy.deepcopy(even_odd_project["specification"])
    mismatched_spec["steps"][1]["payload"]["condition"] = "n % 2 != 0"
    spec_cand = adapt_specification_to_ast(mismatched_spec, project_id=even_odd_project["projectId"])
    
    recon = reconcile_ast_candidates(spec_cand, flow_cand)
    assert recon["status"] == "conflict"
    assert len(recon["findings"]) > 0
    assert any("condition" in f["difference"] or "operator" in f["difference"] for f in recon["findings"])
