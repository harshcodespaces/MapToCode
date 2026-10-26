from app.domain.adapters import adapt_flowchart_to_ast, adapt_specification_to_ast


def test_specification_adapter_emits_ast(even_odd_project):
    spec = even_odd_project["specification"]
    res = adapt_specification_to_ast(spec, project_id=even_odd_project["projectId"])
    assert res["valid"] is True
    assert res["ast"] is not None
    assert len(res["diagnostics"]) == 0
    assert len(res["ast"]["symbols"]) == 1
    assert res["ast"]["symbols"][0]["name"] == "n"
    assert len(res["ast"]["body"]["statements"]) == 3  # VariableDeclaration + Input + IfStatement


def test_flowchart_adapter_emits_ast(even_odd_project):
    flowchart = even_odd_project["flowchart"]
    res = adapt_flowchart_to_ast(flowchart, project_id=even_odd_project["projectId"])
    assert res["valid"] is True
    assert res["ast"] is not None
    assert len(res["diagnostics"]) == 0
    assert len(res["ast"]["symbols"]) == 1
    assert res["ast"]["symbols"][0]["name"] == "n"
    assert len(res["ast"]["body"]["statements"]) == 3  # VariableDeclaration + Input + IfStatement
