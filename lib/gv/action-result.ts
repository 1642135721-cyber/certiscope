export type ActionFailureCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RETRYABLE"
  | "INTERNAL";

export type ActionResult<T> =
  | { ok: true; data: T; message: string }
  | {
      ok: false;
      code: ActionFailureCode;
      message: string;
      fields?: Record<string, string>;
      retryable: boolean;
    };

export function success<T>(data: T, message = "已保存"): ActionResult<T> {
  return { ok: true, data, message };
}

export function failure<T = never>(
  code: ActionFailureCode,
  message: string,
  fields?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, code, message, fields, retryable: code === "RETRYABLE" };
}

export function actionStatus(result: ActionResult<unknown>): number {
  if (result.ok) return 200;
  return (
    {
      VALIDATION: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      CONFLICT: 409,
      RETRYABLE: 503,
      INTERNAL: 500,
    } as const
  )[result.code];
}

export function readIdempotencyKey(request: Request): string | null {
  const key = request.headers.get("Idempotency-Key")?.trim();
  return key && key.length <= 128 ? key : null;
}
