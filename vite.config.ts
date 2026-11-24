import { defineConfig } from 'vite'

export default defineConfig({
  // @ts-expect-error - manus tuning plugin is optional
  plugins: [],
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
  },
})
