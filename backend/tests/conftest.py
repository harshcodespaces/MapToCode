import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def even_odd_project():
    return {
        "schemaVersion": "1.0.0",
        "projectId": "11111111-1111-4111-8111-111111111111",
        "name": "Even or Odd",
        "specification": {
            "schemaVersion": "1.0.0",
            "revision": 1,
            "inputs": [{"id": "in-n", "name": "n", "type": "int", "description": "Number to test"}],
            "outputs": [{"id": "out-res", "description": "Even/odd outcome"}],
            "variables": [],
            "steps": [
                {"id": "s-in", "kind": "input", "payload": {"inputId": "in-n", "prompt": "Enter n: "}},
                {
                    "id": "s-cond",
                    "kind": "conditional",
                    "payload": {
                        "condition": "n % 2 == 0",
                        "whenTrue": [{"id": "s-even", "kind": "output", "payload": {"outputId": "out-res", "mode": "message", "message": "Even"}}],
                        "whenFalse": [{"id": "s-odd", "kind": "output", "payload": {"outputId": "out-res", "mode": "message", "message": "Odd"}}],
                    },
                },
            ],
            "constraints": [],
            "examples": [],
        },
        "flowchart": {
            "schemaVersion": "1.0.0",
            "revision": 1,
            "nodes": [
                {"id": "n-start", "kind": "start", "payload": {}},
                {"id": "n-input", "kind": "input", "payload": {"symbolId": "in-n", "name": "n", "type": "int", "prompt": "Enter n: "}},
                {"id": "n-dec", "kind": "decision", "payload": {"condition": "n % 2 == 0"}},
                {"id": "n-even", "kind": "output", "payload": {"outputId": "out-res", "mode": "message", "message": "Even"}},
                {"id": "n-odd", "kind": "output", "payload": {"outputId": "out-res", "mode": "message", "message": "Odd"}},
                {"id": "n-end", "kind": "end", "payload": {}},
            ],
            "edges": [
                {"id": "e1", "from": "n-start", "to": "n-input"},
                {"id": "e2", "from": "n-input", "to": "n-dec"},
                {"id": "e3", "from": "n-dec", "to": "n-even", "branch": "true"},
                {"id": "e4", "from": "n-dec", "to": "n-odd", "branch": "false"},
                {"id": "e5", "from": "n-even", "to": "n-end"},
                {"id": "e6", "from": "n-odd", "to": "n-end"},
            ],
            "layout": {
                "positions": {
                    "n-start": {"x": 100, "y": 50},
                    "n-input": {"x": 100, "y": 150},
                    "n-dec": {"x": 100, "y": 270},
                    "n-even": {"x": 20, "y": 420},
                    "n-odd": {"x": 200, "y": 420},
                    "n-end": {"x": 100, "y": 560},
                },
                "zoom": 1.0,
            },
        },
        "decisions": [],
        "revisions": {"semantic": 1, "presentation": 0},
        "createdAt": "2026-10-18T10:00:00.000Z",
        "updatedAt": "2026-10-18T10:00:00.000Z",
        "generationApproval": None,
    }
