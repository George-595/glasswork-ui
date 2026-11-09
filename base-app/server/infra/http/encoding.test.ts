import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { addVary, compressBody, etagMatches, negotiateEncoding } from './encoding.ts';

describe('negotiateEncoding', () => {
  it('sends the bytes as they are when the client names no encoding', () => {
    expect(negotiateEncoding(undefined)).toBeUndefined();
    expect(negotiateEncoding('')).toBeUndefined();
    expect(negotiateEncoding('identity')).toBeUndefined();
  });

  it('prefers Brotli over gzip when both are accepted', () => {
    expect(negotiateEncoding('gzip, deflate, br')).toBe('br');
    expect(negotiateEncoding('br, gzip')).toBe('br');
  });

  it('falls back to gzip when Brotli is not accepted', () => {
    expect(negotiateEncoding('gzip, deflate')).toBe('gzip');
    expect(negotiateEncoding('x-gzip')).toBe('gzip');
  });

  it('is case-insensitive and ignores spaces', () => {
    expect(negotiateEncoding('  GZip ;  Q=0.5 , BR')).toBe('br');
  });

  it('respects q-values: the higher weight wins even over the usual preference', () => {
    expect(negotiateEncoding('br;q=0.4, gzip;q=0.9')).toBe('gzip');
    expect(negotiateEncoding('br;q=0.9, gzip;q=0.4')).toBe('br');
  });

  it('keeps the usual preference on a tie', () => {
    expect(negotiateEncoding('gzip;q=0.5, br;q=0.5')).toBe('br');
  });

  it('never picks an encoding with q=0', () => {
    expect(negotiateEncoding('br;q=0, gzip')).toBe('gzip');
    expect(negotiateEncoding('br;q=0, gzip;q=0')).toBeUndefined();
    expect(negotiateEncoding('br;q=0.000')).toBeUndefined();
  });

  it('treats * as every encoding not named', () => {
    expect(negotiateEncoding('*')).toBe('br');
    expect(negotiateEncoding('br;q=0, *')).toBe('gzip');
    expect(negotiateEncoding('gzip;q=0, *;q=0.1')).toBe('br');
    expect(negotiateEncoding('*;q=0')).toBeUndefined();
  });

  it('reads a bad q-value as 0 and clamps one above 1', () => {
    expect(negotiateEncoding('br;q=abc, gzip')).toBe('gzip');
    expect(negotiateEncoding('gzip;q=7, br;q=1')).toBe('br');
  });

  it('accepts the header as an array (repeated header lines)', () => {
    expect(negotiateEncoding(['gzip', 'br;q=0.1'])).toBe('gzip');
  });

  it('only chooses among the encodings on offer', () => {
    expect(negotiateEncoding('br, gzip', ['gzip'])).toBe('gzip');
    expect(negotiateEncoding('br', ['gzip'])).toBeUndefined();
    expect(negotiateEncoding('br, gzip', [])).toBeUndefined();
  });

  it('skips empty and unknown tokens', () => {
    expect(negotiateEncoding(',, deflate, compress, gzip')).toBe('gzip');
    expect(negotiateEncoding('deflate')).toBeUndefined();
  });
});

describe('compressBody', () => {
  const text = Buffer.from('{"row":"a fairly repetitive value"}'.repeat(200));

  it('round-trips with Brotli', () => {
    const packed = compressBody(text, 'br');
    expect(packed.length).toBeLessThan(text.length);
    expect(brotliDecompressSync(packed).equals(text)).toBe(true);
  });

  it('round-trips with gzip', () => {
    const packed = compressBody(text, 'gzip');
    expect(packed.length).toBeLessThan(text.length);
    expect(gunzipSync(packed).equals(text)).toBe(true);
  });
});

describe('addVary', () => {
  it('sets the header when there is none', () => {
    expect(addVary(undefined, 'Accept-Encoding')).toBe('Accept-Encoding');
    expect(addVary('', 'Accept-Encoding')).toBe('Accept-Encoding');
  });

  it('appends to an existing list once', () => {
    expect(addVary('Origin', 'Accept-Encoding')).toBe('Origin, Accept-Encoding');
    expect(addVary('Origin, accept-encoding', 'Accept-Encoding')).toBe('Origin, accept-encoding');
  });

  it('leaves Vary: * alone', () => {
    expect(addVary('*', 'Accept-Encoding')).toBe('*');
  });
});

describe('etagMatches', () => {
  it('matches the same tag, weak or strong', () => {
    expect(etagMatches('"abc"', '"abc"')).toBe(true);
    expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"abc"', 'W/"abc"')).toBe(true);
  });

  it('matches one tag in a list, and *', () => {
    expect(etagMatches('"x", "abc" , "y"', '"abc"')).toBe(true);
    expect(etagMatches('*', '"abc"')).toBe(true);
    expect(etagMatches(['"x"', '"abc"'], '"abc"')).toBe(true);
  });

  it('does not match another tag or a missing header', () => {
    expect(etagMatches('"abd"', '"abc"')).toBe(false);
    expect(etagMatches(undefined, '"abc"')).toBe(false);
    expect(etagMatches('', '"abc"')).toBe(false);
  });
});
