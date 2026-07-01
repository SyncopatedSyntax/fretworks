import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local multi-zone dev: proxy each trainer path-prefix to that trainer's dev
// server, mirroring the Vercel `rewrites` used in production. Run every app's
// `npm run dev` on the port below (see .claude/launch.json) so clicking a tool
// in the launcher loads the real trainer at /chord/, /diatonic/, etc.
const ZONES = {
  "/chord": "http://localhost:5180",
  "/diatonic": "http://localhost:5181",
  "/melodic-minor": "http://localhost:5182",
  "/altered": "http://localhost:5183",
  "/circle": "http://localhost:5184",
  "/triads": "http://localhost:5185",
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      Object.entries(ZONES).map(([path, target]) => [
        path,
        { target, changeOrigin: true, ws: true },
      ])
    ),
  },
});
