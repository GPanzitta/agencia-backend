import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Integridad en la base (informe de seguridad del 14/10/2026, sección 7.3).
 *
 * Tres cosas, todas pensadas para no frenar el deploy con datos viejos:
 *
 * 1. CHECK `>= 0` en montos y cantidades, como `NOT VALID`: Postgres los exige
 *    en toda fila nueva o editada desde ahora, pero no revisa las que ya están.
 *    Se validan después, a mano, con `scripts/validar-integridad.sql`, cuando
 *    `scripts/diagnostico-integridad.sql` (B1) dé 0.
 *    NO van en saldos de billetera, stock, kardex (`stock_posterior`,
 *    `saldo_posterior`), saldos de anticipos ni diferencias de arqueo o de
 *    conteo: esos pueden ser negativos por diseño.
 *
 * 2. Las FK que faltaban, también `NOT VALID` (B3 dice si hay huérfanos). El
 *    ON DELETE copia lo que hace hoy el código:
 *    - nada borra órdenes, ventas, billeteras (baja lógica), movimientos de
 *      stock ni usuarios: NO ACTION, igual que las FK vecinas;
 *    - la bitácora (eventos) cuelga de la orden como las notas y los PDF:
 *      CASCADE, igual que ellas;
 *    - las plantillas de mensajes SÍ se borran (`mensajes.service.borrar`): el
 *      correo enviado queda y pierde la referencia (SET NULL);
 *    - quién hizo algo (autor, editor, quién subió, quién envió, el empleado
 *      del evento): SET NULL, como `desguace_piezas.autor_id`;
 *    - venta y carrito se apuntan entre sí: SET NULL en los dos sentidos.
 *    Si la columna ya tiene una FK (la base de producción nació de las
 *    migraciones y la de desarrollo de `synchronize`, y no son idénticas), no
 *    se agrega otra.
 *
 * 3. Dos únicos, que se crean sólo si no hay duplicados (B2). Si los hay, se
 *    avisa en el log (sólo la cantidad, sin los datos) y se saltea: la
 *    migración no falla y el resto queda aplicado. Se pueden crear después
 *    con `scripts/validar-integridad.sql`.
 *    - `lower(users.email)`: hoy el único distingue mayúsculas.
 *    - `repair_orders.mp_payment_id` parcial: un webhook repetido no puede
 *      asentar dos veces la misma seña.
 *
 * Una columna que no existe en esta base se saltea con aviso, en vez de
 * cortar el deploy.
 *
 * Los CASCADE que borrarían historia de plata NO se tocan acá: pasarlos a
 * RESTRICT es una decisión del dueño (informe 7.3).
 *
 * Locks: cada ALTER toma un lock breve sobre su tabla (sin recorrerla, por el
 * NOT VALID); los dos índices únicos sí recorren `users` y `repair_orders`.
 * Correrla en horario de baja.
 */

/** [tabla, columnas que no pueden ser negativas]. El nombre sale de la tabla. */
const CHECKS_NO_NEGATIVOS: [string, string[]][] = [
  ['repair_orders', ['monto_presupuestado', 'sena_pagada', 'saldo_cobrado']],
  ['repair_order_repuestos', ['cantidad', 'precio_unitario']],
  ['ventas_tienda', ['subtotal', 'costo_envio', 'descuento', 'total']],
  ['ventas_tienda_items', ['cantidad', 'precio_unitario', 'precio_lista', 'cantidad_devuelta']],
  ['carrito_items', ['cantidad', 'precio_visto']],
  ['wallet_movements', ['monto']],
  ['stock_movements', ['cantidad', 'costo_unitario', 'costo_total']],
  ['expenses', ['monto', 'neto', 'iva', 'percepciones', 'monto_pagado']],
  ['expense_payments', ['monto']],
  ['supplier_advances', ['monto']],
  ['pagos_sin_aplicar', ['monto']],
  ['purchase_orders', ['monto_estimado', 'monto_final', 'tipo_cambio']],
  ['purchase_order_items', ['cantidad_pedida', 'cantidad_recibida', 'precio_unitario_estimado', 'precio_unitario_final']],
  ['purchase_receipts', ['monto']],
  ['purchase_receipt_items', ['cantidad', 'precio_unitario', 'subtotal', 'cantidad_rechazada']],
  ['purchase_devoluciones', ['monto']],
  ['purchase_devolucion_items', ['cantidad', 'precio_unitario']],
  ['cash_movements', ['monto']],
  ['cash_registers', ['monto_apertura', 'ventas_efectivo', 'ventas_digital', 'retiros_caja', 'ingresos_extra', 'monto_declarado']],
  ['wallet_balances', ['opening_amount', 'declared_amount']],
  ['rutas', ['rendido']],
  ['ruta_paradas', ['cobrado_monto']],
  ['turnos', ['costo_visita']],
  ['ingredients', ['cost', 'ultimo_costo', 'minStock', 'precio_venta', 'ml_precio', 'precio_anterior']],
];

