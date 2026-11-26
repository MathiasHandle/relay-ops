import { randomUUID } from "node:crypto"
import { once } from "node:events"
import {
  DELIVERY_TOPOLOGY,
  deliveryJobSchema,
} from "@relay-ops/backend-shared/queue"
import { DeliveryBatchInterruptedError } from "./delivery-publisher.errors"

import type { DeliveryJob } from "@relay-ops/backend-shared/queue"
import type { ConfirmChannel } from "amqplib"
import type { DeliveryPublishErrorCode } from "./delivery-publisher.errors"

export type DeliveryPublishResult =
  | { deliveryId: string; kind: "published" }
  | { deliveryId: string; kind: "failed"; code: DeliveryPublishErrorCode }

export type DeliveryPublisher = {
  publish: (jobs: DeliveryJob[]) => Promise<DeliveryPublishResult[]>
}

type PendingMessage = { returned: boolean }

type PublisherState = {
  pendingMessages: Map<string, PendingMessage>
  batchController: AbortController | undefined
}

type CreateDeliveryPublisherParams = { channel: ConfirmChannel }

export function createDeliveryPublisher(
  params: CreateDeliveryPublisherParams,
): DeliveryPublisher {
  const { channel } = params

  const state: PublisherState = {
    pendingMessages: new Map(),
    batchController: undefined,
  }

  // returned mandatory message that couldn't be routed to a queue
  channel.on("return", (message) => {
    const messageId: unknown = message.properties.messageId
    if (typeof messageId !== "string") return

    const pending = state.pendingMessages.get(messageId)
    if (pending) pending.returned = true
  })

  // channel closed -> cancel processing current batch of messages
  channel.on("close", () => {
    state.batchController?.abort(
      new DeliveryBatchInterruptedError("RabbitMQ channel closed during batch"),
    )
  })

  return { publish: (jobs) => publish({ channel, state, jobs }) }
}

const CONFIRM_TIMEOUT_MS = 5_000

type PublishBatchOptions = {
  channel: ConfirmChannel
  state: PublisherState
  jobs: DeliveryJob[]
}

async function publish(
  options: PublishBatchOptions,
): Promise<DeliveryPublishResult[]> {
  const { channel, state, jobs } = options

  // interrupt the batch if confirms doesn't arrive within the time limit
  const controller = new AbortController()
  state.batchController = controller
  const timeout = setTimeout(() => {
    controller.abort(
      new DeliveryBatchInterruptedError("Publish batch timed out"),
    )
  }, CONFIRM_TIMEOUT_MS)

  try {
    const publishPromises = await sendJobs({
      channel,
      state,
      jobs,
      signal: controller.signal,
    })

    return await waitForBatch({
      publishPromises,
      signal: controller.signal,
    })
  } catch (cause) {
    if (controller.signal.aborted) {
      throw controller.signal.reason
    }

    throw new DeliveryBatchInterruptedError("Publish batch interrupted", {
      cause,
    })
  } finally {
    clearTimeout(timeout)
    state.pendingMessages.clear()
    state.batchController = undefined
  }
}

type SendJobsOptions = PublishBatchOptions & { signal: AbortSignal }

/**
 * Publishes jobs to an exchange
 * If write buffer is full and there are still pending jobs to send it will wait for "drain" event
 * @returns Array of promises for the individual publish results
 */
async function sendJobs(
  options: SendJobsOptions,
): Promise<Promise<DeliveryPublishResult>[]> {
  const { channel, state, jobs, signal } = options

  const publishPromises: Promise<DeliveryPublishResult>[] = []

  for (const [index, job] of jobs.entries()) {
    signal.throwIfAborted()

    const { result, hasRoom } = sendJob({ channel, state, job })
    publishPromises.push(result)

    // wait for drain if channel is full; if abort is requested, cancel waiting
    if (!hasRoom && index < jobs.length - 1) {
      await once(channel, "drain", { signal })
    }
  }

  return publishPromises
}

type SendJobOptions = {
  channel: ConfirmChannel
  state: PublisherState
  job: DeliveryJob
}

function sendJob(options: SendJobOptions) {
  const { channel, state, job } = options

  const parsed = deliveryJobSchema.safeParse(job)
  if (!parsed.success) {
    const result: DeliveryPublishResult = {
      deliveryId: job.deliveryId,
      kind: "failed",
      code: "INVALID_JOB",
    }
    return { result: Promise.resolve(result), hasRoom: true }
  }

  const messageId = randomUUID()
  const entry: PendingMessage = { returned: false }
  const { promise, resolve } = Promise.withResolvers<DeliveryPublishResult>()
  state.pendingMessages.set(messageId, entry)

  const hasRoom = channel.publish(
    DELIVERY_TOPOLOGY.process.exchange,
    DELIVERY_TOPOLOGY.process.routingKey,
    Buffer.from(JSON.stringify(parsed.data)),
    {
      persistent: true,
      contentType: "application/json",
      messageId,
      timestamp: Math.floor(Date.now() / 1_000),
      mandatory: true,
    },
    (error) => {
      state.pendingMessages.delete(messageId)
      if (error) {
        resolve({
          deliveryId: job.deliveryId,
          kind: "failed",
          code: "PUBLISH_FAILED",
        })
      } else if (entry.returned) {
        resolve({
          deliveryId: job.deliveryId,
          kind: "failed",
          code: "UNROUTABLE",
        })
      } else {
        resolve({ deliveryId: job.deliveryId, kind: "published" })
      }
    },
  )
  return { result: promise, hasRoom }
}

type WaitForBatchOptions = {
  publishPromises: Promise<DeliveryPublishResult>[]
  signal: AbortSignal
}

async function waitForBatch(
  options: WaitForBatchOptions,
): Promise<DeliveryPublishResult[]> {
  const { publishPromises, signal } = options

  // if batch is already cancelled, throw error
  signal.throwIfAborted()

  const { promise: interrupted, reject } = Promise.withResolvers<never>()
  const onAbort = () => reject(signal.reason)
  signal.addEventListener("abort", onAbort, { once: true })

  try {
    return await Promise.race([Promise.all(publishPromises), interrupted])
  } finally {
    signal.removeEventListener("abort", onAbort)
  }
}
