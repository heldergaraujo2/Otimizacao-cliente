/**
 * Encrypted MU connection pipeline.
 *
 * Direction rules of the reference protocol (verified against the OpenMU network library that the
 * current MU clients use):
 *
 *  client -> server :  Xor32  ->  SimpleModulus(client keys)  ->  socket
 *  server -> client :  SimpleModulus(server keys)             ->  socket
 *
 * Packets with a prefix below 0xC3 ("C1"/"C2") skip the SimpleModulus layer in both directions.
 */

import { PacketAssembler } from './framing.js';
import { xor32DecryptInPlace, xor32EncryptInPlace } from './crypto/xor.js';
import {
  DEFAULT_KEYS,
  SimpleModulusDecryptor,
  SimpleModulusEncryptor,
} from './crypto/simplemodulus.js';

export interface MuTransport {
  /** Human readable peer description, used in logs and tests. */
  readonly remoteLabel: string;
  write(data: Uint8Array): void;
  onData(handler: (chunk: Uint8Array) => void): void;
  onClose(handler: (error?: Error) => void): void;
  close(): void;
}

export interface MuConnectionOptions {
  role: 'client' | 'server';
  transport: MuTransport;
  /** Enables the SimpleModulus layer (default true). */
  useEncryption?: boolean;
  /** Enables the Xor32 layer. Default: true for clients (protocol requires it). */
  useXor32?: boolean;
  log?: (message: string) => void;
}

export interface MuConnectionMetrics {
  packetsIn: number;
  packetsOut: number;
  bytesIn: number;
  bytesOut: number;
  framingRejects: number;
  decryptErrors: number;
  encryptErrors: number;
}

export class MuConnection {
  private readonly assembler: PacketAssembler;
  private readonly decryptor?: SimpleModulusDecryptor;
  private readonly encryptor?: SimpleModulusEncryptor;
  private readonly useXor32: boolean;
  private readonly packetHandlers = new Set<(packet: Uint8Array) => void>();
  private readonly closeHandlers = new Set<(error?: Error) => void>();
  private closed = false;
  readonly metrics: MuConnectionMetrics = {
    packetsIn: 0,
    packetsOut: 0,
    bytesIn: 0,
    bytesOut: 0,
    framingRejects: 0,
    decryptErrors: 0,
    encryptErrors: 0,
  };

  constructor(private readonly options: MuConnectionOptions) {
    this.useXor32 = options.useXor32 ?? options.role === 'client';
    const useEncryption = options.useEncryption ?? true;
    if (useEncryption) {
      if (options.role === 'client') {
        this.decryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorClient, 'new');
        this.encryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorClient, 'new');
      } else {
        this.decryptor = new SimpleModulusDecryptor(DEFAULT_KEYS.decryptorServer, 'new');
        this.encryptor = new SimpleModulusEncryptor(DEFAULT_KEYS.encryptorServer, 'new');
      }
    }
    this.assembler = new PacketAssembler((reason) => {
      this.metrics.framingRejects++;
      this.options.log?.(`framing: ${reason}`);
    });

    options.transport.onData((chunk) => this.handleChunk(chunk));
    options.transport.onClose((error) => this.handleClose(error));
  }

  get remoteLabel(): string {
    return this.options.transport.remoteLabel;
  }

  onPacket(handler: (packet: Uint8Array) => void): () => void {
    this.packetHandlers.add(handler);
    return () => this.packetHandlers.delete(handler);
  }

  onClose(handler: (error?: Error) => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  /** Encrypts (when required) and writes a packet. */
  send(packet: Uint8Array): void {
    if (this.closed) throw new Error('connection is closed');
    let data: Uint8Array = packet.slice();
    try {
      if (this.useXor32) xor32EncryptInPlace(data);
      if (this.encryptor) data = this.encryptor.encryptPacket(data);
    } catch (error) {
      this.metrics.encryptErrors++;
      this.options.log?.(`encrypt error: ${(error as Error).message}`);
      throw error;
    }
    this.metrics.packetsOut++;
    this.metrics.bytesOut += data.length;
    this.options.transport.write(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.options.transport.close();
    for (const handler of this.closeHandlers) handler(undefined);
  }

  private handleChunk(chunk: Uint8Array): void {
    if (this.closed) return;
    this.metrics.bytesIn += chunk.length;
    const packets = this.assembler.push(chunk);
    for (const raw of packets) {
      let packet = raw;
      try {
        if (this.decryptor) packet = this.decryptor.decryptPacket(packet);
        if (this.useXor32) xor32DecryptInPlace(packet);
      } catch (error) {
        this.metrics.decryptErrors++;
        this.options.log?.(`decrypt error: ${(error as Error).message}`);
        continue;
      }
      this.metrics.packetsIn++;
      for (const handler of this.packetHandlers) {
        try {
          handler(packet);
        } catch (error) {
          this.options.log?.(`packet handler error: ${(error as Error).message}`);
        }
      }
    }
  }

  private handleClose(error?: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.closeHandlers) handler(error);
  }
}
