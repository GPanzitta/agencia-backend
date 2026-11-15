import { LUGARES_FOTO, fotoPexels, lugaresParaErp, resolverFotosSitio } from './fotos-sitio';

describe('fotos del sitio (spec 2026-10-18)', () => {
  it('el catálogo tiene los 13 lugares con sus cantidades', () => {
    const cantidades = Object.fromEntries(Object.entries(LUGARES_FOTO).map(([k, v]) => [k, v.originales.length]));
    expect(cantidades).toEqual({
      portada_video_poster: 1, portada_visita: 2, portada_tienda: 1, portada_repuestos: 2, portada_aire: 1,
      equipo_lavarropas: 1, equipo_aire: 1, equipo_televisor: 1, equipo_heladera: 1,
      seguimiento_ejemplo: 1, marcas: 4, taller_deposito: 1, taller_camioneta: 1,
    });
  });

  it('sin fotos propias, todo sale de las originales de Pexels a 1400 y 700', () => {
    const r = resolverFotosSitio(undefined);
    expect(r.portada_visita).toEqual([
      { url: fotoPexels('camioneta', 1400), miniatura: fotoPexels('camioneta', 700), propia: false },
      { url: fotoPexels('lavarropas', 1400), miniatura: fotoPexels('lavarropas', 700), propia: false },
    ]);
    expect(fotoPexels('camioneta', 700)).toBe(
      'https://images.pexels.com/photos/6169582/pexels-photo-6169582.jpeg?auto=compress&w=700',
    );
  });

  it('una propia en la posición 1 deja la 0 original', () => {
    const r = resolverFotosSitio({ portada_visita: [null, { url: '/uploads/a.webp', miniatura: '/uploads/a_t.webp' }] });
    expect(r.portada_visita[0].propia).toBe(false);
    expect(r.portada_visita[1]).toEqual({ url: '/uploads/a.webp', miniatura: '/uploads/a_t.webp', propia: true });
  });

  it('ignora claves desconocidas, posiciones de más y entradas sin url', () => {
    const r = resolverFotosSitio({
      vieja: [{ url: '/uploads/x.webp', miniatura: '/uploads/x.webp' }],
      portada_aire: [{ miniatura: 'sin-url' }, { url: '/uploads/de-mas.webp', miniatura: '' }],
      marcas: 'basura',
    });
    expect(Object.keys(r)).not.toContain('vieja');
    expect(r.portada_aire).toHaveLength(1);
    expect(r.portada_aire[0].propia).toBe(false);
    expect(r.marcas.every((f) => !f.propia)).toBe(true);
  });

  it('una propia sin miniatura usa la url como miniatura', () => {
    const r = resolverFotosSitio({ portada_aire: [{ url: '/uploads/a.webp' }] });
    expect(r.portada_aire[0]).toEqual({ url: '/uploads/a.webp', miniatura: '/uploads/a.webp', propia: true });
  });

  it('para el ERP: los lugares en el orden de la página y el video de la portada', () => {
    const erp = lugaresParaErp({}, null);
    expect(erp.lugares.map((l) => l.clave)).toEqual(Object.keys(LUGARES_FOTO));
    expect(erp.lugares[0]).toMatchObject({ clave: 'portada_video_poster', seccion: 'Portada' });
    expect(erp.video_portada).toEqual({ url: expect.stringContaining('videos.pexels.com'), propio: false });
    expect(lugaresParaErp({}, '/uploads/v.mp4').video_portada).toEqual({ url: '/uploads/v.mp4', propio: true });
  });
});
