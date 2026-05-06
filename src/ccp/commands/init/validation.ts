const PROJECT_ID_RE = /^[a-z][a-z0-9-]{0,62}$/;

export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id);
}

export function validateProjectId(id: string): string | null {
  if (id.length === 0) return 'project_id is required';
  if (id.length > 63) return 'project_id must be 63 characters or fewer';
  if (!isValidProjectId(id)) {
    return 'project_id must be lowercase, start with a letter, and contain only [a-z0-9-]';
  }
  return null;
}
