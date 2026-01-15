import initCycleTLS, { CycleTLSClient, CycleTLSRequestOptions, CycleTLSResponse } from 'cycletls'

/**
 * TLS fingerprint profiles for different clients
 * JA3 fingerprints identify the TLS client based on ClientHello parameters
 */
export const TLS_PROFILES = {
  // Electron (based on Chromium) - mimics modern Chrome/Electron TLS behavior
  electron: {
    ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) electron/28.0.0 Chrome/120.0.6099.291 Safari/537.36',
  },
  // Chrome 120
  chrome120: {
    ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  // Firefox 121
  firefox121: {
    ja3: '771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-34-51-43-13-45-28-27,29-23-24-25-256-257,0',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  },
} as const

export type TLSProfile = keyof typeof TLS_PROFILES

// Singleton CycleTLS client instance
let cycleClient: CycleTLSClient | null = null
let initPromise: Promise<CycleTLSClient> | null = null

// Current active profile
let activeProfile: TLSProfile = 'electron'

/**
 * Initialize or return the existing CycleTLS client
 */
export async function getCycleClient(): Promise<CycleTLSClient> {
  if (cycleClient) {
    return cycleClient
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = initCycleTLS()
  cycleClient = await initPromise
  console.log('[CycleTLS] Initialized with profile:', activeProfile)
  return cycleClient
}

/**
 * Set the active TLS profile
 */
export function setTLSProfile(profile: TLSProfile): void {
  activeProfile = profile
  console.log('[CycleTLS] Profile set to:', profile)
}

/**
 * Get the current TLS profile
 */
export function getTLSProfile(): TLSProfile {
  return activeProfile
}

/**
 * Make an HTTPS request using CycleTLS with the configured fingerprint
 */
export async function cycleFetch(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
    timeout?: number
    disableRedirect?: boolean
    // Allow overriding the profile for a single request
    profile?: TLSProfile
  } = {}
): Promise<CycleTLSResponse> {
  const client = await getCycleClient()
  const profile = TLS_PROFILES[options.profile ?? activeProfile]
  const method = options.method ?? 'GET'

  const requestOptions: CycleTLSRequestOptions = {
    ja3: profile.ja3,
    userAgent: profile.userAgent,
    headers: options.headers ?? {},
    body: options.body ?? '',
    timeout: options.timeout ?? 30,
    disableRedirect: options.disableRedirect ?? false,
  }

  return client(url, requestOptions, method)
}

/**
 * Gracefully shutdown the CycleTLS client
 */
export async function shutdownCycleClient(): Promise<void> {
  if (cycleClient) {
    await cycleClient.exit()
    cycleClient = null
    initPromise = null
    console.log('[CycleTLS] Client shut down')
  }
}

// Export types for external use
export type { CycleTLSResponse, CycleTLSRequestOptions }

