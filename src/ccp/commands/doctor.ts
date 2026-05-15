import { type DoctorReport, runDoctor } from '../../core/doctor';
import { renderPackBadge, type PackVersionState } from '../../core/renderer';

export function runDoctorCommand(args: { repoRoot: string }): Promise<DoctorReport> {
  return Promise.resolve(runDoctor(args.repoRoot));
}

// ── Glyphs ────────────────────────────────────────────────────────────────────

const USE_ANSI =
  typeof process !== 'undefined' &&
  process.stdout?.isTTY === true &&
  process.env['NO_COLOR'] === undefined;

function checkGlyph(status: 'pass' | 'soft_fail' | 'fail'): string {
  if (USE_ANSI) {
    if (status === 'pass') return '✓';
    if (status === 'soft_fail') return '⚠';
    return '✗';
  }
  if (status === 'pass') return '[ok]';
  if (status === 'soft_fail') return '[!]';
  return '[x]';
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = ['● Agent OS doctor', ''];

  for (const check of report.checks) {
    if (check.packs && check.packs.length > 0) {
      // Structured pack rows
      const label = (check.label ?? 'Packs');
      lines.push(`  ${label}:`);
      for (const pack of check.packs) {
        const badge = renderPackBadge(
          pack.state as PackVersionState,
          pack.id,
          pack.version,
          pack.bundled_version,
        );
        const inactive = pack.active === false ? ' (inactive)' : '';
        lines.push(`    ${badge}${inactive}`);
      }
    } else {
      // Standard check row
      const rawLabel = check.label ?? check.description ?? check.id ?? '';
      const label = rawLabel.padEnd(15);
      const glyph = checkGlyph(check.status);
      const detail = check.detail ? ` ${check.detail}` : '';
      lines.push(`  ${label} ${glyph}${detail}`);
    }
  }

  lines.push('', `  Status: ${report.status}`);
  if (report.hint) lines.push(`  Hint:   ${report.hint}`);

  return lines.join('\n');
}
