/**
 * Certificate generation utilities for tests
 * Uses node-forge to generate self-signed certificates
 */
import forge from 'node-forge'

export interface CertificateCredentials {
  key: string
  cert: string
}

export interface CertificateOptions {
  commonName?: string
  organizationName?: string
  validityYears?: number
  keySize?: number
  altNames?: string[]
}

// Cache for generated certificates (per commonName)
const certCache = new Map<string, CertificateCredentials>()

/**
 * Generate a self-signed certificate for testing
 * Results are cached by commonName
 */
export function generateTestCertificate(options: CertificateOptions = {}): CertificateCredentials {
  const {
    commonName = 'localhost',
    organizationName = 'Test',
    validityYears = 1,
    keySize = 2048,
    altNames = ['localhost']
  } = options

  // Check cache first
  const cacheKey = `${commonName}:${keySize}`
  const cached = certCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pki = forge.pki
  const keys = pki.rsa.generateKeyPair(keySize)
  const cert = pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + validityYears)

  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: organizationName }
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)

  // Set extensions for proper certificate handling
  const extensions: forge.pki.CertificateField[] = [
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      keyEncipherment: true
    },
    {
      name: 'subjectAltName',
      altNames: altNames.map(name => ({
        type: 2, // DNS
        value: name
      }))
    }
  ]
  cert.setExtensions(extensions)

  cert.sign(keys.privateKey)

  const credentials: CertificateCredentials = {
    key: pki.privateKeyToPem(keys.privateKey),
    cert: pki.certificateToPem(cert)
  }

  // Cache the result
  certCache.set(cacheKey, credentials)

  return credentials
}

/**
 * Clear the certificate cache
 * Useful when you need fresh certificates
 */
export function clearCertificateCache(): void {
  certCache.clear()
}

/**
 * Generate a simple certificate for localhost
 * This is a convenience wrapper for the most common use case
 */
export function generateCert(): CertificateCredentials {
  return generateTestCertificate({
    commonName: 'localhost',
    altNames: ['localhost', '127.0.0.1']
  })
}
