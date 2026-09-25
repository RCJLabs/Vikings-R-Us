// gifenc 1.0.3 ships no types; this is the part the store capture uses (https://github.com/mattdesl/gifenc).
declare module 'gifenc' {
  type Palette = number[][];
  interface FrameOptions {
    readonly palette?: Palette;
    /** Milliseconds this frame shows. */
    readonly delay?: number;
    /** 0 loops for ever. */
    readonly repeat?: number;
  }
  interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  const gifenc: {
    GIFEncoder(): Encoder;
    quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette;
    applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
  };
  export default gifenc;
}
