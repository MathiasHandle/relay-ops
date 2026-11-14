import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HttpRequestError } from "./http-request.errors"
import { makeRequest } from "./make-request"

const fetchMock = vi.fn<typeof fetch>()
const logger = { error: vi.fn() }
const options = {
  url: "https://example.com/hook",
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ hello: "world" }),
  timeoutMs: 10_000,
  logger,
} as const

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("makeRequest", () => {
  it("passes request arguments and returns the original response and timeout signal", async () => {
    const controller = new AbortController()
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal)
    const response = new Response(null, { status: 204 })
    fetchMock.mockResolvedValue(response)

    const result = await makeRequest(options)
    expect(result.response).toBe(response)
    expect(result.signal).toBe(controller.signal)
    expect(timeout).toHaveBeenCalledWith(options.timeoutMs)
    expect(fetchMock).toHaveBeenCalledWith(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
      redirect: "error",
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("returns HTTP 503 as a response rather than a transport error", async () => {
    const response = new Response(null, { status: 503 })
    fetchMock.mockResolvedValue(response)
    await expect(makeRequest(options)).resolves.toEqual({
      response,
      signal: expect.any(AbortSignal),
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("leaves the body readable for the caller without cancelling it", async () => {
    const cancel = vi.fn()
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("response body"))
          controller.close()
        },
        cancel,
      }),
    )
    fetchMock.mockResolvedValue(response)
    const result = await makeRequest(options)
    expect(result.response.bodyUsed).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    await expect(result.response.text()).resolves.toBe("response body")
  })

  it("logs transport failure and preserves its cause in a typed error", async () => {
    const error = new TypeError("Connection failed")
    fetchMock.mockRejectedValue(error)
    const request = makeRequest(options)
    await expect(request).rejects.toBeInstanceOf(HttpRequestError)
    await expect(request).rejects.toMatchObject({
      reason: "request-failed",
      cause: error,
    })
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: error, reason: "request-failed" },
      "HTTP request failed",
    )
  })

  it("distinguishes and logs expiration of the request timeout", async () => {
    const controller = new AbortController()
    const error = new DOMException("Timed out", "TimeoutError")
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal)
    fetchMock.mockImplementation(() => {
      controller.abort(error)
      return Promise.reject(error)
    })
    const request = makeRequest(options)
    await expect(request).rejects.toBeInstanceOf(HttpRequestError)
    await expect(request).rejects.toMatchObject({
      reason: "timeout",
      cause: error,
    })
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: error, reason: "timeout" },
      "HTTP request failed",
    )
  })
  it("keeps the failure reason when the signal aborts later", async () => {
    const controller = new AbortController()
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal)
    fetchMock.mockRejectedValue(new Error("Connection failed"))
    const error = await makeRequest(options).catch((cause: unknown) => cause)
    controller.abort()
    expect(error).toBeInstanceOf(HttpRequestError)
    expect(error).toMatchObject({ reason: "request-failed" })
  })
})
