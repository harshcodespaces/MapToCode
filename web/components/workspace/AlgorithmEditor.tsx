import React from "react";
import type {
  AlgorithmSpecification,
  SpecificationStep,
  SpecificationDeclaration,
} from "@/types/contracts";

export interface AlgorithmEditorProps {
  specification: AlgorithmSpecification;
  onChange: (updater: (prev: AlgorithmSpecification) => AlgorithmSpecification) => void;
  styles: Record<string, string>;
}

const uid = (): string =>
  globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export function updateStepList(
  steps: SpecificationStep[],
  stepId: string,
  updater: (step: SpecificationStep) => SpecificationStep
): SpecificationStep[] {
  return steps.map((step) => {
    if (step.id === stepId) return updater(step);
    if (step.kind !== "conditional") return step;
    return {
      ...step,
      payload: {
        ...step.payload,
        whenTrue: updateStepList(step.payload.whenTrue, stepId, updater),
        whenFalse: updateStepList(step.payload.whenFalse, stepId, updater),
      },
    };
  });
}

export function removeStepById(steps: SpecificationStep[], stepId: string): SpecificationStep[] {
  return steps
    .filter((step) => step.id !== stepId)
    .map((step) =>
      step.kind === "conditional"
        ? {
            ...step,
            payload: {
              ...step.payload,
              whenTrue: removeStepById(step.payload.whenTrue, stepId),
              whenFalse: removeStepById(step.payload.whenFalse, stepId),
            },
          }
        : step
    );
}

export function moveStep(steps: SpecificationStep[], index: number, direction: number): SpecificationStep[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= steps.length) return steps;
  const copy = [...steps];
  const [removed] = copy.splice(index, 1);
  copy.splice(targetIndex, 0, removed);
  return copy;
}

export function formatSpecStep(step: SpecificationStep, spec: AlgorithmSpecification): string {
  if (step.kind === "input") {
    const input = spec.inputs.find((i) => i.id === step.payload.inputId);
    const name = input?.name || "variable";
    const type = input?.type || "int";
    const prompt = step.payload.prompt ? `with prompt "${step.payload.prompt}"` : "";
    return `Read input ${name} (${type}) ${prompt}`.trim();
  }
  if (step.kind === "declaration") {
    const v = spec.variables.find((item) => item.id === step.payload.symbolId);
    return `Declare variable ${v?.name || step.payload.symbolId || "result"} (${v?.type || "int"})`;
  }
  if (step.kind === "assignment") {
    const target = [...spec.inputs, ...spec.variables].find((item) => item.id === step.payload.targetId);
    return `Set ${target?.name || "variable"} = ${step.payload.expression || "0"}`;
  }
  if (step.kind === "output") {
    if (step.payload.mode === "formatted") return `Display "${step.payload.message}" and ${step.payload.expression}`;
    if (step.payload.mode === "message") {
      return `Display message "${step.payload.message || ""}"`;
    }
    return `Display value of ${step.payload.expression || ""}`;
  }
  if (step.kind === "conditional") {
    return `If ${step.payload.condition || "condition"}`;
  }
  return (step as SpecificationStep).kind;
}

export function renderAlgoStepsPreview(
  steps: SpecificationStep[],
  spec: AlgorithmSpecification,
  depth = 0
): React.ReactNode {
  if (!steps || steps.length === 0) {
    return <li style={{ color: "var(--muted)" }}>No steps defined yet.</li>;
  }
  return steps.map((step, idx) => (
    <li key={step.id} style={{ paddingLeft: `${depth * 16}px`, marginBottom: "4px" }}>
      {depth === 0 ? `${idx + 1}. ` : "• "}
      {formatSpecStep(step, spec)}
      {step.kind === "conditional" && (
        <ul style={{ listStyle: "none", paddingLeft: "16px", marginTop: "4px" }}>
          <li style={{ color: "#2E8555", fontWeight: 600 }}>
            ✓ True:
            <ul style={{ listStyle: "none", paddingLeft: "12px", marginTop: "2px" }}>
              {renderAlgoStepsPreview(step.payload.whenTrue, spec, depth + 1)}
            </ul>
          </li>
          <li style={{ color: "#C0392B", fontWeight: 600, marginTop: "4px" }}>
            ✗ False:
            <ul style={{ listStyle: "none", paddingLeft: "12px", marginTop: "2px" }}>
              {renderAlgoStepsPreview(step.payload.whenFalse, spec, depth + 1)}
            </ul>
          </li>
        </ul>
      )}
    </li>
  ));
}

