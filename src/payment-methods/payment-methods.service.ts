import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly repository: Repository<PaymentMethod>,
  ) {}

  async create(createDto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    const paymentMethod = this.repository.create(createDto);
    return await this.repository.save(paymentMethod);
  }

  async findAll(): Promise<PaymentMethod[]> {
    return await this.repository.find({
      where: { isDeleted: false },
      order: { createdAt: 'DESC' }
    });
  }

  async findOne(id: string): Promise<PaymentMethod> {
    const paymentMethod = await this.repository.findOne({
      where: { id, isDeleted: false }
    });
    if (!paymentMethod) {
      throw new NotFoundException(`PaymentMethod with ID ${id} not found`);
    }
    return paymentMethod;
  }

  async update(id: string, updateDto: UpdatePaymentMethodDto): Promise<PaymentMethod> {
    const paymentMethod = await this.findOne(id);
    this.repository.merge(paymentMethod, updateDto);
    return await this.repository.save(paymentMethod);
  }

  async remove(id: string): Promise<void> {
    const paymentMethod = await this.findOne(id);
    if (paymentMethod.isSystem) {
      throw new BadRequestException('Cannot delete a system payment method');
    }
    paymentMethod.isDeleted = true;
    await this.repository.save(paymentMethod);
  }
}
