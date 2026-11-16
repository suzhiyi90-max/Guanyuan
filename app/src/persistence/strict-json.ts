export const PORTABLE_SAVE_MAX_BYTES = 128 * 1024 * 1024

export type StrictJsonIssue =
  | 'json-invalid'
  | 'json-duplicate-key'
  | 'json-prototype-key'
  | 'json-resource-limit'
  | 'file-too-large'
  | 'json-encoding-invalid'

export class StrictJsonParseError extends Error {
  constructor(readonly issue: StrictJsonIssue) {
    super(issue)
    this.name = 'StrictJsonParseError'
  }
}

export interface StrictJsonLimits {
  readonly maxDepth?: number
  readonly maxNodes?: number
  readonly maxBytes?: number
}

const DEFAULT_LIMITS: Required<StrictJsonLimits> = {
  maxDepth: 256,
  maxNodes: 1_000_000,
  maxBytes: PORTABLE_SAVE_MAX_BYTES,
}

/**
 * A JSON grammar parser which detects duplicate decoded object keys before
 * constructing the value. Objects have null prototypes, and __proto__ is
 * rejected at every nesting level.
 */
export function parseStrictJson(source: string, limits: StrictJsonLimits = {}): unknown {
  const budget = { ...DEFAULT_LIMITS, ...limits }
  if (new TextEncoder().encode(source).byteLength > budget.maxBytes) {
    throw new StrictJsonParseError('file-too-large')
  }

  let offset = 0
  let nodes = 0
  const fail = (): never => { throw new StrictJsonParseError('json-invalid') }
  const resource = (): never => { throw new StrictJsonParseError('json-resource-limit') }
  const whitespace = (): void => {
    while (offset < source.length && (source[offset] === ' ' || source[offset] === '\n'
      || source[offset] === '\r' || source[offset] === '\t')) offset += 1
  }
  const countNode = (): void => {
    nodes += 1
    if (nodes > budget.maxNodes) resource()
  }
  const parseString = (): string => {
    if (source[offset] !== '"') fail()
    const start = offset
    offset += 1
    while (offset < source.length) {
      const code = source.charCodeAt(offset)
      if (code === 0x22) {
        offset += 1
        try { return JSON.parse(source.slice(start, offset)) as string } catch { fail() }
      }
      if (code < 0x20) fail()
      if (code === 0x5c) {
        offset += 1
        if (offset >= source.length) fail()
        const escaped = source[offset]
        if (escaped === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(source.slice(offset + 1, offset + 5))) fail()
          offset += 5
          continue
        }
        if (!['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(escaped)) fail()
      }
      offset += 1
    }
    return fail()
  }
  const parseValue = (depth: number): unknown => {
    whitespace()
    countNode()
    if (depth > budget.maxDepth) resource()
    const char = source[offset]
    if (char === '"') return parseString()
    if (char === '{') {
      offset += 1
      whitespace()
      const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>
      const keys = new Set<string>()
      if (source[offset] === '}') { offset += 1; return output }
      while (true) {
        whitespace()
        const key = parseString()
        if (key === '__proto__') throw new StrictJsonParseError('json-prototype-key')
        if (keys.has(key)) throw new StrictJsonParseError('json-duplicate-key')
        keys.add(key)
        whitespace()
        if (source[offset] !== ':') fail()
        offset += 1
        output[key] = parseValue(depth + 1)
        whitespace()
        if (source[offset] === '}') { offset += 1; return output }
        if (source[offset] !== ',') fail()
        offset += 1
      }
    }
    if (char === '[') {
      offset += 1
      whitespace()
      const output: unknown[] = []
      if (source[offset] === ']') { offset += 1; return output }
      while (true) {
        output.push(parseValue(depth + 1))
        whitespace()
        if (source[offset] === ']') { offset += 1; return output }
        if (source[offset] !== ',') fail()
        offset += 1
      }
    }
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, offset)) { offset += literal.length; return value }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(source.slice(offset))
    if (number) {
      offset += number[0].length
      const value = Number(number[0])
      if (!Number.isFinite(value)) fail()
      return value
    }
    return fail()
  }

  const result = parseValue(0)
  whitespace()
  if (offset !== source.length) fail()
  return result
}

/** Check the raw byte count before decoding untrusted file contents. */
export function parseStrictJsonBytes(bytes: Uint8Array, limits: StrictJsonLimits = {}): unknown {
  const maxBytes = limits.maxBytes ?? PORTABLE_SAVE_MAX_BYTES
  if (bytes.byteLength > maxBytes) throw new StrictJsonParseError('file-too-large')
  let source: string
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch {
    throw new StrictJsonParseError('json-encoding-invalid')
  }
  return parseStrictJson(source, { ...limits, maxBytes })
}
