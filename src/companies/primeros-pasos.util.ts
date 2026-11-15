/**
 * La lista de lo que le falta configurar a un taller nuevo (spec 2026-10-28 §6).
 * Casi todo se tilda solo, mirando los datos: sólo las plantillas no tienen cómo
 * saberse, y se marcan al abrirlas.
 */
// Agencia (12/11/2026): los pasos de una agencia que recién se da de alta.
export type ClavePaso = 'datos' | 'legales' | 'logo' | 'caja_dolares' | 'unidad' | 'publicada' | 'empleados';

export interface PasoInicial { clave: ClavePaso; hecho: boolean }

export interface DatosDePasos {
  nombre?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  cuit?: string | null;
  razon_social?: string | null;
  logo_url?: string | null;
  usuarios_activos: number;
  /** Agencia: cajas en dólares, unidades cargadas y unidades publicadas en el sitio. */
  cajas_usd?: number;
  unidades?: number;
  publicadas?: number;
}

export function pasosDe(d: DatosDePasos): PasoInicial[] {
  return [
    { clave: 'datos', hecho: !!(d.nombre && d.telefono && d.direccion) },
    { clave: 'legales', hecho: !!(d.cuit && d.razon_social) },
    { clave: 'logo', hecho: !!d.logo_url },
    { clave: 'caja_dolares', hecho: (d.cajas_usd ?? 0) > 0 },
    { clave: 'unidad', hecho: (d.unidades ?? 0) > 0 },
    { clave: 'publicada', hecho: (d.publicadas ?? 0) > 0 },
    { clave: 'empleados', hecho: d.usuarios_activos > 1 },
  ];
}
