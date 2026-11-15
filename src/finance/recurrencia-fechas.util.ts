import { Frecuencia } from './entities/recurring-expense.entity';

/**
 * Aritmética de vencimientos de los gastos recurrentes.
 *
 * Vive fuera del servicio como funciones puras: acá están los casos borde de
 * calendario (el 31 sobre febrero, los bisiestos) y es donde un error genera
 * gastos en fechas equivocadas todos los meses. Puro = testeable sin base.
 */

/**
 * Parsea el valor de una columna `date` (string 'YYYY-MM-DD' de TypeORM, o un
 * Date date-only) como fecha LOCAL anclada a mediodía.
 *
 * `new Date('2026-09-14')` parsea UTC medianoche — en Argentina eso es el 13
 * a las 21hs, y así los gastos recurrentes se generaban con vencimiento un
 * día ANTES del configurado (día 14 → gasto el 13). El mediodía blinda la
 * ida y vuelta a la base contra cualquier huso de ±12.
 */
export function fechaLocal(valor: string | Date): Date {
  if (valor instanceof Date) {
    // Un Date date-only viene como UTC medianoche: sus componentes UTC son
    // el día calendario real.
    return new Date(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate(), 12);
  }
  const [y, m, d] = String(valor).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * Fija el día del mes sin desbordar.
 *
 * Un vencimiento el 31 no puede convertirse en el 3 de marzo: `setDate(31)`
 * sobre febrero se pasa de largo al mes siguiente. Se recorta al último día
 * del mes.
 */
export function conDia(fecha: Date, dia: number): Date {
  const f = new Date(fecha);
  const ultimoDelMes = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  f.setDate(Math.min(dia, ultimoDelMes));
  return f;
}

/** Primer vencimiento a partir del inicio, respetando el día elegido. */
export function primeraFecha(inicio: Date, dia: number): Date {
  const f = conDia(new Date(inicio), dia);
  if (f < inicio) {
    const siguiente = new Date(f);
    siguiente.setMonth(siguiente.getMonth() + 1);
    return conDia(siguiente, dia);
  }
  return f;
}

export function siguienteFecha(desde: Date, frecuencia: Frecuencia, dia: number): Date {
  const f = new Date(desde);
  // Para los saltos por mes/año se pisa el día a 1 ANTES de avanzar: si no,
  // `setMonth` sobre un 31 de enero desborda al 3 de marzo y el recorte de
  // conDia llega tarde — el vencimiento de febrero se salteaba entero. Ese
  // bug vivió en la versión original de esta lógica.
  switch (frecuencia) {
    case Frecuencia.SEMANAL:
      f.setDate(f.getDate() + 7);
      return f;
    case Frecuencia.QUINCENAL:
      f.setDate(f.getDate() + 15);
      return f;
    case Frecuencia.MENSUAL:
      f.setDate(1);
      f.setMonth(f.getMonth() + 1);
      return conDia(f, dia);
    case Frecuencia.BIMESTRAL:
      f.setDate(1);
      f.setMonth(f.getMonth() + 2);
      return conDia(f, dia);
    case Frecuencia.TRIMESTRAL:
      f.setDate(1);
      f.setMonth(f.getMonth() + 3);
      return conDia(f, dia);
    case Frecuencia.ANUAL:
      f.setDate(1);
      f.setFullYear(f.getFullYear() + 1);
      f.setMonth(desde.getMonth());
      return conDia(f, dia);
  }
}

/**
 * Tope de vueltas de `primeraNoAnteriorA`. Holgado a propósito: una semanal
 * dada de baja hace diez años son ~520 vueltas; 5000 son casi un siglo.
 */
const TOPE_VUELTAS = 5000;

/**
 * Primera ocurrencia de la serie que no es anterior a `minimo`, avanzando
 * desde `desde` con la frecuencia de la plantilla.
 *
 * Es lo que usa «Retomar desde hoy» (#42): una plantilla que estuvo parada
 * vuelve a su calendario de siempre, pero sin generar los vencimientos que
 * quedaron atrás. Si `desde` ya no es anterior, se devuelve tal cual.
 */
export function primeraNoAnteriorA(desde: Date, minimo: Date, frecuencia: Frecuencia, dia: number): Date {
  let f = new Date(desde);
  for (let vueltas = 0; f < minimo; vueltas++) {
    if (vueltas >= TOPE_VUELTAS) {
      throw new Error(`primeraNoAnteriorA: más de ${TOPE_VUELTAS} vueltas`);
    }
    f = siguienteFecha(f, frecuencia, dia);
  }
  return f;
}
