import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // Enforce minimum thresholds — CI will fail if coverage drops below these.
      // Thresholds apply to the included files; route handlers and UI components
      // are excluded since they require full Next.js runtime mocking.
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
      exclude: [
        'node_modules/**',
        '.next/**',
        '**/*.config.*',
        '**/*.d.ts',
        '**/types/**',
        // Exclude Next.js route handlers from coverage (tested separately via integration)
        'app/api/**',
        'app/**/page.tsx',
        'app/**/layout.tsx',
      ],
    },
  },
})
