import { z } from "zod"

export const jwkSchema = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: z.string().min(1),
  kid: z.string().min(1),
  alg: z.literal("EdDSA"),
  use: z.literal("sig"),
})

export const jwksResponseSchema = z.object({
  keys: z.array(jwkSchema),
})
