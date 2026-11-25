import type { Moneda } from '../unidades/entities/unidad.entity';
import { convertir } from '../unidades/unidades.util';
import type { EstadoOrdenAlistaje, ItemChecklistAlistaje } from './entities/orden-alistaje.entity';

/**
 * Lógica pura del módulo de Órdenes de Alistaje/Taller y Repuestos de la agencia.
 */

export const CHECKLIST_BASE_ALISTAJE: Omit<ItemChecklistAlistaje, 'estado' | 'observacion'>[] = [
  { clave: 'aceite_filtros', grupo: 'Mecanica', nombre: 'Aceite de motor y filtros (aire, aceite, habitáculo)' },
  { clave: 'distribucion_correas', grupo: 'Mecanica', nombre: 'Correa / cadena de distribución y poli-V' },
  { clave: 'bateria_carga', grupo: 'Mecanica', nombre: 'Batería, arranque y carga de alternador' },
  { clave: 'refrigeracion_fluidos', grupo: 'Mecanica', nombre: 'Líquido refrigerante, dirección y pérdidas' },
  { clave: 'frenos', grupo: 'Seguridad', nombre: 'Pastillas, discos y líquido de frenos' },
  { clave: 'tren_delantero', grupo: 'Seguridad', nombre: 'Tren delantero, amortiguadores y alineación' },
  { clave: 'neumaticos_auxilio', grupo: 'Seguridad', nombre: 'Estado de los 4 neumáticos y rueda de auxilio' },
  { clave: 'luces_instrumental', grupo: 'Seguridad', nombre: 'Ópticas, luces exteriores y testigos de tablero' },
  { clave: 'chapa_paragolpes', grupo: 'Estetica', nombre: 'Chapa, pintura y paragolpes (bollos / rayones)' },
  { clave: 'pulido_interior', grupo: 'Estetica', nombre: 'Limpieza de tapizados, lavado de motor y abrillantado' },
  { clave: 'cristales_levantavidrios', grupo: 'Equipamiento', nombre: 'Parabrisas, cristales, cierre centralizado y alzavidrios' },
  { clave: 'aire_multimedia', grupo: 'Equipamiento', nombre: 'Aire acondicionado / climatizador y pantalla multimedia' },
];

export function checklistInicial(): ItemChecklistAlistaje[] {
  return CHECKLIST_BASE_ALISTAJE.map((item) => ({
    ...item,
    estado: 'pendiente',
    observacion: null,
  }));
}

const TRANSICIONES_ORDEN: Record<EstadoOrdenAlistaje, EstadoOrdenAlistaje[]> = {
  recibida: ['diagnostico', 'en_trabajo', 'anulada'],
  diagnostico: ['en_trabajo', 'control_calidad', 'anulada'],
  en_trabajo: ['diagnostico', 'control_calidad', 'lista', 'anulada'],
  control_calidad: ['en_trabajo', 'lista', 'anulada'],
  lista: [],
  anulada: [],
};

export function puedeMoverOrdenA(actual: EstadoOrdenAlistaje, siguiente: EstadoOrdenAlistaje): boolean {
  return TRANSICIONES_ORDEN[actual]?.includes(siguiente) ?? false;
}

export interface RenglonRepuestoParaCalculo {
  cantidad: number | string;
  costo_unitario: number | string;
  moneda: Moneda;
}

/**
 * Calcula el total de repuestos, mano de obra y costo total de la Orden de Alistaje
 * en la moneda de la orden. Si algún repuesto está en otra moneda, usa `tipo_cambio`.
 */
export function calcularTotalesOrden(
  monedaOrden: Moneda,
  costoManoObra: number | string,
  tipoCambio: number | string | null | undefined,
  repuestos: RenglonRepuestoParaCalculo[],
): { total_repuestos: number; mano_obra: number; total_orden: number } {
  const tc = tipoCambio ? Number(tipoCambio) : null;
  let sumaRep = 0;
  for (const r of repuestos) {
    const subtotal = (Number(r.cantidad) || 0) * (Number(r.costo_unitario) || 0);
    const enMoneda = convertir({ monto: subtotal, moneda: r.moneda, tipo_cambio: tc }, monedaOrden);
    sumaRep += enMoneda ?? subtotal;
  }
  const mo = Math.max(0, Number(costoManoObra) || 0);
  const totalRep = Math.round(sumaRep * 100) / 100;
  const totalMo = Math.round(mo * 100) / 100;
  return {
    total_repuestos: totalRep,
    mano_obra: totalMo,
    total_orden: Math.round((totalRep + totalMo) * 100) / 100,
  };
}
