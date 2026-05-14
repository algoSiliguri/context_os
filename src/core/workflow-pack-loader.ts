import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import YAML from 'yaml';

export interface PhaseDefinition {
  id: string;
  agent_os_command: string;
  allowed_predecessors: string[];
  produces: string[];
  may_edit_source: boolean;
  requires_approval: boolean;
  validators: string[];
  escape_hatch?: boolean;
}

export interface ValidatorDefinition {
  id: string;
  path: string;
  mode: 'advisory' | 'blocking';
}

export interface GrillConfig {
  question_profile: 'default' | 'doc_grounded';
  max_questions?: number;
}

export interface PlanConfig {
  verification_profile: 'detected' | 'none';
}

export interface PromptPhaseDefinition {
  id: string;
  prompt: string;          // relative path inside pack directory
  exit_condition: string;  // named flag set in artifact when sub-phase completes
  prompt_content?: string; // populated by loader after reading file
  validator?: string;      // optional validator ID to run on sub-phase exit
}

export interface PromptsDiagnoseConfig {
  phases?: PromptPhaseDefinition[];
}

export interface PromptsGrillConfig {
  intro?: { path: string; content?: string };
  question_packs?: Array<{ path: string; content?: string }>;
}

export interface PromptsConfig {
  diagnose?: PromptsDiagnoseConfig;
  grill?: PromptsGrillConfig;
}

export interface WorkflowPackManifest {
  workflow_pack_id: string;
  version: string;
  schema_version: string;
  runtime_target: string;
  min_agent_os_version: string;
  artifact_root: string;
  task_id_pattern: string;
  artifact_format: 'yaml' | 'json';
  phases: PhaseDefinition[];
  validators: ValidatorDefinition[];
  grill?: GrillConfig;
  plan?: PlanConfig;
  prompts?: PromptsConfig;        // NEW
  prompt_warnings: string[];      // NEW — non-fatal load warnings
}

export type WorkflowPackLoadResult =
  | { ok: true; manifest: WorkflowPackManifest; packDir: string }
  | { ok: false; error: string; packDir: string };

function validateManifest(raw: unknown, packDir: string): WorkflowPackManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`workflow-pack.yaml in ${packDir} is not an object`);
  }
  const r = raw as Record<string, unknown>;

  const required = [
    'workflow_pack_id', 'version', 'schema_version',
    'runtime_target', 'phases',
  ] as const;
  for (const field of required) {
    if (r[field] === undefined) {
      throw new Error(`workflow-pack.yaml missing required field: ${field}`);
    }
  }

  if (!Array.isArray(r.phases) || r.phases.length === 0) {
    throw new Error('workflow-pack.yaml phases must be a non-empty array');
  }

  for (const phase of r.phases as unknown[]) {
    if (!phase || typeof phase !== 'object') {
      throw new Error('each phase must be an object');
    }
    const p = phase as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id) {
      throw new Error('each phase must have a string id');
    }
    if (!Array.isArray(p.allowed_predecessors)) {
      throw new Error(`phase "${p.id}" missing allowed_predecessors array`);
    }
  }

  const prompt_warnings: string[] = [];
  const prompts = parsePromptsConfig(r.prompts, packDir, prompt_warnings);

  return {
    workflow_pack_id: String(r.workflow_pack_id),
    version: String(r.version),
    schema_version: String(r.schema_version ?? '1.0.0'),
    runtime_target: String(r.runtime_target ?? 'pi'),
    min_agent_os_version: String(r.min_agent_os_version ?? '1.3.0'),
    artifact_root: String(r.artifact_root ?? '.agent-os/tasks'),
    task_id_pattern: String(r.task_id_pattern ?? 'T-\\d{3}'),
    artifact_format: (r.artifact_format === 'json' ? 'json' : 'yaml'),
    phases: (r.phases as Record<string, unknown>[]).map((p) => ({
      id: String(p.id),
      agent_os_command: String(p.agent_os_command ?? `/${p.id}`),
      allowed_predecessors: (p.allowed_predecessors as string[]),
      produces: Array.isArray(p.produces) ? (p.produces as string[]) : [],
      may_edit_source: Boolean(p.may_edit_source ?? false),
      requires_approval: Boolean(p.requires_approval ?? false),
      validators: Array.isArray(p.validators) ? (p.validators as string[]) : [],
      escape_hatch: Boolean(p.escape_hatch ?? false),
    })),
    validators: Array.isArray(r.validators)
      ? (r.validators as Record<string, unknown>[]).map((v) => ({
          id: String(v.id),
          path: String(v.path),
          mode: v.mode === 'blocking' ? 'blocking' : 'advisory',
        }))
      : [],
    grill: parseGrillConfig(r.grill, packDir),
    plan: parsePlanConfig(r.plan, packDir),
    prompts,
    prompt_warnings,
  };
}

function parseGrillConfig(raw: unknown, packDir: string): GrillConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') {
    throw new Error(`workflow-pack.yaml in ${packDir}: grill must be an object`);
  }
  const g = raw as Record<string, unknown>;
  const profile = g.question_profile;
  if (profile !== 'default' && profile !== 'doc_grounded') {
    throw new Error(
      `workflow-pack.yaml in ${packDir}: grill.question_profile must be "default" or "doc_grounded", got "${profile}"`,
    );
  }
  const maxQ = g.max_questions;
  if (maxQ !== undefined) {
    const n = Number(maxQ);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(
        `workflow-pack.yaml in ${packDir}: grill.max_questions must be a positive integer`,
      );
    }
  }
  return {
    question_profile: profile,
    max_questions: maxQ !== undefined ? Number(maxQ) : undefined,
  };
}

