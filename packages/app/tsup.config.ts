import { defineConfig } from 'tsup'
import { builtinModules } from 'module'

const nodeBuiltins = builtinModules.flatMap(m => [m, `node:${m}`])

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  noExternal: [/(.*)/],
  external: [
    ...nodeBuiltins,
    '@clancyapp/utls',
    '@clancyapp/utls-linux-x64',
    '@clancyapp/utls-linux-arm64',
    '@clancyapp/utls-darwin-x64',
    '@clancyapp/utls-darwin-arm64',
  ],
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
})
