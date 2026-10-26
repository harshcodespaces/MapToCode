from unittest.mock import AsyncMock, patch
import pytest
from app.services.execution_service import check_rate_limit, reset_rate_limits, verify_execution_gate


def test_rate_limiter():
    reset_rate_limits()
    ip = "192.168.1.50"
    for _ in range(30):
        res = check_rate_limit(ip)
        assert res["allowed"] is True
    # 31st request should be blocked
    blocked = check_rate_limit(ip)
    assert blocked["allowed"] is False
    assert blocked["retry_after_seconds"] > 0
    reset_rate_limits()


def test_execution_gate_unapproved(even_odd_project):
    gate = verify_execution_gate(even_odd_project, "c")
    assert gate["allowed"] is False
    assert gate["reason"] == "GATE_BLOCKED"


def test_execution_gate_approved(even_odd_project, client):
    # Approve project first
    appr_resp = client.post("/api/v1/projects/approve", json={"project": even_odd_project})
    approval = appr_resp.json()["approval"]

    approved_project = dict(even_odd_project)
    approved_project["generationApproval"] = approval

    gate = verify_execution_gate(approved_project, "c")
    assert gate["allowed"] is True
    assert "#include <stdio.h>" in gate["code"]


@pytest.mark.anyio
async def test_execution_endpoint_gate_blocked(client, even_odd_project):
    resp = client.post("/api/v1/projects/execute", json={
        "project": even_odd_project,
        "language": "c",
        "stdin": "",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert data["status"] == "gate_blocked"


@pytest.mark.anyio
async def test_local_python_execution():
    from app.services.execution_service import execute_sandboxed_code
    code = (
        "n = int(input())\n"
        "if n % 2 == 0:\n"
        "    print('Even Number')\n"
        "else:\n"
        "    print('Odd Number')\n"
    )
    result = await execute_sandboxed_code("python", code, stdin="42\n")
    assert result["success"] is True
    assert result["status"] == "success"
    assert "Even Number" in result["stdout"]
    assert result["runner"] == "local_isolated"
    assert result["exitCode"] == 0

    # Test odd branch
    result_odd = await execute_sandboxed_code("python", code, stdin="17\n")
    assert result_odd["success"] is True
    assert "Odd Number" in result_odd["stdout"]


@pytest.mark.anyio
async def test_local_c_execution():
    from app.services.execution_service import execute_sandboxed_code
    code = (
        "#include <stdio.h>\n"
        "int main() {\n"
        "    int n;\n"
        "    if (scanf(\"%d\", &n) == 1) {\n"
        "        printf(\"Value: %d\\n\", n * 2);\n"
        "    }\n"
        "    return 0;\n"
        "}\n"
    )
    result = await execute_sandboxed_code("c", code, stdin="5\n")
    assert result["success"] is True
    assert result["status"] == "success"
    assert "Value: 10" in result["stdout"]
    assert result["runner"] == "local_isolated"


@pytest.mark.anyio
async def test_security_audit_blocks_import():
    from app.services.execution_service import execute_sandboxed_code
    malicious = "import os\nos.system('echo hacked')\n"
    result = await execute_sandboxed_code("python", malicious)
    assert result["success"] is False
    assert result["status"] == "runtime_error"
    assert "Security audit failed" in result["stderr"]


@pytest.mark.anyio
async def test_security_audit_blocks_eval():
    from app.services.execution_service import execute_sandboxed_code
    malicious = "eval('1 + 1')\n"
    result = await execute_sandboxed_code("python", malicious)
    assert result["success"] is False
    assert result["status"] == "runtime_error"
    assert "Security audit failed" in result["stderr"]


@pytest.mark.anyio
async def test_execution_endpoint_approved_project(client, even_odd_project):
    # Approve project
    appr_resp = client.post("/api/v1/projects/approve", json={"project": even_odd_project})
    approval = appr_resp.json()["approval"]

    approved_project = dict(even_odd_project)
    approved_project["generationApproval"] = approval

    # Execute Python
    resp = client.post("/api/v1/projects/execute", json={
        "project": approved_project,
        "language": "python",
        "stdin": "10\n",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "even" in data["stdout"].lower()
    assert data["runner"] == "local_isolated"
