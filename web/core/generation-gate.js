import { adaptFlowchartToAst, adaptSpecificationToAst, ADAPTER_VERSION } from "./adapters.js";
import { validateAstSemantics } from "./ast-validation.js";
import { CONTRACT_VALIDATOR_VERSION, validateProjectContract } from "./contract-validation.js";
import { C_GENERATOR_VERSION, generateCFromAst } from "./c-generator.js";
import { createDiagnostic } from "./diagnostics.js";
import { generatePythonFromAst } from "./python-generator.js";
import { CANONICALIZER_VERSION, canonicalizeAst, reconcileAstCandidates } from "./reconciliation.js";

export const GENERATION_GATE_VERSION = "1.0.0";

function generationDiagnostic(code, message) {
  return createDiagnostic({ code, category: "generation", message });
}

export function analyzeProject(project) {
  const projectDiagnostics = validateProjectContract(project);
  if (projectDiagnostics.length) return { diagnostics: projectDiagnostics };
  const specificationCandidate = adaptSpecificationToAst(project.specification, { projectId: project.projectId });
  const flowchartCandidate = adaptFlowchartToAst(project.flowchart, { projectId: project.projectId });
  const reconciliation = reconcileAstCandidates(specificationCandidate, flowchartCandidate);
  const specificationValidation = specificationCandidate.ast ? validateAstSemantics(specificationCandidate.ast) : null;
  const flowchartValidation = flowchartCandidate.ast ? validateAstSemantics(flowchartCandidate.ast) : null;
  return {
    diagnostics: [...specificationCandidate.diagnostics, ...flowchartCandidate.diagnostics],
    specificationCandidate,
    flowchartCandidate,
    specificationValidation,
    flowchartValidation,
    reconciliation,
  };
}

export function canonicalAstFingerprint(ast) {
  const result = canonicalizeAst(ast);
  if (result.status !== "canonical") return null;
  return JSON.stringify(result.canonical);
}

function currentApproval(project, fingerprint, approvedAt) {
  return {
    projectId: project.projectId,
    semanticRevision: project.revisions.semantic,
    specificationRevision: project.specification.revision,
    flowchartRevision: project.flowchart.revision,
    canonicalAstFingerprint: fingerprint,
    adapterVersion: ADAPTER_VERSION,
    canonicalizerVersion: CANONICALIZER_VERSION,
    validatorVersion: CONTRACT_VALIDATOR_VERSION,
    generatorVersion: C_GENERATOR_VERSION,
    approvedAt,
  };
}

export function approveCurrentProject(project, { approvedAt = new Date().toISOString() } = {}) {
  const analysis = analyzeProject(project);
  const diagnostics = [...analysis.diagnostics];
  if (analysis.reconciliation?.status !== "equivalent") {
    diagnostics.push(generationDiagnostic("GEN_UNRESOLVED_CONFLICT", "Approval is available only after both current sources reconcile as equivalent."));
    return { approval: null, diagnostics, reconciliation: analysis.reconciliation ?? null };
  }
  if (!analysis.specificationValidation?.valid || !analysis.flowchartValidation?.valid) {
    diagnostics.push(generationDiagnostic("GEN_VALIDATION_FAILED", "Approval requires both AST candidates to pass static validation."));
    return { approval: null, diagnostics, reconciliation: analysis.reconciliation };
  }
  const fingerprint = canonicalAstFingerprint(analysis.specificationCandidate.ast);
  if (!fingerprint) {
    diagnostics.push(generationDiagnostic("GEN_AST_UNSUPPORTED", "The canonical AST could not be fingerprinted."));
    return { approval: null, diagnostics, reconciliation: analysis.reconciliation };
  }
  return {
    approval: currentApproval(project, fingerprint, approvedAt),
    diagnostics,
    reconciliation: analysis.reconciliation,
  };
}

