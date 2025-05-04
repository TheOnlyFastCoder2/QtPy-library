// Общие настройки для всех пакетов
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    minify: true,
    sourcemap: true,
    reportCompressedSize: true,
    lib: {
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "mjs" : "cjs"}`,
    },
    rollupOptions: {
      external: ["typescript"],
    },
  },
});
