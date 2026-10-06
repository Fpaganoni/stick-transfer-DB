import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import depthLimit from "graphql-depth-limit";
import { formatGraphqlError } from "./common/errors/format-error";

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: ["./**/*.graphql"],
      context: ({ req, res }) => ({ req, res }),
      playground: process.env.NODE_ENV !== "production",
      validationRules: [depthLimit(5)], // Protect against deeply nested malicious queries
      formatError: formatGraphqlError,
    }),
  ],
})
export class GraphqlModule {}
