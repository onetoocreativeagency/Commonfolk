import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:preview` inlines everything into one HTML file that opens
// straight from disk (no server needed) — handy for sharing a preview.
export default defineConfig(({ mode }) =>
  mode === 'preview'
    ? { plugins: [viteSingleFile()], build: { outDir: 'preview' } }
    : {},
);
