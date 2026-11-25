import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT'])
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: '/stream/',
    plugins: [],
    server: {
      host: env.HOST ?? '127.0.0.1',
      port,
      strictPort: true,
    },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 4600,
      sourcemap: false,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.{ts,mjs}'],
    },
  }
})
