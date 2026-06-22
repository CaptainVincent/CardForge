import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendors into their own cached chunks
        // (was one >500KB bundle). React Flow + dagre dominate. Function form
        // for rolldown/Vite 8 compatibility.
        manualChunks(id) {
          if (id.includes('@xyflow')) return 'reactflow';
          if (id.includes('@dagrejs')) return 'dagre';
          return undefined;
        },
      },
    },
  },
});
