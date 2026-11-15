import { formatoDeArchivo, formatoDeFoto, formatoDeVideo } from './tipo-archivo.util';

const b = (...x: (number | string)[]) => Buffer.concat(x.map((y) => (typeof y === 'string' ? Buffer.from(y, 'latin1') : Buffer.from([y]))));

describe('tipo de archivo por los bytes (SEG-09)', () => {
  it('fotos', () => {
    expect(formatoDeFoto(b(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(formatoDeFoto(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(formatoDeFoto(b('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('webp');
    expect(formatoDeFoto(b(0, 0, 0, 0x18, 'ftypheic'))).toBe('heic');
  });

  it('un svg, un html o un pdf disfrazados de imagen no son fotos', () => {
    expect(formatoDeFoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(formatoDeFoto(Buffer.from('<html><script>'))).toBeNull();
    expect(formatoDeFoto(Buffer.from('%PDF-1.7'))).toBeNull();
  });

  it('comprobantes: además gif y pdf', () => {
    expect(formatoDeArchivo(Buffer.from('%PDF-1.7\n'))).toBe('pdf');
    expect(formatoDeArchivo(Buffer.from('GIF89a'))).toBe('gif');
    expect(formatoDeArchivo(Buffer.from('<html>'))).toBeNull();
  });

  it('video: mp4 o webm, y una foto heic no pasa por video', () => {
    expect(formatoDeVideo(b(0, 0, 0, 0x20, 'ftypisom', 0))).toBe('mp4');
    expect(formatoDeVideo(b(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('webm');
    expect(formatoDeVideo(b(0, 0, 0, 0x18, 'ftypheic', 0))).toBeNull();
    expect(formatoDeVideo(Buffer.from('no es un video para nada'))).toBeNull();
  });
});
