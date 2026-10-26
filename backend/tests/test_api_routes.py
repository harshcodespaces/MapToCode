def test_create_project_endpoint(client):
    response = client.post("/api/v1/projects/create", json={"name": "My Algorithm"})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "My Algorithm"
    assert "projectId" in data
    assert data["schemaVersion"] == "1.0.0"


def test_validate_specification_endpoint(client, even_odd_project):
    spec = even_odd_project["specification"]
    response = client.post("/api/v1/specifications/validate", json={"specification": spec})
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert len(data["diagnostics"]) == 0


def test_validate_flowchart_endpoint(client, even_odd_project):
    flowchart = even_odd_project["flowchart"]
    response = client.post("/api/v1/flowcharts/validate", json={"flowchart": flowchart})
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert len(data["diagnostics"]) == 0


def test_reconcile_endpoint(client, even_odd_project):
    response = client.post("/api/v1/projects/reconcile", json={"project": even_odd_project})
    assert response.status_code == 200
    data = response.json()
    assert data["reconciliation"]["status"] == "equivalent"


def test_approve_and_generate_gate(client, even_odd_project):
    # 1. Generation blocked before approval
    gen_resp_blocked = client.post("/api/v1/projects/generate/c", json={"project": even_odd_project})
    assert gen_resp_blocked.status_code == 200
    assert gen_resp_blocked.json()["status"] == "blocked"
    assert any(d["code"] == "GEN_APPROVAL_REQUIRED" for d in gen_resp_blocked.json()["diagnostics"])

    # 2. Approve project
    appr_resp = client.post("/api/v1/projects/approve", json={"project": even_odd_project})
    assert appr_resp.status_code == 200
    approval_data = appr_resp.json()
    assert approval_data["approval"] is not None
    assert approval_data["approval"]["canonicalAstFingerprint"]

    # 3. Attach approval to project
    approved_project = dict(even_odd_project)
    approved_project["generationApproval"] = approval_data["approval"]

    # 4. Generate C passes gate
    gen_c_resp = client.post("/api/v1/projects/generate/c", json={"project": approved_project})
    assert gen_c_resp.status_code == 200
    c_data = gen_c_resp.json()
    assert c_data["status"] == "ready"
    assert "#include <stdio.h>" in c_data["code"]
    assert len(c_data["sourceMap"]) > 0

    # 5. Generate Python passes gate
    gen_py_resp = client.post("/api/v1/projects/generate/python", json={"project": approved_project})
    assert gen_py_resp.status_code == 200
    py_data = gen_py_resp.json()
    assert py_data["status"] == "ready"
    assert "print(\"Even\")" in py_data["code"]
    assert len(py_data["sourceMap"]) > 0


def test_generation_blocks_on_semantic_revision_mismatch(client, even_odd_project):
    # Approve first
    appr_resp = client.post("/api/v1/projects/approve", json={"project": even_odd_project})
    approval = appr_resp.json()["approval"]

    # Modify project semantic revision to 2 (simulating a change after approval)
    stale_project = dict(even_odd_project)
    stale_project["generationApproval"] = approval
    stale_project["revisions"] = {"semantic": 2, "presentation": 0}

    gen_resp = client.post("/api/v1/projects/generate/c", json={"project": stale_project})
    assert gen_resp.status_code == 200
    data = gen_resp.json()
    assert data["status"] == "blocked"
    assert any(d["code"] == "GEN_STALE_APPROVAL" for d in data["diagnostics"])


def test_import_project_endpoint(client, even_odd_project):
    # Valid import
    resp = client.post("/api/v1/projects/import", json={"project": even_odd_project})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == even_odd_project["name"]

    # Invalid import (missing required schemaVersion / bad structure)
    bad_resp = client.post("/api/v1/projects/import", json={"project": {"foo": "bar"}})
    assert bad_resp.status_code == 400
    assert "detail" in bad_resp.json()


def test_export_project_endpoint(client, even_odd_project):
    resp = client.post("/api/v1/projects/export", json={"project": even_odd_project})
    assert resp.status_code == 200
    data = resp.json()
    assert data["projectId"] == even_odd_project["projectId"]


def test_cors_headers_development(client):
    headers = {"Origin": "http://localhost:3000"}
    resp = client.get("/api/v1/health", headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"

