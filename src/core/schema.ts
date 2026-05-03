import { readFileSync } from 'node:fs';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

export function loadSchema(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export interface ValidateResult {
  valid: boolean;
  errors: ErrorObject[] | null;
}

function getOrCompile(schema: object): ValidateFunction {
  const id = (schema as { $id?: string }).$id;
  if (id) {
    const existing = ajv.getSchema(id);
    if (existing) return existing as ValidateFunction;
  }
  return ajv.compile(schema);
}

export function validate(schema: unknown, data: unknown): ValidateResult {
  const validateFn = getOrCompile(schema as object);
  const valid = validateFn(data);
  return { valid: !!valid, errors: validateFn.errors ?? null };
}
