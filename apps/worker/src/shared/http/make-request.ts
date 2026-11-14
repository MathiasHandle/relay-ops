import { HttpRequestError } from "./http-request.errors"

type RequestLogger = {
  error: (context: object, message: string) => void
}

type MakeRequestOptions = {
  url: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  headers?: Record<string, string>
  body?: string
  timeoutMs: number
  logger: RequestLogger
}

type MakeRequestResult = {
  response: Response
  signal: AbortSignal
}

export async function makeRequest(
  options: MakeRequestOptions,
): Promise<MakeRequestResult> {
  const { url, method, headers, body, timeoutMs, logger } = options
  const signal = AbortSignal.timeout(timeoutMs)

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal,
      redirect: "error",
    })

    return { response, signal }
  } catch (error) {
    const reason = signal.aborted ? "timeout" : "request-failed"
    logger.error({ err: error, reason }, "HTTP request failed")

    throw new HttpRequestError({ reason, cause: error })
  }
}
