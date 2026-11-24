import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The backend redirects to http://localhost:5173 after login, so the port is fixed.
  server: { port: 5173, strictPort: true },
});
