from app.domain.flowchart_explanation import explain_flowchart_to_learner


def test_explain_empty_flowchart():
    result = explain_flowchart_to_learner({"nodes": [], "edges": []})
    assert result["status"] == "empty"
    assert "empty" in result["summary"].lower()
    assert result["complexity"]["time"] == "O(1)"


def test_explain_even_odd_flowchart(even_odd_project):
    flowchart = even_odd_project["flowchart"]
    result = explain_flowchart_to_learner(flowchart)
    assert result["status"] == "ok"
    assert "reads input" in result["summary"]
    assert "BEGIN" in result["pseudocode"]
    assert "IF" in result["pseudocode"]
    assert "END" in result["pseudocode"]
    assert result["complexity"]["time"] == "O(1)"
    assert len(result["narrativeSteps"]) > 0


def test_explain_flowchart_endpoint(client, even_odd_project):
    resp = client.post("/api/v1/flowcharts/explain", json={"flowchart": even_odd_project["flowchart"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "pseudocode" in data
    assert "complexity" in data
    assert data["complexity"]["time"] == "O(1)"


def test_generate_flowchart_direct_endpoint(client, even_odd_project):
    resp = client.post("/api/v1/flowcharts/generate", json={
        "flowchart": even_odd_project["flowchart"],
        "language": "python",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert "input(" in data["code"]
    assert "print" in data["code"]
