import z from "zod"

// RFC 6749 §5.2
export const OAUTH_ERROR_CODES = [
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
] as const

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number]

// RFC 6749 §5.2
export const oauthErrorResponseSchema = z.object({
  error: z.enum(OAUTH_ERROR_CODES),
  error_description: z.string().optional(),
  error_uri: z.url().optional(),
})
