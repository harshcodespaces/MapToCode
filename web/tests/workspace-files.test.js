import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveNewFileName,
  getWorkspaceStorageKey,
  createEmptyProjectWorkspace,
  getDefaultProjectWorkspace,
  loadProjectWorkspace,
  saveProjectWorkspace,
  deleteProjectWorkspace,
  renameFileInWorkspace,
  renameFolderInWorkspace,
} from "../core/workspace-files.js";

function createMockStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
}

test("defaults to .txt text file when no extension is specified", () => {
  const result = resolveNewFileName("notes");
  assert.deepEqual(result, {
    fileName: "notes.txt",
    baseName: "notes.txt",
    fileType: "text",
  });
});

test("defaults to .txt text file when name ends with dot", () => {
  const result = resolveNewFileName("my_document.");
  assert.deepEqual(result, {
    fileName: "my_document.txt",
    baseName: "my_document.txt",
    fileType: "text",
  });
});

test("preserves .ps extension and identifies pseudocode specification", () => {
  const result = resolveNewFileName("algorithm.ps");
  assert.deepEqual(result, {
    fileName: "algorithm.ps",
    baseName: "algorithm.ps",
    fileType: "ps",
  });
});

test("preserves .fc extension and identifies flowchart file", () => {
  const result = resolveNewFileName("subflow.fc");
  assert.deepEqual(result, {
    fileName: "subflow.fc",
    baseName: "subflow.fc",
    fileType: "fc",
  });
});

test("preserves .fs extension and identifies flowchart file", () => {
  const result = resolveNewFileName("logic.fs");
  assert.deepEqual(result, {
    fileName: "logic.fs",
    baseName: "logic.fs",
    fileType: "fc",
  });
});

test("preserves explicit .txt extension", () => {
  const result = resolveNewFileName("readme.txt");
  assert.deepEqual(result, {
    fileName: "readme.txt",
    baseName: "readme.txt",
    fileType: "text",
  });
});

test("preserves code extensions like .py, .json, and .md as text files", () => {
  assert.deepEqual(resolveNewFileName("solution.py"), {
    fileName: "solution.py",
    baseName: "solution.py",
    fileType: "text",
  });
  assert.deepEqual(resolveNewFileName("config.json"), {
    fileName: "config.json",
    baseName: "config.json",
    fileType: "text",
  });
  assert.deepEqual(resolveNewFileName("notes.md"), {
    fileName: "notes.md",
    baseName: "notes.md",
    fileType: "text",
  });
});

test("creates a file inside a folder with relative folder prefix", () => {
  // Inside folder "assets", without extension -> assets/helper.txt
  assert.deepEqual(resolveNewFileName("helper", "assets"), {
    fileName: "assets/helper.txt",
    baseName: "helper.txt",
    fileType: "text",
  });

  // Inside folder "src", with .ps -> src/calc.ps
  assert.deepEqual(resolveNewFileName("calc.ps", "src"), {
    fileName: "src/calc.ps",
    baseName: "calc.ps",
    fileType: "ps",
  });

  // Inside folder "diagrams", with .fc -> diagrams/subflow.fc
  assert.deepEqual(resolveNewFileName("subflow.fc", "diagrams"), {
    fileName: "diagrams/subflow.fc",
    baseName: "subflow.fc",
    fileType: "fc",
  });
});

test("returns null for empty or whitespace-only inputs", () => {
  assert.equal(resolveNewFileName(""), null);
  assert.equal(resolveNewFileName("   "), null);
  assert.equal(resolveNewFileName(null), null);
});

test("generates default project workspace files with isolated IDs", () => {
  const proj = { projectId: "proj-123", name: "Grade Calculator" };
  const ws = getDefaultProjectWorkspace(proj, "BEGIN\n    OUTPUT 'Passed'\nEND");
  assert.equal(ws.files.length, 3);
  assert.equal(ws.files[0].name, "main.fc");
  assert.equal(ws.files[1].name, "algorithm.ps");
  assert.match(ws.files[1].content, /Passed/);
  assert.equal(ws.files[2].name, "notes.txt");
  assert.equal(ws.folders.length, 1);
  assert.equal(ws.folders[0].name, "assets");
  assert.deepEqual(ws.openTabs, ["main.fc", "algorithm.ps", "notes.txt"]);
  assert.equal(ws.activeTab, "main.fc");
});

