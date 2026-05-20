import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import depthLimit from "graphql-depth-limit";

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: ["./**/*.graphql"],
      context: ({ req }) => ({ req }),
      playground: true,
      validationRules: [depthLimit(5)], // Protect against deeply nested malicious queries
      formatError: (error: any) => {
        const originalError = error.extensions?.originalError || error;
        
        // Console logger (in a real app, send to Datadog/Sentry)
        console.error("--- GRAPHQL ERROR ---", new Date().toISOString());
        console.error("Message:", error.message);
        console.error("Path:", error.path);
        
        // 1. Prisma Data Leak Prevention
        // If the error message contains 'prisma' or is an unhandled 500, we mask it!
        // Prisma errors often expose SQL schema, rows, and relationships
        if (
          error.message.includes("Prisma") || 
          error.message.includes("database") ||
          originalError?.code?.startsWith?.("P") // Prisma specific error codes
        ) {
          console.error("Critical DB Exception Caught:", originalError);
          return {
            message: "Internal server error",
            statusCode: 500,
            timestamp: new Date().toISOString()
          };
        }

        // 2. Standardize Validation Errors (from ValidationPipe)
        if (originalError?.message && Array.isArray(originalError.message)) {
          return {
            message: "Validation Error",
            errors: originalError.message, // Return the exact ValidationPipe array
            statusCode: 400,
          };
        }

        // 3. Keep expected GraphQL errors (like UnauthorizedException) intact
        return {
          message: error.message || "Internal server error",
          statusCode: error.extensions?.code === "UNAUTHENTICATED" ? 401 : (originalError?.statusCode || 500),
          code: error.extensions?.code,
        };
      },
    }),
  ],
})
export class GraphqlModule {}
