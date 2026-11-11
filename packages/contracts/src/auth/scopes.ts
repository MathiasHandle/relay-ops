export const CLIENT_SCOPES = {
  EVENTS_READ: "events:read",
  EVENTS_WRITE: "events:write",
  DELIVERIES_READ: "deliveries:read",
  DELIVERIES_RETRY: "deliveries:retry",
  DESTINATIONS_READ: "destinations:read",
  DESTINATIONS_WRITE: "destinations:write",
} as const

export type ClientScope = (typeof CLIENT_SCOPES)[keyof typeof CLIENT_SCOPES]