const nombreCheck = (tabla: string): string => `CHK_${tabla}_no_negativos`;

/** Expresión del CHECK. La misma que usan los `@Check` espejo de las entidades. */
const expresionNoNegativos = (columnas: string[]): string =>
  columnas.map((c) => `"${c}" >= 0`).join(' AND ');

type AlBorrar = 'NO ACTION' | 'CASCADE' | 'SET NULL';
interface Fk {
  tabla: string;
  columna: string;
  referencia: string;
  alBorrar: AlBorrar;
}

const FKS: Fk[] = [
  { tabla: 'repair_order_events', columna: 'order_id', referencia: 'repair_orders', alBorrar: 'CASCADE' },
  { tabla: 'repair_order_events', columna: 'empleado_id', referencia: 'users', alBorrar: 'SET NULL' },
  { tabla: 'repair_order_events', columna: 'company_id', referencia: 'company', alBorrar: 'NO ACTION' },
  { tabla: 'repair_order_notes', columna: 'autor_id', referencia: 'users', alBorrar: 'SET NULL' },
  { tabla: 'repair_order_notes', columna: 'editado_por_id', referencia: 'users', alBorrar: 'SET NULL' },
  { tabla: 'ventas_tienda', columna: 'wallet_id', referencia: 'wallets', alBorrar: 'NO ACTION' },
  { tabla: 'ventas_tienda', columna: 'carrito_id', referencia: 'carritos_tienda', alBorrar: 'SET NULL' },
  { tabla: 'carritos_tienda', columna: 'venta_id', referencia: 'ventas_tienda', alBorrar: 'SET NULL' },
  { tabla: 'company', columna: 'mp_wallet_id', referencia: 'wallets', alBorrar: 'NO ACTION' },
  { tabla: 'company', columna: 'transferencia_wallet_id', referencia: 'wallets', alBorrar: 'NO ACTION' },
  { tabla: 'correos_enviados', columna: 'company_id', referencia: 'company', alBorrar: 'NO ACTION' },
  { tabla: 'correos_enviados', columna: 'cliente_id', referencia: 'customers', alBorrar: 'NO ACTION' },
  { tabla: 'correos_enviados', columna: 'orden_id', referencia: 'repair_orders', alBorrar: 'NO ACTION' },
  { tabla: 'correos_enviados', columna: 'plantilla_id', referencia: 'mensaje_plantillas', alBorrar: 'SET NULL' },
  { tabla: 'correos_enviados', columna: 'enviado_por_id', referencia: 'users', alBorrar: 'SET NULL' },
  { tabla: 'orden_documentos', columna: 'subido_por_id', referencia: 'users', alBorrar: 'SET NULL' },
  { tabla: 'orden_documentos', columna: 'company_id', referencia: 'company', alBorrar: 'NO ACTION' },
  { tabla: 'desguace_piezas', columna: 'stock_movement_id', referencia: 'stock_movements', alBorrar: 'NO ACTION' },
];

const nombreFk = (fk: Fk): string => `FK_integridad_${fk.tabla}_${fk.columna}`;

interface Unico {
  nombre: string;
  tabla: string;
  /** Cuenta los valores repetidos (grupos con más de una fila). */
  repetidos: string;
  crear: string;
}

const UNICOS: Unico[] = [
  {
    nombre: 'UQ_users_email_lower',
    tabla: 'users',
    repetidos: `SELECT count(*)::int AS n FROM (SELECT lower("email") FROM "users" GROUP BY 1 HAVING count(*) > 1) x`,
    crear: `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_lower" ON "users" (lower("email"))`,
  },
  {
    nombre: 'UQ_repair_orders_mp_payment',
    tabla: 'repair_orders',
    repetidos: `SELECT count(*)::int AS n FROM (SELECT "mp_payment_id" FROM "repair_orders" WHERE "mp_payment_id" IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x`,
    crear: `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_repair_orders_mp_payment" ON "repair_orders" ("mp_payment_id") WHERE "mp_payment_id" IS NOT NULL`,
  },
];

const aviso = (texto: string): void => console.warn(`[IntegridadDatos] ${texto}`);

