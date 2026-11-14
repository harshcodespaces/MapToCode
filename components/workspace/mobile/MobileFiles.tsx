"use client";

import React, { useMemo, useState } from "react";
import styles from "./MobileWorkspace.module.css";

interface MobileExplorerFile {
  id: string;
  name: string;
  type: "fc" | "ps" | "text";
  content?: string;
  folderId?: string | null;
}

interface MobileExplorerFolder {
  id: string;
  name: string;
  isOpen: boolean;
}

interface MobileFilesProps {
  files: MobileExplorerFile[];
  folders: MobileExplorerFolder[];
  activeTab: string;
  onOpenFile: (fileName: string) => void;
  onToggleFolder: (folderId: string) => void;
  onNewFile?: () => void;
  onNewFolder?: () => void;
}

function getFileIcon(type: MobileExplorerFile["type"]): React.ReactNode {
  if (type === "fc") {
    return (
      <span className={styles.mobileFileIcon} aria-hidden="true">
        ◇
      </span>
    );
  }

  if (type === "ps") {
    return (
      <span className={styles.mobileFileIcon} aria-hidden="true">
        ≡
      </span>
    );
  }

  return (
    <span className={styles.mobileFileIcon} aria-hidden="true">
      A
    </span>
  );
}

function getFileTypeLabel(type: MobileExplorerFile["type"]): string {
  if (type === "fc") return "Flowchart";
  if (type === "ps") return "Pseudocode";
  return "Text";
}

export default function MobileFiles({
  files,
  folders,
  activeTab,
  onOpenFile,
  onToggleFolder,
  onNewFile,
  onNewFolder,
}: MobileFilesProps): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [showNewMenu, setShowNewMenu] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredFiles = useMemo(() => {
    if (!normalizedSearch) return files;

    return files.filter((file) => {
      return (
        file.name.toLowerCase().includes(normalizedSearch) ||
        getFileTypeLabel(file.type).toLowerCase().includes(normalizedSearch)
      );
    });
  }, [files, normalizedSearch]);

  const rootFiles = filteredFiles.filter(
    (file) => !file.folderId
  );

  const getFolderFiles = (folderId: string) =>
    filteredFiles.filter((file) => file.folderId === folderId);

  return (
    <div className={styles.mobileFiles}>
      {/* Search */}
      <div className={styles.mobileFilesSearch}>
        <span className={styles.mobileFilesSearchIcon} aria-hidden="true">
          ⌕
        </span>

        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search files"
          aria-label="Search files"
        />

        {search ? (
          <button
            type="button"
            className={styles.mobileFilesClear}
            onClick={() => setSearch("")}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>

      {/* Project files */}
      <div className={styles.mobileFilesList}>
        {folders.map((folder) => {
          const folderFiles = getFolderFiles(folder.id);

          if (
            normalizedSearch &&
            folderFiles.length === 0 &&
            !folder.name.toLowerCase().includes(normalizedSearch)
          ) {
            return null;
          }

          return (
            <div key={folder.id} className={styles.mobileFolderGroup}>
              <button
                type="button"
                className={styles.mobileFolderRow}
                onClick={() => onToggleFolder(folder.id)}
              >
                <span
                  className={styles.mobileFolderChevron}
                  aria-hidden="true"
                >
                  {folder.isOpen ? "⌄" : "›"}
                </span>

                <span className={styles.mobileFolderIcon} aria-hidden="true">
                  {folder.isOpen ? "📂" : "📁"}
                </span>

                <span className={styles.mobileFolderName}>
                  {folder.name}
                </span>

                <span className={styles.mobileItemCount}>
                  {folderFiles.length}
                </span>
              </button>

              {folder.isOpen && folderFiles.length > 0 ? (
                <div className={styles.mobileFolderChildren}>
                  {folderFiles.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      className={`${styles.mobileFileRow} ${
                        activeTab === file.name
                          ? styles.mobileFileRowActive
                          : ""
                      }`}
                      onClick={() => onOpenFile(file.name)}
                    >
                      <span className={styles.mobileFileIndent} />

                      {getFileIcon(file.type)}

                      <span className={styles.mobileFileInfo}>
                        <span className={styles.mobileFileName}>
                          {file.name.split("/").pop()}
                        </span>

                        <span className={styles.mobileFileType}>
                          {getFileTypeLabel(file.type)}
                        </span>
                      </span>

                      {activeTab === file.name ? (
                        <span
                          className={styles.mobileActiveDot}
                          aria-label="Currently open"
                        />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {rootFiles.length > 0 ? (
          <div className={styles.mobileRootFiles}>
            {rootFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                className={`${styles.mobileFileRow} ${
                  activeTab === file.name
                    ? styles.mobileFileRowActive
                    : ""
                }`}
                onClick={() => onOpenFile(file.name)}
              >
                {getFileIcon(file.type)}

                <span className={styles.mobileFileInfo}>
                  <span className={styles.mobileFileName}>
                    {file.name.split("/").pop()}
                  </span>

                  <span className={styles.mobileFileType}>
                    {getFileTypeLabel(file.type)}
                  </span>
                </span>

                {activeTab === file.name ? (
                  <span
                    className={styles.mobileActiveDot}
                    aria-label="Currently open"
                  />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {filteredFiles.length === 0 ? (
          <div className={styles.mobileFilesEmpty}>
            <div className={styles.mobileFilesEmptyIcon}>⌕</div>
            <h3>No files found</h3>
            <p>
              {search
                ? `Nothing matches "${search}".`
                : "This project does not have any files yet."}
            </p>
          </div>
        ) : null}
      </div>

      {/* New item button */}
      {(onNewFile || onNewFolder) && (
        <div className={styles.mobileFilesActions}>
          <button
            type="button"
            className={styles.mobileNewButton}
            onClick={() => setShowNewMenu((value) => !value)}
          >
            <span aria-hidden="true">＋</span>
            <span>New</span>
          </button>

          {showNewMenu ? (
            <div className={styles.mobileNewMenu}>
              {onNewFile ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMenu(false);
                    onNewFile();
                  }}
                >
                  <span>📄</span>
                  <span>New file</span>
                </button>
              ) : null}

              {onNewFolder ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMenu(false);
                    onNewFolder();
                  }}
                >
                  <span>📁</span>
                  <span>New folder</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}