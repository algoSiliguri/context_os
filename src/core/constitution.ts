import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { computeConstitutionHash, computeJsonFileHash } from './hash';
import { loadSchema, validate } from './schema';

export interface VerificationResult {
  passed: string[];
  hardFailed: string | null;
  softFailed: string[];
  detail: string | null;
}

function ok(passed: string[]): VerificationResult {
  return { passed, hardFailed: null, softFailed: [], detail: null };
}

function fail(condition: string, detail: string, passed: string[] = []): VerificationResult {
  return { passed, hardFailed: condition, softFailed: [], detail };
}

function checkC11(repoRoot: string): VerificationResult {
  const runtimeDir = join(repoRoot, '.agent-os', 'runtime');
  try {
    mkdirSync(runtimeDir, { recursive: true });
    const probe = join(runtimeDir, '.write_probe');
    writeFileSync(probe, '', 'utf-8');
    unlinkSync(probe);
  } catch (e) {
    return fail('C11', `Runtime directory not writable: ${(e as Error).message}`);
  }
  return ok(['C11']);
}

function parseB0Header(text: string): Record<string, unknown> | null {
  const match = text.match(/```yaml\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    return YAML.parse(match[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function checkC4(constitutionPath: string, b0: Record<string, unknown>): VerificationResult {
  const expected = String(b0['content-hash'] ?? '');
  if (!expected) return fail('C4', 'B0 content-hash is empty.');
  const raw = readFileSync(constitutionPath, 'utf-8');
  const actual = computeConstitutionHash(raw);
  if (actual !== expected) {
    return fail('C4', `content-hash mismatch. Expected: ${expected}  Got: ${actual}`);
  }
  return ok(['C4']);
}

function checkC8(repoRoot: string, b0: Record<string, unknown>): VerificationResult {
  const expected = String(b0['contract-index-hash'] ?? '');
  if (!expected) return fail('C8', 'B0 contract-index-hash is empty.');
  const indexPath = join(repoRoot, '.agent-os', 'contracts', 'index.json');
  if (!existsSync(indexPath)) return fail('C8', `contracts/index.json not found at ${indexPath}.`);
  const actual = computeJsonFileHash(readFileSync(indexPath, 'utf-8'));
  if (actual !== expected) {
    return fail('C8', `contract-index-hash mismatch. Expected: ${expected}  Got: ${actual}`);
  }
  return ok(['C8']);
}

function checkC7(repoRoot: string, b0: Record<string, unknown>): VerificationResult {
  const schemaPath = join(repoRoot, '.agent-os', 'schemas', 'constitution-binding.schema.json');
  if (!existsSync(schemaPath)) {
    return fail('C7', 'constitution-binding.schema.json not found.');
  }
  const schema = loadSchema(schemaPath);
  const result = validate(schema, b0);
  if (!result.valid) {
    return fail(
      'C7',
      `B0 header schema validation failed: ${result.errors?.[0]?.message ?? 'unknown'}`,
    );
  }
  return ok(['C7']);
}

function checkC10(repoRoot: string): VerificationResult {
  const errors: string[] = [];
  for (const name of ['telemetry-event.schema.json', 'permission-manifest.schema.json']) {
    const path = join(repoRoot, '.agent-os', 'schemas', name);
    if (!existsSync(path)) {
      errors.push(`${name} not found`);
      continue;
    }
    try {
      loadSchema(path);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  if (errors.length > 0) {
    return { passed: [], hardFailed: null, softFailed: ['C10'], detail: errors.join('; ') };
  }
  return ok(['C10']);
}

export function verifyConstitution(repoRoot: string): VerificationResult {
  const passed: string[] = [];
  const constitutionPath = join(repoRoot, 'AGENT_OS_CONSTITUTION.md');

  let r = checkC11(repoRoot);
  if (r.hardFailed) return r;
  passed.push(...r.passed);

  if (!existsSync(constitutionPath)) {
    return { ...fail('C4', 'AGENT_OS_CONSTITUTION.md not found.'), passed };
  }
  const text = readFileSync(constitutionPath, 'utf-8');
  const b0 = parseB0Header(text);
  if (!b0) return { ...fail('C4', 'Could not parse B0 header block.'), passed };

  r = checkC4(constitutionPath, b0);
  if (r.hardFailed) return { ...r, passed };
  passed.push(...r.passed);

  r = checkC8(repoRoot, b0);
  if (r.hardFailed) return { ...r, passed };
  passed.push(...r.passed);

  r = checkC7(repoRoot, b0);
  if (r.hardFailed) return { ...r, passed };
  passed.push(...r.passed);

  r = checkC10(repoRoot);
  passed.push(...r.passed);

  return {
    passed,
    hardFailed: null,
    softFailed: r.softFailed,
    detail: r.detail,
  };
}
