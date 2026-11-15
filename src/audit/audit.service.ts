import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccionAuditada, AuditLog } from './entities/audit-log.entity';
import { ConsultarAuditoriaDto } from './dto/consultar-auditoria.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async registrar(datos: Partial<AuditLog>): Promise<void> {
    const registro = this.auditRepo.create(datos);
    await this.auditRepo.save(registro);
  }

  /**
   * Consulta paginada del log. El filtro por empresa lo agrega el parche de
   * tenant a partir del token; acá no se recibe ninguna empresa por parámetro
   * justamente para que nadie pueda pedir la de otro local.
   */
  async consultar(filtros: ConsultarAuditoriaDto) {
    const { pagina = 1, porPagina = 50, accion, usuario_id, desde, hasta } = filtros;

    const qb = this.auditRepo
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .skip((pagina - 1) * porPagina)
      .take(porPagina);

    if (accion) qb.andWhere('a.accion = :accion', { accion });
    if (usuario_id) qb.andWhere('a.usuario_id = :usuario_id', { usuario_id });
    if (desde) qb.andWhere('a.created_at >= :desde', { desde });
    if (hasta) qb.andWhere('a.created_at <= :hasta', { hasta });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, pagina, porPagina };
  }

  /** Resumen por acción para el tablero: dónde mirar primero ante un descuadre. */
  async resumen(dias = 30) {
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const filas = await this.auditRepo
      .createQueryBuilder('a')
      .select('a.accion', 'accion')
      .addSelect('COUNT(*)', 'cantidad')
      .andWhere('a.created_at >= :desde', { desde })
      .groupBy('a.accion')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany();

    return filas.map((f) => ({
      accion: f.accion as AccionAuditada,
      cantidad: Number(f.cantidad),
    }));
  }
}
