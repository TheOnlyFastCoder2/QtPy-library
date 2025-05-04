// core/tsup.config.ts
export default {
  entry: {
    index: "src/index.ts",
    "observable/index": "src/observable/index.ts",
    "query/index": "src/query/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  clean: true,
};
