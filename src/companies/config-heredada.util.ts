/**
 * Configuración de la empresa heredada del producto anterior. Sus módulos ya
 * no existen, pero `GET/PATCH /companies/mi-empresa` todavía lee y escribe
 * estos campos (la pantalla Empresa del ERP los manda): acá queda sólo lo que
 * hace falta para validar y completar esos valores.
 */

export interface FranjaConfig { codigo: 'manana' | 'tarde'; desde: string; hasta: string; cupo: number }
export interface LocalConfig { desde: string; hasta: string; duracion_min: number; cupo_por_hora: number }
export interface DomicilioConfig { desde: string; hasta: string; duracion_min: number; cupo_por_bloque: number }

/** Lo que puede haber guardado en `company.agenda_config` (jsonb). `franjas` es legado. */
export interface AgendaConfig {
  /** Día de la semana según Date.getDay(): 0 domingo … 6 sábado. */
  dias_habiles: number[];
  local: LocalConfig;
  domicilio?: DomicilioConfig;
  franjas?: FranjaConfig[];
}

/** La configuración lista para usar: siempre con `domicilio`, sin `franjas`. */
export interface AgendaResuelta { dias_habiles: number[]; local: LocalConfig; domicilio: DomicilioConfig }

export const DURACION_DOMICILIO_MIN = 60;
export const DURACION_DOMICILIO_MAX = 180;

export const AGENDA_CONFIG_DEFAULT: AgendaResuelta = {
  dias_habiles: [1, 2, 3, 4, 5, 6],
  local: { desde: '09:00', hasta: '18:00', duracion_min: 30, cupo_por_hora: 2 },
  domicilio: { desde: '08:00', hasta: '18:00', duracion_min: 120, cupo_por_bloque: 3 },
};

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** El domicilio de una configuración vieja, a partir de sus franjas (bloques de 2 h, mismo cupo por hora). */
export function domicilioDeFranjas(franjas: FranjaConfig[]): DomicilioConfig {
  const duracion = 120;
  const desde = franjas.map((f) => f.desde).sort()[0];
  const hasta = franjas.map((f) => f.hasta).sort().reverse()[0];
  const horas = franjas.reduce((total, f) => total + (aMinutos(f.hasta) - aMinutos(f.desde)) / 60, 0);
  const cupos = franjas.reduce((total, f) => total + Number(f.cupo || 0), 0);
  const porBloque = horas > 0 ? Math.round((cupos / horas) * (duracion / 60)) : 0;
  return { desde, hasta, duracion_min: duracion, cupo_por_bloque: Math.max(1, porBloque) };
}

/** La configuración guardada, completa: lo que falta vale lo de fábrica. */
export function resolverAgenda(cfg?: Partial<AgendaConfig> | null): AgendaResuelta {
  const base = AGENDA_CONFIG_DEFAULT;
  const domicilio = cfg?.domicilio
    ?? (cfg?.franjas?.length ? domicilioDeFranjas(cfg.franjas) : base.domicilio);
  return {
    dias_habiles: cfg?.dias_habiles ?? base.dias_habiles,
    local: cfg?.local ?? base.local,
    domicilio,
  };
}

/** Qué está mal en una configuración que se quiere guardar; null si está bien. */
export function problemaDeAgenda(cfg: Partial<AgendaConfig>): string | null {
  const d = cfg.domicilio;
  if (d) {
    if (aMinutos(d.hasta) <= aMinutos(d.desde)) {
      return 'Turnos a domicilio: el horario «hasta» tiene que ser posterior al «desde».';
    }
    // Tiene que entrar al menos un bloque entero de esa duración.
    if (!(d.duracion_min > 0) || aMinutos(d.desde) + d.duracion_min > aMinutos(d.hasta)) {
      return 'Turnos a domicilio: en ese horario no entra ni un turno de esa duración. Ampliá el horario o acortá el turno.';
    }
  }
  const l = cfg.local;
  if (l && aMinutos(l.hasta) <= aMinutos(l.desde)) {
    return 'Turnos en el taller: el horario «hasta» tiene que ser posterior al «desde».';
  }
  return null;
}

export interface SlaConfig { diagnostico_horas: number; cotizacion_horas: number; reparacion_horas: number }

export const SLA_CONFIG_DEFAULT: SlaConfig = { diagnostico_horas: 24, cotizacion_horas: 48, reparacion_horas: 72 };

export interface PlanCuotas { cuotas: number; sin_interes: boolean }

export function cuotasRepetidas(planes: PlanCuotas[] | null | undefined): boolean {
  const cuotas = (planes ?? []).map((p) => Number(p.cuotas));
  return new Set(cuotas).size !== cuotas.length;
}

export type FaltaTransferencia = 'cbu_o_alias' | 'titular' | 'caja';

/** Lo que falta para poder cobrar por transferencia: CBU o alias, titular y la caja. */
export function faltanParaTransferencia(e: {
  transferencia_cbu?: string | null;
  transferencia_alias?: string | null;
  transferencia_titular?: string | null;
  transferencia_wallet_id?: string | null;
}): FaltaTransferencia[] {
  const faltan: FaltaTransferencia[] = [];
  if (!e.transferencia_cbu?.trim() && !e.transferencia_alias?.trim()) faltan.push('cbu_o_alias');
  if (!e.transferencia_titular?.trim()) faltan.push('titular');
  if (!e.transferencia_wallet_id) faltan.push('caja');
  return faltan;
}

/** Un `decimal` de Postgres (texto) o número a número; null, undefined y '' a null. */
export const numeroONull = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);
