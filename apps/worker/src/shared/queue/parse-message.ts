import type { z } from "zod"

type ParseMessageResult<TData> =
  { success: true; data: TData } | { success: false; error: unknown }

type ParseMessageParams<TData> = {
  content: Buffer
  schema: z.ZodType<TData>
}

export function parseMessage<TData>(
  params: ParseMessageParams<TData>,
): ParseMessageResult<TData> {
  const { content, schema } = params
  let json: unknown

  try {
    json = JSON.parse(content.toString())
  } catch (error) {
    return { success: false, error }
  }

  return schema.safeParse(json)
}
