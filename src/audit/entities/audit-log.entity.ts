import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

/**
 * Acciones sensibles que quedan registradas.
 *
 * El criterio para entrar acá es "si aparece un descuadre o un reclamo,
 * ¿voy a querer saber quién hizo esto?". En un taller eso es la plata (caja,
 * gastos, pagos) y el ciclo de la orden en sus puntos de no retorno:
 * aprobar o rechazar un presupuesto y entregar el equipo.
 *
 * El enum solo lista lo que algún endpoint emite de verdad: un filtro que
 * siempre devuelve cero es ruido. (Los valores gastronómicos del sistema
 * madre siguen existiendo en el tipo de Postgres por compatibilidad, pero
 * ya no se emiten ni se ofrecen como filtro.)
 */
export enum AccionAuditada {
  CAJA_ABIERTA = 'caja_abierta',
  CAJA_CERRADA = 'caja_cerrada',
  MOVIMIENTO_CAJA = 'movimiento_caja',
  GASTO_APROBADO = 'gasto_aprobado',
  GASTO_RECHAZADO = 'gasto_rechazado',
  GASTO_ANULADO = 'gasto_anulado',
  PAGO_ANULADO = 'pago_anulado',
  PRESUPUESTO_APROBADO = 'presupuesto_aprobado',
  PRESUPUESTO_RECHAZADO = 'presupuesto_rechazado',
  ORDEN_ENTREGADA = 'orden_entregada',
  /** Edición de datos de recepción/equipo de una orden (bitácora + spec 02/09). */
  ORDEN_EDITADA = 'orden_editada',
  /** Edición del texto o la visibilidad de un comentario de la bitácora. */
  BITACORA_EDITADA = 'bitacora_editada',
  /** Alta, edición o baja de un mensaje de WhatsApp del taller. */
  PLANTILLA_EDITADA = 'plantilla_editada',
  // T6a — agenda: un compromiso con el cliente que se mueve o se cae tiene
  // que poder rastrearse hasta quién lo movió.
  TURNO_AGENDADO = 'turno_agendado',
  TURNO_REPROGRAMADO = 'turno_reprogramado',
  TURNO_CANCELADO = 'turno_cancelado',
  // C — pañol y compras: plata y stock que se mueven por decisión de alguien.
  STOCK_AJUSTADO = 'stock_ajustado',
  REPUESTO_DESACTIVADO = 'repuesto_desactivado',
  OC_EDITADA = 'oc_editada',
  OC_CERRADA_CON_FALTANTE = 'oc_cerrada_con_faltante',
  DEVOLUCION_PROVEEDOR = 'devolucion_proveedor',
  /** C5 — dos identidades se vuelven una: no hay forma de deshacerlo. */
  REPUESTO_FUSIONADO = 'repuesto_fusionado',
  /**
   * STK-06 — precio de lista, precio anterior o costo de un repuesto, con el
   * valor de antes y el de después (migración 1789800000017).
   */
  PRECIO_MODIFICADO = 'precio_modificado',
  /**
   * DAT-02 (integridad 14/10) — los datos de los CLIENTES: quién los dio de
   * alta, cambió, dio de baja, reactivó o importó en masa, y qué cambió (con
   * documento, teléfono y correo enmascarados). Migración 1789800000022.
   */
  CLIENTE_CREADO = 'cliente_creado',
  CLIENTE_EDITADO = 'cliente_editado',
  CLIENTE_DADO_DE_BAJA = 'cliente_dado_de_baja',
  CLIENTE_REACTIVADO = 'cliente_reactivado',
  CLIENTES_IMPORTADOS = 'clientes_importados',
  /**
   * SEG-54 — el empleado cambió su clave, o el admin se la reseteó (clave
   * provisoria). Nunca se guarda la clave. Migración 1790000000002.
   */
  CLAVE_CAMBIADA = 'clave_cambiada',
  CLAVE_RESETEADA = 'clave_reseteada',
}

@Entity('audit_logs')
// El uso real es "mostrame lo que pasó en este local, lo último primero".
@Index(['companyId', 'created_at'])
@Index(['companyId', 'accion'])
@Index(['entidad', 'entidad_id'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AccionAuditada })
  accion: AccionAuditada;

  // ─── Quién ────────────────────────────────────────────────────────────────
  //
  // El id, el email y el rol se guardan desnormalizados a propósito: si el
  // empleado después se da de baja o cambia de rol, el registro tiene que
  // seguir diciendo quién era en el momento del hecho. Un log de auditoría que
  // se altera cuando cambian los datos de referencia no sirve como evidencia.

  @Column({ type: 'uuid', nullable: true })
  usuario_id?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  usuario_email?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  usuario_rol?: string;

  // ─── Sobre qué ────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 60 })
  entidad: string;

  @Column({ name: 'entidad_id', type: 'varchar', length: 60, nullable: true })
  entidad_id?: string;

  /** Motivo declarado por el usuario, cuando la operación lo pide. */
  @Column({ type: 'text', nullable: true })
  motivo?: string;

  /** Datos del hecho: montos, estados previo/nuevo, lo que aplique. */
  @Column({ type: 'jsonb', nullable: true })
  detalle?: Record<string, any>;

  // ─── Desde dónde ──────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  // ─── Empresa ──────────────────────────────────────────────────────────────

  @ManyToOne(() => Company, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string;
}
