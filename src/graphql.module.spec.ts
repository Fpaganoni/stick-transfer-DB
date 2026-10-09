import { INestApplication } from "@nestjs/common";
import { ApolloDriverConfig } from "@nestjs/apollo";
import { GraphQLModule } from "@nestjs/graphql";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { baseGraphqlConfig } from "./graphql.module";

const QUERY = "{ ping }";

describe("GraphQL CSRF protection", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          ...baseGraphqlConfig,
          typeDefs: "type Query { ping: String! }",
          resolvers: { Query: { ping: () => "pong" } },
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("enables csrfPrevention explicitly instead of relying on the Apollo default", () => {
    expect(baseGraphqlConfig.csrfPrevention).toBe(true);
  });

  it("serves a normal JSON POST (non-simple content type forces a preflight)", async () => {
    const res = await request(app.getHttpServer())
      .post("/graphql")
      .set("Content-Type", "application/json")
      .send({ query: QUERY });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ping: "pong" });
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"])(
    "blocks a cross-site-forgeable POST with content type %s",
    async (contentType) => {
      const res = await request(app.getHttpServer())
        .post("/graphql")
        .set("Content-Type", contentType)
        .send(JSON.stringify({ query: QUERY }));

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/CSRF|preflight/i);
    },
  );

  it("blocks a bare GET query that carries no preflight-forcing header", async () => {
    const res = await request(app.getHttpServer()).get("/graphql").query({ query: QUERY });

    expect(res.status).toBe(400);
  });

  it("allows a GET query that opts in with the Apollo preflight header", async () => {
    const res = await request(app.getHttpServer())
      .get("/graphql")
      .set("Apollo-Require-Preflight", "true")
      .query({ query: QUERY });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ping: "pong" });
  });
});
