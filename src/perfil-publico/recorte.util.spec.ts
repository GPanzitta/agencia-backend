import sharp from 'sharp';
import { recortarBorde } from './recorte.util';

const conBorde = () => sharp({ create: { width: 200, height: 100, channels: 3, background: '#ffffff' } })
  .composite([{ input: { create: { width: 40, height: 30, channels: 3, background: '#f87808' } }, left: 80, top: 35 }])
  .png().toBuffer();

describe('recortarBorde (spec 2026-10-01 §3.1)', () => {
  it('saca el margen blanco parejo', async () => {
    const r = await sharp(await recortarBorde(await conBorde())).metadata();
    expect([r.width, r.height]).toEqual([40, 30]);
  });

  it('una imagen sin borde queda igual de grande', async () => {
    const lleno = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#f87808' } }).png().toBuffer();
    const r = await sharp(await recortarBorde(lleno)).metadata();
    expect([r.width, r.height]).toEqual([50, 50]);
  });

  it('una imagen toda blanca o un archivo roto vuelven tal cual', async () => {
    const blanca = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#ffffff' } }).png().toBuffer();
    expect(await recortarBorde(blanca)).toBe(blanca);
    const roto = Buffer.from('no es una imagen');
    expect(await recortarBorde(roto)).toBe(roto);
  });

  it('respeta la orientación EXIF: el logo sacado con el celular queda derecho', async () => {
    const jpeg = await sharp(await conBorde()).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = await sharp(await recortarBorde(jpeg)).metadata();
    expect(r.height).toBeGreaterThan(r.width!);
  });

  it('un JPEG sin borde con orientación EXIF 6 vuelve tal cual', async () => {
    const lleno = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#f87808' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await recortarBorde(lleno)).toBe(lleno);
  });
});
