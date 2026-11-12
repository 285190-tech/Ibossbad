"use strict";

module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended",
    "plugin:node/recommended",
  ],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    strict: "error",
    "node/no-deprecated-api": "warn",
  },
  overrides: [
    {
      files: ["examples/*/*.js"],
      rules: {
        "node/no-missing-require": "off",
        "node/no-unpublished-require": "off",
      },
    },
    {
      files: ["public/**/*.js"],
      env: {
        node: false,
        browser: true,
        worker: true,
        serviceworker: true,
        es6: true,
      },
      globals: {
        $scramjetLoadWorker: "readonly",
        $scramjetLoadController: "readonly",
        BareMux: "readonly",
      },
      parserOptions: {
        ecmaVersion: 2020,
      },
      rules: {
        "no-empty": ["error", { allowEmptyCatch: true }],
        "node/no-unsupported-features/es-syntax": "off",
        "node/no-unsupported-features/es-builtins": "off",
        "node/no-unsupported-features/node-builtins": "off",
      },
    },
    {
      files: ["test/**"],
      rules: {
        "node/no-unsupported-features/node-builtins": "off",
      },
    },
  ],
  ignorePatterns: ["test/source/", "test/expected/"],
};
