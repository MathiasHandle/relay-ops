import "fastify"

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the `authenticate` middleware; undefined on routes without it. */
    principal: {
      organizationId: string
      organizationName: string
      oauthIdentityId: string
      scopes: string[]
    }
  }
}
