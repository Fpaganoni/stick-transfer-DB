import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import depthLimit from "graphql-depth-limit";
import { formatGraphqlError } from "./common/errors/format-error";

/**
 * Everything except the schema source, exported so tests can boot the exact
 * same Apollo settings against a tiny in-memory schema.
 */
export const baseGraphqlConfig: ApolloDriverConfig = {
  driver: ApolloDriver,
  context: ({ req, res }) => ({ req, res }),
  playground: process.env.NODE_ENV !== "production",
  validationRules: [depthLimit(5)], // Protect against deeply nested malicious queries
  formatError: formatGraphqlError,
  // The session cookie is SameSite=None in production, so browsers attach it to
  // cross-site requests. Apollo then rejects "simple" requests (text/plain,
  // urlencoded, bare GET) that need no CORS preflight. Explicit on purpose so
  // upgrading or tweaking Apollo cannot silently turn it off.
  csrfPrevention: true,
};

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      ...baseGraphqlConfig,
      typePaths: ["./**/*.graphql"],
    }),
  ],
})
export class GraphqlModule {}
