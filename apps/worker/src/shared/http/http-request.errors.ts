type HttpRequestErrorOptions = {
  reason: "timeout" | "request-failed"
  cause: unknown
}

export class HttpRequestError extends Error {
  override name = "HttpRequestError"
  readonly reason: HttpRequestErrorOptions["reason"]

  constructor(options: HttpRequestErrorOptions) {
    const { reason, cause } = options

    super("HTTP request failed", { cause })
    this.reason = reason
  }
}
