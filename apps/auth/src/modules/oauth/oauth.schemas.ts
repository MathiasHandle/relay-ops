import z from "zod"
import { CLIENT_SCOPES } from "@relay-ops/contracts"

const clientScopeSchema = z.enum(CLIENT_SCOPES)
export const clientScopesSchema = z.array(clientScopeSchema)

// RFC 6749 §3.3: `scope` is a space-delimited list of scope tokens
const isScopeList = (value: string) =>
  value.split(" ").every((scope) => clientScopeSchema.safeParse(scope).success)

const responseScopeSchema = z
  .string()
  .refine(isScopeList, { message: "Unknown or malformed scope" })

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: responseScopeSchema.optional(),
})
