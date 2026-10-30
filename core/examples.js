import { createProject } from "./project-service.js";

export function createNumberComparisonExample(options = {}) {
  const project = createProject({
    name: "Compare two numbers",
    projectId: "00000000-0000-4000-8000-000000000001",
    now: "2026-01-01T00:00:00.000Z",
    ...options,
  });
  project.specification = {
    ...project.specification,
    inputs: [
      { id: "spec-first", name: "first", type: "int", description: "The first number" },
      { id: "spec-second", name: "second", type: "int", description: "The second number" },
    ],
    outputs: [
      { id: "spec-first-larger", description: "The first number is larger" },
      { id: "spec-second-larger", description: "The second number is larger" },
      { id: "spec-equal", description: "The numbers are equal" },
    ],
    steps: [
      { id: "spec-read-first", kind: "input", payload: { inputId: "spec-first", prompt: "Enter the first number: " } },
      { id: "spec-read-second", kind: "input", payload: { inputId: "spec-second", prompt: "Enter the second number: " } },
      {
        id: "spec-check-first", kind: "conditional", payload: {
          condition: "first > second",
          whenTrue: [{ id: "spec-output-first", kind: "output", payload: { outputId: "spec-first-larger", mode: "message", message: "The first number is larger." } }],
          whenFalse: [{
            id: "spec-check-second", kind: "conditional", payload: {
              condition: "first < second",
              whenTrue: [{ id: "spec-output-second", kind: "output", payload: { outputId: "spec-second-larger", mode: "message", message: "The second number is larger." } }],
              whenFalse: [{ id: "spec-output-equal", kind: "output", payload: { outputId: "spec-equal", mode: "message", message: "The numbers are equal." } }],
            },
          }],
        },
      },
    ],
  };
  project.flowchart = {
    ...project.flowchart,
    nodes: [
      { id: "graph-start", kind: "start", payload: {} },
      { id: "graph-read-first", kind: "input", payload: { symbolId: "graph-first", name: "first", type: "int", prompt: "Enter the first number: " } },
      { id: "graph-read-second", kind: "input", payload: { symbolId: "graph-second", name: "second", type: "int", prompt: "Enter the second number: " } },
      { id: "graph-check-first", kind: "decision", payload: { condition: "first > second" } },
      { id: "graph-output-first", kind: "output", payload: { outputId: "first-result", mode: "message", message: "The first number is larger." } },
      { id: "graph-check-second", kind: "decision", payload: { condition: "first < second" } },
      { id: "graph-output-second", kind: "output", payload: { outputId: "second-result", mode: "message", message: "The second number is larger." } },
      { id: "graph-output-equal", kind: "output", payload: { outputId: "equal-result", mode: "message", message: "The numbers are equal." } },
      { id: "graph-end", kind: "end", payload: {} },
    ],
    edges: [
      { id: "graph-edge-1", from: "graph-start", to: "graph-read-first" },
      { id: "graph-edge-2", from: "graph-read-first", to: "graph-read-second" },
      { id: "graph-edge-3", from: "graph-read-second", to: "graph-check-first" },
      { id: "graph-edge-4", from: "graph-check-first", to: "graph-output-first", branch: "true" },
      { id: "graph-edge-5", from: "graph-check-first", to: "graph-check-second", branch: "false" },
      { id: "graph-edge-6", from: "graph-output-first", to: "graph-end" },
      { id: "graph-edge-7", from: "graph-check-second", to: "graph-output-second", branch: "true" },
      { id: "graph-edge-8", from: "graph-check-second", to: "graph-output-equal", branch: "false" },
      { id: "graph-edge-9", from: "graph-output-second", to: "graph-end" },
      { id: "graph-edge-10", from: "graph-output-equal", to: "graph-end" },
    ],
    layout: {
      positions: {
        "graph-start": { x: 510, y: 24 },
        "graph-read-first": { x: 484, y: 126 },
        "graph-read-second": { x: 484, y: 240 },
        "graph-check-first": { x: 480, y: 360 },
        "graph-output-first": { x: 120, y: 555 },
        "graph-check-second": { x: 780, y: 550 },
        "graph-output-second": { x: 570, y: 760 },
        "graph-output-equal": { x: 970, y: 760 },
        "graph-end": { x: 630, y: 990 },
      },
      zoom: 1,
    },
  };
  return project;
}

