import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { estadoAbono } from './abono.util';
import { PlataformaConfig } from './entities/plataforma-config.entity';

/** Lo que `JwtStrategy` necesita saber del abono. No depende de `AuthModule`, que lo importa. */
@Injectable()
export class EstadoAbonoService {
  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(PlataformaConfig)
    private readonly configs: Repository<PlataformaConfig>,
  ) {}

  async config(): Promise<PlataformaConfig> {
    const config = await this.configs.findOneBy({ id: 1 });
    // La siembra la migración: sin esa fila, la base está a medio migrar.
    if (!config) throw new Error('Falta la configuración de la plataforma (migración 1790000000015).');
    return config;
  }

  async enSoloLectura(companyId: string): Promise<boolean> {
    const empresa = await this.companies.findOne({
      where: { id: companyId },
      select: ['id', 'plan', 'abono_vence_en'],
    });
    if (!empresa) return false;
    // Sólo un plan pago puede vencer: los demás ni leen la configuración.
    if (empresa.plan !== 'pago') return false;
    const { dias_gracia } = await this.config();
    return estadoAbono(empresa, new Date(), dias_gracia) === 'solo_lectura';
  }
}
