export type DeliveryPublishErrorCode =
  "INVALID_JOB" | "UNROUTABLE" | "PUBLISH_FAILED"

export class DeliveryBatchInterruptedError extends Error {
  override name = "DeliveryBatchInterruptedError"
}
