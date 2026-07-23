#!/usr/bin/env node
/**
 * Community registry CI validation. Self-contained: plain Node ≥ 20, no
 * dependencies (including the zip reader), so the registry repo needs no
 * install step.
 *
 * Checks:
 *  - games.json parses, matches the schema, has no duplicate ids
 *  - no com.boardr.* ids (reserved for built-ins)
 *  - for each entry changed vs the base branch (or all, outside a PR):
 *      bundle bytes match sha256/sizeBytes; zip within caps with safe paths;
 *      manifest inside the bundle agrees with the entry; declared entries exist
 *  - warns when a changed entry's author differs from the PR author
 *
 * Bundles are prebuilt — this validates structure and integrity only, it
 * never executes game code.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_ENTRIES = 500
const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_TOTAL_BYTES = 100 * 1024 * 1024

let failures = 0
const fail = (msg) => {
  failures += 1
  console.error(`FAIL: ${msg}`)
}
const warn = (msg) => {
  // GitHub Actions annotation; plain stderr elsewhere
  console.error(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `WARN: ${msg}`)
}

// --- schema -----------------------------------------------------------------

const ID_RE = /^[a-z0-9][a-z0-9.-]*$/
const TAG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SHA_RE = /^[0-9a-f]{64}$/

function validateEntry(entry, i) {
  const at = `games[${i}] (${entry?.id ?? '?'})`
  const bad = (m) => fail(`${at}: ${m}`)
  if (typeof entry !== 'object' || entry === null) return bad('not an object')
  if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) bad('id must be lowercase [a-z0-9.-]')
  if (typeof entry.name !== 'string' || entry.name.length < 1 || entry.name.length > 64) bad('name must be 1–64 chars')
  if (typeof entry.description !== 'string' || entry.description.length > 280) bad('description must be a string ≤ 280 chars')
  if (!Array.isArray(entry.tags) || entry.tags.length > 6 || entry.tags.some((t) => typeof t !== 'string' || !TAG_RE.test(t)))
    bad('tags must be ≤ 6 lowercase kebab-case strings')
  if (typeof entry.version !== 'string' || entry.version.length === 0) bad('version required')
  if (typeof entry.sdkVersion !== 'string') bad('sdkVersion required')
  if (
    typeof entry.players !== 'object' ||
    !Number.isInteger(entry.players?.min) ||
    !Number.isInteger(entry.players?.max) ||
    entry.players.min < 1 ||
    entry.players.max < entry.players.min
  )
    bad('players must be {min, max} with 1 ≤ min ≤ max')
  if (!['none', 'optional', 'required'].includes(entry.phoneMode)) bad('phoneMode must be none|optional|required')
  if (typeof entry.author !== 'string' || entry.author.length < 1) bad('author (GitHub handle) required')
  if (entry.iconUrl !== null && entry.iconUrl !== undefined && typeof entry.iconUrl !== 'string') bad('iconUrl must be a string or null')
  if (typeof entry.downloadUrl !== 'string' || entry.downloadUrl.length === 0) bad('downloadUrl required')
  else if (entry.downloadUrl.startsWith('http:')) bad('external downloadUrl must be https')
  if (typeof entry.sha256 !== 'string' || !SHA_RE.test(entry.sha256)) bad('sha256 must be 64 lowercase hex chars')
  if (!Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 1) bad('sizeBytes must be a positive integer')
  if (typeof entry.id === 'string' && entry.id.startsWith('com.boardr.')) bad('com.boardr.* ids are reserved for built-ins')
}

// --- minimal zip reader (stored + deflate), hostile-input safe --------------

function readZip(buffer) {
  // find EOCD from the tail
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record')
  const count = buffer.readUInt16LE(eocd + 10)
  const cdOffset = buffer.readUInt32LE(eocd + 16)
  if (count > MAX_ENTRIES) throw new Error(`too many entries: ${count} > ${MAX_ENTRIES}`)

  const entries = []
  let p = cdOffset
  let totalBytes = 0
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory')
    const method = buffer.readUInt16LE(p + 10)
    const compressedSize = buffer.readUInt32LE(p + 20)
    const uncompressedSize = buffer.readUInt32LE(p + 24)
    const nameLen = buffer.readUInt16LE(p + 28)
    const extraLen = buffer.readUInt16LE(p + 30)
    const commentLen = buffer.readUInt16LE(p + 32)
    const externalAttrs = buffer.readUInt32LE(p + 38)
    const localOffset = buffer.readUInt32LE(p + 42)
    const name = buffer.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    p += 46 + nameLen + extraLen + commentLen

    const isDir = name.endsWith('/')
    const isSymlink = ((externalAttrs >>> 16) & 0o170000) === 0o120000
    if (!isDir) {
      if (uncompressedSize > MAX_FILE_BYTES) throw new Error(`${name} exceeds the per-file cap`)
      totalBytes += uncompressedSize
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('archive exceeds the total uncompressed cap')
    }
    const normalized = name.replaceAll('\\', '/')
    if (normalized.startsWith('/') || normalized.split('/').includes('..') || normalized.includes('\0')) {
      throw new Error(`unsafe entry path: ${name}`)
    }

    entries.push({
      name: normalized,
      isDir,
      isSymlink,
      read() {
        const lp = localOffset
        if (buffer.readUInt32LE(lp) !== 0x04034b50) throw new Error(`corrupt local header for ${name}`)
        const lNameLen = buffer.readUInt16LE(lp + 26)
        const lExtraLen = buffer.readUInt16LE(lp + 28)
        const start = lp + 30 + lNameLen + lExtraLen
        const raw = buffer.subarray(start, start + compressedSize)
        if (method === 0) return Buffer.from(raw)
        if (method === 8) {
          const out = inflateRawSync(raw, { maxOutputLength: MAX_FILE_BYTES })
          if (out.length !== uncompressedSize) throw new Error(`${name}: size mismatch after inflate`)
          return out
        }
        throw new Error(`${name}: unsupported compression method ${method}`)
      },
    })
  }
  return entries
}

// --- bundle validation --------------------------------------------------------

async function bundleBytes(entry) {
  if (/^https:\/\//.test(entry.downloadUrl)) {
    const res = await fetch(entry.downloadUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${entry.downloadUrl}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_FILE_BYTES) throw new Error('bundle exceeds the 50 MB cap')
    return buf
  }
  const path = join(ROOT, entry.downloadUrl)
  if (!resolve(path).startsWith(ROOT)) throw new Error(`downloadUrl escapes the repo: ${entry.downloadUrl}`)
  if (!existsSync(path)) throw new Error(`bundle file missing: ${entry.downloadUrl}`)
  return readFileSync(path)
}

async function validateBundle(entry) {
  const at = `games entry ${entry.id}`
  let bytes
  try {
    bytes = await bundleBytes(entry)
  } catch (err) {
    return fail(`${at}: ${err.message}`)
  }

  const sha = createHash('sha256').update(bytes).digest('hex')
  if (sha !== entry.sha256) fail(`${at}: sha256 is ${sha}, entry says ${entry.sha256}`)
  if (bytes.length !== entry.sizeBytes) fail(`${at}: bundle is ${bytes.length} bytes, entry says ${entry.sizeBytes}`)

  let entries
  try {
    entries = readZip(bytes)
  } catch (err) {
    return fail(`${at}: ${err.message}`)
  }
  if (entries.some((e) => e.isSymlink)) fail(`${at}: bundle contains symlink entries`)

  const files = new Map(entries.filter((e) => !e.isDir).map((e) => [e.name, e]))
  const manifestEntry = files.get('boardr.game.json')
  if (!manifestEntry) return fail(`${at}: bundle has no boardr.game.json`)
  let manifest
  try {
    manifest = JSON.parse(manifestEntry.read().toString('utf8'))
  } catch {
    return fail(`${at}: boardr.game.json in the bundle is not valid JSON`)
  }

  // index ⇄ manifest agreement: one fetch renders the store, so they must match
  const agree = (field, indexValue, manifestValue) => {
    if (JSON.stringify(indexValue) !== JSON.stringify(manifestValue)) {
      fail(`${at}: entry ${field} ${JSON.stringify(indexValue)} != manifest ${JSON.stringify(manifestValue)}`)
    }
  }
  agree('id', entry.id, manifest.id)
  agree('name', entry.name, manifest.name)
  agree('version', entry.version, manifest.version)
  agree('sdkVersion', entry.sdkVersion, manifest.sdkVersion)
  agree('players.min', entry.players.min, manifest.minPlayers)
  agree('players.max', entry.players.max, manifest.maxPlayers)
  agree('phoneMode', entry.phoneMode, manifest.phoneMode)
  agree('description', entry.description, manifest.description ?? '')
  agree('tags', entry.tags, manifest.tags ?? [])

  for (const [key, rel] of Object.entries(manifest.entries ?? {})) {
    if (typeof rel === 'string' && !files.has(rel)) fail(`${at}: manifest entries.${key} "${rel}" missing from bundle`)
  }
  if (typeof manifest.icon === 'string' && manifest.icon && !files.has(manifest.icon)) {
    fail(`${at}: manifest icon "${manifest.icon}" missing from bundle`)
  }
}

// --- main --------------------------------------------------------------------

let index
try {
  index = JSON.parse(readFileSync(join(ROOT, 'games.json'), 'utf8'))
} catch (err) {
  fail(`games.json unreadable: ${err.message}`)
  process.exit(1)
}
if (index.registryVersion !== 1) fail('registryVersion must be 1')
if (!Array.isArray(index.games)) {
  fail('games must be an array')
  process.exit(1)
}

index.games.forEach(validateEntry)
const ids = index.games.map((g) => g.id)
for (const dup of ids.filter((id, i) => ids.indexOf(id) !== i)) fail(`duplicate id: ${dup}`)

// In a PR, only re-validate entries that changed; otherwise validate everything.
let baseGames = new Map()
const baseRef = process.env.GITHUB_BASE_REF
if (baseRef) {
  try {
    const baseJson = execFileSync('git', ['show', `origin/${baseRef}:games.json`], { cwd: ROOT, encoding: 'utf8' })
    baseGames = new Map(JSON.parse(baseJson).games.map((g) => [g.id, g]))
  } catch {
    warn(`could not read games.json from origin/${baseRef}; validating every entry`)
  }
}
const changed = index.games.filter((g) => JSON.stringify(baseGames.get(g.id)) !== JSON.stringify(g))

const actor = process.env.GITHUB_ACTOR
for (const entry of changed) {
  const base = baseGames.get(entry.id)
  if (base && actor && base.author !== actor) {
    warn(`${entry.id} is owned by "${base.author}" but this PR is from "${actor}" — review carefully`)
  }
}

console.log(`validating ${changed.length} changed entr${changed.length === 1 ? 'y' : 'ies'} of ${index.games.length}`)
for (const entry of changed) await validateBundle(entry)

if (failures > 0) {
  console.error(`\n${failures} problem(s) found`)
  process.exit(1)
}
console.log('registry is valid ✔')