export class IntegridadDatos1790000000000 implements MigrationInterface {
  name = 'IntegridadDatos1790000000000';

  public async up(q: QueryRunner): Promise<void> {
    const columnas = await this.columnasPorTabla(q);
    const existe = (tabla: string, columna: string) => columnas.get(tabla)?.has(columna) ?? false;

    // 1. CHECK >= 0, NOT VALID.
    for (const [tabla, cols] of CHECKS_NO_NEGATIVOS) {
      const presentes = cols.filter((c) => existe(tabla, c));
      const faltan = cols.filter((c) => !presentes.includes(c));
      if (faltan.length) aviso(`${tabla}: no existen ${faltan.join(', ')}; el CHECK va sin esas columnas`);
      if (!presentes.length) continue;
      if (await this.hayConstraint(q, tabla, nombreCheck(tabla))) continue;
      await q.query(
        `ALTER TABLE "${tabla}" ADD CONSTRAINT "${nombreCheck(tabla)}" CHECK (${expresionNoNegativos(presentes)}) NOT VALID`,
      );
    }

    // 2. FK faltantes, NOT VALID.
    for (const fk of FKS) {
      if (!existe(fk.tabla, fk.columna) || !columnas.has(fk.referencia)) {
        aviso(`${fk.tabla}.${fk.columna}: la columna o la tabla ${fk.referencia} no existen; se saltea la FK`);
        continue;
      }
      if (await this.columnaTieneFk(q, fk.tabla, fk.columna)) continue;
      await q.query(
        `ALTER TABLE "${fk.tabla}" ADD CONSTRAINT "${nombreFk(fk)}" FOREIGN KEY ("${fk.columna}") ` +
          `REFERENCES "${fk.referencia}"("id") ON DELETE ${fk.alBorrar} ON UPDATE NO ACTION NOT VALID`,
      );
    }

    // 3. Únicos, sólo sin duplicados.
    for (const u of UNICOS) {
      const [{ n }]: { n: number }[] = await q.query(u.repetidos);
      if (n > 0) {
        aviso(
          `${u.nombre}: hay ${n} valor(es) repetido(s) en ${u.tabla}; NO se crea el único. ` +
            'Ver B2 en scripts/diagnostico-integridad.sql, conciliar y crearlo con scripts/validar-integridad.sql.',
        );
        continue;
      }
      await q.query(u.crear);
    }
  }

  /**
   * Saca sólo lo que creó esta migración (todo lleva nombre propio): las FK
   * que ya existían con otro nombre no se tocan.
   */
  public async down(q: QueryRunner): Promise<void> {
    for (const u of UNICOS) await q.query(`DROP INDEX IF EXISTS "${u.nombre}"`);
    for (const fk of [...FKS].reverse()) {
      await q.query(`ALTER TABLE IF EXISTS "${fk.tabla}" DROP CONSTRAINT IF EXISTS "${nombreFk(fk)}"`);
    }
    for (const [tabla] of [...CHECKS_NO_NEGATIVOS].reverse()) {
      await q.query(`ALTER TABLE IF EXISTS "${tabla}" DROP CONSTRAINT IF EXISTS "${nombreCheck(tabla)}"`);
    }
  }

  private async columnasPorTabla(q: QueryRunner): Promise<Map<string, Set<string>>> {
    const filas: { table_name: string; column_name: string }[] = await q.query(
      `SELECT c.table_name, c.column_name
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = current_schema()`,
    );
    const mapa = new Map<string, Set<string>>();
    for (const f of filas) {
      if (!mapa.has(f.table_name)) mapa.set(f.table_name, new Set());
      mapa.get(f.table_name)!.add(f.column_name);
    }
    return mapa;
  }

  private async hayConstraint(q: QueryRunner, tabla: string, nombre: string): Promise<boolean> {
    const filas: unknown[] = await q.query(
      `SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass($1) AND conname = $2`,
      [`"${tabla}"`, nombre],
    );
    return filas.length > 0;
  }

  /** true si la columna ya es (sola) una FK, con cualquier nombre. */
  private async columnaTieneFk(q: QueryRunner, tabla: string, columna: string): Promise<boolean> {
    const filas: unknown[] = await q.query(
      `SELECT 1
         FROM pg_constraint con
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
        WHERE con.contype = 'f' AND con.conrelid = to_regclass($1)
          AND array_length(con.conkey, 1) = 1 AND a.attname = $2`,
      [`"${tabla}"`, columna],
    );
    return filas.length > 0;
  }
}
