import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { Company } from '../companies/entities/company.entity';
import { ErrorDeNegocio } from '../common/errores/error-negocio';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async create(createWalletDto: CreateWalletDto): Promise<Wallet> {
    const wallet = this.walletRepository.create(createWalletDto);
    return await this.walletRepository.save(wallet);
  }

  async findAll(): Promise<Wallet[]> {
    return await this.walletRepository.find({
      where: { is_deleted: false },
      order: { createdAt: 'ASC' },
    });
  }

  async findActive(): Promise<Wallet[]> {
    return await this.walletRepository.find({
      where: { is_deleted: false, is_active: true },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id, is_deleted: false },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }
    return wallet;
  }

  async update(id: string, updateWalletDto: UpdateWalletDto): Promise<Wallet> {
    const wallet = await this.findOne(id);
    // Renombrarla sigue permitido: lo que no se puede es apagarla.
    if (updateWalletDto.is_active === false && wallet.is_active) {
      await this.exigirQueNoSeaDeCobros(wallet);
    }
    this.walletRepository.merge(wallet, updateWalletDto);
    return await this.walletRepository.save(wallet);
  }

  async remove(id: string): Promise<void> {
    const wallet = await this.findOne(id);
    await this.exigirQueNoSeaDeCobros(wallet);
    wallet.is_deleted = true;
    wallet.is_active = false;
    await this.walletRepository.save(wallet);
  }

  /**
   * #41 — La billetera donde entran los cobros de Mercado Pago o las
   * transferencias (D2) de su empresa no se desactiva ni se borra: el próximo
   * pago llegaría a una billetera muerta y quedaría sin asiento. Primero hay
   * que elegir otra en Configuración. Se mira sólo la empresa dueña de la
   * billetera: una referencia de otra empresa no es un uso real.
   */
  private async exigirQueNoSeaDeCobros(wallet: Wallet): Promise<void> {
    const empresa = await this.companyRepository.findOne({
      where: [
        { id: wallet.companyId, mp_wallet_id: wallet.id },
        { id: wallet.companyId, transferencia_wallet_id: wallet.id },
      ],
    });
    if (!empresa) return;
    const uso = empresa.mp_wallet_id === wallet.id ? 'mercado_pago' : 'transferencia';
    const para = uso === 'mercado_pago' ? 'los cobros de Mercado Pago' : 'las transferencias';
    throw new ErrorDeNegocio(
      'BILLETERA_EN_USO',
      `«${wallet.name}» es la billetera de ${para}: elegí otra en Configuración antes de darla de baja.`,
      { uso, billetera: wallet.name },
    );
  }
}
