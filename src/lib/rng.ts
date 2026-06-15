/**
 * Provably-fair random number generation.
 *
 * Uses a synchronous, self-contained SHA-256 / HMAC-SHA256 implementation so
 * that every game outcome is deterministically derived from:
 *   - serverSeed  (secret, its SHA-256 hash is shown BEFORE you bet)
 *   - clientSeed  (chosen by the player)
 *   - nonce       (incrementing bet counter)
 *
 * After rotating the server seed it is revealed, so any past result can be
 * independently re-computed and verified — exactly like Stake / duel-style
 * casinos. The underlying entropy comes from crypto.getRandomValues.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** Raw SHA-256 over bytes. */
function sha256Bytes(data: Uint8Array): Uint8Array {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])

  const l = data.length
  const bitLen = l * 8
  const withOne = l + 1
  const k = (56 - (withOne % 64) + 64) % 64
  const total = withOne + k + 8
  const m = new Uint8Array(total)
  m.set(data)
  m[l] = 0x80
  const dv = new DataView(m.buffer)
  dv.setUint32(total - 4, bitLen >>> 0, false)
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false)

  const w = new Uint32Array(64)
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false)
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }

    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
  }

  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i], false)
  return out
}

function hmacSha256Bytes(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64
  let k = key
  if (k.length > blockSize) k = sha256Bytes(k)
  if (k.length < blockSize) {
    const padded = new Uint8Array(blockSize)
    padded.set(k)
    k = padded
  }
  const oKeyPad = new Uint8Array(blockSize)
  const iKeyPad = new Uint8Array(blockSize)
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = k[i] ^ 0x5c
    iKeyPad[i] = k[i] ^ 0x36
  }
  const inner = sha256Bytes(concat(iKeyPad, message))
  return sha256Bytes(concat(oKeyPad, inner))
}

// ---- encoding helpers ----

const encoder = new TextEncoder()

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

/** SHA-256 of a UTF-8 string → hex. */
export function sha256(message: string): string {
  return bytesToHex(sha256Bytes(encoder.encode(message)))
}

/** HMAC-SHA256(key, message) → hex. */
export function hmacSha256(key: string, message: string): string {
  return bytesToHex(hmacSha256Bytes(encoder.encode(key), encoder.encode(message)))
}

/** A cryptographically-random 64-char hex string. */
export function randomServerSeed(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/** A short random client seed. */
export function randomClientSeed(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/**
 * Generate `count` independent floats in [0, 1) for a single bet, using the
 * Stake-style byte stream: each float consumes 4 bytes of HMAC output, and
 * the stream re-hashes with an incrementing round when it runs out of bytes.
 */
export function randomFloats(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
): number[] {
  const floats: number[] = []
  let round = 0
  let buffer: number[] = []

  const refill = () => {
    const hex = hmacSha256(serverSeed, `${clientSeed}:${nonce}:${round}`)
    buffer = []
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(hex.slice(i, i + 2), 16))
    round++
  }

  for (let i = 0; i < count; i++) {
    let result = 0
    for (let j = 0; j < 4; j++) {
      if (buffer.length === 0) refill()
      const byte = buffer.shift() as number
      result += byte / Math.pow(256, j + 1)
    }
    floats.push(result)
  }
  return floats
}

/** Map a float in [0,1) to an integer in [min, max] inclusive. */
export function floatToInt(float: number, min: number, max: number): number {
  return min + Math.floor(float * (max - min + 1))
}

/**
 * Fisher–Yates shuffle of [0..size-1] driven by a provably-fair float stream.
 * Used for card games and Mines so the full deck/board is verifiable.
 */
export function shuffledIndices(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  size: number,
): number[] {
  const floats = randomFloats(serverSeed, clientSeed, nonce, size)
  const arr = Array.from({ length: size }, (_, i) => i)
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(floats[size - 1 - i] * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
