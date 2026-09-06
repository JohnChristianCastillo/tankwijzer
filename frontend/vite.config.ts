/** Vite build config. Output goes to dist/, which Cloudflare serves as static assets. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
