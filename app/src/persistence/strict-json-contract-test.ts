import { parseStrictJson, parseStrictJsonBytes, StrictJsonParseError } from './strict-json'

const passed: string[] = []
function check(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL ${name}`)
  passed.push(name)
  console.log(`PASS ${name}`)
}
function rejects(source: string, issue: string): boolean {
  try { parseStrictJson(source); return false } catch (error) {
    return error instanceof StrictJsonParseError && error.issue === issue
  }
}

check('parses nested JSON values', JSON.stringify(parseStrictJson('{"a":[1,true,null,"x"]}')) === '{"a":[1,true,null,"x"]}')
check('creates null-prototype objects', Object.getPrototypeOf(parseStrictJson('{"a":1}')) === null)
check('rejects duplicate literal keys', rejects('{"a":1,"a":2}', 'json-duplicate-key'))
check('rejects duplicate escaped-equivalent keys', rejects('{"a":1,"\\u0061":2}', 'json-duplicate-key'))
check('rejects prototype keys at arbitrary depth', rejects('{"outer":[{"__proto__":{"polluted":true}}]}', 'json-prototype-key'))
check('rejects malformed trailing content', rejects('{"a":1} false', 'json-invalid'))
check('rejects invalid number grammar', rejects('{"n":01}', 'json-invalid'))
check('rejects excessive nesting', (() => {
  try { parseStrictJson(`${'['.repeat(260)}0${']'.repeat(260)}`); return false } catch (error) {
    return error instanceof StrictJsonParseError && error.issue === 'json-resource-limit'
  }
})())
check('rejects malformed UTF-8 bytes', (() => {
  try { parseStrictJsonBytes(new Uint8Array([0xc3, 0x28])); return false } catch (error) {
    return error instanceof StrictJsonParseError && error.issue === 'json-encoding-invalid'
  }
})())
check('rejects byte limit before decode', (() => {
  try { parseStrictJsonBytes(new Uint8Array(9), { maxBytes: 8 }); return false } catch (error) {
    return error instanceof StrictJsonParseError && error.issue === 'file-too-large'
  }
})())
console.log(`strict-json: ${passed.length}/${passed.length} passed`)