function parsePlanConfig(raw: unknown, packDir: string): PlanConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') {
    throw new Error(`workflow-pack.yaml in ${packDir}: plan must be an object`);
  }
  const p = raw as Record<string, unknown>;
  const profile = p.verification_profile;
  if (profile !== 'detected' && profile !== 'none') {
    throw new Error(
      `workflow-pack.yaml in ${packDir}: plan.verification_profile must be "detected" or "none", got "${profile}"`,
    );
  }
  return { verification_profile: profile };
}

const PROMPT_FILE_MAX_BYTES = 10 * 1024;       // 10KB per file
const PROMPT_TOTAL_MAX_BYTES = 200 * 1024;     // 200KB total per pack

function isInsidePack(packDir: string, relativePath: string): boolean {
  if (isAbsolute(relativePath)) return false;
  const resolved = resolve(packDir, relativePath);
  const rel = relative(packDir, resolved);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

function readPromptFile(
  packDir: string,
  relPath: string,
  budget: { used: number },
): { content?: string; warning?: string } {
  if (!isInsidePack(packDir, relPath)) {
    throw new Error(`prompt path "${relPath}" is outside pack directory or invalid path`);
  }
  const fullPath = resolve(packDir, relPath);
  if (!existsSync(fullPath)) {
    return { warning: `prompt file not found: ${relPath}` };
  }
  const size = statSync(fullPath).size;
  if (size > PROMPT_FILE_MAX_BYTES) {
    throw new Error(`prompt file "${relPath}" (${size} bytes) exceeds 10KB per-file limit`);
  }
  if (budget.used + size > PROMPT_TOTAL_MAX_BYTES) {
    throw new Error(`total prompt bytes exceeds 200KB budget after including "${relPath}"`);
  }
  budget.used += size;
  const buf = readFileSync(fullPath);
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error(`prompt file "${relPath}" is not valid UTF-8`);
  }
  return { content };
}

function parsePromptsConfig(
  raw: unknown,
  packDir: string,
  warnings: string[],
): PromptsConfig | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') {
    throw new Error(`workflow-pack.yaml in ${packDir}: prompts must be an object`);
  }
  const p = raw as Record<string, unknown>;
  const budget = { used: 0 };
  const config: PromptsConfig = {};

  // diagnose.phases
  if (p.diagnose && typeof p.diagnose === 'object') {
    const d = p.diagnose as Record<string, unknown>;
    if (d.phases !== undefined) {
      if (!Array.isArray(d.phases)) {
        throw new Error(`workflow-pack.yaml in ${packDir}: prompts.diagnose.phases must be an array`);
      }
      const phases: PromptPhaseDefinition[] = [];
      for (const ph of d.phases as Array<Record<string, unknown>>) {
        if (!ph || typeof ph !== 'object') {
          throw new Error('each prompts.diagnose.phases entry must be an object');
        }
        if (typeof ph.id !== 'string' || !ph.id) {
          throw new Error('each prompts.diagnose.phases entry must have a string id');
        }
        if (typeof ph.prompt !== 'string' || !ph.prompt) {
          throw new Error(`prompts.diagnose.phases[${ph.id}] must have a string prompt path`);
        }
        if (typeof ph.exit_condition !== 'string' || !ph.exit_condition) {
          throw new Error(`prompts.diagnose.phases[${ph.id}] must have a string exit_condition`);
        }
        const result = readPromptFile(packDir, ph.prompt, budget);
        if (result.warning) warnings.push(result.warning);
        phases.push({
          id: ph.id,
          prompt: ph.prompt,
          exit_condition: ph.exit_condition,
          prompt_content: result.content,
          validator: typeof ph.validator === 'string' ? ph.validator : undefined,
        });
      }
      config.diagnose = { phases };
    }
  }

  // grill.intro and grill.question_packs (lightweight; same patterns)
  if (p.grill && typeof p.grill === 'object') {
    const g = p.grill as Record<string, unknown>;
    const grillCfg: PromptsGrillConfig = {};
    if (typeof g.intro === 'string' && g.intro) {
      const r = readPromptFile(packDir, g.intro, budget);
      if (r.warning) warnings.push(r.warning);
      grillCfg.intro = { path: g.intro, content: r.content };
    }
    if (Array.isArray(g.question_packs)) {
      grillCfg.question_packs = [];
      for (const qp of g.question_packs as unknown[]) {
        if (typeof qp !== 'string' || !qp) {
          throw new Error('prompts.grill.question_packs entries must be non-empty strings');
        }
        const r = readPromptFile(packDir, qp, budget);
        if (r.warning) warnings.push(r.warning);
        grillCfg.question_packs.push({ path: qp, content: r.content });
      }
    }
    if (grillCfg.intro || grillCfg.question_packs) {
      config.grill = grillCfg;
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * Scan {repoRoot}/.agent-os/packs/ for workflow-pack.yaml files.
 * Returns [] if the packs directory does not exist (backward compat — no pack loaded).
 * Returns a result per pack found; caller decides how to handle failures.
 */
export function loadWorkflowPacks(repoRoot: string): WorkflowPackLoadResult[] {
  const packsDir = join(repoRoot, '.agent-os', 'packs');
  if (!existsSync(packsDir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(packsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  return entries.map((name) => {
    const packDir = join(packsDir, name);
    const manifestPath = join(packDir, 'workflow-pack.yaml');
    if (!existsSync(manifestPath)) {
      return { ok: false, error: `workflow-pack.yaml not found in ${packDir}`, packDir };
    }
    try {
      const text = readFileSync(manifestPath, 'utf-8');
      const raw = YAML.parse(text);
      const manifest = validateManifest(raw, packDir);
      return { ok: true, manifest, packDir };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to load pack at ${packDir}: ${(err as Error).message}`,
        packDir,
      };
    }
  });
}
