import { SINTOMAS_POR_DEFECTO } from './sintomas.util';
import {
  ACENTOS, ICONOS_SERVICIO, armarPerfilPublico, esUrlPropia, perfilPorDefecto, videosPublicos,
} from './perfil-publico.util';

/**
 * El perfil público es lo que el portal muestra en la home del comercio. Sin
 * fila cargada tiene que salir algo presentable (nombre y garantía de la
 * empresa, acento amarillo, listas vacías), y con fila cargada tiene que
 * respetar el override de garantía y no filtrar nada de la empresa que no
 * sea público.
 */
const empresa = (p: any = {}) => ({
  id: 'emp-1', name: 'Taller Demo SRL', direccion: 'Av. Siempreviva 742', telefono: '011 4444-5555',
  lat: -34.55, lng: -58.55, garantia_dias: 90, mp_access_token: 'SECRETO', cuit: '20-1-1', ...p,
});

describe('perfilPorDefecto', () => {
  it('acento amarillo, listas vacías, textos nulos', () => {
    expect(perfilPorDefecto()).toEqual({
      eslogan: null, quienes_somos: null, zona: null, color_acento: 'amarillo',
      logo_url: null, isotipo_url: null, portada_url: null, foto_equipo_url: null,
      horarios: [], redes: {}, marcas: [], servicios: [], fotos_trabajos: [], cifras: {},
      video_url: null, video_poster_url: null, videos: [], google_place_id: null,
      // La consola de la portada arranca con la lista de fábrica.
      sintomas: SINTOMAS_POR_DEFECTO,
      fotos_sitio: {}, video_portada_url: null,
      // «Te lo instalamos» arranca apagado (spec 2026-11-07 §8.3).
      instalacion_activa: false, instalacion_texto: null, vende_repuestos: true,
    });
  });
});

describe('armarPerfilPublico', () => {
  it('sin fila: datos de la empresa + defaults; nunca el token ni el CUIT', () => {
    const r = armarPerfilPublico(empresa() as any, null);
    expect(r).toMatchObject({
      nombre: 'Taller Demo SRL', direccion: 'Av. Siempreviva 742', telefono: '011 4444-5555',
      whatsapp: '5491144445555', lat: -34.55, lng: -58.55, garantia_dias: 90, color_acento: 'amarillo',
      horarios: [], marcas: [], servicios: [], fotos_trabajos: [], cifras: {},
    });
    expect(JSON.stringify(r)).not.toContain('SECRETO');
    expect(JSON.stringify(r)).not.toContain('20-1-1');
  });

  it('con fila: usa el override de garantía y saca garantia_dias de cifras', () => {
    const r = armarPerfilPublico(empresa() as any, {
      ...perfilPorDefecto(), eslogan: 'Lo arreglamos', color_acento: 'verde',
      cifras: { reparaciones: 2400, opiniones: 130, garantia_dias: 180 },
    } as any);
    expect(r.garantia_dias).toBe(180);
    expect(r.cifras).toEqual({ reparaciones: 2400, opiniones: 130 });
    expect(r.eslogan).toBe('Lo arreglamos');
    expect(r.color_acento).toBe('verde');
  });

  it('expone el isotipo, null si no hay', () => {
    expect(armarPerfilPublico(empresa() as any, null).isotipo_url).toBeNull();
    expect(armarPerfilPublico(empresa() as any, { ...perfilPorDefecto(), isotipo_url: '/uploads/i.webp' } as any).isotipo_url).toBe('/uploads/i.webp');
  });

  it('sin teléfono no inventa whatsapp; lat/lng decimales de Postgres llegan como número', () => {
    const r = armarPerfilPublico(empresa({ telefono: null, lat: '-34.5', lng: '-58.5' }) as any, null);
    expect(r.whatsapp).toBeNull();
    expect(r.lat).toBe(-34.5);
    expect(r.lng).toBe(-58.5);
  });
});

