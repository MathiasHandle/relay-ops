import { jsonSchemaTransform } from "fastify-type-provider-zod"

import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger"
import type { FastifySwaggerUiOptions } from "@fastify/swagger-ui"

export const SWAGGER_OPTIONS: FastifyDynamicSwaggerOptions = {
  openapi: {
    openapi: "3.2.0",
    info: {
      title: "Relay Ops Server Swagger",
      description: "Swagger for Relay Ops Server",
      version: "0.1.0",
    },
    tags: [
      { name: "health", description: "Service health check" },
      { name: "me", description: "Caller identity and organization" },
      { name: "events", description: "Event related end-points" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    externalDocs: {
      url: "https://swagger.io",
      description: "Find more info here",
    },
  },
  transform: jsonSchemaTransform,
}

export const SWAGGER_UI_OPTIONS: FastifySwaggerUiOptions = {
  routePrefix: "/docs",
}
