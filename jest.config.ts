import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  testTimeout: 60000,
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^(\\.\\.?/.*)\\.js$": "$1",
  },
};

export default config;
