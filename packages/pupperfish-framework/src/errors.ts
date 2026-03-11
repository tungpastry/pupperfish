export class PupperfishError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "PupperfishError";
    this.code = code;
    this.status = status;
  }
}

export function isPupperfishError(error: unknown): error is PupperfishError {
  return error instanceof PupperfishError;
}