function createSingleDecisionExample({ name, symbol, prompt, condition, whenTrue, whenFalse }) {
  const exampleId = symbol === "number"
    ? "00000000-0000-4000-8000-000000000002"
    : symbol === "age"
    ? "00000000-0000-4000-8000-000000000003"
    : "00000000-0000-4000-8000-000000000009";
  const project = createProject({
    name,
    projectId: exampleId,
    now: "2026-01-01T00:00:00.000Z",
  });
  const specInput = `spec-${symbol}`;
  const flowInput = `flow-${symbol}`;
  const specYes = "spec-yes-output";
  const specNo = "spec-no-output";
  const flowYes = "flow-yes-output";
  const flowNo = "flow-no-output";
  project.specification = {
    ...project.specification,
    inputs: [{ id: specInput, name: symbol, type: "int", description: prompt }],
    outputs: [{ id: specYes, description: whenTrue }, { id: specNo, description: whenFalse }],
    steps: [
      { id: "spec-read-value", kind: "input", payload: { inputId: specInput, prompt } },
      { id: "spec-decision", kind: "conditional", payload: {
        condition,
        whenTrue: [{ id: "spec-show-true", kind: "output", payload: { outputId: specYes, mode: "message", message: whenTrue } }],
        whenFalse: [{ id: "spec-show-false", kind: "output", payload: { outputId: specNo, mode: "message", message: whenFalse } }],
      } },
    ],
  };
  project.flowchart = {
    ...project.flowchart,
    nodes: [
      { id: "flow-start", kind: "start", payload: {} },
      { id: `flow-input-${symbol}`, kind: "input", payload: { symbolId: flowInput, name: symbol, type: "int", prompt } },
      { id: "flow-decision", kind: "decision", payload: { condition } },
      { id: "flow-output-true", kind: "output", payload: { outputId: flowYes, mode: "message", message: whenTrue } },
      { id: "flow-output-false", kind: "output", payload: { outputId: flowNo, mode: "message", message: whenFalse } },
      { id: "flow-end", kind: "end", payload: {} },
    ],
    edges: [
      { id: "flow-edge-start", from: "flow-start", to: `flow-input-${symbol}` },
      { id: "flow-edge-input", from: `flow-input-${symbol}`, to: "flow-decision" },
      { id: "flow-edge-true", from: "flow-decision", to: "flow-output-true", branch: "true" },
      { id: "flow-edge-false", from: "flow-decision", to: "flow-output-false", branch: "false" },
      { id: "flow-edge-end-true", from: "flow-output-true", to: "flow-end" },
      { id: "flow-edge-end-false", from: "flow-output-false", to: "flow-end" },
    ],
    layout: { positions: {
      "flow-start": { x: 380, y: 28 }, [`flow-input-${symbol}`]: { x: 380, y: 140 },
      "flow-decision": { x: 380, y: 270 }, "flow-output-true": { x: 105, y: 450 },
      "flow-output-false": { x: 655, y: 450 }, "flow-end": { x: 380, y: 620 },
    }, zoom: 1 },
  };
  return project;
}

export function createEvenOddExample() {
  return createSingleDecisionExample({
    name: "Even or odd number", symbol: "number", prompt: "Enter a whole number: ",
    condition: "number % 2 == 0", whenTrue: "This is an even number.", whenFalse: "This is an odd number.",
  });
}

export function createEligibilityExample() {
  return createSingleDecisionExample({
    name: "Check age eligibility", symbol: "age", prompt: "Enter your age: ",
    condition: "age >= 18", whenTrue: "You are eligible to vote.", whenFalse: "You are not eligible to vote yet.",
  });
}

