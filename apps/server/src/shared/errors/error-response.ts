import z from "zod"

export const domainErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  code: z.string(),
  message: z.string(),
})
