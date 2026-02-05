declare module 'zstd-codec' {
  export interface ZstdSimple {
    compress(data: Uint8Array): Uint8Array
    decompress(data: Uint8Array): Uint8Array
  }

  export interface ZstdInstance {
    Simple: new () => ZstdSimple
  }

  export class ZstdCodec {
    static run(callback: (zstd: ZstdInstance) => void): void
  }
}