export function createGradeExample() {
  const project = createProject({
    name: "Calculate a grade",
    projectId: "00000000-0000-4000-8000-000000000004",
    now: "2026-01-01T00:00:00.000Z",
  });
  project.specification = {
    ...project.specification,
    inputs: [{ id: "spec-mark", name: "mark", type: "int", description: "A mark from 0 to 100" }],
    outputs: [
      { id: "spec-grade-a", description: "Grade A" }, { id: "spec-grade-b", description: "Grade B" },
      { id: "spec-grade-c", description: "Grade C" }, { id: "spec-grade-f", description: "Below passing grade" },
    ],
    steps: [
      { id: "spec-read-mark", kind: "input", payload: { inputId: "spec-mark", prompt: "Enter your mark (0–100): " } },
      { id: "spec-check-a", kind: "conditional", payload: {
        condition: "mark >= 90",
        whenTrue: [{ id: "spec-show-a", kind: "output", payload: { outputId: "spec-grade-a", mode: "message", message: "Grade A" } }],
        whenFalse: [{ id: "spec-check-b", kind: "conditional", payload: {
          condition: "mark >= 80",
          whenTrue: [{ id: "spec-show-b", kind: "output", payload: { outputId: "spec-grade-b", mode: "message", message: "Grade B" } }],
          whenFalse: [{ id: "spec-check-c", kind: "conditional", payload: {
            condition: "mark >= 70",
            whenTrue: [{ id: "spec-show-c", kind: "output", payload: { outputId: "spec-grade-c", mode: "message", message: "Grade C" } }],
            whenFalse: [{ id: "spec-show-f", kind: "output", payload: { outputId: "spec-grade-f", mode: "message", message: "Below passing grade" } }],
          } }],
        } }],
      } }],
  };
  project.flowchart = {
    ...project.flowchart,
    nodes: [
      { id: "graph-start", kind: "start", payload: {} },
      { id: "graph-read-mark", kind: "input", payload: { symbolId: "graph-mark", name: "mark", type: "int", prompt: "Enter your mark (0–100): " } },
      { id: "graph-check-a", kind: "decision", payload: { condition: "mark >= 90" } },
      { id: "graph-show-a", kind: "output", payload: { outputId: "graph-grade-a", mode: "message", message: "Grade A" } },
      { id: "graph-check-b", kind: "decision", payload: { condition: "mark >= 80" } },
      { id: "graph-show-b", kind: "output", payload: { outputId: "graph-grade-b", mode: "message", message: "Grade B" } },
      { id: "graph-check-c", kind: "decision", payload: { condition: "mark >= 70" } },
      { id: "graph-show-c", kind: "output", payload: { outputId: "graph-grade-c", mode: "message", message: "Grade C" } },
      { id: "graph-show-f", kind: "output", payload: { outputId: "graph-grade-f", mode: "message", message: "Below passing grade" } },
      { id: "graph-end", kind: "end", payload: {} },
    ],
    edges: [
      { id: "grade-e1", from: "graph-start", to: "graph-read-mark" },
      { id: "grade-e2", from: "graph-read-mark", to: "graph-check-a" },
      { id: "grade-e3", from: "graph-check-a", to: "graph-show-a", branch: "true" },
      { id: "grade-e4", from: "graph-check-a", to: "graph-check-b", branch: "false" },
      { id: "grade-e5", from: "graph-show-a", to: "graph-end" },
      { id: "grade-e6", from: "graph-check-b", to: "graph-show-b", branch: "true" },
      { id: "grade-e7", from: "graph-check-b", to: "graph-check-c", branch: "false" },
      { id: "grade-e8", from: "graph-show-b", to: "graph-end" },
      { id: "grade-e9", from: "graph-check-c", to: "graph-show-c", branch: "true" },
      { id: "grade-e10", from: "graph-check-c", to: "graph-show-f", branch: "false" },
      { id: "grade-e11", from: "graph-show-c", to: "graph-end" },
      { id: "grade-e12", from: "graph-show-f", to: "graph-end" },
    ],
    layout: { positions: {
      "graph-start": { x: 530, y: 24 }, "graph-read-mark": { x: 530, y: 128 },
      "graph-check-a": { x: 530, y: 250 }, "graph-show-a": { x: 110, y: 420 },
      "graph-check-b": { x: 900, y: 420 }, "graph-show-b": { x: 620, y: 590 },
      "graph-check-c": { x: 1060, y: 610 }, "graph-show-c": { x: 760, y: 800 },
      "graph-show-f": { x: 1150, y: 800 }, "graph-end": { x: 720, y: 1000 },
    }, zoom: 1 },
  };
  return project;
}
