import { readFileSync } from "fs";
import { join } from "path";
import {
  buildSchema,
  getNamedType,
  GraphQLObjectType,
  GraphQLSchema,
  isNonNullType,
} from "graphql";

const SDL_FILES = [
  "schema.graphql",
  "admin/admin.graphql",
  "notifications/notifications.graphql",
  "report/report.graphql",
];

function loadSchema(): GraphQLSchema {
  const sdl = SDL_FILES.map((file) => readFileSync(join(__dirname, "..", file), "utf8")).join("\n");
  return buildSchema(sdl);
}

describe("follow lists SDL", () => {
  const schema = loadSchema();
  const query = schema.getQueryType()!;
  const user = schema.getType("User") as GraphQLObjectType;

  it.each(["followers", "following"])(
    "Query.%s returns UserBasicInfo, which is what the resolver serves",
    (name) => {
      const field = query.getFields()[name];
      expect(getNamedType(field.type).name).toBe("UserBasicInfo");
    },
  );

  it.each([
    ["Query", "followers"],
    ["Query", "following"],
    ["User", "followers"],
    ["User", "following"],
  ])("%s.%s takes optional limit and offset", (typeName, fieldName) => {
    const type = schema.getType(typeName) as GraphQLObjectType;
    const args = type.getFields()[fieldName].args;
    for (const argName of ["limit", "offset"]) {
      const arg = args.find((a) => a.name === argName);
      expect(arg?.type.toString()).toBe("Int");
      expect(isNonNullType(arg!.type)).toBe(false);
    }
  });

  it("exposes the follow counters on the User returned by me", () => {
    expect(getNamedType(query.getFields().me.type).name).toBe("User");
    expect(user.getFields().followersCount.type.toString()).toBe("Int!");
    expect(user.getFields().followingCount.type.toString()).toBe("Int!");
  });
});
