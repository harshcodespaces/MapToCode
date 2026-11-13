"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import BrandMark from "@/components/common/BrandMark";
import FeedbackButton from "@/components/common/FeedbackButton";
import styles from "./page.module.css";

export interface SampleProject {
  key: string;
  icon: string;
  title: string;
  desc: string;
  meta: string;
  stepsA: string;
  stepsB: string;
}

const SAMPLE_PROJECTS: SampleProject[] = [
  {
    key: "even-odd",
    icon: "½",
    title: "Even or Odd Number",
    desc: "Read an integer n, use a decision to check whether n % 2 == 0, and display the result.",
    meta: "Input: n (int) · Remainder check · 2 branches",
    stepsA: "5 Steps: Spec → Flowchart → Reconcile → Validate → Generate Code",
    stepsB: "6 Steps: Flowchart → Explain & Learn → Spec → Reconcile → Validate → Generate Code",
  },
  {
    key: "largest",
    icon: "↕",
    title: "Largest of Two Numbers",
    desc: "Compare two numbers, branching to report which is greater or if both values are equal.",
    meta: "Two inputs · Nested decisions · 3 outcomes",
    stepsA: "5 Steps: Spec → Flowchart → Reconcile → Validate → Generate Code",
    stepsB: "6 Steps: Flowchart → Explain & Learn → Spec → Reconcile → Validate → Generate Code",
  },
  {
    key: "eligibility",
    icon: "✓",
    title: "Voting Eligibility",
    desc: "Prompt the user for their age, verify if age >= 18, and display voting eligibility.",
    meta: "Single input · Age condition · True/False",
    stepsA: "5 Steps: Spec → Flowchart → Reconcile → Validate → Generate Code",
    stepsB: "6 Steps: Flowchart → Explain & Learn → Spec → Reconcile → Validate → Generate Code",
  },
  {
    key: "grade",
    icon: "A",
    title: "Calculate a Grade",
    desc: "Evaluate a numerical student score through standard grade cutoffs to determine letter grade.",
    meta: "Score input · Threshold logic · Grade display",
    stepsA: "5 Steps: Spec → Flowchart → Reconcile → Validate → Generate Code",
    stepsB: "6 Steps: Flowchart → Explain & Learn → Spec → Reconcile → Validate → Generate Code",
  },
];

function SunIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function SampleIcon({ name }: { name: string }): React.JSX.Element {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "even-odd":
      return (
        <svg {...common}>
          <path d="M12 3l8 9-8 9-8-9z" />
        </svg>
      );
    case "largest":
      return (
        <svg {...common}>
          <path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4" />
        </svg>
      );
    case "eligibility":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l3 3 5-6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M5 20v-8M12 20V5M19 20v-11" />
        </svg>
      );
  }
}

