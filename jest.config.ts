import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "tsconfig.spec.json" }],
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "\\.module\\.ts$",
    "main\\.ts$",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};

export default config;
