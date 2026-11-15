import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PLA-05 (auditoría 13/10/2026): una billetera no podía pasar de
 * $99.999.999,99. `wallets.current_balance` era numeric(10,2): al cruzar ese
 * tope, Postgres rechaza el asiento y todo cobro y pago en esa billetera da
 * 500 (también el webhook de MP, que reintenta sin fin). Con la facturación
 * acumulándose en la billetera del banco o de MP, el tope llega en meses.
 *
 * Todo lo que guarda plata de billeteras, caja y gastos pasa a numeric(14,2)
 * (hasta 999.999.999.999,99). El libro (`wallet_movements`) estaba en 12,2:
 * también sube, para que el saldo posterior no sea el próximo techo.
 *
 * Subir la precisión sin cambiar la escala no reescribe la tabla en Postgres:
 * es un cambio de metadatos, rápido aun con muchas filas.
 */
const COLUMNAS: [string, string[]][] = [
  ['wallets', ['current_balance']],
  ['wallet_movements', ['monto', 'saldo_posterior']],
  ['wallet_balances', ['opening_amount', 'expected_amount', 'declared_amount', 'difference']],
  ['expenses', ['monto', 'neto', 'iva', 'percepciones', 'monto_pagado']],
  ['expense_payments', ['monto']],
  ['supplier_advances', ['monto', 'saldo']],
  [
    'cash_registers',
    ['monto_apertura', 'monto_esperado', 'monto_declarado', 'diferencia', 'ventas_efectivo', 'ventas_digital', 'retiros_caja', 'ingresos_extra'],
  ],
  ['cash_movements', ['monto']],
];

export class PlataSinTope1789800000018 implements MigrationInterface {
  name = 'PlataSinTope1789800000018';

  public async up(q: QueryRunner): Promise<void> {
    for (const [tabla, columnas] of COLUMNAS) {
      const alter = columnas.map((c) => `ALTER COLUMN "${c}" TYPE numeric(14,2)`).join(', ');
      await q.query(`ALTER TABLE "${tabla}" ${alter}`);
    }
  }

  /**
   * Vuelve a los tamaños de antes. Falla si ya hay un valor que no entra
   * (justamente lo que esta migración vino a permitir): en ese caso no se
   * puede volver atrás sin perder datos, y está bien que falle.
   */
  public async down(q: QueryRunner): Promise<void> {
    for (const [tabla, columnas] of COLUMNAS) {
      const precision = tabla === 'wallet_movements' ? 12 : 10;
      const alter = columnas.map((c) => `ALTER COLUMN "${c}" TYPE numeric(${precision},2)`).join(', ');
      await q.query(`ALTER TABLE "${tabla}" ${alter}`);
    }
  }
}
