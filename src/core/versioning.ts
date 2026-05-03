export function resolveRuntimeVersion(requested: string): string {
  if (requested === '0.1.x') return '0.1.0';
  return requested;
}