test("persists, isolates, and loads workspace files per projectId", () => {
  const storage = createMockStorage();
  const projA = { projectId: "proj-aaa", name: "Project Alpha" };
  const projB = { projectId: "proj-bbb", name: "Project Beta" };

  const wsA = getDefaultProjectWorkspace(projA);
  wsA.files.push({ id: "file-custom-a", name: "alpha_notes.txt", type: "text", content: "Alpha info" });
  wsA.folders.push({ id: "folder-alpha", name: "src", isOpen: true });

  const wsB = getDefaultProjectWorkspace(projB);
  wsB.files.push({ id: "file-custom-b", name: "beta_code.py", type: "text", content: "print('Beta')" });

  // Save both projects
  saveProjectWorkspace(storage, projA.projectId, wsA);
  saveProjectWorkspace(storage, projB.projectId, wsB);

  // Load project A
  const loadedA = loadProjectWorkspace(storage, projA);
  assert.equal(loadedA.files.some((f) => f.name === "alpha_notes.txt"), true);
  assert.equal(loadedA.files.some((f) => f.name === "beta_code.py"), false);
  assert.equal(loadedA.folders.some((f) => f.name === "src"), true);

  // Load project B
  const loadedB = loadProjectWorkspace(storage, projB);
  assert.equal(loadedB.files.some((f) => f.name === "beta_code.py"), true);
  assert.equal(loadedB.files.some((f) => f.name === "alpha_notes.txt"), false);
  assert.equal(loadedB.folders.some((f) => f.name === "src"), false);

  // Deleting Project A cleans up its workspace key without affecting B
  deleteProjectWorkspace(storage, projA.projectId);
  const reloadedA = loadProjectWorkspace(storage, projA);
  // Default workspace is loaded instead of custom alpha files
  assert.equal(reloadedA.files.some((f) => f.name === "alpha_notes.txt"), false);
  // B remains intact
  const reloadedB = loadProjectWorkspace(storage, projB);
  assert.equal(reloadedB.files.some((f) => f.name === "beta_code.py"), true);
});

test("renameFileInWorkspace correctly handles root files and subfolder files", () => {
  const ws = {
    files: [
      { id: "f1", name: "main.fc", type: "fc" },
      { id: "f2", name: "assets/image.png", type: "text", folderId: "fold-1" },
      { id: "f3", name: "notes.txt", type: "text" },
    ],
    folders: [{ id: "fold-1", name: "assets", isOpen: true }],
    openTabs: ["main.fc", "assets/image.png"],
    activeTab: "assets/image.png",
  };

  // Renaming root file
  const rootRes = renameFileInWorkspace(ws, "f3", "documentation.txt");
  assert.equal(rootRes.success, true);
  assert.equal(rootRes.newName, "documentation.txt");
  assert.equal(rootRes.workspace.files.find((f) => f.id === "f3").name, "documentation.txt");

  // Renaming subfolder file preserves folder prefix
  const subRes = renameFileInWorkspace(ws, "f2", "diagram.png");
  assert.equal(subRes.success, true);
  assert.equal(subRes.newName, "assets/diagram.png");
  assert.deepEqual(subRes.workspace.openTabs, ["main.fc", "assets/diagram.png"]);
  assert.equal(subRes.workspace.activeTab, "assets/diagram.png");

  // Collision fails safely
  const colRes = renameFileInWorkspace(ws, "f3", "main.fc");
  assert.equal(colRes.success, false);
  assert.match(colRes.reason, /already exists/);
});

test("renameFolderInWorkspace updates folder name, file paths, and open tabs", () => {
  const ws = {
    files: [
      { id: "f1", name: "main.fc", type: "fc" },
      { id: "f2", name: "assets/notes.txt", type: "text", folderId: "fold-1" },
      { id: "f3", name: "assets/config.json", type: "text", folderId: "fold-1" },
    ],
    folders: [{ id: "fold-1", name: "assets", isOpen: true }],
    openTabs: ["main.fc", "assets/notes.txt"],
    activeTab: "assets/notes.txt",
  };

  const res = renameFolderInWorkspace(ws, "fold-1", "docs");
  assert.equal(res.success, true);
  assert.equal(res.oldFolderName, "assets");
  assert.equal(res.newFolderName, "docs");

  const updatedFolder = res.workspace.folders.find((f) => f.id === "fold-1");
  assert.equal(updatedFolder.name, "docs");

  const updatedFile2 = res.workspace.files.find((f) => f.id === "f2");
  assert.equal(updatedFile2.name, "docs/notes.txt");

  const updatedFile3 = res.workspace.files.find((f) => f.id === "f3");
  assert.equal(updatedFile3.name, "docs/config.json");

  assert.deepEqual(res.workspace.openTabs, ["main.fc", "docs/notes.txt"]);
  assert.equal(res.workspace.activeTab, "docs/notes.txt");
});

test("creates clean empty workspace for new projects without any file or folder", () => {
  const ws = createEmptyProjectWorkspace("new-proj-id");
  assert.deepEqual(ws, {
    files: [],
    folders: [],
    openTabs: [],
    activeTab: "",
  });
});

test("loads empty workspace for brand new unsaved project", () => {
  const storage = createMockStorage();
  const newProj = { projectId: "custom-user-proj-1", name: "My New Algorithm" };
  const loaded = loadProjectWorkspace(storage, newProj);
  assert.deepEqual(loaded, {
    files: [],
    folders: [],
    openTabs: [],
    activeTab: "",
  });
});
