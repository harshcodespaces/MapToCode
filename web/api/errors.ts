export class MapToCodeApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly details: unknown;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "MapToCodeApiError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.details = options.details;
  }
}
