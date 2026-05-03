import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { verifyConstitution } from './constitution';
import { loadProjectConfig } from './manifest';

export interface DoctorCheck {
  id: string;
  description: string;
  status: 'pass' | 'fail' | 'soft_fail';
  detail?: string;
}

export interface DoctorReport {
  status: 'ok' | 'soft_fail' | 'hard_fail';
  checks: DoctorCheck[];
}

export function runDoctor(repoRoot: string): DoctorReport {
  const checks: DoctorCheck[] = [];

  const constitutionPath = join(repoRoot, 'AGENT_OS_CONSTITUTION.md');
  if (!existsSync(constitutionPath)) {
    checks.push({
      id: 'constitution_exists',
      description: 'AGENT_OS_CONSTITUTION.md exists',
      status: 'fail',
      detail: `Not found at ${constitutionPath}`,
    });
    return { status: 'hard_fail', checks };
  }
  checks.push({
    id: 'constitution_exists',
    description: 'AGENT_OS_CONSTITUTION.md exists',
    status: 'pass',
  });

  const verify = verifyConstitution(repoRoot);
  if (verify.hardFailed) {
    checks.push({
      id: 'constitution_verify',
      description: 'Constitution binding conditions',
      status: 'fail',
      detail: `${verify.hardFailed}: ${verify.detail ?? ''}`,
    });
    return { status: 'hard_fail', checks };
  }
  checks.push({
    id: 'constitution_verify',
    description: 'Constitution binding conditions',
    status: verify.softFailed.length > 0 ? 'soft_fail' : 'pass',
    detail: verify.softFailed.length > 0 ? `soft: ${verify.softFailed.join(', ')}` : undefined,
  });

  const projectYaml = join(repoRoot, '.agent-os', 'project.yaml');
  if (!existsSync(projectYaml)) {
    checks.push({
      id: 'project_yaml_exists',
      description: '.agent-os/project.yaml exists',
      status: 'fail',
      detail: `Not found at ${projectYaml}`,
    });
    return { status: 'hard_fail', checks };
  }
  try {
    loadProjectConfig(projectYaml);
    checks.push({
      id: 'project_yaml_valid',
      description: '.agent-os/project.yaml parses and validates',
      status: 'pass',
    });
  } catch (e) {
    checks.push({
      id: 'project_yaml_valid',
      description: '.agent-os/project.yaml parses and validates',
      status: 'fail',
      detail: (e as Error).message,
    });
    return { status: 'hard_fail', checks };
  }

  const hasSoft = checks.some((c) => c.status === 'soft_fail');
  return { status: hasSoft ? 'soft_fail' : 'ok', checks };
}
