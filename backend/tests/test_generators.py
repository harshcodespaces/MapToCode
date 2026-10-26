from app.domain.adapters import adapt_specification_to_ast
from app.domain.c_generator import generate_c_from_ast
from app.domain.python_generator import generate_python_from_ast


def test_generate_c_deterministic(even_odd_project):
    spec_cand = adapt_specification_to_ast(even_odd_project["specification"], project_id=even_odd_project["projectId"])
    ast = spec_cand["ast"]
    
    res1 = generate_c_from_ast(ast)
    res2 = generate_c_from_ast(ast)
    
    assert res1["code"] == res2["code"]
    assert "#include <stdio.h>" in res1["code"]
    assert "int main(void)" in res1["code"]
    assert "scanf" in res1["code"]
    assert "if (((n % 2) == 0))" in res1["code"]
    assert 'printf("%s\\n", "Even");' in res1["code"]
    assert len(res1["sourceMap"]) > 0


def test_generate_python_deterministic(even_odd_project):
    spec_cand = adapt_specification_to_ast(even_odd_project["specification"], project_id=even_odd_project["projectId"])
    ast = spec_cand["ast"]
    
    res1 = generate_python_from_ast(ast)
    res2 = generate_python_from_ast(ast)
    
    assert res1["code"] == res2["code"]
    assert 'n = int(input("Enter n: "))' in res1["code"]
    assert "if ((n % 2) == 0):" in res1["code"]
    assert 'print("Even")' in res1["code"]
    assert len(res1["sourceMap"]) > 0