describe('esUrlPropia', () => {
  it('acepta /uploads y Cloudinary; rechaza cualquier otro host o javascript:', () => {
    expect(esUrlPropia('/uploads/perfil/x/a.webp')).toBe(true);
    expect(esUrlPropia('https://res.cloudinary.com/demo/image/upload/a.webp')).toBe(true);
    expect(esUrlPropia('https://evil.com/a.webp')).toBe(false);
    expect(esUrlPropia('javascript:alert(1)')).toBe(false);
    expect(esUrlPropia('')).toBe(false);
  });
});

describe('constantes', () => {
  it('siete acentos y ocho íconos, en el orden que muestra el ERP', () => {
    expect(ACENTOS).toEqual(['amarillo', 'naranja', 'celeste', 'verde', 'rojo', 'violeta', 'fuego']);
    expect(ICONOS_SERVICIO).toEqual(['lavarropas', 'heladera', 'microondas', 'aire', 'cocina', 'secarropas', 'lavavajillas', 'herramienta']);
  });
});

describe('videosPublicos', () => {
  it('el título personalizado gana sobre el de YouTube', () => {
    expect(videosPublicos([
      { id: 'aaaaaaaaaaa', titulo: 'Título de YouTube', canal: 'Taller Demo', titulo_personalizado: 'Cómo cambiar un blocapuertas' },
    ])).toEqual([{ id: 'aaaaaaaaaaa', titulo: 'Cómo cambiar un blocapuertas', canal: 'Taller Demo' }]);
  });

  it('sin título personalizado (o vacío) sale el de YouTube', () => {
    expect(videosPublicos([
      { id: 'bbbbbbbbbbb', titulo: 'Reparación de heladera', canal: 'Taller Demo' },
      { id: 'ccccccccccc', titulo: 'Service de aire', canal: 'Taller Demo', titulo_personalizado: '   ' },
    ])).toEqual([
      { id: 'bbbbbbbbbbb', titulo: 'Reparación de heladera', canal: 'Taller Demo' },
      { id: 'ccccccccccc', titulo: 'Service de aire', canal: 'Taller Demo' },
    ]);
  });

  it('sin videos (o nulo) devuelve una lista vacía, no rompe', () => {
    expect(videosPublicos([])).toEqual([]);
    expect(videosPublicos(null)).toEqual([]);
    expect(videosPublicos(undefined)).toEqual([]);
  });
});

describe('armarPerfilPublico con los datos del sitio (S1c-b)', () => {
  it('saca el video y los videos ya resueltos, y NUNCA el google_place_id', () => {
    const r = armarPerfilPublico(empresa() as any, {
      ...perfilPorDefecto(),
      video_url: 'https://res.cloudinary.com/demo/video/upload/v1/perfil/emp-1/abc.mp4',
      video_poster_url: 'https://res.cloudinary.com/demo/video/upload/so_0/v1/perfil/emp-1/abc.jpg',
      videos: [{ id: '0MELX_vb0qY', titulo: 'De YouTube', canal: 'Taller Demo', titulo_personalizado: 'Nuestro taller' }],
      google_place_id: 'ChIJSECRETO123',
    } as any);
    expect(r.video_url).toBe('https://res.cloudinary.com/demo/video/upload/v1/perfil/emp-1/abc.mp4');
    expect(r.video_poster_url).toBe('https://res.cloudinary.com/demo/video/upload/so_0/v1/perfil/emp-1/abc.jpg');
    expect(r.videos).toEqual([{ id: '0MELX_vb0qY', titulo: 'Nuestro taller', canal: 'Taller Demo' }]);
    expect(JSON.stringify(r)).not.toContain('ChIJSECRETO123');
    expect(JSON.stringify(r)).not.toContain('google_place_id');
  });

  it('sin fila cargada el video sale en null y los videos vacíos', () => {
    const r = armarPerfilPublico(empresa() as any, null);
    expect(r.video_url).toBeNull();
    expect(r.video_poster_url).toBeNull();
    expect(r.videos).toEqual([]);
  });
});