function sameApproval(approval, expected) {
  if (!approval) return false;
  return Object.keys(expected).every((key) => {
    if (approval[key] === expected[key]) return true;
    if (key === "canonicalAstFingerprint" && typeof approval[key] === "string" && typeof expected[key] === "string") {
      try {
        const a = JSON.parse(approval[key]);
        const b = JSON.parse(expected[key]);
        const deepMatch = (x, y) => {
          if (x === y) return true;
          if (!x || !y || typeof x !== "object" || typeof y !== "object") return false;
          const kx = Object.keys(x);
          const ky = Object.keys(y);
          if (kx.length !== ky.length) return false;
          return kx.every((k) => deepMatch(x[k], y[k]));
        };
        return deepMatch(a, b);
      } catch {
        return false;
      }
    }
    return false;
  });
}

function astWithCombinedProvenance(specificationAst, flowchartAst) {
  const specification = canonicalizeAst(specificationAst);
  const flowchart = canonicalizeAst(flowchartAst);
  const ast = structuredClone(specificationAst);
  ast.provenance = ast.provenance.map((entry) => {
    const path = specification.nodePaths.get(entry.astNodeId);
    const additional = flowchart.sourcePaths.get(path) ?? [];
    const merged = new Map([...entry.origins, ...additional].map((origin) => [
      `${origin.sourceKind}:${origin.sourceObjectId}:${origin.sourceRevision}`, origin,
    ]));
    return { ...entry, origins: [...merged.values()] };
  });
  return ast;
}

function generateForProject(project, generator) {
  const analysis = analyzeProject(project);
  const diagnostics = [...analysis.diagnostics];
  if (!analysis.reconciliation) {
    return { status: "blocked", code: "", sourceMap: [], diagnostics, reconciliation: null };
  }
  if (analysis.reconciliation.status !== "equivalent") {
    diagnostics.push(generationDiagnostic(
      "GEN_UNRESOLVED_CONFLICT",
      analysis.reconciliation.status === "unknown"
        ? "Generation is blocked because equivalence is unknown."
        : analysis.reconciliation.status === "conflict"
          ? "Generation is blocked until the differences between the two sources are resolved."
          : "Generation is blocked because one or both sources are invalid.",
    ));
    return { status: "blocked", code: "", sourceMap: [], diagnostics: [...diagnostics, ...analysis.reconciliation.diagnostics], reconciliation: analysis.reconciliation };
  }

  const fingerprint = canonicalAstFingerprint(analysis.specificationCandidate.ast);
  const expectedApproval = currentApproval(project, fingerprint, project.generationApproval?.approvedAt ?? "");
  if (!project.generationApproval) {
    diagnostics.push(generationDiagnostic("GEN_APPROVAL_REQUIRED", "Review the current reconciliation and validation results, then approve this semantic revision before generating code."));
    return { status: "blocked", code: "", sourceMap: [], diagnostics, reconciliation: analysis.reconciliation };
  }
  if (!sameApproval(project.generationApproval, expectedApproval)) {
    diagnostics.push(generationDiagnostic("GEN_STALE_APPROVAL", "The approval is stale because the project, source revisions, AST, or tool versions changed. Review and approve the current results again."));
    return { status: "blocked", code: "", sourceMap: [], diagnostics, reconciliation: analysis.reconciliation };
  }

  const combinedAst = astWithCombinedProvenance(analysis.specificationCandidate.ast, analysis.flowchartCandidate.ast);
  const generated = generator(combinedAst, { codeLevel: project.codeLevel });
  if (generated.diagnostics.length) return { status: "blocked", code: "", sourceMap: [], diagnostics: [...diagnostics, ...generated.diagnostics], reconciliation: analysis.reconciliation };
  return {
    status: "ready",
    code: generated.code,
    sourceMap: generated.sourceMap,
    diagnostics,
    reconciliation: analysis.reconciliation,
    metadata: {
      generatorVersion: generated.generatorVersion,
      semanticRevision: project.revisions.semantic,
      canonicalAstFingerprint: fingerprint,
    },
  };
}

export function generateCForProject(project) {
  return generateForProject(project, generateCFromAst);
}

export function generatePythonForProject(project) {
  return generateForProject(project, generatePythonFromAst);
}
