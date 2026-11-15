import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { estadoAbono, type EstadoAbono, type PlanTaller } from '../abono/abono.util';
import { PlataformaConfig } from '../abono/entities/plataforma-config.entity';
import { EstadoAbonoService } from '../abono/estado-abono.service';
import { ConflictoDeNegocio } from '../common/errores/error-negocio';
import { Company } from '../companies/entities/company.entity';
import type { ConfigPlataformaDto, PlanTallerDto } from './dto/plataforma.dto';

export interface TallerDePlataforma {
  id: string;
  nombre: string;
  plan: PlanTaller;
  estado: EstadoAbono;
  vence_en: Date | null;
  ultima_actividad: Date;
  ordenes_mes: number;
  creado_en: Date;
}

/**
 * El panel del dueño de la plataforma (spec 2026-10-28 §7): quién usa el sistema
 * y quién está por irse. Lee de todas las empresas: es sólo para el superadmin.
 */
@Injectable()
export class PlataformaService {
  private readonly logger = new Logger(PlataformaService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(PlataformaConfig)
    private readonly configs: Repository<PlataformaConfig>,
    private readonly estado: EstadoAbonoService,
  ) {}

  /** Una sola consulta, aunque haya cientos de talleres. La misma regla de conteo que `ordenesDelMes` (en la agencia: unidades en stock). */
  async talleres(): Promise<TallerDePlataforma[]> {
    const { dias_gracia } = await this.estado.config();
    const filas: Omit<TallerDePlataforma, 'estado'>[] = await this.dataSource.query(
      `SELECT c."id", c."name" AS "nombre", c."plan", c."abono_vence_en" AS "vence_en",
              c."created_at" AS "creado_en",
              COALESCE(o."ultima", c."created_at") AS "ultima_actividad",
              COALESCE(o."mes", 0)::int AS "ordenes_mes"
         FROM "company" c
         LEFT JOIN (
           SELECT o."company_id",
                  MAX(o."updated_at") AS "ultima",
                  count(*) FILTER (WHERE o."estado" IN ('ingreso', 'alistaje', 'disponible', 'reservada')) AS "mes"
             FROM "unidades" o
            GROUP BY o."company_id"
         ) o ON o."company_id" = c."id"
        ORDER BY "ultima_actividad" ASC`,
    );
    const ahora = new Date();
    return filas.map((fila) => ({
      ...fila,
      estado: estadoAbono({ plan: fila.plan, abono_vence_en: fila.vence_en }, ahora, dias_gracia),
    }));
  }

  async cambiarPlan(id: string, dto: PlanTallerDto): Promise<void> {
    if (dto.plan === 'pago' && !dto.vence_en) {
      throw new BadRequestException('Un plan pago necesita la fecha hasta la que está pagado.');
    }
    const empresa = await this.companies.findOne({ where: { id } });
    if (!empresa) throw new NotFoundException('Ese taller no existe.');
    if (dto.plan !== 'pago' && empresa.mp_preapproval_estado === 'authorized') {
      throw new ConflictoDeNegocio(
        'CONFLICTO',
        'Este taller tiene una suscripción activa en Mercado Pago y le seguiría cobrando. Primero tiene que volver al plan gratis desde su pantalla de abono.',
      );
    }
    await this.companies.update(id, {
      plan: dto.plan,
      abono_vence_en: dto.plan === 'pago' ? new Date(dto.vence_en!) : null,
    });
    this.logger.log(`Plataforma: el taller ${id} pasó al plan ${dto.plan}.`);
  }

  config(): Promise<PlataformaConfig> {
    return this.estado.config();
  }

  async guardarConfig(dto: ConfigPlataformaDto): Promise<PlataformaConfig> {
    const guardada = await this.configs.save({
      id: 1,
      precio_mensual: dto.precio_mensual,
      tope_ordenes_gratis: dto.tope_ordenes_gratis,
      dias_gracia: dto.dias_gracia,
    });
    this.logger.log(`Plataforma: valores del abono cambiados: ${JSON.stringify(guardada)}.`);
    return guardada;
  }
}
