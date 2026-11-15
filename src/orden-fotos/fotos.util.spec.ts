import sharp from 'sharp';
import { comprimirFoto, LADO_MAXIMO, LADO_MINIATURA } from './fotos.util';

/** Una foto "de celular": grande, con ruido para que no comprima a nada. */
async function fotoGrande(ancho: number, alto: number): Promise<Buffer> {
  const ruido = Buffer.alloc(ancho * alto * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 7919) % 251;
  return sharp(ruido, { raw: { width: ancho, height: alto, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

describe('comprimirFoto', () => {
  it('achica una foto grande al lado máximo, en WebP, y pesa menos que la original', async () => {
    const original = await fotoGrande(3000, 2000);
    const r = await comprimirFoto(original);

    const meta = await sharp(r.principal).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(LADO_MAXIMO);
    expect(meta.height).toBe(Math.round((LADO_MAXIMO * 2000) / 3000));
    expect(r.principal.length).toBeLessThan(original.length);
  }, 20000);

  it('la miniatura entra en el lado de miniatura y es mucho más liviana', async () => {
    const original = await fotoGrande(3000, 2000);
    const r = await comprimirFoto(original);

    const meta = await sharp(r.miniatura).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(LADO_MINIATURA);
    expect(r.miniatura.length).toBeLessThan(r.principal.length / 4);
  }, 20000);

  it('una foto chica no se agranda', async () => {
    const original = await fotoGrande(640, 480);
    const r = await comprimirFoto(original);

    const meta = await sharp(r.principal).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  }, 20000);

  it('devuelve las medidas finales para guardarlas con la foto', async () => {
    const r = await comprimirFoto(await fotoGrande(3000, 2000));
    expect(r.ancho).toBe(LADO_MAXIMO);
    expect(r.alto).toBe(Math.round((LADO_MAXIMO * 2000) / 3000));
  }, 20000);

  it('rechaza lo que no es una imagen', async () => {
    await expect(comprimirFoto(Buffer.from('esto no es una imagen'))).rejects.toThrow();
  });

  it('conserva la transparencia (el isotipo viene sin fondo)', async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const { principal } = await comprimirFoto(png);
    expect((await sharp(principal).metadata()).hasAlpha).toBe(true);
  });
});

describe('comprimirFoto — SEG-35: imagen bomba', () => {
  it('una foto de más de 50 MP se rechaza con un error de negocio, sin decodificarla', async () => {
    // 7100 × 7100 = 50,4 MP, de un solo color: el PNG pesa poco.
    const bomba = await sharp({ create: { width: 7100, height: 7100, channels: 3, background: '#fff' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(comprimirFoto(bomba)).rejects.toThrow('demasiado grande');
  }, 30000);
});
