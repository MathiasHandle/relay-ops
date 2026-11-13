import { z } from "zod"

export const deliveryJobSchema = z.object({
  deliveryId: z.cuid2(),
})

export type DeliveryJob = z.infer<typeof deliveryJobSchema>
