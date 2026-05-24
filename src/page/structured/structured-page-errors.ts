import type {
  StructuredPageError,
  StructuredPageWarning
} from '../../shared/schemas/structured-page-data.schema';

export function structuredPageWarning(
  code: string,
  message: string,
  detail?: unknown
): StructuredPageWarning {
  return detail === undefined ? { code, message } : { code, message, detail };
}

export function structuredPageError(
  code: string,
  message: string,
  detail?: unknown
): StructuredPageError {
  return detail === undefined ? { code, message } : { code, message, detail };
}
