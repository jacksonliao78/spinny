import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@game": path.resolve(__dirname, "engine"),
    },
  },
});
