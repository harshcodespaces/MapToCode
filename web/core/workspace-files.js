/**
 * Workspace File System Manager for MapToCode:
 * Handles per-project files, folders, tab state, resolution of file extensions,
 * and isolated local storage persistence so projects never bleed into each other.
 */

export const WORKSPACE_STORAGE_PREFIX = "maptocode:workspace:";

/**
 * Returns the localStorage key for a specific project's workspace state.
 * @param {string} projectId
 * @returns {string}
 */
export function getWorkspaceStorageKey(projectId) {
  return `${WORKSPACE_STORAGE_PREFIX}${projectId}:state`;
}

/**
 * Generates an empty workspace state without any folders or files.
 * Used when creating brand new blank projects.
 * @param {string} [projectId="default"]
 * @returns {{ files: Array, folders: Array, openTabs: string[], activeTab: string }}
 */
export function createEmptyProjectWorkspace(projectId = "default") {
  return {
    files: [],
    folders: [],
    openTabs: [],
    activeTab: "",
  };
}

/**
 * Generates default workspace files and folders for a project.
 * @param {object} project - ProjectEnvelope
 * @param {string} [defaultPseudocode=""] - Initial pseudocode content
 * @returns {{ files: Array, folders: Array, openTabs: string[], activeTab: string }}
 */
export function getDefaultProjectWorkspace(project, defaultPseudocode = "") {
  const name = project?.name || "Algorithm";
  const projectId = project?.projectId || "default";
  const psContent =
    defaultPseudocode ||
    `# Algorithm Specification for ${name}\nBEGIN\n    // Add your algorithm steps here\nEND\n`;

  const notesContent = `# ${name}\n\n## Project Workspace\n- Visual Flowchart: main.fc\n- Algorithm Specification: algorithm.ps\n- Target Language: Python\n\nAutomatically synchronized with your MapToCode workspace.\n`;

  return {
    files: [
      { id: `file-main-fc-${projectId}`, name: "main.fc", type: "fc" },
      { id: `file-algo-ps-${projectId}`, name: "algorithm.ps", type: "ps", content: psContent },
      { id: `file-notes-txt-${projectId}`, name: "notes.txt", type: "text", content: notesContent },
    ],
    folders: [
      { id: `folder-assets-${projectId}`, name: "assets", isOpen: true },
    ],
    openTabs: ["main.fc", "algorithm.ps", "notes.txt"],
    activeTab: "main.fc",
  };
}

/**
 * Safely loads workspace files and folder state for a project from storage.
 * If not found or invalid, returns empty workspace for new projects or template workspace for samples.
 * @param {Storage|object} storage
 * @param {object} project
 * @param {string} [defaultPseudocode=""]
 * @returns {{ files: Array, folders: Array, openTabs: string[], activeTab: string }}
 */
export function loadProjectWorkspace(storage, project, defaultPseudocode = "") {
  if (!project?.projectId) {
    return createEmptyProjectWorkspace(project?.projectId);
  }
  if (!storage || typeof storage.getItem !== "function") {
    return createEmptyProjectWorkspace(project.projectId);
  }

  try {
    const raw = storage.getItem(getWorkspaceStorageKey(project.projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.files) && Array.isArray(parsed?.folders)) {
        return {
          files: parsed.files,
          folders: parsed.folders,
          openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : [],
          activeTab: typeof parsed.activeTab === "string" ? parsed.activeTab : "",
        };
      }
    }
  } catch {}

  const sampleIds = new Set([
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000009",
  ]);
  if (sampleIds.has(project.projectId)) {
    return getDefaultProjectWorkspace(project, defaultPseudocode);
  }

  return createEmptyProjectWorkspace(project.projectId);
}

/**
 * Safely persists workspace state for a project to storage.
 * @param {Storage|object} storage
 * @param {string} projectId
 * @param {{ files: Array, folders: Array, openTabs: string[], activeTab: string }} state
 * @returns {boolean}
 */
