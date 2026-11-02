import test from "node:test";
import assert from "node:assert/strict";
import { approveCurrentProject, generateCForProject, generatePythonForProject } from "../core/generation-gate.js";
import { createEligibilityExample, createEvenOddExample, createGradeExample, createNumberComparisonExample } from "../core/examples.js";
import { createProject, updateFlowchartSemantics, updateSpecification } from "../core/project-service.js";

function projectWith(message = "Hello from both editors") {
  const specification = {
    schemaVersion: "1.0.0", revision: 0, inputs: [],
    outputs: [{ id: "output-hello", description: "Greeting" }], variables: [],
    steps: [{ id: "spec-output", kind: "output", payload: { outputId: "output-hello", mode: "message", message } }],
    constraints: [], examples: [],
  };
  const flowchart = {
    schemaVersion: "1.0.0", revision: 0,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "output", kind: "output", payload: { outputId: "graph-output", mode: "message", message } },
      { id: "end", kind: "end", payload: {} },
    ],
    edges: [{ id: "one", from: "start", to: "output" }, { id: "two", from: "output", to: "end" }],
    layout: { positions: {}, zoom: 1 },
  };
  return {
    schemaVersion: "1.0.0",
    projectId: "5f0a5f3c-1d9a-4f99-a134-9194f0ae4123",
    name: "Greeting",
    specification,
    flowchart,
    decisions: [],
    revisions: { semantic: 0, presentation: 0 },
    createdAt: "2026-10-11T00:00:00.000Z",
    updatedAt: "2026-10-11T00:00:00.000Z",
  };
}

test("C generation is blocked until the user approves equivalent validated sources", () => {
  const project = projectWith();
  const beforeApproval = generateCForProject(project);
  assert.equal(beforeApproval.status, "blocked");
  assert.equal(beforeApproval.code, "");
  assert.ok(beforeApproval.diagnostics.some(({ code }) => code === "GEN_APPROVAL_REQUIRED"));

  const approved = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  assert.ok(approved.approval);
  const ready = generateCForProject({ ...project, generationApproval: approved.approval });
  assert.equal(ready.status, "ready");
  assert.equal(ready.code, '#include <stdio.h>\n\nint main(void) {\n    printf("%s\\n", "Hello from both editors");\n    return 0;\n}\n');
  assert.ok(ready.sourceMap[0].sourceRefs.some(({ sourceKind }) => sourceKind === "specification"));
  assert.ok(ready.sourceMap[0].sourceRefs.some(({ sourceKind }) => sourceKind === "flowchart"));
  assert.equal(ready.code, generateCForProject({ ...project, generationApproval: approved.approval }).code);
});

test("the built-in decision example reconciles and generates after current approval", () => {
  const project = createNumberComparisonExample();
  const approved = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  assert.ok(approved.approval, approved.diagnostics.map(({ message }) => message).join("\n"));
  assert.equal(approved.reconciliation.status, "equivalent");
  const ready = generateCForProject({ ...project, generationApproval: approved.approval });
  assert.equal(ready.status, "ready");
  assert.match(ready.code, /if \(\(first > second\)\)/);
  assert.match(ready.code, /The numbers are equal/);
});

test("student sample projects pass the real reconciliation and generation gate", () => {
  for (const createExample of [createEvenOddExample, createEligibilityExample, createGradeExample]) {
    const project = createExample();
    const approved = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
    assert.ok(approved.approval, `${project.name}: ${approved.diagnostics.map(({ message }) => message).join("; ")}`);
    assert.equal(approved.reconciliation.status, "equivalent");
    assert.equal(generateCForProject({ ...project, generationApproval: approved.approval }).status, "ready");
  }
});

test("the nested grade example generates all four outcomes from its decision paths", () => {
  const project = createGradeExample();
  const { approval } = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  assert.ok(approval);
  const generated = generateCForProject({ ...project, generationApproval: approval });
  assert.equal(generated.status, "ready");
  for (const grade of ["Grade A", "Grade B", "Grade C", "Below passing grade"]) assert.ok(generated.code.includes(grade));
});

