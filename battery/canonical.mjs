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

// Module and cell test records are signed over their canonical JSON without the `signature` field (Ed25519, base64).
const signedBytes = ({ signature, ...rest }) => Buffer.from(canonicalJson(rest), 'utf8');

export const signRecord = (record, privateKey) =>
  ({ ...record, signature: sign(null, signedBytes(record), privateKey).toString('base64') });

export function verifySignature(record, publicKeyPem) {
  if (typeof record.signature !== 'string' || !record.signature) return false;
  try {
    return verify(null, signedBytes(record), createPublicKey(publicKeyPem), Buffer.from(record.signature, 'base64'));
  } catch {
    return false;
  }
}
