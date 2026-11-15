import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from '../../auth/entities/user.entity';
import type { AgendaConfig, SlaConfig } from '../config-heredada.util';
import type { PlanTaller } from '../../abono/abono.util';

@Entity()
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // El ciclo de la orden es configurable por taller: con presupuesto y
  // aprobacion del cliente (default), o directo (se recibe, se repara, se
  // cobra al retirar). Lo consulta la maquina de estados de las ordenes.
  @Column({ type: 'boolean', default: true })
  requiere_presupuesto: boolean;

  @Column({ nullable: true })
  domain: string;

  /** Agencia (12/11/2026): la dirección propia de su sitio (`perez` en `perez.dominio`). Única. */
  @Index('UQ_company_slug', { unique: true, where: `"slug" IS NOT NULL` })
  @Column({ type: 'varchar', length: 60, nullable: true })
  slug: string | null;

  /** Agencia (13/11/2026): si el sitio muestra a quien mira un auto cómo están sus papeles. Espejo de la migración 1790000000028. */
  @Column({ type: 'boolean', default: true })
  sitio_muestra_papeles: boolean;

  /** Agencia (13/11/2026): con qué condiciones el sitio simula cuotas. `null` = no ofrece financiación. Migración 1790000000029. */
  @Column({ type: 'jsonb', nullable: true })
  sitio_financiacion: { anticipo_minimo_pct: number; plazos: number[]; tna_ars: number | null; tna_usd: number | null } | null;

  /** Agencia (13/11/2026): con qué condiciones el sitio toma reservas con seña por transferencia. `null` = no toma. Migración 1790000000030. */
  @Column({ type: 'jsonb', nullable: true })
  sitio_reserva: { monto: number; moneda: 'ARS' | 'USD'; horas: number; dias: number; alias: string; titular: string } | null;

  /** Agencia (14/11/2026): a cuántos pesos toma el dólar para comparar precios con otros vendedores. Migración 1790000000034. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  dolar_comparacion: number | null;

  // ─── Seguimiento de envíos (Fase 3) ────────────────────────────────────
  //
  // Origen para dibujar la ruta local→destino en el mapa del repartidor.
  // Se cargan a mano una vez desde Configuración: es un solo local por
  // empresa y no cambia, así que no hace falta geocodificarlo — a diferencia
  // de la dirección de cada pedido, que sí es texto libre y variable.

  @Column({ type: 'text', nullable: true })
  direccion?: string;

  // ─── Membrete de la documentación física ───────────────────────────────
  // Orden de servicio, remito de entrega y OC salen impresos con estos datos.

  @Column({ type: 'varchar', length: 40, nullable: true })
  telefono?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cuit?: string;

  // ─── Datos legales de los documentos (opción B, 13/10/2026) ────────────
  // Lo que la ley pide que digan los papeles al cliente (pie del prestador,
  // condiciones de recepción, presupuesto y garantía). Todos tienen respaldo:
  // vacío, el papel usa el que dice cada comentario.

  /** Razón social del pie, los datos personales y la garantía. Vacía = `name`. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  razon_social?: string | null;

  /** `responsable_inscripto` | `monotributo` | `exento`. Vacía = el pie no la imprime. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  condicion_iva?: string | null;

  /** N° de Ingresos Brutos del pie. Vacío = no se imprime. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  iibb?: string | null;

  /** Inicio de actividades (`aaaa-mm-dd`) del pie. Vacío = no se imprime. */
  @Column({ type: 'date', nullable: true })
  inicio_actividades?: string | null;

  /** Dónde pedir los datos personales y reclamar la garantía. Vacío = «en el local». */
  @Column({ type: 'varchar', length: 120, nullable: true })
  email_contacto?: string | null;

  /** Horario del certificado de garantía («lunes a sábados de 9 a 18 h»). Vacío = se omite. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  horario_atencion?: string | null;

  /** Lo que cuesta la revisión (recepción y presupuesto). 0 = «La revisión no tiene cargo». */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costo_revision: number;

  /** La revisión se descuenta del total si el cliente aprueba el presupuesto. */
  @Column({ type: 'boolean', default: true })
  revision_se_descuenta: boolean;

  /** Días hábiles para mandar el presupuesto desde que se recibe el equipo. */
  @Column({ type: 'int', default: 2 })
  plazo_presupuesto_dias: number;

  /** Días hábiles para reparar desde la aprobación (Ley 5.672 CABA art. 3: nunca más de 30 corridos sin acuerdo escrito). */
  @Column({ type: 'int', default: 10 })
  plazo_reparacion_dias: number;

  /** Cargo diario por guarda, sólo desde la intimación (art. 2590 CCyC). 0 = sin cargo. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  canon_guarda_diario: number;

  /** Días hábiles para revisar un equipo que vuelve en garantía (certificado). */
  @Column({ type: 'int', default: 5 })
  revision_garantia_dias: number;

  /** Cuándo se emite la factura: `al_cobrar` | `al_senar` (seña y saldo). */
  @Column({ type: 'varchar', length: 20, default: 'al_cobrar' })
  factura_momento: string;

  /** Cláusula de traslado del certificado. Vacía = el texto por defecto de los documentos. */
  @Column({ type: 'text', nullable: true })
  traslado_garantia?: string | null;

  // ─── Portal del cliente / Mercado Pago (sub-4) ─────────────────────────

  /**
   * Access token de MP del taller. 'SIMULADO' activa el modo demo.
   *
   * CLI-02: es un secreto y nunca sale por HTTP (`@Exclude` vale para toda
   * entidad que pase por el ClassSerializerInterceptor, también anidada). Lo
   * que se informa es `mp_configurado` (sí/no).
   */
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'text', nullable: true })
  mp_access_token?: string | null;

  /** Lo que el taller marcó a mano de sus primeros pasos (`primeros-pasos.util.ts`). */
  @Column({ type: 'jsonb', default: {} })
  primeros_pasos: { plantillas_vistas?: boolean; cerrado?: boolean };

  /** Lo que declaró al registrarse. Informativo (spec 2026-10-28 §13.7). */
  @Column({ type: 'jsonb', nullable: true })
  rubros_declarados?: string[] | null;

  /** OAuth de la plataforma (spec 2026-10-28 §13.1). Sin esto, el token se pegó a mano y no se renueva. */
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'text', nullable: true, select: false })
  mp_refresh_token?: string | null;

  /** La cuenta de MP conectada por OAuth. Ninguno de estos sale serializado: los informa `miEmpresa`. */
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 40, nullable: true })
  mp_user_id?: string | null;

  /** El nombre de esa cuenta, para que el taller la reconozca. */
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  mp_cuenta?: string | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'timestamptz', nullable: true })
  mp_token_vence?: Date | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'timestamptz', nullable: true })
  mp_conectado_en?: Date | null;

  /** Qué porcentaje del presupuesto se cobra como seña en el portal. */
  @Column({ type: 'int', default: 50 })
  sena_porcentaje: number;

  /** Señas del portal, ventas de la tienda por MP y lo que el chofer cobra por MP en la puerta. */
  @Column({ type: 'uuid', nullable: true })
  mp_wallet_id?: string | null;

  /**
   * D2 — La billetera donde entran las transferencias que el chofer cobra en
   * la puerta. Puede ser la misma que `mp_wallet_id`. Nula = el chofer no
   * cobra por transferencia.
   */
  @Column({ type: 'uuid', nullable: true })
  transferencia_wallet_id?: string | null;

  /** Garantía por defecto de las reparaciones, en días. */
  @Column({ type: 'int', default: 90 })
  garantia_dias: number;

  /** Días en "listo"/"rechazada" sin retirar para considerar abandono.
   *  Coincide con la condición impresa en la orden de servicio. */
  @Column({ type: 'int', default: 30 })
  dias_abandono: number;

  /**
   * Exige que el repuesto de una orden con cargo tenga su compra hecha Y
   * pagada antes de darlo por recibido. Los talleres que compran a cuenta
   * corriente (el repuesto llega mucho antes de vencer la factura) lo apagan.
   */
  @Column({ type: 'boolean', default: true })
  exigir_oc_paga_repuestos: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng?: number;

  /**
   * T6 — Días hábiles, franjas de domicilio con su cupo y la grilla de
   * turnos del taller. Un jsonb en vez de una columna por cada cupo que
   * aparezca después. Nulo = valen los valores por defecto del backend.
   */
  @Column({ type: 'jsonb', nullable: true })
  agenda_config?: AgendaConfig | null;

  /** Lo que se le cobra al cliente por ir hasta su casa. Pisable por turno. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costo_visita_domicilio: number;

  /** La tienda ofrece envío a domicilio. */
  @Column({ type: 'boolean', default: false })
  envio_habilitado: boolean;

  /** Monto fijo del envío de la tienda. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  costo_envio_tienda: number;

  /** Cuánto dura una reserva sin pagar antes de liberar el stock. */
  @Column({ type: 'int', default: 24 })
  reserva_horas: number;

  /** Spec 2026-10-02 §3.6: tope de descuento del mostrador, en %. Admin y superadmin no tienen tope. */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  descuento_maximo_mostrador: number;
  // ─── Tienda: capa comercial (spec 2026-10-07 tienda §3.2) ──────────────

  /** IVA con el que se calcula el «precio sin impuestos nacionales» (Ley 27.743). */
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 21 })
  alicuota_iva_defecto: number;

  /** Planes de cuotas que anuncia la tienda: `[{ cuotas: 2..24, sin_interes }]`, sin repetir, hasta 6. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  cuotas_tienda: { cuotas: number; sin_interes: boolean }[];

  /** La tienda acepta transferencia. Habilitarla exige CBU o alias, titular y `transferencia_wallet_id`. */
  @Column({ type: 'boolean', default: false })
  transferencia_tienda_habilitada: boolean;

  /** Descuento por pagar con transferencia, 0..50 %. */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  transferencia_descuento_porcentaje: number;

  @Column({ type: 'varchar', length: 22, nullable: true })
  transferencia_cbu: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  transferencia_alias: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  transferencia_titular: string | null;

  /** Envío gratis cuando el subtotal (antes del descuento) llega a esto. Nulo = nunca. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  envio_gratis_desde: number | null;


  /**
   * T7 — Plazos que el taller promete, en horas. Nulo = valores por defecto
   * del backend. Es lo que se mide: la promesa, no la costumbre.
   */
  @Column({ type: 'jsonb', nullable: true })
  sla_config?: SlaConfig | null;

  /** Cuántas órdenes en paralelo aguanta un técnico antes de saturarse. */
  @Column({ type: 'int', default: 8 })
  tope_ordenes_tecnico: number;

  /** C — Margen por defecto sobre el costo para el precio sugerido del repuesto. */
  @Column({ type: 'int', default: 40 })
  margen_repuestos_porcentaje: number;

  /** C — Umbral de la alerta "este renglón vino más caro" al recibir una OC. */
  @Column({ type: 'int', default: 15 })
  alerta_suba_costo_porcentaje: number;

  /**
   * Abono (spec 2026-10-28 §7). El estado no se guarda: lo calcula `estadoAbono`.
   * Un taller nuevo nace `gratis`; `interno` es GUSMAT y las empresas anteriores.
   */
  @Column({ type: 'varchar', length: 10, default: 'gratis' })
  plan: PlanTaller;

  /** Hasta cuándo está pagado. Sólo lo extiende un pago aprobado. */
  @Column({ type: 'timestamptz', nullable: true })
  abono_vence_en?: Date | null;

  /** La suscripción de MP vigente. No sale serializado: lo informa `GET /abono/estado`. */
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 60, nullable: true })
  mp_preapproval_id?: string | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  mp_preapproval_estado?: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => User, user => user.company)
  users: User[];
}
