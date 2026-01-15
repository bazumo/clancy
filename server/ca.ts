import tls from 'tls'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import forge from 'node-forge'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const CERTS_DIR = path.join(__dirname, '..', 'certs')

// Ensure certs directory exists
if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true })
}

// CA certificate management
let caCert: forge.pki.Certificate
let caKey: forge.pki.PrivateKey
const certCache = new Map<string, tls.SecureContext>()

export function loadOrCreateCA() {
  const caCertPath = path.join(CERTS_DIR, 'ca.crt')
  const caKeyPath = path.join(CERTS_DIR, 'ca.key')

  if (fs.existsSync(caCertPath) && fs.existsSync(caKeyPath)) {
    caCert = forge.pki.certificateFromPem(fs.readFileSync(caCertPath, 'utf-8'))
    caKey = forge.pki.privateKeyFromPem(fs.readFileSync(caKeyPath, 'utf-8'))
    console.log('Loaded existing CA certificate')
  } else {
    console.log('Generating new CA certificate...')
    const keys = forge.pki.rsa.generateKeyPair(2048)
    caCert = forge.pki.createCertificate()
    caKey = keys.privateKey

    caCert.publicKey = keys.publicKey
    caCert.serialNumber = '01'
    caCert.validity.notBefore = new Date()
    caCert.validity.notAfter = new Date()
    caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10)

    const attrs = [
      { name: 'commonName', value: 'Claudeoscope Proxy CA' },
      { name: 'organizationName', value: 'Claudeoscope' }
    ]
    caCert.setSubject(attrs)
    caCert.setIssuer(attrs)

    caCert.setExtensions([
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true }
    ])

    caCert.sign(caKey, forge.md.sha256.create())

    fs.writeFileSync(caCertPath, forge.pki.certificateToPem(caCert))
    fs.writeFileSync(caKeyPath, forge.pki.privateKeyToPem(caKey))
    console.log(`CA certificate saved to ${caCertPath}`)
  }
}

export function generateCertForHost(host: string): tls.SecureContext {
  if (certCache.has(host)) {
    return certCache.get(host)!
  }

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = Date.now().toString(16)
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  const attrs = [{ name: 'commonName', value: host }]
  cert.setSubject(attrs)
  cert.setIssuer(caCert.subject.attributes)

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: host }] }
  ])

  cert.sign(caKey as forge.pki.rsa.PrivateKey, forge.md.sha256.create())

  const ctx = tls.createSecureContext({
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  })

  certCache.set(host, ctx)
  return ctx
}