export default function Home(): React.JSX.Element {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [targetLang, setTargetLang] = useState<"python" | "c">("python");
  const [previewWorkflow, setPreviewWorkflow] = useState<"logic" | "flowchart">("logic");
  const [sampleModalTarget, setSampleModalTarget] = useState<SampleProject | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = (localStorage.getItem("maptocode-theme") as "light" | "dark") || "light";
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("maptocode-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <div className={styles.page}>
      {/* Top Navigation */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <BrandMark className={styles.brandIcon} />
            <span className={styles.brandText}>MapToCode</span>
          </Link>

          <nav className={styles.nav} aria-label="Main Navigation">
            <Link href="/" className={`${styles.navLink} ${styles.navActive}`}>
              Home
            </Link>
            <a href="#workflows" className={styles.navLink}>
              Workflows
            </a>
            <a href="#examples" className={styles.navLink}>
              Examples
            </a>
            <a href="#learn" className={styles.navLink}>
              Learn
            </a>
            <a href="#about" className={styles.navLink}>
              About
            </a>
          </nav>

          <div className={styles.headerRight}>
            {/* Theme Toggle Capsule */}
            <button
              type="button"
              className={styles.themeToggle}
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title="Toggle theme"
            >
              <span className={`${styles.themeOption} ${theme === "light" ? styles.themeOptionActive : ""}`}>
                <SunIcon />
              </span>
              <span className={`${styles.themeOption} ${theme === "dark" ? styles.themeOptionActive : ""}`}>
                <MoonIcon />
              </span>
            </button>

            {/* Open Workspace CTA Button */}
            <Link href="/workspace" className={styles.openWorkspaceNavBtn}>
              Open Workspace
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroGrid}>
          {/* Left Hero Content */}
          <div className={styles.heroLeft}>
            <h1 className={styles.heroTitle}>
              Turn Your<br />
              Algorithm into a<br />
              <span className={styles.amberText}>Flowchart</span> and{" "}
              <span className={styles.greenText}>
                {targetLang === "c" ? "C Code" : "Python Code"}
              </span>
            </h1>

            <p className={styles.heroSubtitle}>
              Write your algorithm step by step, create a flowchart for the same logic,
              validate both, and get clean {targetLang === "c" ? "C" : "Python"} code — all in one place.
            </p>

            {/* Language Pill Switcher */}
            <div className={styles.languagePillRow}>
              <span className={styles.languageLabel}>Target Language:</span>
              <button
                type="button"
                className={`${styles.langPill} ${targetLang === "c" ? styles.langPillActive : ""}`}
                onClick={() => setTargetLang("c")}
              >
                C Code
              </button>
              <button
                type="button"
                className={`${styles.langPill} ${targetLang === "python" ? styles.langPillActive : ""}`}
                onClick={() => setTargetLang("python")}
              >
                Python Code
              </button>
            </div>

            {/* CTA Buttons */}
            <div className={styles.ctaRow}>
              <Link href="/workspace?new=1" className={styles.primaryCta}>
                Create Your Project
                <span className={styles.arrowIcon} aria-hidden="true">→</span>
              </Link>
              <a href="#examples" className={styles.secondaryCta}>
                <span className={styles.docIcon} aria-hidden="true">📋</span>
                Sample Projects
              </a>
            </div>

            {/* 3 Feature Badges */}
            <div className={styles.featureCardsRow}>
              <div className={styles.featureCard}>
                <div className={styles.featureIconBadge}>🎓</div>
                <div className={styles.featureText}>
                  <strong>Learn by Doing</strong>
                  <p>Perfect for students and beginners.</p>
                </div>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIconBadge}>🔀</div>
                <div className={styles.featureText}>
                  <strong>See the Logic Clearly</strong>
                  <p>Create flowcharts with drag and drop.</p>
                </div>
              </div>

              <div className={styles.featureCard}>
                <div className={styles.featureIconBadge}>&lt;/&gt;</div>
                <div className={styles.featureText}>
                  <strong>Get Clean {targetLang === "c" ? "C" : "Python"} Code</strong>
                  <p>Only when everything is correct and supported.</p>
                </div>
              </div>
            </div>

            {/* How It Works Trail with Workflow Toggle */}
            <div className={styles.howItWorksTrail}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h2 className={styles.howItWorksHeading} style={{ margin: 0 }}>
                  How It Works: {previewWorkflow === "logic" ? "Option A (Logic First)" : "Option B (Flowchart First)"}
                </h2>
                <div className={styles.languagePillRow} style={{ margin: 0 }}>
                  <button
                    type="button"
                    className={`${styles.langPill} ${previewWorkflow === "logic" ? styles.langPillActive : ""}`}
                    onClick={() => setPreviewWorkflow("logic")}
                  >
                    Option A (5 Steps)
                  </button>
                  <button
                    type="button"
                    className={`${styles.langPill} ${previewWorkflow === "flowchart" ? styles.langPillActive : ""}`}
                    onClick={() => setPreviewWorkflow("flowchart")}
                  >
                    Option B (6 Steps)
                  </button>
                </div>
              </div>

              {previewWorkflow === "logic" ? (
                <div className={styles.stepTrail}>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>1</span>
                    <span className={styles.trailLabel}>Describe Algorithm</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>2</span>
                    <span className={styles.trailLabel}>Draw Flowchart</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>3</span>
                    <span className={styles.trailLabel}>Check &amp; Compare</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>4</span>
                    <span className={styles.trailLabel}>Validate</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>5</span>
                    <span className={styles.trailLabel}>Generate {targetLang === "c" ? "C" : "Python"}</span>
                  </div>
                </div>
              ) : (
                <div className={styles.stepTrail}>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>1</span>
                    <span className={styles.trailLabel}>Draw Flowchart</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>2</span>
                    <span className={styles.trailLabel}>Explain &amp; Learn</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>3</span>
                    <span className={styles.trailLabel}>Author Algorithm</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>4</span>
                    <span className={styles.trailLabel}>Check &amp; Compare</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>5</span>
                    <span className={styles.trailLabel}>Validate</span>
                  </div>
                  <span className={styles.trailArrow}>→</span>
                  <div className={styles.trailStep}>
                    <span className={styles.trailNum}>6</span>
                    <span className={styles.trailLabel}>Generate {targetLang === "c" ? "C" : "Python"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Hero Illustrated Cards Scene */}
          <div className={styles.heroRight}>
            <div className={styles.mockupScene}>
              {/* Card 1: Algorithm */}
              <div className={styles.cardAlgorithm}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardHeaderIcon}>📋</span>
                  <span>Algorithm</span>
                </div>
                <ol className={styles.algoList}>
                  <li><span>1.</span> Read n</li>
                  <li><span>2.</span> If n % 2 == 0</li>
                  <li className={styles.algoIndent}><span>3.</span> Print Even</li>
                  <li><span>4.</span> Else Print Odd</li>
                </ol>
              </div>

              {/* Card 2: Flowchart */}
              <div className={styles.cardFlowchart}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardHeaderIcon}>🔀</span>
                  <span>Flowchart</span>
                </div>
                <div className={styles.flowDiagram}>
                  {/* Start pill */}
                  <div className={styles.flowNodeStart}>Start</div>
                  <div className={styles.flowArrowDown}>↓</div>
                  {/* Read n parallelogram */}
                  <div className={styles.flowNodeInput}>Read n</div>
                  <div className={styles.flowArrowDown}>↓</div>
                  {/* Decision diamond */}
                  <div className={styles.flowNodeDecision}>
                    <span>n % 2 == 0 ?</span>
                  </div>
                  {/* Branches */}
                  <div className={styles.flowBranches}>
                    <div className={styles.flowBranch}>
                      <span className={styles.branchTagYes}>Yes</span>
                      <div className={styles.flowNodeProcess}>{'Print "Even"'}</div>
                    </div>
                    <div className={styles.flowBranch}>
                      <span className={styles.branchTagNo}>No</span>
                      <div className={styles.flowNodeProcess}>{'Print "Odd"'}</div>
                    </div>
                  </div>
                  <div className={styles.flowArrowDown}>↓</div>
                  {/* End pill */}
                  <div className={styles.flowNodeEnd}>End</div>
                </div>
              </div>

              {/* Card 3: Code Card */}
              <div className={styles.cardCode}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardHeaderIcon}>💻</span>
                  <span>{targetLang === "c" ? "C Code" : "Python Code"}</span>
                </div>
                <pre className={styles.codeSnippet}>
                  {targetLang === "c"
                    ? `#include <stdio.h>\n\nint main() {\n  int n;\n  scanf("%d", &n);\n  if (n % 2 == 0) {\n    printf("Even\\n");\n  } else {\n    printf("Odd\\n");\n  }\n  return 0;\n}`
                    : `n = int(input("Enter number: "))\nif n % 2 == 0:\n    print("Even")\nelse:\n    print("Odd")`}
                </pre>
              </div>

              {/* Foreground Smiling Student Developer SVG */}
              <div className={styles.characterContainer}>
                <svg viewBox="0 0 240 240" className={styles.characterSvg} aria-label="Smiling student programmer sitting at laptop">
                  {/* Desk surface */}
                  <rect x="20" y="195" width="200" height="8" rx="4" fill="#D5C5B0" />
                  
                  {/* Laptop base and screen */}
                  <polygon points="65,195 145,195 155,192 55,192" fill="#3D4B43" />
                  <rect x="75" y="142" width="70" height="50" rx="3" fill="#24332A" />
                  <rect x="80" y="147" width="60" height="40" rx="2" fill="#E6EDE8" />
                  {/* Code lines on screen */}
                  <rect x="85" y="153" width="22" height="3" rx="1" fill="#C9742B" />
                  <rect x="85" y="160" width="38" height="3" rx="1" fill="#1E3D31" />
                  <rect x="91" y="167" width="26" height="3" rx="1" fill="#1E3D31" />
                  <rect x="85" y="174" width="30" height="3" rx="1" fill="#C9742B" />
                  {/* Laptop Apple/circle logo */}
                  <circle cx="110" cy="167" r="4" fill="#D2DDD5" opacity="0.4" />

                  {/* Character Body / Green Sweater */}
                  <path d="M110 135 C85 135 70 160 65 210 L175 210 C170 160 155 135 130 135 Z" fill="#225942" />
                  {/* Collar */}
                  <path d="M110 135 L120 150 L130 135 Z" fill="#FAF7F2" />

                  {/* Arms typing on laptop */}
                  <path d="M78 175 Q95 178 110 188" stroke="#E5A672" strokeWidth="10" strokeLinecap="round" fill="none" />
                  <path d="M162 175 Q145 178 130 188" stroke="#E5A672" strokeWidth="10" strokeLinecap="round" fill="none" />

                  {/* Neck */}
                  <rect x="113" y="118" width="14" height="20" rx="5" fill="#E5A672" />

                  {/* Head */}
                  <circle cx="120" cy="98" r="26" fill="#F4BA86" />

                  {/* Hair */}
                  <path d="M96 95 C94 72 108 62 128 62 C146 62 150 75 148 95 C142 82 136 78 120 80 C108 81 100 88 96 95 Z" fill="#4A2F1B" />
                  {/* Hair tuft */}
                  <path d="M120 62 Q130 52 140 60 Q130 64 120 62" fill="#4A2F1B" />

                  {/* Friendly smiling face */}
                  <circle cx="111" cy="96" r="3" fill="#2D2218" />
                  <circle cx="129" cy="96" r="3" fill="#2D2218" />
                  {/* Eyebrows */}
                  <path d="M107 90 Q112 87 116 90" stroke="#4A2F1B" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                  <path d="M124 90 Q128 87 133 90" stroke="#4A2F1B" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                  {/* Nose */}
                  <path d="M120 98 Q122 102 119 104" stroke="#D39768" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                  {/* Cheerful Smile */}
                  <path d="M112 107 Q120 116 128 107" stroke="#9E3B28" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  {/* Rosy cheeks */}
                  <circle cx="106" cy="103" r="3.5" fill="#EE907C" opacity="0.45" />
                  <circle cx="134" cy="103" r="3.5" fill="#EE907C" opacity="0.45" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two Starting Workflows Cards Section */}
      <section className={styles.workflowsSection} id="workflows">
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionKicker}>CHOOSE YOUR STARTING WORKFLOW</span>
            <h2 className={styles.sectionTitle}>Two Ways to Build Your Algorithm</h2>
            <p className={styles.sectionDesc}>
              Pick the approach that matches your thinking style. Whether you write first or draw first,
              MapToCode independently verifies both representations and generates clean restricted code.
            </p>
          </div>

          <div className={styles.workflowCardsGrid}>
            {/* Option A — Describe My Logic */}
            <article className={`${styles.workflowChoiceCard} ${styles.cardOptionA}`}>
              <div className={styles.workflowCardTop}>
                <span className={styles.workflowOptionBadgeGreen}>Option A</span>
                <span className={styles.stepCountBadge}>5 Steps</span>
              </div>
              <h3 className={styles.workflowCardTitle}>Option A — Describe My Logic</h3>
              <p className={styles.workflowCardSubtitle}>
                &ldquo;Write what your algorithm should do, step by step.&rdquo;
              </p>
              <div className={styles.workflowStepsListTitle}>Workflow:</div>
              <ol className={styles.workflowNumberedSteps}>
                <li>
                  <span className={styles.stepIndex}>1</span>
                  <span>Describe the algorithm using a structured specification.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>2</span>
                  <span>Create a flowchart representing the same logic.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>3</span>
                  <span>Compare the two representations.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>4</span>
                  <span>Validate the inputs and resolve errors.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>5</span>
                  <span>Approve the current valid revision and generate restricted C code.</span>
                </li>
              </ol>
              <Link href="/workspace?workflow=logic&new=1" className={styles.workflowCardActionGreen}>
                Start Option A: Describe My Logic →
              </Link>
            </article>

            {/* Option B — Draw My Flowchart */}
            <article className={`${styles.workflowChoiceCard} ${styles.cardOptionB}`}>
              <div className={styles.workflowCardTop}>
                <span className={styles.workflowOptionBadgeAmber}>Option B</span>
                <span className={styles.stepCountBadge}>6 Steps</span>
              </div>
              <h3 className={styles.workflowCardTitle}>Option B — Draw My Flowchart</h3>
              <p className={styles.workflowCardSubtitleAmber}>
                &ldquo;Build your algorithm visually, then understand how it works.&rdquo;
              </p>
              <div className={styles.workflowStepsListTitle}>Workflow:</div>
              <ol className={styles.workflowNumberedSteps}>
                <li>
                  <span className={styles.stepIndex}>1</span>
                  <span>Create a flowchart using drag-and-drop blocks.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>2</span>
                  <span>Explain the flowchart in simple English and show readable pseudocode as a learning aid.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>3</span>
                  <span>Let the user create, complete, or review the separate structured algorithm specification.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>4</span>
                  <span>Compare the independently authored specification with the flowchart.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>5</span>
                  <span>Validate both representations and resolve any errors.</span>
                </li>
                <li>
                  <span className={styles.stepIndex}>6</span>
                  <span>Require current approval and generate restricted C code when every required condition passes.</span>
                </li>
              </ol>
              <Link href="/workspace?workflow=flowchart&new=1" className={styles.workflowCardActionAmber}>
                Start Option B: Draw My Flowchart →
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* Examples Section */}
      <section className={styles.section} id="examples">
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionKicker}>CURATED FOR LEARNERS</span>
            <h2 className={styles.sectionTitle}>Interactive Example Projects</h2>
            <p className={styles.sectionDesc}>
              Each project includes a written algorithm and a matching flowchart ready to explore in either
              workflow, compare, and convert to clean code.
            </p>
          </div>

          <div className={styles.sampleGrid}>
            {SAMPLE_PROJECTS.map((sample) => (
              <article className={styles.sampleCard} key={sample.key}>
                <div className={styles.sampleCardHeader}>
                  <div className={styles.sampleIconBox}>
                    <SampleIcon name={sample.key} />
                  </div>
                  <div className={styles.sampleCardHeaderInfo}>
                    <h3>{sample.title}</h3>
                    <span className={styles.sampleMetaBadge}>{sample.meta}</span>
                  </div>
                </div>
                <p className={styles.sampleDesc}>{sample.desc}</p>
                <div className={styles.sampleWorkflowActions}>
                  <button
                    type="button"
                    className={styles.useSampleBtn}
                    onClick={() => setSampleModalTarget(sample)}
                  >
                    <span>Use this example</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Learn Section */}
      <section className={styles.learnSection} id="learn">
        <div className={styles.sectionContainer}>
          <div className={styles.learnBox}>
            <div className={styles.learnIcon}>💡</div>
            <div className={styles.learnText}>
              <span className={styles.sectionKicker}>BEGINNER FRIENDLY</span>
              <h2>Start with the idea, not the syntax.</h2>
              <p>
                Programming starts with algorithmic thinking. In MapToCode, you describe what you want
                to happen first. Then you construct the visual flowchart. Our reconciliation engine
                checks both representations to ensure your logic is sound before code is generated.
              </p>
            </div>
            <Link href="/workspace?new=1" className={styles.learnButton}>
              Open Workspace →
            </Link>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className={styles.section} id="about">
        <div className={styles.sectionContainer}>
          <div className={styles.aboutGrid}>
            <div>
              <span className={styles.sectionKicker}>PRODUCT PROMISE</span>
              <h2 className={styles.aboutHeading}>Local, Private &amp; Pedagogical</h2>
              <p className={styles.aboutParagraph}>
                MapToCode runs 100% inside your web browser. No code is executed on a remote server,
                no telemetry tracks your learning, and your projects stay securely saved in your browser’s
                local storage.
              </p>
            </div>
            <div className={styles.aboutPoints}>
              <div className={styles.point}>
                <span className={styles.pointCheck}>✓</span>
                <div>
                  <strong>No Account Required</strong>
                  <p>Start drafting algorithms instantly with zero sign-up friction.</p>
                </div>
              </div>
              <div className={styles.point}>
                <span className={styles.pointCheck}>✓</span>
                <div>
                  <strong>Bi-directional Verification</strong>
                  <p>We compare your written steps with the flowchart to flag discrepancies.</p>
                </div>
              </div>
              <div className={styles.point}>
                <span className={styles.pointCheck}>✓</span>
                <div>
                  <strong>Export &amp; Download</strong>
                  <p>Export JSON backups or download production-ready Python and C code files.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <BrandMark />
            <span>MapToCode</span>
          </div>
          <p className={styles.footerNote}>
            Turn your algorithm into a flowchart and code. Free and open for computer science learners.
          </p>
          <div className={styles.footerLinks}>
            <Link href="/">Home</Link>
            <Link href="/workspace">Workspace</Link>
            <a href="#examples">Examples</a>
            <a href="#learn">Learn</a>
          </div>
        </div>
      </footer>

      {/* Workflow Choice Modal for Selected Sample Project */}
      {sampleModalTarget && (
        <div className={styles.modalOverlay} onClick={() => setSampleModalTarget(null)}>
          <div className={styles.workflowModalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.modalKicker}>Choose Your Starting Workflow</span>
                <h3 className={styles.modalTitle}>{sampleModalTarget.title}</h3>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSampleModalTarget(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className={styles.modalSubtitle}>
              How would you like to explore this algorithm? Choose your preferred starting workflow:
            </p>
            <div className={styles.modalWorkflowChoices}>
              <div className={`${styles.modalChoiceCard} ${styles.modalChoiceCardA}`}>
                <div className={styles.choiceHeader}>
                  <span className={styles.choiceBadgeA}>Option A</span>
                  <h4>Describe My Logic</h4>
                </div>
                <p className={styles.choiceDesc}>
                  Write what your algorithm should do, step by step. Perfect if you prefer thinking in written instructions first.
                </p>
                <div className={styles.choiceStepsListPills}>
                  <span className={styles.stepMiniPill}>1. Specification</span>
                  <span className={styles.stepMiniPill}>2. Flowchart</span>
                  <span className={styles.stepMiniPill}>3. Reconcile</span>
                  <span className={styles.stepMiniPill}>4. Validate</span>
                  <span className={styles.stepMiniPill}>5. Generate C</span>
                </div>
                <Link
                  href={`/workspace?sample=${sampleModalTarget.key}&workflow=logic`}
                  className={styles.choiceBtnA}
                  onClick={() => setSampleModalTarget(null)}
                >
                  Start Option A (Logic First) →
                </Link>
              </div>

              <div className={`${styles.modalChoiceCard} ${styles.modalChoiceCardB}`}>
                <div className={styles.choiceHeader}>
                  <span className={styles.choiceBadgeB}>Option B</span>
                  <h4>Draw My Flowchart</h4>
                </div>
                <p className={styles.choiceDesc}>
                  Build your algorithm visually, then understand how it works with learning pseudocode and plain-English explanations.
                </p>
                <div className={styles.choiceStepsListPills}>
                  <span className={styles.stepMiniPill}>1. Flowchart</span>
                  <span className={styles.stepMiniPill}>2. Explain &amp; Learn</span>
                  <span className={styles.stepMiniPill}>3. Specification</span>
                  <span className={styles.stepMiniPill}>4. Reconcile</span>
                  <span className={styles.stepMiniPill}>5. Validate</span>
                  <span className={styles.stepMiniPill}>6. Generate C</span>
                </div>
                <Link
                  href={`/workspace?sample=${sampleModalTarget.key}&workflow=flowchart`}
                  className={styles.choiceBtnB}
                  onClick={() => setSampleModalTarget(null)}
                >
                  Start Option B (Flowchart First) →
                </Link>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                onClick={() => setSampleModalTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <FeedbackButton />
    </div>
  );
}