test("Python is generated from the approved AST with typed input and both decision branches", () => {
  const project = createEligibilityExample();
  const approved = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  assert.ok(approved.approval);
  const ready = generatePythonForProject({ ...project, generationApproval: approved.approval });
  assert.equal(ready.status, "ready");
  assert.equal(ready.code, 'age = int(input("Enter your age: "))\nif (age >= 18):\n    print("You are eligible to vote.")\nelse:\n    print("You are not eligible to vote yet.")\n');
  assert.ok(ready.sourceMap.some(({ sourceRefs }) => sourceRefs.some(({ sourceKind }) => sourceKind === "flowchart")));
  assert.equal(ready.code, generatePythonForProject({ ...project, generationApproval: approved.approval }).code);
});

test("Python generation stays blocked without current approval", () => {
  const project = createEligibilityExample();
  const blocked = generatePythonForProject(project);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.code, "");
  assert.ok(blocked.diagnostics.some(({ code }) => code === "GEN_APPROVAL_REQUIRED"));
});

test("Python preserves truncation toward zero for integer division", () => {
  let project = createProject({ name: "Integer division" });
  project = updateSpecification(project, {
    ...project.specification,
    inputs: [{ id: "left", name: "left", type: "int", description: "" }, { id: "right", name: "right", type: "int", description: "" }],
    outputs: [{ id: "quotient", description: "Quotient" }],
    steps: [
      { id: "read-left", kind: "input", payload: { inputId: "left", prompt: "Left: " } },
      { id: "read-right", kind: "input", payload: { inputId: "right", prompt: "Right: " } },
      { id: "show-quotient", kind: "output", payload: { outputId: "quotient", mode: "expression", expression: "left / right" } },
    ],
  });
  project = updateFlowchartSemantics(project, {
    ...project.flowchart,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "input-left", kind: "input", payload: { symbolId: "graph-left", name: "left", type: "int", prompt: "Left: " } },
      { id: "input-right", kind: "input", payload: { symbolId: "graph-right", name: "right", type: "int", prompt: "Right: " } },
      { id: "output", kind: "output", payload: { outputId: "graph-quotient", mode: "expression", expression: "left / right" } },
      { id: "end", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start", to: "input-left" }, { id: "e2", from: "input-left", to: "input-right" },
      { id: "e3", from: "input-right", to: "output" }, { id: "e4", from: "output", to: "end" },
    ],
    layout: { positions: {}, zoom: 1 },
  });
  const approved = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  assert.ok(approved.approval, approved.diagnostics.map(({ message }) => message).join("\n"));
  const ready = generatePythonForProject({ ...project, generationApproval: approved.approval });
  assert.equal(ready.status, "ready");
  assert.match(ready.code, /def _maptocode_trunc_div\(a, b\):/);
  assert.match(ready.code, /print\(_maptocode_trunc_div\(left, right\)\)/);
});

test("Python generation explains names that would shadow generated built-ins", () => {
  const project = createEligibilityExample();
  project.specification.inputs[0].name = "print";
  project.specification.steps[0].payload.prompt = "Enter your age: ";
  project.specification.steps[1].payload.condition = "print >= 18";
  project.flowchart.nodes.find(({ kind }) => kind === "input").payload.name = "print";
  project.flowchart.nodes.find(({ kind }) => kind === "decision").payload.condition = "print >= 18";
  project.specification.revision += 1;
  project.flowchart.revision += 1;
  project.revisions.semantic += 1;
  const approved = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  assert.ok(approved.approval);
  const result = generatePythonForProject({ ...project, generationApproval: approved.approval });
  assert.equal(result.status, "blocked");
  assert.ok(result.diagnostics.some(({ message }) => message.includes("Python keyword or generated built-in")));
});

test("generation blocks a semantic conflict even when an earlier approval exists", () => {
  const project = projectWith();
  const { approval } = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  const changed = structuredClone(project);
  changed.flowchart.nodes.find(({ kind }) => kind === "output").payload.message = "Changed greeting";
  changed.flowchart.revision += 1;
  changed.revisions.semantic += 1;
  changed.generationApproval = approval;
  const result = generateCForProject(changed);
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "");
  assert.ok(result.diagnostics.some(({ code }) => code === "GEN_UNRESOLVED_CONFLICT"));
});

