// Discriminated-union envelope returned by every Server Action.
// Forces callers to handle the failure path before reading data.

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      code?: ActionErrorCode;
      fieldErrors?: Record<string, string[]>;
    };

export type ActionErrorCode =
  | "validation_failed"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "internal_error";

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = <T = never>(
  error: string,
  code: ActionErrorCode = "internal_error",
  fieldErrors?: Record<string, string[]>,
): ActionResult<T> => ({ ok: false, error, code, fieldErrors });
