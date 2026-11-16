type DeliveryPublishErrorOptions = {
  deliveryId: string
  confirmedDeliveryIds: string[]
  unattemptedDeliveryIds: string[]
  cause: unknown
}

export class DeliveryPublishError extends Error {
  override name = "DeliveryPublishError"
  readonly deliveryId: string
  readonly confirmedDeliveryIds: string[]
  readonly unattemptedDeliveryIds: string[]

  constructor(options: DeliveryPublishErrorOptions) {
    const { deliveryId, confirmedDeliveryIds, unattemptedDeliveryIds, cause } =
      options

    super("Failed to publish delivery job", { cause })
    this.deliveryId = deliveryId
    this.confirmedDeliveryIds = [...confirmedDeliveryIds]
    this.unattemptedDeliveryIds = [...unattemptedDeliveryIds]
  }
}
