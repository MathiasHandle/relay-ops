import amqp from "amqplib"

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)

  return value
}

async function request(options) {
  const { base, auth, method, path, body, allowNotFound = false } = options

  const response = await fetch(`${base}${path}`, {
    method,
    redirect: "error",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })

  // Only existence checks may treat 404 as an expected response.
  if (!response.ok && !(allowNotFound && response.status === 404)) {
    throw new Error(
      `RabbitMQ API ${method} failed with status ${response.status}`,
    )
  }

  return response
}

async function main() {
  // Credentials come from Kubernetes Secrets; the application must not use the administrator account.
  const host = required("RABBITMQ_HOST")
  const vhost = required("RABBITMQ_VHOST")
  const admin = required("RABBITMQ_ADMIN_USER")
  const adminPassword = required("RABBITMQ_ADMIN_PASSWORD")
  const user = required("RABBITMQ_APP_USER")
  const password = required("RABBITMQ_APP_PASSWORD")

  if (user === admin)
    throw new Error("Application user must differ from administrator")

  const base = `http://${host}:15672/api`
  const auth = Buffer.from(`${admin}:${adminPassword}`).toString("base64")
  const requestOptions = { base, auth }

  // A PUT on an existing vhost can overwrite its metadata, so create it only when absent.
  const vhostPath = `/vhosts/${encodeURIComponent(vhost)}`
  const userPath = `/users/${encodeURIComponent(user)}`

  const existingVhost = await request({
    ...requestOptions,
    method: "GET",
    path: vhostPath,
    allowNotFound: true,
  })

  if (existingVhost.status === 404) {
    await request({
      ...requestOptions,
      method: "PUT",
      path: vhostPath,
      body: {},
    })
  }

  // Preserve an existing user's password and reject accounts with management privileges.
  const existingUser = await request({
    ...requestOptions,
    method: "GET",
    path: userPath,
    allowNotFound: true,
  })

  if (existingUser.status === 404) {
    await request({
      ...requestOptions,
      method: "PUT",
      path: userPath,
      body: { password, tags: [] },
    })
  } else {
    const details = await existingUser.json()

    // Tagged accounts may have management access; application credentials must not grant it.
    const hasTags = Array.isArray(details.tags)
      ? details.tags.length > 0
      : Boolean(details.tags?.trim())

    if (hasTags) {
      throw new Error("Application user must not have tags")
    }
  }

  // Both applications declare the delivery topology and need access to its resources.
  const resourcePattern = "^deliveries(\\..*)?$"

  await request({
    ...requestOptions,
    method: "PUT",
    path: `/permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(user)}`,
    body: {
      configure: resourcePattern,
      write: resourcePattern,
      read: resourcePattern,
    },
  })

  // Verify the Secret and vhost access without changing an existing password.
  let connection

  try {
    connection = await amqp.connect(
      {
        protocol: "amqp",
        hostname: host,
        port: 5672,
        username: user,
        password,
        vhost,
      },
      { timeout: 10000 },
    )
  } catch {
    throw new Error(
      "AMQP connection failed; the Secret may not match the existing RabbitMQ user, or vhost access or broker availability may be incorrect",
    )
  }

  await connection.close()

  process.stdout.write("RabbitMQ setup complete\n")
}

main().catch((error) => {
  process.stderr.write(`RabbitMQ setup failed: ${error.message}\n`)
  process.exitCode = 1
})
