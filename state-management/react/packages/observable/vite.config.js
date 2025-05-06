import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["**/__tests__/**"],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["es", "cjs"],
      fileName: (format) => {
        if (format === "es") return "index.mjs";
        if (format === "cjs") return "index.cjs";
        return `index.${format}.js`;
      },
    },
    rollupOptions: {
      external: ["react", "react-dom", "@qtpy/state-management-observable"],
    },
  },
});
