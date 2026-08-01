import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["server/**/*.test.js", "scripts/**/*.test.js"],
    // scripts/check-toolchain.test.js and scripts/check-unused-template.test.js both
    // mutate the real tracked package.json/package-lock.json in place and restore them
    // in afterEach; running test files in parallel workers let those mutations race and
    // clobber each other. Force sequential file execution so each restore completes
    // before the next file's mutation begins.
    fileParallelism: false,
  },
});
