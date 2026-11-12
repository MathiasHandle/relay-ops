import { describe, expect, it } from "vitest"
import { createEventBodySchema } from "./event.schemas"

const validBody = {
  event: {
    externalId: "ext-1",
    name: "order.created",
    payload: { orderId: 1, nested: { list: [1, "two", null, true] } },
  },
  destinations: [{ humanReadableId: "a" }, { humanReadableId: "b" }],
}

describe("createEventBodySchema", () => {
  it("accepts a valid body with a nested JSON payload", () => {
    expect(createEventBodySchema.safeParse(validBody).success).toBe(true)
  })

  it("accepts an empty payload object", () => {
    const body = { ...validBody, event: { ...validBody.event, payload: {} } }

    expect(createEventBodySchema.safeParse(body).success).toBe(true)
  })

  it.each([
    ["an array", [1, 2]],
    ["a string", "text"],
    ["null", null],
  ])("rejects a payload that is %s", (_, payload) => {
    const body = { ...validBody, event: { ...validBody.event, payload } }

    expect(createEventBodySchema.safeParse(body).success).toBe(false)
  })

  it("rejects a payload with a non-JSON value", () => {
    const body = {
      ...validBody,
      event: { ...validBody.event, payload: { at: new Date() } },
    }

    expect(createEventBodySchema.safeParse(body).success).toBe(false)
  })

  it.each(["externalId", "name"] as const)("rejects an empty %s", (field) => {
    const body = { ...validBody, event: { ...validBody.event, [field]: "" } }

    expect(createEventBodySchema.safeParse(body).success).toBe(false)
  })

  it("rejects an empty destination list", () => {
    const body = { ...validBody, destinations: [] }

    expect(createEventBodySchema.safeParse(body).success).toBe(false)
  })

  it("rejects duplicate destinations", () => {
    const body = {
      ...validBody,
      destinations: [{ humanReadableId: "a" }, { humanReadableId: "a" }],
    }

    const result = createEventBodySchema.safeParse(body)

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.message)).toContain(
      "Duplicate destinations are not allowed",
    )
  })
})
