// R145.1: SigV4 signer tests. The get-vanilla case pins the implementation
// to the public botocore sigv4 test-suite vector (aws/aws-sigv4-test-suite);
// the rest are structural/determinism assertions that stay correct without
// memorized constants.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { signAwsRequest, signBedrockChat, bedrockChatUrl, toAmzDate } from '../../src/main/awsSigv4'

const CREDS = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }

describe('signAwsRequest (R145.1)', () => {
  it('matches the botocore get-vanilla official vector', () => {
    const headers = signAwsRequest({
      ...CREDS, service: 'service', region: 'us-east-1',
      method: 'GET', url: 'https://example.amazonaws.com/', body: '',
      amzDate: '20150830T123600Z',
    })
    expect(headers['x-amz-date']).toBe('20150830T123600Z')
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, '
      + 'SignedHeaders=host;x-amz-date, '
      + 'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    )
  })

  it('payload hash is sha256(body) and changes with the body', () => {
    const a = signAwsRequest({ ...CREDS, service: 'bedrock', region: 'us-east-1', method: 'POST', url: 'https://x.amazonaws.com/', body: '{"a":1}', amzDate: '20260101T000000Z', signPayloadHeader: true })
    const b = signAwsRequest({ ...CREDS, service: 'bedrock', region: 'us-east-1', method: 'POST', url: 'https://x.amazonaws.com/', body: '{"a":2}', amzDate: '20260101T000000Z', signPayloadHeader: true })
    expect(a['x-amz-content-sha256']).toBe(createHash('sha256').update('{"a":1}').digest('hex'))
    expect(a.authorization).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date')
    expect(a.authorization).not.toBe(b.authorization)
    // default (non-S3) services don't sign the payload header at all
    const bare = signAwsRequest({ ...CREDS, service: 'bedrock', region: 'us-east-1', method: 'POST', url: 'https://x.amazonaws.com/', body: '{"a":1}', amzDate: '20260101T000000Z' })
    expect(bare['x-amz-content-sha256']).toBeUndefined()
    expect(bare.authorization).toContain('SignedHeaders=host;x-amz-date')
  })

  it('session token is sent AND signed', () => {
    const withTok = signAwsRequest({ ...CREDS, sessionToken: 'AQoEXAMPLE...', service: 'bedrock', region: 'us-east-1', method: 'POST', url: 'https://x.amazonaws.com/', body: '{}', amzDate: '20260101T000000Z' })
    const noTok = signAwsRequest({ ...CREDS, service: 'bedrock', region: 'us-east-1', method: 'POST', url: 'https://x.amazonaws.com/', body: '{}', amzDate: '20260101T000000Z' })
    expect(withTok['x-amz-security-token']).toBe('AQoEXAMPLE...')
    expect(noTok['x-amz-security-token']).toBeUndefined()
    expect(withTok.authorization).toContain('SignedHeaders=host;x-amz-date;x-amz-security-token')
    expect(withTok.authorization).not.toBe(noTok.authorization)
  })

  it('credential scope follows date/region/service/aws4_request order', () => {
    const h = signAwsRequest({ ...CREDS, service: 'bedrock', region: 'eu-west-1', method: 'POST', url: 'https://x.amazonaws.com/', body: '', amzDate: '20260921T101112Z' })
    expect(h.authorization).toContain('Credential=AKIDEXAMPLE/20260921/eu-west-1/bedrock/aws4_request')
  })

  it('unsorted query strings sign identically to their sorted form', () => {
    const unsorted = signAwsRequest({ ...CREDS, service: 'bedrock', region: 'us-east-1', method: 'GET', url: 'https://x.amazonaws.com/path?b=2&a=1', body: '', amzDate: '20260101T000000Z' })
    const sorted = signAwsRequest({ ...CREDS, service: 'bedrock', region: 'us-east-1', method: 'GET', url: 'https://x.amazonaws.com/path?a=1&b=2', body: '', amzDate: '20260101T000000Z' })
    expect(unsorted.authorization).toBe(sorted.authorization)
  })

  it('deterministic for identical input; differs across regions', () => {
    const opts = { ...CREDS, service: 'bedrock', method: 'POST', url: 'https://x.amazonaws.com/', body: 'x', amzDate: '20260101T000000Z' }
    const r1 = signAwsRequest({ ...opts, region: 'us-east-1' })
    const r2 = signAwsRequest({ ...opts, region: 'us-east-1' })
    const other = signAwsRequest({ ...opts, region: 'us-west-2' })
    expect(r1.authorization).toBe(r2.authorization)
    expect(r1.authorization).not.toBe(other.authorization)
  })
})

describe('bedrock wrapper (R145.3)', () => {
  it('bedrockChatUrl targets the regional OpenAI-compatible endpoint', () => {
    expect(bedrockChatUrl('us-east-1')).toBe('https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions')
  })

  it('signBedrockChat posts with SigV4 and no Bearer header', () => {
    const h = signBedrockChat({ region: 'us-west-2', ...CREDS, body: '{"model":"us.anthropic.claude-sonnet-4-5"}', amzDate: '20260921T000000Z' })
    expect(h.host).toBe('bedrock-runtime.us-west-2.amazonaws.com')
    expect(h.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260921\/us-west-2\/bedrock\/aws4_request, /)
    expect(h.authorization).not.toContain('Bearer')
  })

  it('toAmzDate formats ISO basic Z', () => {
    expect(toAmzDate(new Date('2026-09-21T08:09:10.123Z'))).toBe('20260921T080910Z')
  })
})
