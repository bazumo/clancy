#!/usr/bin/env node

/**
 * Publish all public packages to npm.
 * Replaces `changeset publish` to work around 2FA/OTP issues.
 *
 * Usage:
 *   node scripts/publish.js              # publish with beta tag (auto-detected from pre.json)
 *   node scripts/publish.js --tag latest  # publish with explicit tag
 *   node scripts/publish.js --dry-run     # show what would be published
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Parse args
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
let tag = null
const tagIndex = args.indexOf('--tag')
if (tagIndex !== -1 && args[tagIndex + 1]) {
  tag = args[tagIndex + 1]
}

// Auto-detect pre-release tag from changeset pre.json
if (!tag) {
  const prePath = join(root, '.changeset', 'pre.json')
  if (existsSync(prePath)) {
    const pre = JSON.parse(readFileSync(prePath, 'utf8'))
    if (pre.mode === 'pre' && pre.tag) {
      tag = pre.tag
      console.log(`Detected pre-release mode: --tag ${tag}`)
    }
  }
}

// Packages to publish in dependency order
const packages = [
  'packages/shared',
  'packages/utls/platforms/linux-x64',
  'packages/utls/platforms/linux-arm64',
  'packages/utls/platforms/darwin-x64',
  'packages/utls/platforms/darwin-arm64',
  'packages/utls',
  'packages/backend',
  'packages/app',
]

const publishedVersions = new Set()
let published = 0
let skipped = 0
let failed = 0

for (const pkgDir of packages) {
  const pkgPath = join(root, pkgDir, 'package.json')
  if (!existsSync(pkgPath)) {
    console.log(`  skip ${pkgDir} (not found)`)
    skipped++
    continue
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

  if (pkg.private) {
    console.log(`  skip ${pkg.name} (private)`)
    skipped++
    continue
  }

  // Check if this version is already published
  try {
    const info = execSync(`npm view ${pkg.name}@${pkg.version} version 2>/dev/null`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    if (info === pkg.version) {
      console.log(`  skip ${pkg.name}@${pkg.version} (already published)`)
      skipped++
      continue
    }
  } catch {
    // Not published yet — proceed
  }

  const tagFlag = tag ? `--tag ${tag}` : ''
  const dryRunFlag = dryRun ? '--dry-run' : ''
  const cmd = `npm publish --access public ${tagFlag} ${dryRunFlag}`.trim()
  const cwd = join(root, pkgDir)

  console.log(`  publishing ${pkg.name}@${pkg.version} ...`)
  try {
    execSync(cmd, { cwd, stdio: 'inherit' })
    published++
    publishedVersions.add(pkg.version)
    console.log(`  ✓ ${pkg.name}@${pkg.version}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${pkg.name}@${pkg.version} — publish failed`)
  }
}

// Create one git tag per version (like changeset publish does)
if (publishedVersions.size > 0 && !dryRun) {
  console.log('\nCreating git tags...')
  for (const version of publishedVersions) {
    const gitTag = `v${version}`
    try {
      execSync(`git tag ${gitTag}`, { cwd: root, stdio: 'pipe' })
      console.log(`  tagged ${gitTag}`)
    } catch {
      console.warn(`  skip tag ${gitTag} (already exists)`)
    }
  }
}

console.log(`\nDone: ${published} published, ${skipped} skipped, ${failed} failed`)
if (failed > 0) process.exit(1)
