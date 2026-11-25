export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export class ConfigError extends HttpError {
  constructor(message: string) {
    super(503, 'not_configured', message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, 'bad_request', message);
  }
}
