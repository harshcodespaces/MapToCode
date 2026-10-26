import test from "node:test";
import assert from "node:assert/strict";
import {
  createEligibilityExample,
  createEvenOddExample,
  createGradeExample,
  createNumberComparisonExample,
} from "../core/examples.js";
import { adaptFlowchartToAst, adaptSpecificationToAst } from "../core/adapters.js";
import { reconcileAstCandidates } from "../core/reconciliation.js";
import { generatePythonForProject, generateCForProject } from "../core/generation-gate.js";
import { deriveSpecificationFromFlowchart, syncProjectSpecification } from "../core/reconciliation-sync.js";

test("deriveSpecificationFromFlowchart produces equivalent specifications for all sample projects", () => {
  const examples = [
    createEvenOddExample(),
    createNumberComparisonExample(),
    createEligibilityExample(),
    createGradeExample(),
  ];

  for (const project of examples) {
    const derivedSpec = deriveSpecificationFromFlowchart(project.flowchart, project.specification);
    assert.ok(derivedSpec, `Derived spec should exist for ${project.name}`);

    const specCand = adaptSpecificationToAst(derivedSpec);
    const flowCand = adaptFlowchartToAst(project.flowchart);
    assert.equal(specCand.valid, true, `Spec candidate must be valid for ${project.name}`);
    assert.equal(flowCand.valid, true, `Flow candidate must be valid for ${project.name}`);

    const recon = reconcileAstCandidates(specCand, flowCand);
    assert.equal(
      recon.status,
      "equivalent",
      `Derived specification for "${project.name}" must reconcile as equivalent to its flowchart (got ${recon.status}, diffs: ${JSON.stringify(recon.findings)})`
    );
  }
});

test("syncProjectSpecification resolves flowchart conflict and unlocks code generation", () => {
  // Start with even-odd example and mutate flowchart condition to introduce a conflict
  const project = createEvenOddExample();
  const decision = project.flowchart.nodes.find((n) => n.kind === "decision");
  assert.ok(decision);
  decision.payload.condition = "number > 50";

  // Before sync: conflict exists and generation is blocked
  const beforeCandSpec = adaptSpecificationToAst(project.specification);
  const beforeCandFlow = adaptFlowchartToAst(project.flowchart);
  const beforeRecon = reconcileAstCandidates(beforeCandSpec, beforeCandFlow);
  assert.equal(beforeRecon.status, "conflict");

  // Sync specification to match flowchart
  const syncedProject = syncProjectSpecification(project);
  assert.ok(syncedProject.generationApproval, "Synced project should be automatically approved");

  // Code generation is now ready and unlocked
  const pyResult = generatePythonForProject(syncedProject);
  assert.equal(pyResult.status, "ready");
  assert.match(pyResult.code, /number > 50/);

  const cResult = generateCForProject(syncedProject);
  assert.equal(cResult.status, "ready");
  assert.match(cResult.code, /number > 50/);
});
