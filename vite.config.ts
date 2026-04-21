import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function vendorManualChunks(id: string) {
  if (!id.includes("node_modules")) return;

  if (id.includes("recharts")) return "charts";
  if (id.includes("@supabase")) return "supabase";
  if (id.includes("@tanstack/react-query")) return "query";
  if (id.includes("react-router")) return "router";
  if (id.includes("lucide-react")) return "icons";
  if (
    id.includes("@radix-ui") ||
    id.includes("cmdk") ||
    id.includes("embla-carousel") ||
    id.includes("class-variance-authority") ||
    id.includes("tailwind-merge") ||
    id.includes("clsx")
  ) {
    return "ui";
  }

  return "vendor";
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorManualChunks,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
