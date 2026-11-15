import { Roles } from '../enums/roles.enum';

/**
 * DAT-02 (pedido del dueño, 14/10/2026): datos personales del cliente según
 * el puesto. Mostrador y admin atienden al cliente y los ven completos.
 * Técnico, pañol (desde el 15/10) y chofer no los necesitan para su tarea fuera de la ruta
 * del día y de la visita a domicilio: en el resto de las respuestas les llegan
 * tapados.
 *
 * El formato es el MISMO que el del ERP
 * (`taller-erp/src/app/core/utils/datos-personales.util.ts`): el ERP reconoce
 * lo que ya viene tapado (lleva «•») y no lo vuelve a tapar. Si se cambia uno,
 * hay que cambiar el otro.
 */
export type DatoPersonal = 'telefono' | 'email' | 'documento';

export const ROLES_CON_DATOS_TAPADOS: ReadonlySet<string> = new Set<string>([Roles.TECNICO, Roles.PANOL, Roles.CHOFER]);

export function veDatosCompletos(rol: string | null | undefined): boolean {
  return !rol || !ROLES_CON_DATOS_TAPADOS.has(rol);
}

const PUNTOS = '••••';

/** Ya viene tapado: trae el «•». */
export function yaTapado(v: string): boolean {
  return v.includes('•');
}

/** «•••• 7788»: los últimos 4 dígitos alcanzan para reconocerlo al teléfono. */
export function taparTelefono(t: string): string {
  const digitos = t.replace(/\D/g, '');
  return digitos.length > 4 ? `${PUNTOS} ${digitos.slice(-4)}` : PUNTOS;
}

/** «j•••@gmail.com». */
export function taparEmail(e: string): string {
  const [usuario, dominio] = e.split('@');
  if (!dominio) return PUNTOS;
  return `${usuario.charAt(0)}•••@${dominio}`;
}

/** «•••• 678»: los últimos 3 del DNI o CUIT. */
export function taparDocumento(d: string): string {
  const limpio = d.replace(/[^0-9A-Za-z]/g, '');
  return limpio.length > 3 ? `${PUNTOS} ${limpio.slice(-3)}` : PUNTOS;
}

/** Tapa un valor según su tipo. Vacío o ya tapado, va tal cual. */
export function tapar(valor: unknown, tipo: DatoPersonal): unknown {
  if (typeof valor !== 'string') return valor;
  const v = valor.trim();
  if (!v || yaTapado(v)) return valor;
  if (tipo === 'telefono') return taparTelefono(v);
  if (tipo === 'email') return taparEmail(v);
  return taparDocumento(v);
}

/** Los campos del cliente que se tapan, con su tipo. La dirección y la ciudad no. */
export const CAMPOS_PERSONALES_DEL_CLIENTE: Readonly<Record<string, DatoPersonal>> = {
  telefono: 'telefono',
  telefono_alternativo: 'telefono',
  email: 'email',
  documento: 'documento',
};

/**
 * Las coincidencias de los buscadores vienen como `{ campo: 'Teléfono',
 * valor: '1155667788' }`: buscar «5566» le mostraría el número entero. Con el
 * rótulo se sabe qué tapar (mismos rótulos que el ERP).
 */
const DATO_DE_ROTULO: Record<string, DatoPersonal> = {
  'teléfono': 'telefono',
  'tel. alternativo': 'telefono',
  email: 'email',
  correo: 'email',
  'dni / cuit': 'documento',
};

export function datoPersonalDeRotulo(rotulo: unknown): DatoPersonal | null {
  return typeof rotulo === 'string' ? (DATO_DE_ROTULO[rotulo.trim().toLowerCase()] ?? null) : null;
}