interface StepListProps {
  steps: SpecificationStep[];
  onChange: (updater: (prev: AlgorithmSpecification) => AlgorithmSpecification) => void;
  outputs: {
    inputs: SpecificationDeclaration[];
    variables: SpecificationDeclaration[];
    outputs: Array<{ id: string; description: string }>;
  };
  depth?: number;
  styles: Record<string, string>;
}

export function StepList({ steps, onChange, outputs, depth = 0, styles }: StepListProps): React.JSX.Element {
  const add = (kind: "input" | "declaration" | "assignment" | "output" | "conditional") => {
    const id = uid();
    if (kind === "input") {
      const input: SpecificationDeclaration = { id: `input-${id}`, name: "n", type: "int", description: "" };
      const step: SpecificationStep = { id, kind, payload: { inputId: input.id, prompt: "Enter a number: " } };
      onChange((spec) => ({ ...spec, inputs: [...spec.inputs, input], steps: [...spec.steps, step] }));
      return;
    }
    if (kind === "declaration") {
      const variable: SpecificationDeclaration = { id: `var-${id}`, name: "result", type: "int" };
      const step: SpecificationStep = { id, kind, payload: { symbolId: variable.id } };
      onChange((spec) => ({ ...spec, variables: [...spec.variables, variable], steps: [...spec.steps, step] }));
      return;
    }
    if (kind === "assignment") {
      const targetId = [...outputs.inputs, ...outputs.variables][0]?.id || "";
      const step: SpecificationStep = { id, kind, payload: { targetId, expression: "" } };
      onChange((spec) => ({ ...spec, steps: [...spec.steps, step] }));
      return;
    }
    if (kind === "output") {
      const output = { id: `out-${id}`, description: "Output" };
      const step: SpecificationStep = { id, kind, payload: { outputId: output.id, mode: "message", message: "Result" } };
      onChange((spec) => ({ ...spec, outputs: [...spec.outputs, output], steps: [...spec.steps, step] }));
      return;
    }
    if (kind === "conditional") {
      const step: SpecificationStep = { id, kind, payload: { condition: "n % 2 == 0", whenTrue: [], whenFalse: [] } };
      onChange((spec) => ({ ...spec, steps: [...spec.steps, step] }));
    }
  };

  const patchStep = (id: string, updater: (current: SpecificationStep) => SpecificationStep) =>
    onChange((spec) => ({ ...spec, steps: updateStepList(spec.steps, id, updater) }));
  const removeStep = (id: string) =>
    onChange((spec) => ({ ...spec, steps: removeStepById(spec.steps, id) }));

  const patchPayload = (step: SpecificationStep, key: string, value: unknown) =>
    patchStep(step.id, (current) => ({ ...current, payload: { ...current.payload, [key]: value } as never }));

  const addToBranch = (parent: SpecificationStep, branch: "whenTrue" | "whenFalse", kind: "assignment" | "output" | "conditional") => {
    const childId = uid();
    onChange((spec) => {
      let additions: Partial<AlgorithmSpecification> = {};
      let child: SpecificationStep;
      if (kind === "assignment") {
        child = {
          id: childId,
          kind,
          payload: { targetId: [...spec.inputs, ...spec.variables][0]?.id || "", expression: "" },
        };
      } else if (kind === "output") {
        const output = { id: `out-${childId}`, description: "Branch output" };
        additions = { outputs: [...spec.outputs, output] };
        child = { id: childId, kind, payload: { outputId: output.id, mode: "message", message: "Result" } };
      } else {
        child = { id: childId, kind: "conditional", payload: { condition: "", whenTrue: [], whenFalse: [] } };
      }
      return {
        ...spec,
        ...additions,
        steps: updateStepList(spec.steps, parent.id, (current) => {
          if (current.kind !== "conditional") return current;
          return {
            ...current,
            payload: { ...current.payload, [branch]: [...current.payload[branch], child] },
          };
        }),
      };
    });
  };

  return (
    <div className={styles.stepList}>
      {steps.length === 0 && depth === 0 && (
        <div className={styles.emptyStepState}>
          <span className={styles.emptyStepIcon}>🔲</span>
          <p>
            No steps yet. Add your first step below — start with an <strong>Input Step</strong> to read a value from the user.
          </p>
        </div>
      )}
      {steps.map((step, index) => (
        <article
          className={`${styles.specStep} ${depth > 0 ? styles.specStepNested : ""}`}
          id={`spec-source-${step.id}`}
          key={step.id}
        >
          <div className={styles.stepHeading}>
            <b>
              {index + 1}.{" "}
              {step.kind === "conditional"
                ? "Decision (If / Else)"
                : step.kind === "input"
                ? "Read Input"
                : step.kind === "output"
                ? "Output Result"
                : step.kind === "assignment"
                ? "Assignment"
                : step.kind === "declaration"
                ? "Declare Variable"
                : (step as SpecificationStep).kind}
            </b>
            <div className={styles.stepControls}>
              <button
                type="button"
                className={styles.reorderBtn}
                disabled={index === 0}
                onClick={() => onChange((spec) => ({ ...spec, steps: moveStep(spec.steps, index, -1) }))}
                title="Move step up"
                aria-label="Move step up"
              >
                ▲
              </button>
              <button
                type="button"
                className={styles.reorderBtn}
                disabled={index === steps.length - 1}
                onClick={() => onChange((spec) => ({ ...spec, steps: moveStep(spec.steps, index, 1) }))}
                title="Move step down"
                aria-label="Move step down"
              >
                ▼
              </button>
              <button type="button" className={styles.textButton} onClick={() => removeStep(step.id)}>
                Remove
              </button>
            </div>
          </div>

          {step.kind === "input" && (
            <div className={styles.fieldGrid}>
              <label>
                Input Variable
                <select
                  value={step.payload.inputId}
                  onChange={(e) => patchPayload(step, "inputId", e.target.value)}
                >
                  {outputs.inputs.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name || "Unnamed input"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prompt message
                <input
                  value={step.payload.prompt || ""}
                  onChange={(e) => patchPayload(step, "prompt", e.target.value)}
                  placeholder="Enter a number: "
                />
              </label>
            </div>
          )}

          {step.kind === "declaration" && (() => {
            const currentVar = outputs.variables?.find((v) => v.id === step.payload.symbolId);
            return (
              <div className={styles.fieldGrid}>
                <label>
                  Variable name
                  <input
                    value={currentVar?.name || ""}
                    placeholder="result"
                    onChange={(e) => {
                      const newName = e.target.value;
                      onChange((spec) => ({
                        ...spec,
                        variables: spec.variables.map((v) =>
                          v.id === step.payload.symbolId ? { ...v, name: newName } : v
                        ),
                      }));
                    }}
                  />
                </label>
                <label>
                  Data type
                  <select
                    value={currentVar?.type || "int"}
                    onChange={(e) => {
                      const newType = e.target.value as "int" | "double" | "char";
                      onChange((spec) => ({
                        ...spec,
                        variables: spec.variables.map((v) =>
                          v.id === step.payload.symbolId ? { ...v, type: newType } : v
                        ),
                      }));
                    }}
                  >
                    <option value="int">int</option>
                    <option value="double">double</option>
                    <option value="char">char</option>
                  </select>
                </label>
              </div>
            );
          })()}

          {step.kind === "assignment" && (
            <div className={styles.fieldGrid}>
              <label>
                Assign to
                <select
                  value={step.payload.targetId}
                  onChange={(e) => patchPayload(step, "targetId", e.target.value)}
                >
                  <option value="">Choose variable</option>
                  {[...outputs.inputs, ...outputs.variables].map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expression
                <input
                  value={step.payload.expression}
                  placeholder="n + 1"
                  onChange={(e) => patchPayload(step, "expression", e.target.value)}
                />
              </label>
            </div>
          )}

          {step.kind === "output" && (
            <div className={styles.fieldGrid}>
              <label>
                Output mode
                <select
                  value={step.payload.mode}
                  onChange={(e) => {
                    const mode = e.target.value as "message" | "expression" | "formatted";
                    patchStep(step.id, (current): SpecificationStep => {
                      if (current.kind !== "output") return current;
                      if (mode === "message") {
                        return {
                          id: current.id,
                          kind: "output",
                          payload: { outputId: current.payload.outputId, mode: "message", message: current.payload.mode === "formatted" ? current.payload.message : "" },
                        };
                      }
                      if (mode === "formatted") return {
                        id: current.id,
                        kind: "output",
                        payload: {
                          outputId: current.payload.outputId,
                          mode: "formatted",
                          message: current.payload.mode === "message" || current.payload.mode === "formatted" ? current.payload.message : "Result:",
                          expression: current.payload.mode === "expression" || current.payload.mode === "formatted" ? current.payload.expression : "",
                        },
                      };
                      return {
                        id: current.id,
                        kind: "output",
                        payload: { outputId: current.payload.outputId, mode: "expression", expression: current.payload.mode === "formatted" ? current.payload.expression : "" },
                      };
                    });
                  }}
                >
                  <option value="message">Display Message</option>
                  <option value="expression">Display Variable/Expression</option>
                  <option value="formatted">Message + Variable/Expression</option>
                </select>
              </label>
              {step.payload.mode === "formatted" ? (
                <>
                  <label>Message Text<input value={step.payload.message} onChange={(e) => patchPayload(step, "message", e.target.value)} placeholder="Area:" /></label>
                  <label>Expression<input value={step.payload.expression} onChange={(e) => patchPayload(step, "expression", e.target.value)} placeholder="area" /></label>
                </>
              ) : (
                <label>
                  {step.payload.mode === "message" ? "Message Text" : "Expression"}
                  <input
                    value={step.payload.mode === "message" ? step.payload.message : step.payload.expression}
                    onChange={(e) => patchPayload(step, step.payload.mode === "message" ? "message" : "expression", e.target.value)}
                    placeholder={step.payload.mode === "message" ? 'e.g. "Even"' : "e.g. n * 2"}
                  />
                </label>
              )}
            </div>
          )}

          {step.kind === "conditional" && (
            <>
              <label className={styles.conditionLabel}>
                Condition
                <input
                  value={step.payload.condition}
                  placeholder="n % 2 == 0"
                  onChange={(e) => patchPayload(step, "condition", e.target.value)}
                />
              </label>
              <div className={`${styles.branchGrid} ${depth > 0 ? styles.branchGridNested : ""}`}>
                {(["whenTrue", "whenFalse"] as const).map((branch) => (
                  <section
                    className={`${styles.branch} ${depth > 0 ? styles.branchNested : ""}`}
                    key={branch}
                  >
                    <h4 className={branch === "whenTrue" ? styles.branchHeaderTrue : styles.branchHeaderFalse}>
                      {branch === "whenTrue" ? "✓ If True (Yes)" : "✗ If False (No)"}
                    </h4>
                    <StepList
                      depth={depth + 1}
                      steps={step.payload[branch]}
                      outputs={outputs}
                      styles={styles}
                      onChange={(change) =>
                        onChange((spec) => {
                          const draft = change({ ...spec, steps: step.payload[branch] });
                          return {
                            ...spec,
                            inputs: draft.inputs,
                            variables: draft.variables,
                            outputs: draft.outputs,
                            steps: updateStepList(spec.steps, step.id, (current) => {
                              if (current.kind !== "conditional") return current;
                              return {
                                ...current,
                                payload: { ...current.payload, [branch]: draft.steps },
                              };
                            }),
                          };
                        })
                      }
                    />
                    <div className={styles.branchAddRow}>
                      <button
                        type="button"
                        className={styles.branchAddBtn}
                        onClick={() => addToBranch(step, branch, "assignment")}
                      >
                        ＋ Assignment
                      </button>
                      <button
                        type="button"
                        className={styles.branchAddBtn}
                        onClick={() => addToBranch(step, branch, "output")}
                      >
                        ＋ Output
                      </button>
                      <button
                        type="button"
                        className={styles.branchAddBtn}
                        onClick={() => addToBranch(step, branch, "conditional")}
                      >
                        ＋ Decision
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </article>
      ))}

      {depth === 0 && (
        <div className={styles.addRow}>
          <button
            key="input"
            type="button"
            className={styles.addStepBtn}
            onClick={() => add("input")}
          >
            ＋ Input Step
          </button>
          <button
            key="declaration"
            type="button"
            className={styles.addStepBtn}
            onClick={() => add("declaration")}
          >
            ＋ Declare Variable
          </button>
          <button
            key="assignment"
            type="button"
            className={styles.addStepBtn}
            onClick={() => add("assignment")}
          >
            ＋ Assignment Step
          </button>
          <button
            key="conditional"
            type="button"
            className={styles.addStepBtn}
            onClick={() => add("conditional")}
          >
            ＋ Decision (If / Else)
          </button>
          <button
            key="output"
            type="button"
            className={styles.addStepBtn}
            onClick={() => add("output")}
          >
            ＋ Output Step
          </button>
        </div>
      )}
    </div>
  );
}

export default function AlgorithmEditor({ specification, onChange, styles }: AlgorithmEditorProps): React.JSX.Element {
  return (
    <StepList
      steps={specification.steps}
      onChange={onChange}
      outputs={{
        inputs: specification.inputs,
        variables: specification.variables,
        outputs: specification.outputs,
      }}
      styles={styles}
    />
  );
}
