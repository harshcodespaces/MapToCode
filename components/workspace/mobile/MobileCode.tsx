"use client";

import React from "react";
import styles from "./MobileWorkspace.module.css";

type CodeLanguage = "python" | "c" | "java";

interface MobileCodeProps {
  code: Record<CodeLanguage, string>;
  language: CodeLanguage;
  onLanguageChange: (language: CodeLanguage) => void;
  fileName?: string;
  onCopy?: () => void;
}

const languageInfo: Record<
  CodeLanguage,
  { label: string; icon: string }
> = {
  python: { label: "Python", icon: "🐍" },
  c: { label: "C", icon: "C" },
  java: { label: "Java", icon: "☕" },
};

export default function MobileCode({
  code,
  language,
  onLanguageChange,
  fileName,
  onCopy,
}: MobileCodeProps): React.JSX.Element {
  const currentCode = code[language] || "";

  return (
    <div className={styles.mobileCode}>
      {/* Language selector */}
      <div className={styles.mobileCodeToolbar}>
        <div className={styles.mobileCodeLanguages}>
          {(Object.keys(languageInfo) as CodeLanguage[]).map((item) => {
            const active = item === language;

            return (
              <button
                key={item}
                type="button"
                className={`${styles.mobileCodeLanguage} ${
                  active ? styles.mobileCodeLanguageActive : ""
                }`}
                onClick={() => onLanguageChange(item)}
              >
                <span aria-hidden="true">
                  {languageInfo[item].icon}
                </span>
                <span>{languageInfo[item].label}</span>
              </button>
            );
          })}
        </div>

        {onCopy ? (
          <button
            type="button"
            className={styles.mobileCodeCopy}
            onClick={onCopy}
            aria-label="Copy code"
          >
            <span aria-hidden="true">⧉</span>
            <span>Copy</span>
          </button>
        ) : null}
      </div>

      {/* File information */}
      <div className={styles.mobileCodeFileBar}>
        <span className={styles.mobileCodeFileIcon} aria-hidden="true">
          &lt;/&gt;
        </span>

        <span className={styles.mobileCodeFileName}>
          {fileName || "main"}
        </span>

        <span className={styles.mobileCodeLanguageLabel}>
          {languageInfo[language].label}
        </span>
      </div>

      {/* Code */}
      <div className={styles.mobileCodeEditor}>
        <pre>
          <code>{currentCode}</code>
        </pre>
      </div>
    </div>
  );
}