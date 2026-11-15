// SOPORTE DE MIGRACIONES: el módulo ya no existe; este archivo queda sólo porque una migración del historial lo importa.
/**
 * El relleno de la migración 1789800000008 (spec 2026-10-02 §3.6), puro y
 * testeado sin base. A partir de las ventas que ya existen arma las filas de
 * `venta_cobros`, `venta_devoluciones` y `venta_devolucion_items` que esas
 * ventas hubieran tenido con el modelo nuevo. Los campos van en snake_case:
 * entran tal como los devuelve `QueryRunner.query` y salen tal como se insertan.
 */

export interface VentaVieja {
  id: string;
  company_id: string | null;
  estado: string;
  total: string | number;
  wallet_id: string | null;
  mp_payment_id: string | null;
  pagado_at: Date | string | null;
  entregado_at: Date | string | null;
  devuelto_at: Date | string | null;
  updated_at: Date | string;
  created_at: Date | string;
  entregado_por: string | null;
  cancelado_motivo: string | null;
}

export interface ItemViejo {
  id: string;
  venta_id: string;
  cantidad: string | number;
  ingredient_id: string | null;
}

/** Un asiento de billetera: sólo su id y a qué apunta (`origen_id`). */
export interface MovimientoViejo {
  id: string;
  origen_id: string;
}

export interface DatosRelleno {
  ventas: VentaVieja[];
  items: ItemViejo[];
  /** Asientos `venta`/`ingreso` con `origen_id` = la venta, del más viejo al más nuevo. */
  movimientosVenta: MovimientoViejo[];
  /** Asientos `anulacion_pago` con `origen_id` = el asiento anulado: así revertía el `devolver` viejo. */
  anulaciones: MovimientoViejo[];
  /** Ventas con al menos un `stock_movements` de origen `devolucion_venta`. */
  ventasConReingreso: string[];
}

export interface CobroRelleno {
  venta_id: string;
  wallet_id: string;
  monto: number;
  tipo: 'total';
  movimiento_id: string | null;
  mp_payment_id: string | null;
  cobrado_por: string | null;
  created_at: Date;
  company_id: string | null;
}

export interface DevolucionRelleno {
  id: string;
  venta_id: string;
  monto: number;
  wallet_id: string | null;
  movimiento_id: string | null;
  motivo: string;
  devuelto_por: null;
  created_at: Date;
  company_id: string | null;
}

export interface DevolucionItemRelleno {
  devolucion_id: string;
  item_id: string;
  cantidad: number;
  reingresa_stock: boolean;
}

export interface Relleno {
  cobros: CobroRelleno[];
  devoluciones: DevolucionRelleno[];
  devolucionItems: DevolucionItemRelleno[];
  /** Renglones que quedan con `cantidad_devuelta = cantidad`. */
  itemsDevueltos: string[];
}

/** `venta_devoluciones.motivo` es NOT NULL: una devuelta vieja sin motivo cargado lleva este texto. */
export const MOTIVO_SIN_REGISTRO = 'Devolución anterior al registro por renglón';

const fecha = (valor: Date | string): Date => new Date(valor);

export function armarRelleno(d: DatosRelleno, nuevoId: () => string): Relleno {
  const primerCobro = new Map<string, string>();
  for (const m of d.movimientosVenta) {
    if (!primerCobro.has(m.origen_id)) primerCobro.set(m.origen_id, m.id);
  }
  const anulacionDe = new Map<string, string>();
  for (const a of d.anulaciones) anulacionDe.set(a.origen_id, a.id);
  const conReingreso = new Set(d.ventasConReingreso);
  const itemsPorVenta = new Map<string, ItemViejo[]>();
  for (const i of d.items) {
    const lista = itemsPorVenta.get(i.venta_id) ?? [];
    lista.push(i);
    itemsPorVenta.set(i.venta_id, lista);
  }

  const r: Relleno = { cobros: [], devoluciones: [], devolucionItems: [], itemsDevueltos: [] };
  for (const v of d.ventas) {
    const total = Number(v.total);
    const movimiento = primerCobro.get(v.id) ?? null;

    // Un cobro se reconoce por la billetera: `entregar` y `aplicarPago` la
    // escriben sólo al cobrar. `pagado_at` no alcanza — el mostrador cobra al
    // entregar y nunca lo escribe —, y una venta pagada por MP sin billetera
    // configurada no tiene asiento ni a dónde apuntar `wallet_id` (NOT NULL).
    const cobrada = !!v.wallet_id && total > 0;
    if (cobrada) {
      r.cobros.push({
        venta_id: v.id,
        wallet_id: v.wallet_id as string,
        monto: total,
        tipo: 'total',
        movimiento_id: movimiento,
        mp_payment_id: v.mp_payment_id,
        cobrado_por: v.mp_payment_id ? null : v.entregado_por,
        created_at: fecha(v.pagado_at ?? v.entregado_at ?? v.created_at),
        company_id: v.company_id,
      });
    }

    if (v.estado !== 'devuelta') continue;
    const id = nuevoId();
    r.devoluciones.push({
      id,
      venta_id: v.id,
      monto: cobrada ? total : 0,
      wallet_id: cobrada ? v.wallet_id : null,
      movimiento_id: cobrada && movimiento ? (anulacionDe.get(movimiento) ?? null) : null,
      motivo: (v.cancelado_motivo ?? '').trim() || MOTIVO_SIN_REGISTRO,
      devuelto_por: null,
      created_at: fecha(v.devuelto_at ?? v.updated_at),
      company_id: v.company_id,
    });
    for (const i of itemsPorVenta.get(v.id) ?? []) {
      const cantidad = Number(i.cantidad);
      if (cantidad <= 0) continue;
      r.devolucionItems.push({
        devolucion_id: id,
        item_id: i.id,
        cantidad,
        reingresa_stock: !!i.ingredient_id && conReingreso.has(v.id),
      });
      r.itemsDevueltos.push(i.id);
    }
  }
  return r;
}
