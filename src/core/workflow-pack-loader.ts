import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  };
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
