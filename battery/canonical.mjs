import { createHash, sign, verify, createPublicKey } from 'node:crypto';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// JSON with object keys sorted at every level, so the same data always gives the same bytes.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// A module test is signed over its canonical JSON without the `signature` field (Ed25519, base64).
const signedBytes = ({ signature, ...rest }) => Buffer.from(canonicalJson(rest), 'utf8');

export const signModuleTest = (test, privateKey) =>
  ({ ...test, signature: sign(null, signedBytes(test), privateKey).toString('base64') });

export function verifyModuleTestSignature(test, publicKeyPem) {
  if (typeof test.signature !== 'string' || !test.signature) return false;
  try {
    return verify(null, signedBytes(test), createPublicKey(publicKeyPem), Buffer.from(test.signature, 'base64'));
  } catch {
    return false;
  }
}
