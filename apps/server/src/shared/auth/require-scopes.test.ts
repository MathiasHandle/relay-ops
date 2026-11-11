import { describe, expect, it } from "vitest"
import { CLIENT_SCOPES } from "@relay-ops/contracts"
import { findMissingScopes } from "./require-scopes"

describe("findMissingScopes", () => {
  it("returns nothing when all required scopes are granted", () => {
    const missing = findMissingScopes({
      granted: [CLIENT_SCOPES.EVENTS_READ, CLIENT_SCOPES.EVENTS_WRITE],
      required: [CLIENT_SCOPES.EVENTS_WRITE],
    })

    expect(missing).toEqual([])
  })

  it("returns the scopes that are not granted", () => {
    const missing = findMissingScopes({
      granted: [CLIENT_SCOPES.EVENTS_READ],
      required: [CLIENT_SCOPES.EVENTS_READ, CLIENT_SCOPES.EVENTS_WRITE],
    })

    expect(missing).toEqual([CLIENT_SCOPES.EVENTS_WRITE])
  })

  it("returns all required scopes when none are granted", () => {
    const missing = findMissingScopes({
      granted: [],
      required: [CLIENT_SCOPES.EVENTS_WRITE],
    })

    expect(missing).toEqual([CLIENT_SCOPES.EVENTS_WRITE])
  })
})
