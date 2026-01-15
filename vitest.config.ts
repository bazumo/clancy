import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use globals for describe, it, expect, etc.
    globals: true,
    
    // Environment for server-side tests
    environment: 'node',
    
    // Include patterns
    include: ['**/*.test.ts'],
    
    // Exclude patterns
    exclude: ['node_modules', 'dist'],
    
    // Longer timeout for integration tests
    testTimeout: 30000,
    
    // Hook timeout
    hookTimeout: 30000,
    
    // Reporter
    reporters: ['verbose'],
    
    // Coverage (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
})

