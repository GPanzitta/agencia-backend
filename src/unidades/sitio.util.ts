/** La dirección propia del sitio de cada agencia (tanda 2, 12/11/2026). Puro. */

/** Nombres que no puede usar una agencia: son de la plataforma. */
export const SLUGS_RESERVADOS = ['www', 'api', 'app', 'admin', 'erp', 'panel', 'sitio', 'mail', 'static', 'demo-fg'];

/** «Automotores Pérez & Hnos.» → `automotores-perez-hnos`. Vacío si no queda nada usable. */
export function slugDe(nombre: string | null | undefined): string {
  return (nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** El primero libre: `perez`, `perez-2`, `perez-3`… Sin nombre usable, `agencia`. */
export function slugLibre(nombre: string | null | undefined, ocupados: Iterable<string>): string {
  const tomados = new Set([...ocupados, ...SLUGS_RESERVADOS]);
  const base = slugDe(nombre) || 'agencia';
  if (!tomados.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base}-${n}`;
    if (!tomados.has(candidato)) return candidato;
  }
}

/** Lo que llega en la cabecera: sólo letras, números y guiones; si no, se ignora. */
export function slugValido(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(v) ? v : null;
}
