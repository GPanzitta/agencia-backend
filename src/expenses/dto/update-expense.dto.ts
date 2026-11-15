import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateExpenseDto } from './create-expense.dto';

/**
 * SEG-56: la edición no hereda `companyId` del alta. El gasto no se cambia de
 * taller: antes el PATCH lo aceptaba y `Object.assign` lo copiaba (lo salvaba
 * el parche de tenant, que lo pisa al guardar). El ERP no lo manda en el
 * PATCH; con `forbidNonWhitelisted`, si alguien lo manda, es 400.
 */
export class UpdateExpenseDto extends PartialType(OmitType(CreateExpenseDto, ['companyId'] as const)) {}
