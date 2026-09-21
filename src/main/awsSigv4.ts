// R145.1: AWS Signature Version 4 — pure request signer built on Node's
// crypto (zero npm deps; deliberately NOT @aws-sdk). Bedrock's OpenAI-
// compatible endpoint authenticates with SigV4 headers instead of a Bearer
// token, which is the only protocol difference from the existing
// chatCompletion pipeline.
//
// Reference: AWS "Signature Version 4 signing process" general reference.
// The unit tests pin this to the public botocore sigv4 test-suite vectors
// (the `service` is a parameter precisely so those vectors apply).

import { createHash, createHmac } from 'node:crypto'

const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Uint8Array, data: string): Uint8Array =>
  new Uint8Array(createHmac('sha256', key).update(data, 'utf8').digest())

/** URI-encode per SigV4 rules (RFC 3986 unreserved set stays literal;
 *  '/' stays literal in paths but is encoded in query values). */
function uriEncode(str: string, encodeSlash = true): string {
  let out = ''
  for (const ch of str) {
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')
      || ch === '-' || ch === '_' || ch === '.' || ch === '~') {
      out += ch
    } else if (ch === '/' && !encodeSlash) {
      out += '/'
    } else {
      for (const byte of Buffer.from(ch, 'utf8')) out += `%${byte.toString(16).toUpperCase()}`
    }
  }
  return out
}

export interface AwsSigv4Input {
  /** Service name ('bedrock', or arbitrary for the official test vectors). */
  service: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** Temporary credentials (STS) — sent AND signed as x-amz-security-token. */
  sessionToken?: string
  method: string
  /** Absolute URL; query must already be in wire order (we sort for signing). */
  url: string
  /** Exact request body bytes (empty string for none). */
  body: string
  /** ISO basic time; omit to use the given Date (default now, test-friendly). */
  amzDate?: string
  now?: Date
  /** S3-style x-amz-content-sha256 header (signed when on). Bedrock doesn't
   *  need it — the payload hash rides in the canonical request either way. */
  signPayloadHeader?: boolean
}

/** ISO basic datetime YYYYMMDD'T'HHMMSS'Z' (SigV4 x-amz-date format). */
export function toAmzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Canonical + signed headers for an AWS SigV4 request. All returned headers
 * must accompany the fetch (they participate in the signature).
 */
export function signAwsRequest(input: AwsSigv4Input): Record<string, string> {
  const u = new URL(input.url)
  const amzDate = input.amzDate ?? toAmzDate(input.now ?? new Date())
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(input.body)

  const headers: Record<string, string> = {
    host: u.host,
    'x-amz-date': amzDate,
  }
  if (input.signPayloadHeader === true) headers['x-amz-content-sha256'] = payloadHash
  if (input.sessionToken && input.sessionToken !== '') headers['x-amz-security-token'] = input.sessionToken

  // canonical headers: lowercase names, sorted, trimmed values, trailing \n
  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim().replace(/\s+/g, ' ')}\n`).join('')
  const signedHeaders = names.join(';')

  // canonical query string: sort by encoded key, then encoded value
  const queryPairs = [...u.searchParams.entries()]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk)))
  const canonicalQuery = queryPairs.map(([k, v]) => `${k}=${v}`).join('&')

  const canonicalRequest = [
    input.method.toUpperCase(),
    uriEncode(u.pathname, false),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  // derived signing key: kSigning = HMAC(HMAC(HMAC(HMAC("AWS4"+sk, date), region), service), "aws4_request")
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, input.region)
  const kService = hmac(kRegion, input.service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { ...headers, authorization }
}

/** R145.3: Bedrock OpenAI-compatible chat endpoint for a region. */
export function bedrockChatUrl(region: string): string {
  return `https://bedrock-runtime.${region}.amazonaws.com/openai/v1/chat/completions`
}

/** Bedrock request headers (service fixed to 'bedrock'). */
export function signBedrockChat(opts: {
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  body: string
  amzDate?: string
  now?: Date
}): Record<string, string> {
  return signAwsRequest({
    service: 'bedrock',
    method: 'POST',
    url: bedrockChatUrl(opts.region),
    ...opts,
  })
}
