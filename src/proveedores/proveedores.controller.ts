import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';
import { ProveedoresService } from './proveedores.service';
import { CreateProveedoreDto } from './dto/create-proveedore.dto';
import { UpdateProveedoreDto } from './dto/update-proveedore.dto';

/**
 * El proveedor lo carga y lo corrige el que lo tiene al teléfono. Desde que
 * mostrador y técnico entran a Pañol y compras son cuatro puestos y no dos:
 * dejar el alta sólo en el pañol obligaba a esperarlo para poder armar una OC.
 *
 * SEG-51 (decisión del dueño, 15/10/2026): corregir y borrar, sólo admin y
 * mostrador. La ficha lleva crédito, CUIT y días de pago: un cambio ahí mueve
 * plata. El alta sigue abierta a los cuatro puestos (para armar la OC) y ver
 * la lista y la ficha, a todos. El superadmin pasa como en todo el sistema
 * (`UserRoleGuard`).
 */
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Post()
  @UserProtected(Roles.ADMIN, Roles.PANOL, Roles.MOSTRADOR, Roles.TECNICO)
  create(@Body() createProveedoreDto: CreateProveedoreDto) {
    return this.proveedoresService.create(createProveedoreDto);
  }

  @Get()
  @Auth()
  findAll() {
    return this.proveedoresService.findAll();
  }

  /** Spec C §2.7: ficha del proveedor. Antes de ':id'. */
  @Get(':id/ficha')
  @UserProtected(Roles.ADMIN, Roles.PANOL, Roles.MOSTRADOR, Roles.TECNICO)
  ficha(@Param('id') id: string) {
    return this.proveedoresService.ficha(id);
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id') id: string) {
    return this.proveedoresService.findOne(id);
  }

  @Patch(':id')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  update(@Param('id') id: string, @Body() updateProveedoreDto: UpdateProveedoreDto) {
    return this.proveedoresService.update(id, updateProveedoreDto);
  }

  @Delete(':id')
  @UserProtected(Roles.ADMIN, Roles.MOSTRADOR)
  remove(@Param('id') id: string) {
    return this.proveedoresService.remove(id);
  }
}
