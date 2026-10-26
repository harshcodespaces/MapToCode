from app.domain.adapters import adapt_specification_to_ast
from app.domain.ast_validation import validate_ast_semantics


def test_ast_validation_passes_valid_project(even_odd_project):
    spec = even_odd_project["specification"]
    adapted = adapt_specification_to_ast(spec, project_id=even_odd_project["projectId"])
    validation = validate_ast_semantics(adapted["ast"])
    assert validation["valid"] is True
    assert len(validation["diagnostics"]) == 0
    assert "typeTable" in validation


def test_ast_validation_detects_division_by_zero():
    # Construct an AST dividing by 0
    ast = {
        "irVersion": "1.0.0",
        "programId": "test-prog",
        "symbols": [{"id": "s1", "name": "x", "type": "int"}],
        "body": {
            "id": "b1",
            "kind": "Block",
            "statements": [
                {
                    "id": "st1",
                    "kind": "VariableDeclaration",
                    "symbolId": "s1",
                    "initializer": {
                        "id": "e1",
                        "kind": "BinaryExpression",
                        "operator": "/",
                        "left": {"id": "e2", "kind": "IntegerLiteral", "value": 10},
                        "right": {"id": "e3", "kind": "IntegerLiteral", "value": 0},
                    },
                }
            ],
        },
        "provenance": [
            {"astNodeId": "b1", "origins": [{"sourceKind": "specification", "sourceObjectId": "1", "sourceRevision": 1}], "transformationRuleId": "r", "adapterVersion": "1.0.0"},
            {"astNodeId": "st1", "origins": [{"sourceKind": "specification", "sourceObjectId": "1", "sourceRevision": 1}], "transformationRuleId": "r", "adapterVersion": "1.0.0"},
            {"astNodeId": "e1", "origins": [{"sourceKind": "specification", "sourceObjectId": "1", "sourceRevision": 1}], "transformationRuleId": "r", "adapterVersion": "1.0.0"},
            {"astNodeId": "e2", "origins": [{"sourceKind": "specification", "sourceObjectId": "1", "sourceRevision": 1}], "transformationRuleId": "r", "adapterVersion": "1.0.0"},
            {"astNodeId": "e3", "origins": [{"sourceKind": "specification", "sourceObjectId": "1", "sourceRevision": 1}], "transformationRuleId": "r", "adapterVersion": "1.0.0"},
        ],
    }
    validation = validate_ast_semantics(ast)
    assert any(d["code"] == "SEM_DIVISION_BY_ZERO_STATIC" for d in validation["diagnostics"])
