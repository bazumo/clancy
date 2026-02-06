#!/usr/bin/env node

/**
 * Syncs platform binary package versions with @clancyapp/utls.
 * Run this after `changeset version` to keep platform packages in sync.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const utlsPkg = JSON.parse(readFileSync(join(root, 'packages/utls/package.json'), 'utf8'))
const version = utlsPkg.version

const platformDirs = [
  'packages/utls/platforms/linux-x64',
  'packages/utls/platforms/linux-arm64',
  'packages/utls/platforms/darwin-x64',
  'packages/utls/platforms/darwin-arm64',
]

for (const dir of platformDirs) {
  const pkgPath = join(root, dir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const oldVersion = pkg.version
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  if (oldVersion !== version) {
    console.log(`  ${pkg.name}: ${oldVersion} -> ${version}`)
  }
}

// Also update the optionalDependencies in @clancyapp/utls to pin platform versions
const optDeps = utlsPkg.optionalDependencies
if (optDeps) {
  let changed = false
  for (const [name, current] of Object.entries(optDeps)) {
    if (name.startsWith('@clancyapp/utls-') && current !== version) {
      optDeps[name] = version
      changed = true
    }
  }
  if (changed) {
    writeFileSync(join(root, 'packages/utls/package.json'), JSON.stringify(utlsPkg, null, 2) + '\n')
    console.log(`  Updated @clancyapp/utls optionalDependencies to ${version}`)
  }
}
