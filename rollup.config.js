import terser from "@rollup/plugin-terser";

export default [
  {
    input: "src/index.js",
    output: {
      file: "dist/index.js",
      format: "esm",
    },
    plugins: [terser()],
  },
  {
    input: "src/index.js",
    output: {
      file: "dist/index.cjs",
      format: "cjs",
      exports: "named",
    },
    plugins: [terser()],
  },
];
