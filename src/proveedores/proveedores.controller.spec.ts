import { META_ROLES } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';
import { ProveedoresController } from './proveedores.controller';

/** SEG-51: corregir y borrar un proveedor (crédito, CUIT, días de pago) es de admin y mostrador. */
describe('ProveedoresController — roles (SEG-51)', () => {
  const roles = (m: keyof ProveedoresController) => Reflect.getMetadata(META_ROLES, ProveedoresController.prototype[m]);

  it('PATCH y DELETE: sólo admin y mostrador (el superadmin pasa por el guard)', () => {
    expect(roles('update')).toEqual([Roles.ADMIN, Roles.MOSTRADOR]);
    expect(roles('remove')).toEqual([Roles.ADMIN, Roles.MOSTRADOR]);
  });

  it('el alta y la ficha siguen abiertas a los cuatro puestos; listar y ver, a cualquiera con sesión', () => {
    expect(roles('create')).toEqual([Roles.ADMIN, Roles.PANOL, Roles.MOSTRADOR, Roles.TECNICO]);
    expect(roles('ficha')).toEqual([Roles.ADMIN, Roles.PANOL, Roles.MOSTRADOR, Roles.TECNICO]);
    expect(roles('findAll')).toBeUndefined();
    expect(roles('findOne')).toBeUndefined();
  });
});
