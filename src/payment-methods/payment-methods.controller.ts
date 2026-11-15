import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Post()
  @UserProtected(Roles.ADMIN)
  create(@Body() createPaymentMethodDto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(createPaymentMethodDto);
  }

  @Get()
  @Auth()
  findAll() {
    return this.paymentMethodsService.findAll();
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id') id: string) {
    return this.paymentMethodsService.findOne(id);
  }

  @Patch(':id')
  @UserProtected(Roles.ADMIN)
  update(@Param('id') id: string, @Body() updatePaymentMethodDto: UpdatePaymentMethodDto) {
    return this.paymentMethodsService.update(id, updatePaymentMethodDto);
  }

  @Delete(':id')
  @UserProtected(Roles.ADMIN)
  remove(@Param('id') id: string) {
    return this.paymentMethodsService.remove(id);
  }
}
