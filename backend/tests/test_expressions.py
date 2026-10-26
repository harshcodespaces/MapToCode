import pytest
from app.domain.expressions import parse_expression, ExpressionSyntaxError


def test_parse_simple_arithmetic():
    expr = parse_expression("1 + 2 * 3")
    assert expr["kind"] == "BinaryExpression"
    assert expr["operator"] == "+"
    assert expr["left"]["value"] == 1
    assert expr["right"]["operator"] == "*"
    assert expr["right"]["left"]["value"] == 2
    assert expr["right"]["right"]["value"] == 3


def test_parse_parentheses_precedence():
    expr = parse_expression("(1 + 2) * 3")
    assert expr["kind"] == "BinaryExpression"
    assert expr["operator"] == "*"
    assert expr["left"]["operator"] == "+"


def test_parse_comparison_and_logic():
    expr = parse_expression("n % 2 == 0 && n > 0")
    assert expr["kind"] == "BinaryExpression"
    assert expr["operator"] == "&&"
    assert expr["left"]["operator"] == "=="
    assert expr["right"]["operator"] == ">"


def test_reject_chained_comparison():
    with pytest.raises(ExpressionSyntaxError) as exc:
        parse_expression("1 < 2 < 3")
    assert "Chained comparisons are not supported" in str(exc.value)


def test_reject_unsupported_operators():
    with pytest.raises(ExpressionSyntaxError):
        parse_expression("x++")
    with pytest.raises(ExpressionSyntaxError):
        parse_expression("x ** 2")
    with pytest.raises(ExpressionSyntaxError):
        parse_expression("x === 1")