test("semantic edits make approval stale, while layout-only edits keep it fresh", () => {
  const original = projectWith();
  const { approval } = approveCurrentProject(original, { approvedAt: "2026-10-11T00:01:00.000Z" });
  const moved = structuredClone(original);
  moved.flowchart.layout.positions.output = { x: 500, y: 30 };
  moved.revisions.presentation += 1;
  assert.equal(generateCForProject({ ...moved, generationApproval: approval }).status, "ready");

  const edited = projectWith("A new greeting");
  edited.specification.revision += 1;
  edited.flowchart.nodes.find(({ kind }) => kind === "output").payload.message = "A new greeting";
  edited.flowchart.revision += 1;
  edited.revisions.semantic += 1;
  edited.generationApproval = approval;
  const stale = generateCForProject(edited);
  assert.equal(stale.status, "blocked");
  assert.ok(stale.diagnostics.some(({ code }) => code === "GEN_STALE_APPROVAL"));
});

test("C string output treats user text as data instead of a format string", () => {
  const project = projectWith('"); system("unsafe"); /*');
  const { approval } = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  const result = generateCForProject({ ...project, generationApproval: approval });
  assert.equal(result.status, "ready");
  assert.ok(result.code.includes(String.raw`printf("%s\n", `));
  assert.equal(result.code.split("\n").filter((line) => line.includes("printf")).length, 1);
});

test("generates C code for double and char variables accurately", () => {
  const specification = {
    schemaVersion: "1.0.0", revision: 0,
    inputs: [
      { id: "input-d", name: "rate", type: "double" },
      { id: "input-c", name: "grade", type: "char" },
    ],
    outputs: [{ id: "out-1", description: "Grade output" }],
    variables: [],
    steps: [
      { id: "step-1", kind: "input", payload: { inputId: "input-d", prompt: "Enter rate: " } },
      { id: "step-2", kind: "input", payload: { inputId: "input-c", prompt: "Enter grade: " } },
      { id: "step-3", kind: "output", payload: { outputId: "out-1", mode: "message", message: "Processed" } },
    ],
    constraints: [], examples: [],
  };
  const flowchart = {
    schemaVersion: "1.0.0", revision: 0,
    nodes: [
      { id: "start", kind: "start", payload: {} },
      { id: "in-1", kind: "input", payload: { symbolId: "input-d", name: "rate", type: "double", prompt: "Enter rate: " } },
      { id: "in-2", kind: "input", payload: { symbolId: "input-c", name: "grade", type: "char", prompt: "Enter grade: " } },
      { id: "out-1", kind: "output", payload: { outputId: "out-1", mode: "message", message: "Processed" } },
      { id: "end", kind: "end", payload: {} },
    ],
    edges: [
      { id: "e1", from: "start", to: "in-1" },
      { id: "e2", from: "in-1", to: "in-2" },
      { id: "e3", from: "in-2", to: "out-1" },
      { id: "e4", from: "out-1", to: "end" },
    ],
    layout: { positions: {}, zoom: 1 },
  };
  const project = {
    schemaVersion: "1.0.0",
    projectId: "5f0a5f3c-1d9a-4f99-a134-9194f0ae4124",
    name: "Types Test",
    specification,
    flowchart,
    decisions: [],
    revisions: { semantic: 0, presentation: 0 },
    createdAt: "2026-10-11T00:00:00.000Z",
    updatedAt: "2026-10-11T00:00:00.000Z",
  };
  const approved = approveCurrentProject(project, { approvedAt: "2026-10-11T00:01:00.000Z" });
  assert.ok(approved.approval, approved.diagnostics.map((d) => d.message).join("\n"));
  const ready = generateCForProject({ ...project, generationApproval: approved.approval });
  assert.equal(ready.status, "ready");
  assert.ok(ready.code.includes("double rate;"));
  assert.ok(ready.code.includes("char grade;"));
  assert.ok(ready.code.includes('scanf("%lf", &rate)'));
  assert.ok(ready.code.includes('scanf(" %c", &grade)'));
});
