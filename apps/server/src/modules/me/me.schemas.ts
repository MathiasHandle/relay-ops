import z from "zod"

export const meResponseBodySchema = z.object({
  organization: z.object({
    id: z.string(),
    name: z.string(),
  }),
  identity: z.object({
    id: z.string(),
  }),
  scopes: z.array(z.string()),
})
