import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject, createProjectStore, exportProjectJson, getStaleDecisionIds,
  importProjectJson, renameProject, updateFlowchartPresentation, updateSpecification,
} from "../core/project-service.js";
import { validateProjectContract } from "../core/contract-validation.js";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

const id = "5f0a5f3c-1d9a-4f99-a134-9194f0ae4123";

test("new local projects are versioned, independently editable drafts", () => {
  const project = createProject({ projectId: id, now: "2026-10-11T00:00:00.000Z" });
  assert.deepEqual(validateProjectContract(project), []);
  assert.equal(project.specification.revision, 0);
  assert.equal(project.flowchart.revision, 0);

  const withSpec = updateSpecification(project, project.specification, "2026-10-11T00:01:00.000Z");
  assert.equal(withSpec.specification.revision, 1);
  assert.equal(withSpec.revisions.semantic, 1);

  const presentation = updateFlowchartPresentation(withSpec, { positions: {}, zoom: 0.8 }, "2026-10-11T00:02:00.000Z");
  assert.equal(presentation.flowchart.revision, 0);
  assert.equal(presentation.revisions.semantic, 1);
  assert.equal(presentation.revisions.presentation, 1);
});

test("browser-local save, list, load, export, import, and delete round-trip a draft", () => {
  const storage = new MemoryStorage();
  const store = createProjectStore(storage);
  const project = createProject({ projectId: id, name: "Draft" });
  store.save(project);
  assert.equal(store.load(id).name, "Draft");
  assert.equal(store.list().length, 1);

  const json = store.export(id);
  assert.deepEqual(importProjectJson(json), project);
  assert.deepEqual(store.import(json), project);
  assert.equal(store.delete(id), true);
  assert.equal(store.list().length, 0);
  assert.equal(store.delete(id), false);
});

test("project import rejects unknown fields, unsupported versions, and broken edge references", () => {
  const base = createProject({ projectId: id });
  assert.throws(() => importProjectJson(JSON.stringify({ ...base, cloudSync: true })), /unsupported or damaged/);
  assert.throws(() => importProjectJson(JSON.stringify({ ...base, schemaVersion: "9.0.0" })), /unsupported or damaged/);
  const broken = structuredClone(base);
  broken.flowchart.nodes = [{ id: "start", kind: "start", payload: {} }];
  broken.flowchart.edges = [{ id: "edge", from: "start", to: "missing" }];
  assert.throws(() => importProjectJson(JSON.stringify(broken)), /unsupported or damaged/);
});

test("semantic edits advance source revisions and make old decisions stale", () => {
  const project = createProject({ projectId: id });
  const withDecision = { ...project, decisions: [{ findingId: "finding-a", specificationRevision: 0, flowchartRevision: 0, choice: "reviewed" }] };
  const edited = updateSpecification(withDecision, { ...project.specification, steps: [] });
  assert.equal(edited.revisions.semantic, 1);
  assert.equal(edited.specification.revision, 1);
  assert.deepEqual(getStaleDecisionIds(edited), ["finding-a"]);
  assert.equal(edited.generationApproval, undefined);
});

test("renaming is presentation-only and JSON export preserves approval metadata", () => {
  const project = createProject({ projectId: id });
  const approval = {
    projectId: id, semanticRevision: 0, specificationRevision: 0, flowchartRevision: 0,
    canonicalAstFingerprint: "[]", adapterVersion: "1.0.0", canonicalizerVersion: "1.0.0",
    validatorVersion: "1.0.0", generatorVersion: "1.0.0", approvedAt: "2026-10-11T00:00:00.000Z",
  };
  const renamed = renameProject({ ...project, generationApproval: approval }, "Renamed");
  assert.equal(renamed.revisions.semantic, 0);
  assert.equal(renamed.revisions.presentation, 1);
  assert.deepEqual(importProjectJson(exportProjectJson(renamed)), renamed);
});

test("in-progress variable name edits can be saved as drafts without damaged structure error", () => {
  const storage = new MemoryStorage();
  const store = createProjectStore(storage);
  const project = createProject({ projectId: id, name: "Draft With In-Progress Var" });

  // User clears variable name or is in the middle of typing
  const draftProject = updateSpecification(project, {
    ...project.specification,
    inputs: [{ id: "input-1", name: "", type: "int", description: "" }],
  });

  // Project contract envelope is valid (no schema violation, valid draft)
  assert.deepEqual(validateProjectContract(draftProject), []);

  // Save draft round-trips safely without throwing "This project has an unsupported or damaged structure."
  assert.doesNotThrow(() => store.save(draftProject));
  assert.equal(store.load(id).specification.inputs[0].name, "");
});

test("newly created projects initialize with connected start and end nodes", () => {
  const project = createProject({ name: "Clean Blank Project" });
  assert.deepEqual(validateProjectContract(project), []);
  assert.equal(project.flowchart.nodes.length, 2);
  assert.equal(project.flowchart.nodes[0].kind, "start");
  assert.equal(project.flowchart.nodes[1].kind, "end");
  assert.equal(project.flowchart.edges.length, 1);
  assert.equal(project.flowchart.edges[0].from, project.flowchart.nodes[0].id);
  assert.equal(project.flowchart.edges[0].to, project.flowchart.nodes[1].id);
});

test("generationApproval: null from backend responses is sanitized without damaging structure", () => {
  const storage = new MemoryStorage();
  const store = createProjectStore(storage);
  const project = createProject({ projectId: id, name: "Backend Project" });
  project.generationApproval = null;

  // assertDoesNotThrow when saving project containing generationApproval: null
  assert.doesNotThrow(() => store.save(project));
  const loaded = store.load(id);
  assert.equal(loaded.generationApproval, undefined);

  // importing json with generationApproval: null does not throw
  const jsonWithNull = JSON.stringify({ ...project, generationApproval: null });
  assert.doesNotThrow(() => importProjectJson(jsonWithNull));
});


