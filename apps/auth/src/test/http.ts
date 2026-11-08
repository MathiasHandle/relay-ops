// HTTP helpers for app.inject() requests.

export const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded"

// RFC 6749 §2.3.1: HTTP Basic client authentication.
export function basicAuth(clientId: string, secret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`
}

export function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}