export function saveProjectWorkspace(storage, projectId, state) {
  if (!storage || typeof storage.setItem !== "function" || !projectId) return false;
  try {
    storage.setItem(getWorkspaceStorageKey(projectId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a project's workspace state from storage.
 * @param {Storage|object} storage
 * @param {string} projectId
 * @returns {boolean}
 */
export function deleteProjectWorkspace(storage, projectId) {
  if (!storage || typeof storage.removeItem !== "function" || !projectId) return false;
  try {
    storage.removeItem(getWorkspaceStorageKey(projectId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely renames a file in workspace state.
 * Handles subfolder paths and tab synchronizations.
 * @param {{ files: Array, folders: Array, openTabs: string[], activeTab: string }} workspaceState
 * @param {string} fileId
 * @param {string} rawNewName
 * @returns {{ success: boolean, reason?: string, oldName?: string, newName?: string, workspace?: object }}
 */
export function renameFileInWorkspace(workspaceState, fileId, rawNewName) {
  const targetFile = workspaceState.files.find((f) => f.id === fileId);
  if (!targetFile) return { success: false, reason: "File not found" };

  const trimmed = (rawNewName || "").trim();
  if (!trimmed) return { success: false, reason: "Name cannot be empty" };

  // Determine parent folder if any
  const parentFolder = targetFile.folderId
    ? workspaceState.folders.find((f) => f.id === targetFile.folderId)
    : null;

  let newFullName = trimmed;
  if (parentFolder) {
    const prefix = `${parentFolder.name}/`;
    if (!trimmed.startsWith(prefix)) {
      newFullName = `${parentFolder.name}/${trimmed}`;
    }
  }

  // Check collision
  const collision = workspaceState.files.some(
    (f) => f.id !== fileId && f.name.toLowerCase() === newFullName.toLowerCase()
  );
  if (collision) {
    return { success: false, reason: `A file named "${newFullName}" already exists.` };
  }

  const oldName = targetFile.name;
  const updatedFiles = workspaceState.files.map((f) =>
    f.id === fileId ? { ...f, name: newFullName } : f
  );
  const updatedTabs = workspaceState.openTabs.map((t) => (t === oldName ? newFullName : t));
  const updatedActiveTab = workspaceState.activeTab === oldName ? newFullName : workspaceState.activeTab;

  return {
    success: true,
    oldName,
    newName: newFullName,
    workspace: {
      ...workspaceState,
      files: updatedFiles,
      openTabs: updatedTabs,
      activeTab: updatedActiveTab,
    },
  };
}

/**
 * Safely renames a folder in workspace state.
 * Updates folder name, all file paths inside that folder, and open tabs.
 * @param {{ files: Array, folders: Array, openTabs: string[], activeTab: string }} workspaceState
 * @param {string} folderId
 * @param {string} newFolderName
 * @returns {{ success: boolean, reason?: string, oldFolderName?: string, newFolderName?: string, workspace?: object }}
 */
export function renameFolderInWorkspace(workspaceState, folderId, newFolderName) {
  const targetFolder = workspaceState.folders.find((f) => f.id === folderId);
  if (!targetFolder) return { success: false, reason: "Folder not found" };

  const cleanName = (newFolderName || "").trim();
  if (!cleanName) return { success: false, reason: "Folder name cannot be empty" };

  const collision = workspaceState.folders.some(
    (f) => f.id !== folderId && f.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (collision) {
    return { success: false, reason: `A folder named "${cleanName}" already exists.` };
  }

  const oldFolderPrefix = `${targetFolder.name}/`;
  const newFolderPrefix = `${cleanName}/`;

  const updatedFolders = workspaceState.folders.map((f) =>
    f.id === folderId ? { ...f, name: cleanName } : f
  );

  const nameReplacements = new Map();
  const updatedFiles = workspaceState.files.map((f) => {
    if (f.folderId === folderId || f.name.startsWith(oldFolderPrefix)) {
      let updatedName = f.name;
      if (f.name.startsWith(oldFolderPrefix)) {
        updatedName = `${newFolderPrefix}${f.name.slice(oldFolderPrefix.length)}`;
      } else {
        updatedName = `${newFolderPrefix}${f.name}`;
      }
      nameReplacements.set(f.name, updatedName);
      return { ...f, name: updatedName };
    }
    return f;
  });

  const updatedTabs = workspaceState.openTabs.map((t) =>
    nameReplacements.has(t) ? nameReplacements.get(t) : t
  );
  const updatedActiveTab = nameReplacements.has(workspaceState.activeTab)
    ? nameReplacements.get(workspaceState.activeTab)
    : workspaceState.activeTab;

  return {
    success: true,
    oldFolderName: targetFolder.name,
    newFolderName: cleanName,
    workspace: {
      ...workspaceState,
      folders: updatedFolders,
      files: updatedFiles,
      openTabs: updatedTabs,
      activeTab: updatedActiveTab,
    },
  };
}

/**
 * Resolves a user-entered file name for the VS Code-style explorer:
 * - If no extension is specified (e.g. "notes" or "notes."), defaults to text file (.txt).
 * - If user specifies .ps, creates a .ps (pseudocode / algorithm specification) file.
 * - If user specifies .fc or .fs, creates a flowchart file (.fc / .fs).
 * - If user specifies other extensions (.py, .json, .md), preserves that extension.
 * - If folderName is supplied, prefixes the resulting path with folderName (e.g. "assets/notes.txt").
 *
 * @param {string} input - Raw user input from explorer
 * @param {string|null} [folderName] - Optional parent folder name
 * @returns {{ fileName: string, baseName: string, fileType: "fc" | "ps" | "text" } | null}
 */
export function resolveNewFileName(input, folderName = null) {
  const raw = (input || "").trim();
  if (!raw) return null;

  const lastDot = raw.lastIndexOf(".");
  let resolvedBase = raw;
  let fileType = "text";

  if (lastDot === -1 || lastDot === raw.length - 1) {
    const base = lastDot === -1 ? raw : raw.slice(0, lastDot);
    resolvedBase = `${base}.txt`;
    fileType = "text";
  } else {
    const ext = raw.slice(lastDot).toLowerCase();
    if (ext === ".ps") {
      resolvedBase = raw;
      fileType = "ps";
    } else if (ext === ".fc" || ext === ".fs") {
      resolvedBase = raw;
      fileType = "fc";
    } else {
      resolvedBase = raw;
      fileType = "text";
    }
  }

  const cleanFolder = (folderName || "").trim();
  const fileName = cleanFolder ? `${cleanFolder}/${resolvedBase}` : resolvedBase;

  return {
    fileName,
    baseName: resolvedBase,
    fileType,
  };
}
