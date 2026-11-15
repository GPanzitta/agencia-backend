/**
 * Los cuatro números que definen cuánto vale un gasto: el total y su desglose
 * fiscal. La regla es una sola: si hay desglose, el total es
 * neto + IVA + percepciones; si no, el neto es el total.
 *
 * Todo pasa por `Number()`: lo que viene de la base (decimal) llega como
 * string, y `'100.00' + '21.00'` concatena en vez de sumar.
 */
export interface TotalesGasto {
  monto: number;
  neto: number;
  iva: number;
  percepciones: number;
}

type Numerico = number | string | null | undefined;

export interface EntradaTotales {
  monto?: Numerico;
  neto?: Numerico;
  iva?: Numerico;
  percepciones?: Numerico;
}

/** 'desglose' (1a): vino neto, IVA o percepciones. 'monto' (1b): vino solo el total. */
export type RamaEdicion = 'desglose' | 'monto';

const dosDecimales = (n: number) => Number(Number(n).toFixed(2));
const num = (v: Numerico) => Number(v ?? 0) || 0;
const vino = (v: Numerico) => v !== undefined && v !== null;

/** El alta: el desglose, si vino, calcula el total. */
export function totalesDeAlta(dto: EntradaTotales): TotalesGasto {
  const neto = num(dto.neto);
  const iva = num(dto.iva);
  const percepciones = num(dto.percepciones);
  const hayDesglose = neto > 0 || iva > 0 || percepciones > 0;
  const monto = hayDesglose
    ? dosDecimales(neto + iva + percepciones)
    : dosDecimales(num(dto.monto));
  return { monto, neto: hayDesglose ? neto : monto, iva, percepciones };
}

/**
 * La edición. Antes el PATCH copiaba el desglose sobre el gasto y dejaba el
 * total viejo: un gasto de $121 editado a 200 + 42 seguía valiendo $121 para
 * pagar, para Cuentas por pagar y para los reportes.
 *
 * - 1a) Vino algo del desglose: se combina con lo guardado y el total sale de
 *   la suma. Si todo quedó en 0 (el operario sacó el desglose), el total es el
 *   monto que vino (o el guardado) y el neto pasa a ser ese total.
 * - 1b) Vino solo el monto: si el gasto tenía IVA o percepciones, se
 *   prorratean para que la suma siga cerrando. El redondeo va al neto. Si el
 *   monto es el mismo que ya tenía, no se toca nada: editar las notas no
 *   reescribe el desglose fiscal.
 * - 1c) No vino ni monto ni desglose: `null`, los totales no se tocan.
 */
export function totalesDeEdicion(
  guardado: EntradaTotales,
  dto: EntradaTotales,
): (TotalesGasto & { rama: RamaEdicion }) | null {
  if (vino(dto.neto) || vino(dto.iva) || vino(dto.percepciones)) {
    const neto = dosDecimales(
      vino(dto.neto) ? num(dto.neto) : num(guardado.neto),
    );
    const iva = dosDecimales(vino(dto.iva) ? num(dto.iva) : num(guardado.iva));
    const percepciones = dosDecimales(
      vino(dto.percepciones)
        ? num(dto.percepciones)
        : num(guardado.percepciones),
    );
    if (neto > 0 || iva > 0 || percepciones > 0) {
      return {
        rama: 'desglose',
        monto: dosDecimales(neto + iva + percepciones),
        neto,
        iva,
        percepciones,
      };
    }
    const monto = dosDecimales(
      vino(dto.monto) ? num(dto.monto) : num(guardado.monto),
    );
    return { rama: 'desglose', monto, neto: monto, iva: 0, percepciones: 0 };
  }

  if (!vino(dto.monto)) return null;

  const monto = dosDecimales(num(dto.monto));
  if (monto === dosDecimales(num(guardado.monto))) return null;

  const neto = num(guardado.neto);
  const iva = num(guardado.iva);
  const percepciones = num(guardado.percepciones);
  const base = neto + iva + percepciones;
  if ((iva <= 0 && percepciones <= 0) || base <= 0) {
    return { rama: 'monto', monto, neto: monto, iva: 0, percepciones: 0 };
  }

  const factor = monto / base;
  const ivaNuevo = dosDecimales(iva * factor);
  const percepcionesNuevas = dosDecimales(percepciones * factor);
  return {
    rama: 'monto',
    monto,
    neto: dosDecimales(monto - ivaNuevo - percepcionesNuevas),
    iva: ivaNuevo,
    percepciones: percepcionesNuevas,
  };
}
