import { randomUUID } from "node:crypto"
import argon2 from "argon2"
import { SignJWT } from "jose"
import { env } from "@/config/env"
import { prisma } from "@/shared/db/prisma"
import { clientScopesSchema } from "./oauth.schemas"

import type OAuth2Server from "@node-oauth/oauth2-server"
import type { Client, Falsey, User } from "@node-oauth/oauth2-server"
import type { FastifyBaseLogger } from "fastify"
import type { SigningKey } from "@/modules/keys"
import type { ClientScope } from "./scopes"

async function verifyClientSecret(secret: string, hash: string) {
  const isValid = await argon2.verify(hash, secret)
  return isValid
}

declare module "@node-oauth/oauth2-server" {
  interface Client {
    allowedScopes: ClientScope[]
    clientId: string
  }
}

type IssuedToken = Pick<
  OAuth2Server.Token,
  "accessToken" | "accessTokenExpiresAt" | "scope"
>

// Single source for the token lifetime: the JWT `exp` and the `expires_in` in the
// token response (computed by oauth2-server) must match.
export const ACCESS_TOKEN_LIFETIME_SECONDS = 60 * 15

export class OAuth2Model implements OAuth2Server.ClientCredentialsModel {
  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly signingKey: SigningKey,
  ) {}

  async getClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<Client | Falsey> {
    this.logger.debug({ clientId }, "getClient called ")

    // get client from DB
    const client = await prisma.oAuthClient.findUnique({
      where: {
        clientId: clientId,
      },
    })
    if (!client) {
      this.logger.info({ clientId }, "client  not found")
      return false
    }

    // check if client is enabled
    if (!client.enabled) {
      this.logger.info({ clientId }, "client  is not enabled")
      return false
    }

    // check that client provided secret, if not ver ify dummy secret to prevent timing attack
    if (!clientSecret) {
      this.logger.info({ clientId }, "no secret provided for client ")
      const DUMMY_SECRET = "111111"
      const DUMMY_HASH =
        "$argon2id$v=19$m=65536,t=3,p=4$dzRNTHdVQTQyWkNON2h6TA$BPlTSPdTcEKxf4TykssxYg"

      await verifyClientSecret(DUMMY_SECRET, DUMMY_HASH)
      return false
    }

    // verify client secret
    const isValidSecret = await verifyClientSecret(
      clientSecret,
      client.secretHash,
    )
    if (!isValidSecret) {
      this.logger.info({ clientId }, "client secret is invalid")
      return false
    }

    const parsedAllowedScopes = clientScopesSchema.parse(client.allowedScopes)

    return {
      id: client.id,
      grants: ["client_credentials"],
      allowedScopes: parsedAllowedScopes,
      clientId: client.clientId,
    }
  }

  // Client credentials: the client acts on its own behalf, there is no end user
  async getUserFromClient(client: Client): Promise<User | Falsey> {
    return client
  }

  async validateScope(
    user: User,
    client: Client,
    scope?: ClientScope[],
  ): Promise<string[] | Falsey> {
    const allowedScopes = client.allowedScopes

    // client must send scopes
    if (!scope || scope.length === 0) {
      return false
    }

    const canAskForScopes = scope.every((askedScope) =>
      allowedScopes.includes(askedScope),
    )
    if (!canAskForScopes) {
      return false
    }

    return scope
  }

  // Access tokens are stateless JWTs verified by apps/server via JWKS; never called.
  async getAccessToken(): Promise<OAuth2Server.Token | Falsey> {
    return false
  }

  // JWT access tokens are not saved in DB
  async saveToken(
    token: IssuedToken,
    client: Client,
    user: User,
  ): Promise<OAuth2Server.Token> {
    this.logger.debug({ client, user }, "saveToken called")

    return { ...token, client, user }
  }

  async generateAccessToken(
    client: Client,
    user: User,
    scope: string[],
  ): Promise<string> {
    return new SignJWT({
      scope: scope.join(" "),
      client_id: client.clientId,
    })
      .setIssuedAt()
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setExpirationTime(`${ACCESS_TOKEN_LIFETIME_SECONDS}s`)
      .setProtectedHeader({
        kid: this.signingKey.kid,
        alg: "EdDSA",
        typ: "at+jwt",
      })
      .setSubject(client.id)
      .setJti(randomUUID())
      .sign(this.signingKey.privateKey)
  }
}
