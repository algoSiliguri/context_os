import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import type { ValidatorDefinition } from './workflow-pack-loader';

export interface ValidatorFinding {
  field?: string;
  message: string;
}

export type ValidatorResult =
  | { ok: true }
  | { ok: false; findings: ValidatorFinding[] };

export interface ValidatorContext {
  taskDir: string;
  taskId: string;
  repoRoot?: string;  // optional; required by validators that scan the repo (e.g., validate-no-stray-debug-tags)
}

const TASK_ID_RE = /^T-\d{3}$/;

// ── validate-artifact ────────────────────────────────────────────────────────
// Advisory: required envelope fields are present and well-formed.
function validateArtifact(artifact: Record<string, unknown>): ValidatorResult {
  const findings: ValidatorFinding[] = [];

  if (!artifact.artifact_type || typeof artifact.artifact_type !== 'string') {
    findings.push({ field: 'artifact_type', message: 'artifact_type must be a non-empty string' });
  }
  if (!artifact.task_id || typeof artifact.task_id !== 'string') {
    findings.push({ field: 'task_id', message: 'task_id must be a non-empty string' });
  } else if (!TASK_ID_RE.test(artifact.task_id)) {
    findings.push({ field: 'task_id', message: `task_id "${artifact.task_id}" does not match T-NNN pattern` });
  }
  if (artifact.schema_version === undefined || artifact.schema_version === null) {
    findings.push({ field: 'schema_version', message: 'schema_version is required' });
  }
  if (!artifact.created_at || typeof artifact.created_at !== 'string') {
    findings.push({ field: 'created_at', message: 'created_at must be a non-empty string' });
  } else if (Number.isNaN(Date.parse(artifact.created_at))) {
    findings.push({ field: 'created_at', message: `created_at "${artifact.created_at}" is not a valid date-time` });
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

// ── validate-plan-scope ──────────────────────────────────────────────────────
// Advisory: plan has non-empty scope.in and at least one step.
function validatePlanScope(artifact: Record<string, unknown>): ValidatorResult {
  const findings: ValidatorFinding[] = [];

  if (artifact.artifact_type !== 'PlanArtifact') {
    return { ok: true }; // not a plan — skip
  }

  const scope = artifact.scope as Record<string, unknown> | undefined;
  if (!scope || typeof scope !== 'object') {
    findings.push({ field: 'scope', message: 'plan must have a scope object' });
  } else {
    const inScope = scope.in;
    if (!Array.isArray(inScope) || inScope.length === 0) {
      findings.push({ field: 'scope.in', message: 'scope.in must be a non-empty array — at least one path in scope' });
    }
  }

  const steps = artifact.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    findings.push({ field: 'steps', message: 'plan must have at least one step' });
  } else {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as Record<string, unknown>;
      if (!step || typeof step !== 'object') {
        findings.push({ field: `steps[${i}]`, message: 'each step must be an object' });
        continue;
      }
      if (!step.id || typeof step.id !== 'string') {
        findings.push({ field: `steps[${i}].id`, message: 'step id must be a non-empty string' });
      }
    }
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

// ── validate-criteria-coverage ───────────────────────────────────────────────
// Advisory: if grill defined success_criteria, verification must have commands.
function validateCriteriaCoverage(
  artifact: Record<string, unknown>,
  ctx: ValidatorContext,
): ValidatorResult {
  const findings: ValidatorFinding[] = [];

  if (artifact.artifact_type !== 'VerificationRecord') {
    return { ok: true }; // not a verification — skip
  }

  // Load grill artifact to check if success_criteria were defined
  const grillPath = join(ctx.taskDir, 'grill.yaml');
  let grillCriteriaCount = 0;
  if (existsSync(grillPath)) {
    try {
      const grill = YAML.parse(readFileSync(grillPath, 'utf-8')) as Record<string, unknown>;
      const criteria = grill.success_criteria;
      if (Array.isArray(criteria)) {
        grillCriteriaCount = criteria.length;
      }
    } catch {
      // grill unreadable — skip coverage check
    }
  }

  const commands = artifact.commands;
  if (!Array.isArray(commands) || commands.length === 0) {
    findings.push({ field: 'commands', message: 'verification must have at least one command entry' });
  }

  if (grillCriteriaCount > 0) {
    const result = artifact.result;
    if (result !== 'pass' && result !== 'pass_with_degradation') {
      findings.push({
        field: 'result',
        message: `grill defined ${grillCriteriaCount} success criteria but verification result is "${result}" — confirm all criteria are covered`,
      });
    }
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

// ── validate-evaluation-gate ─────────────────────────────────────────────────
// Advisory: evaluation record is internally consistent.
function validateEvaluationGate(artifact: Record<string, unknown>): ValidatorResult {
  const findings: ValidatorFinding[] = [];

  if (artifact.artifact_type !== 'EvaluationRecord') {
    return { ok: true }; // not an evaluation — skip
  }

  const rate = artifact.criteria_satisfaction_rate;
  if (typeof rate !== 'number' || rate < 0 || rate > 1) {
    findings.push({
      field: 'criteria_satisfaction_rate',
      message: 'criteria_satisfaction_rate must be a number in [0, 1]',
    });
  }

  const outcome = artifact.task_outcome;
  const validOutcomes = ['PASS', 'PASS_WITH_DEGRADATION', 'FAIL'];
  if (!validOutcomes.includes(outcome as string)) {
    findings.push({
      field: 'task_outcome',
      message: `task_outcome must be one of ${validOutcomes.join(' | ')}, got "${outcome}"`,
    });
  }

  // Consistency: PASS outcome with 0% satisfaction is suspicious
  if (outcome === 'PASS' && typeof rate === 'number' && rate === 0) {
    findings.push({
      field: 'criteria_satisfaction_rate',
      message: 'task_outcome is PASS but criteria_satisfaction_rate is 0 — verify this is intentional',
    });
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

// ── validate-falsifiable-hypothesis ──────────────────────────────────────────
// Advisory: every hypothesis statement contains an "if X then Y" clause.
function validateFalsifiableHypothesis(artifact: Record<string, unknown>): ValidatorResult {
  if (artifact.artifact_type !== 'DiagnosisRecord') {
    return { ok: true }; // not a diagnosis — skip
  }
  const hypotheses = artifact.hypotheses;
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
    return { ok: true }; // no hypotheses provided (legacy flow) — skip
  }
  const IF_THEN = /\bif\b[\s\S]+?\bthen\b/i;
  const findings: ValidatorFinding[] = [];
  for (let i = 0; i < hypotheses.length; i++) {
    const h = hypotheses[i] as Record<string, unknown> | undefined;
    const statement = typeof h?.statement === 'string' ? h.statement : '';
    if (!IF_THEN.test(statement)) {
      findings.push({
        field: `hypotheses[${i}]`,
        message: `hypothesis "${statement.slice(0, 60)}" must be falsifiable: contain "if … then …" structure`,
      });
    }
  }
  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

// ── validate-no-stray-debug-tags ─────────────────────────────────────────────
// Advisory: when DiagnosisRecord.instrumentation_tag is set, no stray matches
// should remain in the repo after the cleanup phase.

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.vitest', '.turbo', 'target', '__pycache__', '.venv', 'venv',
]);

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function* walkRepo(dir: string): Generator<string> {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf-8' });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      yield* walkRepo(join(dir, e.name));
    } else if (e.isFile()) {
      yield join(dir, e.name);
    }
  }
}

function validateNoStrayDebugTags(
  artifact: Record<string, unknown>,
  ctx: ValidatorContext,
): ValidatorResult {
  if (artifact.artifact_type !== 'DiagnosisRecord') {
    return { ok: true }; // not a diagnosis — skip
  }
  const tag = artifact.instrumentation_tag;
  if (typeof tag !== 'string' || !tag) {
    return { ok: true }; // legacy flow — skip
  }
  const repoRoot = ctx.repoRoot;
  if (!repoRoot || !existsSync(repoRoot)) {
    return { ok: true }; // no repo to scan — skip (best-effort)
  }
  const pattern = new RegExp(escapeForRegex(tag));
  const MAX_FILE_BYTES = 2 * 1024 * 1024; // skip files > 2MB
  const findings: ValidatorFinding[] = [];

  for (const filePath of walkRepo(repoRoot)) {
    let size: number;
    try { size = statSync(filePath).size; } catch { continue; }
    if (size > MAX_FILE_BYTES) continue;
    let text: string;
    try { text = readFileSync(filePath, 'utf-8'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i] ?? '')) {
        const rel = filePath.slice(repoRoot.length + 1).replace(/\\/g, '/');
        findings.push({
          field: 'instrumentation_tag',
          message: `stray debug tag "${tag}" at ${rel}:${i + 1}`,
        });
      }
    }
  }

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

// ── dispatcher ───────────────────────────────────────────────────────────────

const BUILT_IN_VALIDATORS: Record<
  string,
  (artifact: Record<string, unknown>, ctx: ValidatorContext) => ValidatorResult
> = {
  'validate-artifact': (a) => validateArtifact(a),
  'validate-plan-scope': (a) => validatePlanScope(a),
  'validate-criteria-coverage': (a, ctx) => validateCriteriaCoverage(a, ctx),
  'validate-evaluation-gate': (a) => validateEvaluationGate(a),
  'validate-falsifiable-hypothesis': (a) => validateFalsifiableHypothesis(a),
  'validate-no-stray-debug-tags': (a, ctx) => validateNoStrayDebugTags(a, ctx),
};

/**
 * Run a single built-in validator by ID.
 * Returns null if the validator ID is not built-in (unknown / external plugin).
 * Never throws.
 */
export function runBuiltinValidator(
  id: string,
  artifact: Record<string, unknown>,
  ctx: ValidatorContext,
): ValidatorResult | null {
  const fn = BUILT_IN_VALIDATORS[id];
  if (!fn) return null;
  try {
    return fn(artifact, ctx);
  } catch {
    return { ok: false, findings: [{ message: `validator "${id}" threw unexpectedly` }] };
  }
}

/**
 * Run all validators declared for a phase.
 * Returns one entry per validator that was executed.
 * Validators not in the built-in registry are skipped (future: external plugins).
 * Never throws.
 */
export function runValidatorsForPhase(
  validatorIds: string[],
  validatorDefs: ValidatorDefinition[],
  artifact: Record<string, unknown>,
  ctx: ValidatorContext,
): Array<{ id: string; mode: 'advisory' | 'blocking'; result: ValidatorResult }> {
  const defMap = new Map(validatorDefs.map((v) => [v.id, v]));
  const results: Array<{ id: string; mode: 'advisory' | 'blocking'; result: ValidatorResult }> = [];

  for (const id of validatorIds) {
    const def = defMap.get(id);
    const mode: 'advisory' | 'blocking' = def?.mode ?? 'advisory';
    const result = runBuiltinValidator(id, artifact, ctx);
    if (result !== null) {
      results.push({ id, mode, result });
    }
  }

  return results;
}
