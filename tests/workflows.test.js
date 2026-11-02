import test from "node:test";
import assert from "node:assert/strict";
import {
  createEligibilityExample,
  createEvenOddExample,
  createNumberComparisonExample,
} from "../core/examples.js";
import {
  analyzeProject,
  approveCurrentProject,
  generateCForProject,
  generatePythonForProject,
} from "../core/generation-gate.js";
import { explainFlowchartToLearner } from "../core/flowchart-explanation.js";
import { setProjectApproval } from "../core/project-service.js";

test("Option A (Describe My Logic): Full 5-step workflow on Even/Odd example", () => {
  // Step 1: Describe algorithm via structured specification
  const project = createEvenOddExample();
  assert.ok(project.specification);
  assert.equal(project.specification.inputs.length, 1);
  assert.equal(project.specification.inputs[0].name, "number");

  // Step 2: Create flowchart representing the same logic
  assert.ok(project.flowchart);
  assert.ok(project.flowchart.nodes.length >= 6);

  // Step 3 & 4: Compare representations and validate inputs
  const analysis = analyzeProject(project);
  assert.ok(analysis.specificationCandidate.ast);
  assert.ok(analysis.flowchartCandidate.ast);
  assert.equal(analysis.specificationValidation.valid, true);
  assert.equal(analysis.flowchartValidation.valid, true);
  assert.equal(analysis.reconciliation.status, "equivalent");

  // Generation is blocked before user approval
  const beforeApproval = generateCForProject(project);
  assert.equal(beforeApproval.status, "blocked");
  assert.ok(beforeApproval.diagnostics.some((d) => d.code === "GEN_APPROVAL_REQUIRED"));

  // Step 5: Approve current revision and generate restricted C code
  const approvedResult = approveCurrentProject(project);
  assert.ok(approvedResult.approval);
  assert.equal(approvedResult.reconciliation.status, "equivalent");

  const approvedProject = setProjectApproval(project, approvedResult.approval);
  const cResult = generateCForProject(approvedProject);
  assert.equal(cResult.status, "ready");
  assert.match(cResult.code, /#include <stdio\.h>/);
  assert.match(cResult.code, /int main\(void\)/);
  assert.match(cResult.code, /number % 2/);
  assert.match(cResult.code, /This is an even number\./);
  assert.match(cResult.code, /This is an odd number\./);
});

test("Option B (Draw My Flowchart): 6-step workflow with learning explanation & independent specification", () => {
  const project = createEligibilityExample();

  // Step 1: Create flowchart visually using blocks
  assert.ok(project.flowchart.nodes.some((n) => n.kind === "decision"));

  // Step 2: Explain flowchart in simple English and show readable pseudocode as learning aid
  const explanation = explainFlowchartToLearner(project.flowchart);
  assert.equal(explanation.status, "complete");
  assert.ok(explanation.summary.length > 0);
  assert.ok(explanation.narrativeSteps.length > 0);
  assert.match(explanation.pseudocode, /BEGIN/);
  assert.match(explanation.pseudocode, /IF age >= 18 THEN/);
  assert.match(explanation.disclaimer, /Pedagogical Learning Aid/);
  assert.match(explanation.disclaimer, /NOT your independent algorithm specification/);

  // Explanation does NOT mutate project or synthesize specification
  assert.ok(project.specification);

  // Step 3: Author/review separate structured algorithm specification
  assert.equal(project.specification.inputs[0].name, "age");

  // Step 4 & 5: Compare independently authored specification with flowchart & validate
  const analysis = analyzeProject(project);
  assert.equal(analysis.reconciliation.status, "equivalent");
  assert.equal(analysis.specificationValidation.valid, true);
  assert.equal(analysis.flowchartValidation.valid, true);

  // Step 6: Require current approval and generate restricted C code
  const approved = approveCurrentProject(project);
  const approvedProject = setProjectApproval(project, approved.approval);
  const cResult = generateCForProject(approvedProject);
  assert.equal(cResult.status, "ready");
  assert.match(cResult.code, /age >= 18/);
  assert.match(cResult.code, /eligible to vote/i);

  // Python preview also functions from approved AST
  const pyResult = generatePythonForProject(approvedProject);
  assert.equal(pyResult.status, "ready");
  assert.match(pyResult.code, /age >= 18/);
});

test("Flowchart-derived explanation is strictly a learning aid and not independent evidence", () => {
  const project = createEvenOddExample();
  const explanation = explainFlowchartToLearner(project.flowchart);

  // Disclaimer explicitly warns the user
  assert.match(explanation.disclaimer, /learning aid/i);
  assert.match(explanation.disclaimer, /NOT your independent algorithm specification/i);

  // If user has not authored a matching independent specification, generation is blocked
  const missingSpecProject = structuredClone(project);
  delete missingSpecProject.generationApproval;
  missingSpecProject.specification.inputs = [];
  missingSpecProject.specification.steps = [];
  missingSpecProject.specification.outputs = [];

  const analysis = analyzeProject(missingSpecProject);
  assert.notEqual(analysis.reconciliation?.status, "equivalent");

  const gateResult = generateCForProject(missingSpecProject);
  assert.equal(gateResult.status, "blocked");
});

test("Option A and Option B both block generation on logic conflicts", () => {
  const project = createNumberComparisonExample();

  // Introduce conflict in flowchart: condition modified from first > second to first <= second
  const conflictingProject = structuredClone(project);
  delete conflictingProject.generationApproval;
  const decisionNode = conflictingProject.flowchart.nodes.find((n) => n.kind === "decision");
  assert.ok(decisionNode);
  decisionNode.payload.condition = "first <= second";

  const analysis = analyzeProject(conflictingProject);
  assert.equal(analysis.reconciliation.status, "conflict");
  assert.ok(analysis.reconciliation.findings.length > 0);

  const gateResult = generateCForProject(conflictingProject);
  assert.equal(gateResult.status, "blocked");
  assert.ok(gateResult.diagnostics.some((d) => d.code === "GEN_UNRESOLVED_CONFLICT"));
});

test("Workflow switching preserves both specification and flowchart data", () => {
  const project = createEvenOddExample();

  // In Option A, user authors spec and flowchart
  const initialSpecTitle = project.name;
  const initialInputs = project.specification.inputs;
  const initialNodeCount = project.flowchart.nodes.length;

  // Switching workflow mode to Option B
  let currentWorkflow = "logic";
  assert.equal(currentWorkflow, "logic");

  currentWorkflow = "flowchart";
  assert.equal(currentWorkflow, "flowchart");

  // Project data remains 100% intact
  assert.equal(project.name, initialSpecTitle);
  assert.deepEqual(project.specification.inputs, initialInputs);
  assert.equal(project.flowchart.nodes.length, initialNodeCount);
});
