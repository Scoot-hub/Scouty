import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": "http://localhost:3001",
      "/uploads": "http://localhost:3001",
    },
    hmr: {
      overlay: false,
    },
    headers: {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.cal.eu https://*.cal.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: http://localhost:3001 https://*.cal.eu https://*.cal.com; frame-src 'self' https://*.cal.eu https://*.cal.com;",
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
            if (id.includes("xlsx")) return "xlsx";
            if (id.includes("@radix-ui")) return "ui";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@tanstack")) return "tanstack";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("@dnd-kit")) return "dnd";
            if (id.includes("date-fns") || id.includes("i18next") || id.includes("react-i18next")) return "utils";
            if (id.includes("react-dom") || id.includes("react-router")) return "vendor";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
