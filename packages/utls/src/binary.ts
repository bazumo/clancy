import { createRequire } from 'module'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Platform/arch to package name mapping
 */
const PLATFORM_PACKAGES: Record<string, string> = {
  'linux-x64': '@clancy/utls-linux-x64',
  'linux-arm64': '@clancy/utls-linux-arm64',
  'darwin-x64': '@clancy/utls-darwin-x64',
  'darwin-arm64': '@clancy/utls-darwin-arm64',
}

/**
 * Get the platform key for the current system
 */
function getPlatformKey(): string {
  const platform = process.platform
  const arch = process.arch

  // Normalize architecture names
  const normalizedArch = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : arch

  return `${platform}-${normalizedArch}`
}

/**
 * Try to find binary in local development paths
 */
function getLocalBinaryPath(platformKey: string): string | null {
  // Try paths relative to this package (for monorepo development)
  // Platform packages are in platforms/{platformKey}/bin/tls-proxy
  const localPaths = [
    // From dist/ (compiled)
    path.join(__dirname, '..', 'platforms', platformKey, 'bin', 'tls-proxy'),
    // From src/ (when running with tsx)
    path.join(__dirname, 'platforms', platformKey, 'bin', 'tls-proxy'),
  ]

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return localPath
    }
  }

  return null
}

/**
 * Get the path to the uTLS binary for the current platform
 * @throws Error if no binary is available for the current platform
 */
export function getBinaryPath(): string {
  const platformKey = getPlatformKey()
  const packageName = PLATFORM_PACKAGES[platformKey]

  if (!packageName) {
    throw new Error(
      `No uTLS binary available for platform: ${platformKey}. ` +
      `Supported platforms: ${Object.keys(PLATFORM_PACKAGES).join(', ')}`
    )
  }

  // First, try local development path
  const localPath = getLocalBinaryPath(platformKey)
  if (localPath) {
    return localPath
  }

  // Then try to require the platform-specific package
  try {
    const pkg = require(packageName) as { binaryPath: string }
    return pkg.binaryPath
  } catch (err) {
    throw new Error(
      `Failed to load uTLS binary package '${packageName}' for platform ${platformKey}. ` +
      `Please install it: npm install ${packageName}\n` +
      `Original error: ${(err as Error).message}`
    )
  }
}

/**
 * Check if the uTLS binary is available for the current platform
 */
export function isBinaryAvailable(): boolean {
  try {
    getBinaryPath()
    return true
  } catch {
    return false
  }
}

/**
 * Get the list of supported platforms
 */
export function getSupportedPlatforms(): string[] {
  return Object.keys(PLATFORM_PACKAGES)
}

/**
 * Get the current platform key
 */
export function getCurrentPlatform(): string {
  return getPlatformKey()
}
