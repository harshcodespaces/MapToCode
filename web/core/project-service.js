import { validateProjectContract } from "./contract-validation.js";

export const PROJECT_STORE_VERSION = "1.0.0";
export const PROJECT_STORAGE_KEY = "maptocode:m1:projects:v1";
const PROJECT_SCHEMA_VERSION = "1.0.0";
const MAX_PROJECT_JSON_BYTES = 1_000_000;

export class ProjectStoreError extends Error {
  constructor(message, diagnostics = []) {
    super(message);
    this.name = "ProjectStoreError";
    this.diagnostics = diagnostics;
  }
}

export function sanitizeProject(project) {
  if (project && typeof project === "object") {
    if (project.generationApproval === null) {
      delete project.generationApproval;
    }
  }
  return project;
}

function assertValidProject(project) {
  sanitizeProject(project);
  const diagnostics = validateProjectContract(project);
  if (diagnostics.length) throw new ProjectStoreError("This project has an unsupported or damaged structure.", diagnostics);
  return project;
}

function readProjects(storage) {
  let raw;
  try {
    raw = storage.getItem(PROJECT_STORAGE_KEY);
  } catch {
    throw new ProjectStoreError("Browser storage could not be read. Check this browser’s site storage settings.");
  }
  if (raw == null) return [];
  if (new TextEncoder().encode(raw).length > MAX_PROJECT_JSON_BYTES * 10) {
    throw new ProjectStoreError("The local project list is too large to safely open.");
  }
  let projects;
  try {
    projects = JSON.parse(raw);
  } catch {
    throw new ProjectStoreError("The saved project list is damaged. Exported project backups may still be opened separately.");
  }
  if (!Array.isArray(projects)) throw new ProjectStoreError("The saved project list has an unsupported format.");
  const ids = new Set();
  const validProjects = [];
  for (const project of projects) {
    try {
      sanitizeProject(project);
      assertValidProject(project);
      if (!ids.has(project.projectId)) {
        ids.add(project.projectId);
        validProjects.push(project);
      }
    } catch {
      // Ignore damaged or incompatible draft so the user is never locked out of the workspace
    }
  }
  return validProjects;
}

function generateUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // fallback
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createProject({ name = "Untitled algorithm", projectId = generateUuid(), now = new Date().toISOString() } = {}) {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId,
    name: String(name).trim().slice(0, 120) || "Untitled algorithm",
    specification: {
      schemaVersion: PROJECT_SCHEMA_VERSION, revision: 0,
      inputs: [], outputs: [], variables: [], steps: [], constraints: [], examples: [],
    },
    flowchart: {
      schemaVersion: PROJECT_SCHEMA_VERSION, revision: 0,
      nodes: [
        { id: "start", kind: "start", payload: {} },
        { id: "end", kind: "end", payload: {} },
      ],
      edges: [
        { id: "edge-start-end", from: "start", to: "end" },
      ],
      layout: {
        positions: {
          start: { x: 380, y: 60 },
          end: { x: 380, y: 320 },
        },
        zoom: 1,
      },
    },
    decisions: [],
    revisions: { semantic: 0, presentation: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSpecification(project, specification, now = new Date().toISOString()) {
  const next = {
    ...project,
    specification: { ...specification, schemaVersion: PROJECT_SCHEMA_VERSION, revision: project.specification.revision + 1 },
    revisions: { ...project.revisions, semantic: project.revisions.semantic + 1 },
    updatedAt: now,
  };
  return next;
}

export function updateFlowchartSemantics(project, flowchart, now = new Date().toISOString()) {
  return {
    ...project,
    flowchart: { ...flowchart, schemaVersion: PROJECT_SCHEMA_VERSION, revision: project.flowchart.revision + 1 },
    revisions: { ...project.revisions, semantic: project.revisions.semantic + 1 },
    updatedAt: now,
  };
}

export function updateFlowchartPresentation(project, layout, now = new Date().toISOString()) {
  return {
    ...project,
    flowchart: { ...project.flowchart, layout },
    revisions: { ...project.revisions, presentation: project.revisions.presentation + 1 },
    updatedAt: now,
  };
}

export function renameProject(project, name, now = new Date().toISOString()) {
  const trimmed = String(name).trim();
  if (!trimmed) throw new ProjectStoreError("A project needs a name.");
  return {
    ...project,
    name: trimmed.slice(0, 120),
    revisions: { ...project.revisions, presentation: project.revisions.presentation + 1 },
    updatedAt: now,
  };
}

export function setProjectApproval(project, generationApproval, now = new Date().toISOString()) {
  return { ...project, generationApproval, updatedAt: now };
}

export function getStaleDecisionIds(project) {
  return project.decisions.filter((decision) => (
    decision.specificationRevision !== project.specification.revision
    || decision.flowchartRevision !== project.flowchart.revision
  )).map((decision) => decision.findingId);
}

export function exportProjectJson(project) {
  assertValidProject(project);
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function importProjectJson(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_PROJECT_JSON_BYTES) {
    throw new ProjectStoreError("Choose a project backup smaller than 1 MB.");
  }
  let project;
  try {
    project = JSON.parse(text);
  } catch {
    throw new ProjectStoreError("This file is not valid JSON.");
  }
  assertValidProject(project);
  return project;
}

export function createProjectStore(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("Project storage needs getItem and setItem methods.");
  }

  function write(projects) {
    try {
      storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
    } catch {
      throw new ProjectStoreError("Browser storage is full or unavailable. Export a JSON backup to keep your work.");
    }
  }

  return {
    list() {
      return readProjects(storage).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    load(projectId) {
      const project = readProjects(storage).find((item) => item.projectId === projectId);
      if (!project) throw new ProjectStoreError("That project is not in this browser’s saved list.");
      return project;
    },
    save(project) {
      assertValidProject(project);
      const projects = readProjects(storage);
      const index = projects.findIndex((item) => item.projectId === project.projectId);
      const next = [...projects];
      if (index === -1) next.push(project);
      else next[index] = project;
      write(next);
      return project;
    },
    delete(projectId) {
      const projects = readProjects(storage);
      const next = projects.filter((item) => item.projectId !== projectId);
      if (next.length === projects.length) return false;
      write(next);
      return true;
    },
    import(text) {
      return this.save(importProjectJson(text));
    },
    export(projectId) {
      return exportProjectJson(this.load(projectId));
    },
  };
}
