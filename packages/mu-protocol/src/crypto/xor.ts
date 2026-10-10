/**
 * XOR ciphers of the MU Online protocol.
 *
 * - Xor3: 3-byte repeating XOR, used for the credentials inside the login packet.
 * - Xor32: chained 32-byte XOR, applied by the client to *every* outgoing packet before the
 *   SimpleModulus layer (`result[i] = result[i] ^ result[i-1] ^ key[i % 32]`).
 *
 * Algorithm source: MUnique/OpenMU (MIT) `src/Network/Xor/*.cs`, verified against the reference
 * test vectors in tests/vectors/openmu_simplemodulus.json.
 */

/** Default 3-byte XOR key. */
export const XOR3_KEY = new Uint8Array([0xfc, 0xcf, 0xab]);

/** Default 32-byte XOR key. */
export const XOR32_KEY = new Uint8Array([
  0xab, 0x11, 0xcd, 0xfe, 0x18, 0x23, 0xc5, 0xa3, 0xca, 0x33, 0xc1, 0xcc, 0x66, 0x67, 0x21, 0xf3,
  0x32, 0x12, 0x15, 0x35, 0x29, 0xff, 0xfe, 0x1d, 0x44, 0xef, 0xcd, 0x41, 0x26, 0x3c, 0x4e, 0x4d,
]);

/** XOR3 is symmetric: the same operation encrypts and decrypts. */
export function xor3InPlace(data: Uint8Array, key: Uint8Array = XOR3_KEY): void {
  for (let i = 0; i < data.length; i++) {
    data[i] = (data[i] ^ key[i % 3]) & 0xff;
  }
}

export function xor3(data: Uint8Array, key: Uint8Array = XOR3_KEY): Uint8Array {
  const out = data.slice();
  xor3InPlace(out, key);
  return out;
}

/**
 * Xor32 encryption as applied by the client to outgoing packets.
 * The header (type + length, and code byte) is never touched: the chain starts at
 * `headerSize + 1` where `headerSize` counts the type and length bytes.
 */
export function xor32EncryptInPlace(packet: Uint8Array, key: Uint8Array = XOR32_KEY): void {
  const headerSize = headerSizeOf(packet[0]);
  for (let i = headerSize + 1; i < packet.length; i++) {
    packet[i] = (packet[i] ^ packet[i - 1] ^ key[i % 32]) & 0xff;
  }
}

/**
 * Inverse of {@link xor32EncryptInPlace}. It must be applied to the *raw* (still encrypted)
 * previous byte, so the loop keeps a copy of each ciphertext byte before overwriting it.
 */
export function xor32DecryptInPlace(packet: Uint8Array, key: Uint8Array = XOR32_KEY): void {
  const headerSize = headerSizeOf(packet[0]);
  let previousCipher = packet[headerSize];
  for (let i = headerSize + 1; i < packet.length; i++) {
    const cipher = packet[i];
    packet[i] = (cipher ^ previousCipher ^ key[i % 32]) & 0xff;
    previousCipher = cipher;
  }
}

/**
 * Packet header size in bytes, counting the type byte and the length field(s).
 * C1/C3 -> 2, C2/C4 -> 3. Unknown prefixes return 0 (the caller must reject the packet).
 */
export function headerSizeOf(prefix: number): number {
  switch (prefix) {
    case 0xc1:
    case 0xc3:
      return 2;
    case 0xc2:
    case 0xc4:
      return 3;
    default:
      return 0;
  }
}
