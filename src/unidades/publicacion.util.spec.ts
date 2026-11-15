import { normalizarPublicacion, PUBLICACION_VACIA } from './publicacion.util';

describe('la publicación de un auto', () => {
  it('lo que no tiene forma queda vacío, con la toma del usado prendida', () => {
    expect(normalizarPublicacion(null)).toEqual(PUBLICACION_VACIA);
    expect(normalizarPublicacion({ destacados: 'x', colores: [1, null], relacionadas: ['no-es-un-id'] })).toEqual(PUBLICACION_VACIA);
  });

  it('descarta renglones vacíos y repetidos, y saca el HTML', () => {
    const p = normalizarPublicacion({
      destacados: [{ nombre: ' Tapizado de <b>cuero</b> ', categoria: 'Tapizado' }, { nombre: 'tapizado de bcuero/b', categoria: 'Otro' }, { nombre: '' }],
      caracteristicas: [{ grupo: 'Seguridad', etiqueta: 'Airbags', valor: 6 }, { grupo: 'Seguridad', etiqueta: 'Frenos ABS', valor: '' }, { etiqueta: 'Puertas', valor: '4' }],
      colores: [{ nombre: 'Gris plata', hex: '#A0A0A0' }, { nombre: 'Rojo', hex: 'javascript:alert(1)' }],
      precio_financiado: '20784210',
      mostrar_toma: false,
      relacionadas: ['6b7e1851-9476-4f3f-a2b3-c058028e5492', '6b7e1851-9476-4f3f-a2b3-c058028e5492'],
    });
    expect(p.destacados).toEqual([{ nombre: 'tapizado de bcuero/b', categoria: 'Otro' }]);
    expect(p.caracteristicas).toEqual([{ grupo: 'Seguridad', etiqueta: 'Airbags', valor: '6' }, { grupo: 'General', etiqueta: 'Puertas', valor: '4' }]);
    expect(p.colores).toEqual([{ nombre: 'Gris plata', hex: '#a0a0a0' }, { nombre: 'Rojo', hex: '#888888' }]);
    expect(p.precio_financiado).toBe(20784210);
    expect(p.mostrar_toma).toBe(false);
    expect(p.relacionadas).toEqual(['6b7e1851-9476-4f3f-a2b3-c058028e5492']);
  });

  it('respeta los topes', () => {
    const p = normalizarPublicacion({ destacados: Array.from({ length: 30 }, (_, i) => ({ nombre: `Cosa ${i}` })), precio_financiado: -5 });
    expect(p.destacados.length).toBe(12);
    expect(p.precio_financiado).toBeNull();
  });
});
