import { EstadoAprobacion, EstadoPagoGasto } from './entities/expense.enums';

/**
 * Qué gastos cuentan para cada pregunta. Antes cada consulta armaba su propio
 * WHERE y no coincidían: Cuentas por pagar y Vencimientos sumaban los
 * rechazados, y el gasto del mes y los presupuestos también. Con umbral de
 * aprobación > 0, la pantalla mostraba una deuda que incluía facturas
 * rechazadas, y pagar ese número por fuera o con anticipo las pagaba.
 *
 * - (a) vigente: activo y no rechazado. Lo que se gastó.
 * - (b) exigible: aprobado y no pagado. Lo que se puede pagar hoy.
 * - (c) abierta: (a) y no pagado. Lo que se debe o se va a deber: los
 *   pendientes de firma siguen a la vista (los gastos fijos se generan antes
 *   del vencimiento y tienen que verse) pero separados de lo exigible.
 *
 * Los parámetros llevan prefijo `dx_` para no pisar los `:pagado` o
 * `:aprobado` que ya usan las consultas donde se aplican.
 */
interface ConAndWhere {
  andWhere(where: string, parameters?: Record<string, unknown>): this;
}

export function condicionGastoVigente<Q extends ConAndWhere>(
  qb: Q,
  alias = 'e',
): Q {
  return qb
    .andWhere(`${alias}.estado = true`)
    .andWhere(`${alias}.estado_aprobacion != :dx_rechazado`, {
      dx_rechazado: EstadoAprobacion.RECHAZADO,
    });
}

export function condicionDeudaExigible<Q extends ConAndWhere>(
  qb: Q,
  alias = 'e',
): Q {
  return qb
    .andWhere(`${alias}.estado = true`)
    .andWhere(`${alias}.estado_aprobacion = :dx_aprobado`, {
      dx_aprobado: EstadoAprobacion.APROBADO,
    })
    .andWhere(`${alias}.estado_pago != :dx_pagado`, {
      dx_pagado: EstadoPagoGasto.PAGADO,
    });
}

export function condicionDeudaAbierta<Q extends ConAndWhere>(
  qb: Q,
  alias = 'e',
): Q {
  return condicionGastoVigente(qb, alias).andWhere(
    `${alias}.estado_pago != :dx_pagado`,
    {
      dx_pagado: EstadoPagoGasto.PAGADO,
    },
  );
}
