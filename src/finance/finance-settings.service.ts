import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceSettings } from './entities/finance-settings.entity';

@Injectable()
export class FinanceSettingsService {
  constructor(
    @InjectRepository(FinanceSettings)
    private readonly repo: Repository<FinanceSettings>,
  ) {}

  /**
   * Devuelve los parametros de la empresa, creandolos con valores neutros si es
   * la primera vez. Asi ninguna consulta tiene que contemplar el caso "todavia
   * no configuro nada".
   */
  async obtener(companyId?: string): Promise<FinanceSettings> {
    const existente = await this.repo.findOne({ where: { companyId } });
    if (existente) return existente;

    return this.repo.save(
      this.repo.create({
        companyId,
        umbral_aprobacion: 0,
        alerta_saldo_minimo: 0,
        dias_aviso_vencimiento: 3,
      }),
    );
  }

  async actualizar(cambios: Record<string, unknown>): Promise<FinanceSettings> {
    const companyId = cambios.companyId as string | undefined;
    const settings = await this.obtener(companyId);
    const { companyId: _ignorado, id: _id, ...resto } = cambios;
    Object.assign(settings, resto);
    return this.repo.save(settings);
  }
}
