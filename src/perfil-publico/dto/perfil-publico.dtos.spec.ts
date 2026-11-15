import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActualizarPerfilPublicoDto } from './perfil-publico.dtos';

/** Misma receta que el DTO de empresa: instanciar, validar, mirar los errores. */
async function errores(body: any): Promise<string[]> {
  const dto = plainToInstance(ActualizarPerfilPublicoDto, body);
  const errs = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errs.map((e) => e.property);
}

describe('ActualizarPerfilPublicoDto', () => {
  it('un PATCH vacío es válido (no cambia nada)', async () => {
    expect(await errores({})).toEqual([]);
  });

  it('acento e ícono fuera de la lista se rechazan', async () => {
    expect(await errores({ color_acento: 'rosa' })).toEqual(['color_acento']);
    expect(await errores({ servicios: [{ nombre: 'Aire', frase: 'x', icono: 'nave' }] })).toEqual(['servicios']);
  });

  it('fuego es un acento válido (el degradé del logo) y rosa sigue sin serlo', async () => {
    expect(await errores({ color_acento: 'fuego' })).toEqual([]);
    expect(await errores({ color_acento: 'rosa' })).toEqual(['color_acento']);
  });

  it('respeta los topes de listas y textos', async () => {
    expect(await errores({ eslogan: 'a'.repeat(121) })).toEqual(['eslogan']);
    expect(await errores({ marcas: Array.from({ length: 31 }, (_, i) => `M${i}`) })).toEqual(['marcas']);
    expect(await errores({ fotos_trabajos: Array.from({ length: 13 }, () => ({ url: '/uploads/a.webp', miniatura: '/uploads/b.webp' })) })).toEqual(['fotos_trabajos']);
    expect(await errores({ horarios: Array.from({ length: 8 }, () => ({ dias: 'Lun', desde: '9:00', hasta: '18:00' })) })).toEqual(['horarios']);
  });

  it('las URLs de imagen tienen que ser del almacén propio', async () => {
    expect(await errores({ logo_url: 'https://evil.com/a.png' })).toEqual(['logo_url']);
    expect(await errores({ logo_url: '/uploads/perfil/x/a.webp' })).toEqual([]);
    expect(await errores({ logo_url: null })).toEqual([]);
  });

  it('un campo desconocido se rechaza (whitelist)', async () => {
    expect(await errores({ mp_access_token: 'x' })).toEqual(['mp_access_token']);
  });

  it('redes: sólo un usuario o una URL https://; el portal lo usa como href', async () => {
    expect(await errores({ redes: { instagram: 'javascript:alert(1)' } })).toEqual(['redes']);
    expect(await errores({ redes: { instagram: 'http://instagram.com/gusmat' } })).toEqual(['redes']);
    expect(await errores({ redes: { instagram: '' } })).toEqual(['redes']);
    expect(await errores({ redes: { instagram: '@gusmat' } })).toEqual([]);
    expect(await errores({ redes: { facebook: 'gusmat.taller' } })).toEqual([]);
    expect(await errores({ redes: { tiktok: 'https://instagram.com/gusmat' } })).toEqual([]);
  });

  it('cifras: reparaciones y opiniones hasta un millón, garantía hasta 3650 días', async () => {
    expect(await errores({ cifras: { reparaciones: 1_000_001 } })).toEqual(['cifras']);
    expect(await errores({ cifras: { opiniones: 1_000_001 } })).toEqual(['cifras']);
    expect(await errores({ cifras: { garantia_dias: 3651 } })).toEqual(['cifras']);
    expect(await errores({ cifras: { reparaciones: 1_000_000, opiniones: 1_000_000, garantia_dias: 3650 } })).toEqual([]);
  });

  it('null se rechaza en campos que no lo admiten', async () => {
    // Solo estos 7 campos rechazarán null. Los otros (logo_url, portada_url, foto_equipo_url, eslogan, quienes_somos, zona) lo aceptan.
    const camposNoNulables = ['color_acento', 'servicios', 'horarios', 'marcas', 'redes', 'fotos_trabajos', 'cifras'];
    for (const campo of camposNoNulables) {
      const resultado = await errores({ [campo]: null });
      expect(resultado).toEqual([campo]);
    }
  });

  it('null se acepta en campos anulables (borrar)', async () => {
    const camposNulables = ['portada_url', 'foto_equipo_url', 'eslogan', 'quienes_somos', 'zona'];
    for (const campo of camposNulables) {
      const resultado = await errores({ [campo]: null });
      expect(resultado).toEqual([]);
    }
  });
});

describe('ActualizarPerfilPublicoDto — SEG-46', () => {
  it('una red con usuario antes del sitio (https://taller@otro-host) se rechaza y el error dice por qué', async () => {
    const dto = plainToInstance(ActualizarPerfilPublicoDto, { redes: { instagram: 'https://instagram.com@estafa.com/x' } });
    const errs = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    const mensaje = JSON.stringify(errs[0]?.children?.[0]?.constraints ?? {});
    expect(errs.map((e) => e.property)).toEqual(['redes']);
    expect(mensaje).toContain('usuario ni clave');
  });

  it('una red de TikTok con @ en la ruta sigue pasando', async () => {
    expect(await errores({ redes: { tiktok: 'https://www.tiktok.com/@gusmat' } })).toEqual([]);
  });

  it('el place_id de Google sólo con su alfabeto', async () => {
    expect(await errores({ google_place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4' })).toEqual([]);
    expect(await errores({ google_place_id: '../../x?y=1' })).toEqual(['google_place_id']);
    expect(await errores({ google_place_id: null })).toEqual([]);
  });
});
