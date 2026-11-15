import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProveedoreDto } from './dto/create-proveedore.dto';
import { UpdateProveedoreDto } from './dto/update-proveedore.dto';
import { Proveedor } from './entities/proveedore.entity';
import { ExpensesService } from '../expenses/expenses.service';

@Injectable()
export class ProveedoresService {
  constructor(
    @InjectRepository(Proveedor)
    private readonly proveedorRepository: Repository<Proveedor>,
    private readonly expenses: ExpensesService,
  ) {}

  async create(createProveedoreDto: CreateProveedoreDto) {
    const data = createProveedoreDto;
    const existing = await this.proveedorRepository.findOneBy({ nombre: data.nombre, activo: true });
    if (existing) {
      throw new BadRequestException(`Proveedor "${data.nombre}" ya existe en esta empresa`);
    }

    const now = new Date();
    const proveedor = this.proveedorRepository.create({
      ...data,
      created_at: now,
      updated_at: now,
    });

    return await this.proveedorRepository.save(proveedor);
  }

  async findAll() {
    return await this.proveedorRepository.find({
      where: { activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: string) {
    const proveedor = await this.proveedorRepository.findOne({
      where: { id, activo: true },
    });
    if (!proveedor) {
      throw new NotFoundException(`Proveedor con id "${id}" no encontrado`);
    }
    return proveedor;
  }

  /** Ficha del proveedor con su saldo en cuenta corriente. */
  async ficha(id: string) {
    const proveedor = await this.findOne(id);
    const saldos = await this.expenses.cuentasPorPagar(proveedor.companyId ?? undefined);
    const fila = saldos.find((s) => s.proveedor_id === id);
    return {
      proveedor,
      // La deuda es la aprobada; lo que espera una firma va aparte (#18).
      saldo: {
        deuda: fila?.deuda ?? 0,
        vencido: fila?.vencido ?? 0,
        a_cuenta: fila?.a_cuenta ?? 0,
        sin_aprobar: fila?.sin_aprobar ?? 0,
      },
      // Ya no hay órdenes de compra: se mandan vacíos porque la ficha del ERP todavía los lee.
      ultimas_oc: [] as never[],
      lead_time_promedio_dias: null as number | null,
      dias_entrega_cargado: Number(proveedor.dias_entrega ?? 0),
    };
  }

  async update(id: string, updateProveedoreDto: UpdateProveedoreDto) {
    const data = updateProveedoreDto;
    const proveedor = await this.findOne(id);

    Object.assign(proveedor, data, { updated_at: new Date() });

    return await this.proveedorRepository.save(proveedor);
  }

  async remove(id: string) {
    const proveedor = await this.findOne(id);
    proveedor.activo = false;
    return await this.proveedorRepository.save(proveedor);
  }
}
