import { connect } from "amqplib"

export type QueueLogger = {
  error: (obj: object, msg?: string) => void
}

type ConnectQueueParams = {
  url: string
  logger: QueueLogger
}

export async function connectQueue(params: ConnectQueueParams) {
  const { url, logger } = params

  const connection = await connect(url)

  // without an "error" listener a broker-side close crashes the process
  connection.on("error", (err) => {
    logger.error({ err }, "RabbitMQ connection error")
  })

  const channel = await connection.createChannel()

  return {
    connection,
    channel,
  }
}
