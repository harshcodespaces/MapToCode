import test from "node:test";
import assert from "node:assert/strict";
import { explainFlowchartToLearner } from "../core/flowchart-explanation.js";
import {
  createEligibilityExample,
  createEvenOddExample,
  createNumberComparisonExample,
} from "../core/examples.js";

test("explains the Even or Odd flowchart in simple English and produces learning pseudocode", () => {
  const project = createEvenOddExample();
  const explanation = explainFlowchartToLearner(project.flowchart);

  assert.equal(explanation.status, "complete");
  assert.match(explanation.summary, /takes input for "number"/i);
  assert.match(explanation.summary, /branches based on checking "number % 2 == 0"/);
  assert.match(explanation.summary, /displays "This is an even number." \/ "This is an odd number."/);

  // Check narrative steps
  assert.ok(explanation.narrativeSteps.length >= 4);
  assert.ok(explanation.narrativeSteps.some((s) => s.text.includes("Ask the user to enter number (int)")));
  assert.ok(explanation.narrativeSteps.some((s) => s.text.includes('Check decision: Is "number % 2 == 0"?')));

  // Check pseudocode
  assert.match(explanation.pseudocode, /BEGIN/);
  assert.match(explanation.pseudocode, /INPUT number/);
  assert.match(explanation.pseudocode, /IF number % 2 == 0 THEN/);
  assert.match(explanation.pseudocode, /OUTPUT "This is an even number."/);
  assert.match(explanation.pseudocode, /ELSE/);
  assert.match(explanation.pseudocode, /OUTPUT "This is an odd number."/);
  assert.match(explanation.pseudocode, /END IF/);
  assert.match(explanation.pseudocode, /END/);

  // Check pedagogical disclaimer
  assert.match(explanation.disclaimer, /Pedagogical Learning Aid/);
  assert.match(explanation.disclaimer, /NOT your independent algorithm specification/);
});

test("explains the Voting Eligibility flowchart with age threshold condition", () => {
  const project = createEligibilityExample();
  const explanation = explainFlowchartToLearner(project.flowchart);

  assert.equal(explanation.status, "complete");
  assert.match(explanation.summary, /takes input for "age"/);
  assert.match(explanation.summary, /age >= 18/);
  assert.match(explanation.pseudocode, /IF age >= 18 THEN/);
});

test("explains the Number Comparison flowchart with branching", () => {
  const project = createNumberComparisonExample();
  const explanation = explainFlowchartToLearner(project.flowchart);

  assert.equal(explanation.status, "complete");
  assert.equal(explanation.inputs.length, 2);
  assert.equal(explanation.inputs[0].name, "first");
  assert.equal(explanation.inputs[1].name, "second");
  assert.match(explanation.pseudocode, /INPUT first/);
  assert.match(explanation.pseudocode, /INPUT second/);
  assert.match(explanation.pseudocode, /IF first > second THEN/);
});

test("handles empty or incomplete flowcharts gracefully", () => {
  const emptyResult = explainFlowchartToLearner({ nodes: [], edges: [] });
  assert.equal(emptyResult.status, "empty");
  assert.match(emptyResult.summary, /canvas is currently empty/i);

  const missingStartResult = explainFlowchartToLearner({
    nodes: [{ id: "end", kind: "end", payload: {} }],
    edges: [],
  });
  assert.equal(missingStartResult.status, "incomplete");
  assert.match(missingStartResult.summary, /missing a Start block/i);
});

test("does not mutate the flowchart or project specification", () => {
  const project = createEvenOddExample();
  const originalFlowchartJson = JSON.stringify(project.flowchart);
  const originalSpecJson = JSON.stringify(project.specification);

  explainFlowchartToLearner(project.flowchart);

  assert.equal(JSON.stringify(project.flowchart), originalFlowchartJson);
  assert.equal(JSON.stringify(project.specification), originalSpecJson);
});
