import { createHash } from 'node:crypto';

export function normalizeConstitutionForHash(text: string): string {
  // Match Python: re.sub(r'(content-hash:\s*)"[^"]*"', r'\1""', raw)
  return text.replace(/(content-hash:\s*)"[^"]*"/g, '$1""');
}

export function computeConstitutionHash(text: string): string {
  const normalized = normalizeConstitutionForHash(text);
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

export function computeJsonFileHash(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}
