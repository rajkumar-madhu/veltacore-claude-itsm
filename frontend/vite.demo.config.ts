// Single-bundle build for the read-only demo page: run `VITE_DEMO=1 npx vite build -c vite.demo.config.ts`.
import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

export default mergeConfig(base, defineConfig({
  build: {
    outDir: 'dist-demo',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
}))
