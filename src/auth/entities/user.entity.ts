import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Role } from '../../roles/entities/role.entity';
import { Exclude } from 'class-transformer';
import { Company } from '../../companies/entities/company.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  email: string;

  /** Alta pública: no puede entrar hasta confirmar el correo. */
  @Column({ type: 'boolean', default: false })
  confirmacion_pendiente: boolean;

  @Column({ type: 'varchar', length: 255 })
  @Exclude()
  password?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono?: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /** Agencia (13/11/2026): el porcentaje del precio que cobra de comisión por cada venta. Vacío = se carga a mano al cerrar. Migración 1790000000030. */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  comision_pct?: number | null;
  /** Pisa el tope de la empresa para este técnico puntual (T7). */
  @Column({ type: 'int', nullable: true })
  tope_ordenes?: number | null;

  /**
   * Se incrementa al cerrar sesión o al desactivar el usuario. El JWT lleva el
   * valor vigente al momento de firmarlo; si no coincide con el de la base, el
   * token se rechaza aunque todavía no haya expirado.
   *
   * Es la pieza que faltaba para poder revocar: antes un token de staff
   * quedaba operativo hasta sus 5 días de vida pasara lo que pasara —cambio de
   * permisos, cierre de sesión explícito— porque JWT es stateless y no había
   * nada contra qué comparar.
   */
  @Column({ name: 'token_version', type: 'int', default: 0 })
  @Exclude()
  tokenVersion: number;

  /**
   * SEG-54: el admin le reseteó la clave y la que tiene es la provisoria. Hasta
   * que la cambie, el backend sólo le deja `/auth/me`, `/auth/cambiar-clave`
   * y `/auth/logout`, y el ERP lo manda a la pantalla de cambio.
   */
  @Column({ name: 'debe_cambiar_clave', type: 'boolean', default: false })
  debe_cambiar_clave: boolean;

  @Column({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Role, (role) => role.users, { eager: true })
  @JoinColumn({ name: 'role_id' })
  role: Role;


  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index()
  @Column({ name: 'company_id', nullable: true })
  companyId: string;
}
