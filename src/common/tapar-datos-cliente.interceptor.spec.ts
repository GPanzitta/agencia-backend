import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';

import { DatosClienteCompletos, TaparDatosClienteInterceptor, taparDatosDeClientes } from './tapar-datos-cliente.interceptor';
import { taparDocumento, taparEmail, taparTelefono, veDatosCompletos } from './datos-personales.util';

/** Un predicado de ejemplo para `@DatosClienteCompletos(fn)`: completos sólo si la respuesta lo cumple. */
const esOrdenADomicilio = (r: unknown): boolean => {
  const o = (r ?? {}) as { estado?: string; turno_proximo?: { tipo?: string } | null };
  return o.estado === 'en_visita' || o.estado === 'a_retirar' || (o.turno_proximo?.tipo ?? '').endsWith('_domicilio');
};

/** DAT-02 (backend): técnico y chofer reciben tapados el teléfono, el correo y el DNI de los clientes. */
describe('DAT-02 — formato (el mismo del ERP)', () => {
  it('teléfono «•••• 7788», correo «j•••@dominio», DNI «•••• 678»', () => {
    expect(taparTelefono('11 5566-7788')).toBe('•••• 7788');
    expect(taparTelefono('123')).toBe('••••');
    expect(taparEmail('juan@gmail.com')).toBe('j•••@gmail.com');
    expect(taparEmail('sin-arroba')).toBe('••••');
    expect(taparDocumento('30.345.678')).toBe('•••• 678');
    expect(taparDocumento('20-30345678-9')).toBe('•••• 789');
  });

  it('técnico, pañol y chofer los ven tapados', () => {
    expect(veDatosCompletos('tecnico')).toBe(false);
    expect(veDatosCompletos('panol')).toBe(false);
    expect(veDatosCompletos('chofer')).toBe(false);
    for (const rol of ['admin', 'mostrador', 'superadmin']) expect(veDatosCompletos(rol)).toBe(true);
  });
});

describe('DAT-02 — taparDatosDeClientes', () => {
  const cliente = {
    id: 'c1', nombre: 'Juan', apellido: 'Pérez', telefono: '1155667788', telefono_alternativo: '011 4444-1234',
    email: 'juan@gmail.com', documento: '30345678', direccion_principal: 'Calle 1 123', ciudad: 'Lanús', segmento: 'regular',
  };

  it('una ficha de cliente: tapa teléfonos, correo y DNI; deja nombre, dirección y ciudad', () => {
    expect(taparDatosDeClientes(cliente)).toEqual({
      ...cliente,
      telefono: '•••• 7788', telefono_alternativo: '•••• 1234', email: 'j•••@gmail.com', documento: '•••• 678',
    });
  });

  it('el cliente de una orden (y de un turno) se tapa; el técnico y quien la creó, no', () => {
    const orden = {
      id: 'o1', numero_orden: 'OR-2026-0042', cliente: { id: 'c1', nombre: 'Juan', telefono: '1155667788', email: 'juan@gmail.com' },
      tecnico: { id: 'u1', nombre: 'Tito', email: 'tito@taller.com', telefono: '1199998888' },
      creado_por: { id: 'u2', email: 'mostrador@taller.com' },
    };
    const r: any = taparDatosDeClientes([orden]);
    expect(r[0].cliente).toMatchObject({ telefono: '•••• 7788', email: 'j•••@gmail.com' });
    expect(r[0].tecnico).toEqual(orden.tecnico);
    expect(r[0].creado_por).toEqual(orden.creado_por);
    expect(r[0].numero_orden).toBe('OR-2026-0042');
  });

  it('las coincidencias de los buscadores se tapan por el rótulo', () => {
    const r: any = taparDatosDeClientes({
      grupos: {
        clientes: { items: [{ id: 'c1', segmento: 'vip', telefono: '1155667788', coincidencias: [{ campo: 'Teléfono', valor: '1155667788' }] }] },
        ordenes: { items: [{ id: 'o1', coincidencias: [{ campo: 'DNI / CUIT', valor: '30345678' }, { campo: 'Equipo', valor: 'Lavarropas' }] }] },
      },
    });
    expect(r.grupos.clientes.items[0].telefono).toBe('•••• 7788');
    expect(r.grupos.clientes.items[0].coincidencias[0].valor).toBe('•••• 7788');
    expect(r.grupos.ordenes.items[0].coincidencias).toEqual([{ campo: 'DNI / CUIT', valor: '•••• 678' }, { campo: 'Equipo', valor: 'Lavarropas' }]);
  });

  it('lo ya tapado y los vacíos van tal cual; proveedores y empresa no se tocan', () => {
    const r: any = taparDatosDeClientes({
      cliente: { telefono: '•••• 7788', email: null, documento: '' },
      proveedor: { telefono: '1155667788', email: 'ventas@prov.com' },
      company: { telefono: '1155667788' },
    });
    expect(r.cliente).toEqual({ telefono: '•••• 7788', email: null, documento: '' });
    expect(r.proveedor).toEqual({ telefono: '1155667788', email: 'ventas@prov.com' });
    expect(r.company).toEqual({ telefono: '1155667788' });
  });

  it('no muta el original (la misma entidad puede estar en caché)', () => {
    const original = { cliente: { telefono: '1155667788' } };
    taparDatosDeClientes(original);
    expect(original.cliente.telefono).toBe('1155667788');
  });
});

describe('DAT-02 — el interceptor', () => {
  const datos = { cliente: { telefono: '1155667788' } };
  class Ctrl {
    comun() {}
    @DatosClienteCompletos()
    ruta() {}
    @DatosClienteCompletos(esOrdenADomicilio)
    orden() {}
  }
  const contexto = (rol: string | null, handler: () => void) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user: rol ? { role: { nombre: rol } } : undefined }) }),
      getHandler: () => handler,
      getClass: () => Ctrl,
    }) as any;
  const correr = (rol: string | null, handler: () => void, respuesta: unknown = datos) =>
    lastValueFrom(new TaparDatosClienteInterceptor(new Reflector()).intercept(contexto(rol, handler), { handle: () => of(respuesta) }));

  it('al técnico y al chofer les tapa el teléfono del cliente', async () => {
    expect(await correr('tecnico', Ctrl.prototype.comun)).toEqual({ cliente: { telefono: '•••• 7788' } });
    expect(await correr('chofer', Ctrl.prototype.comun)).toEqual({ cliente: { telefono: '•••• 7788' } });
  });

  it('al mostrador, al admin y sin usuario, tal cual', async () => {
    expect(await correr('mostrador', Ctrl.prototype.comun)).toBe(datos);
    expect(await correr('admin', Ctrl.prototype.comun)).toBe(datos);
    expect(await correr(null, Ctrl.prototype.comun)).toBe(datos);
  });

  it('la ruta del día va completa también para el chofer', async () => {
    expect(await correr('chofer', Ctrl.prototype.ruta)).toBe(datos);
  });

  it('la ficha de una orden a domicilio va completa; la de taller, tapada', async () => {
    const visita = { estado: 'en_visita', ...datos };
    const conEntrega = { estado: 'listo', turno_proximo: { tipo: 'entrega_domicilio' }, ...datos };
    const deTaller = { estado: 'en_reparacion', turno_proximo: { tipo: 'retiro_local' }, ...datos };
    expect(await correr('tecnico', Ctrl.prototype.orden, visita)).toBe(visita);
    expect(await correr('tecnico', Ctrl.prototype.orden, conEntrega)).toBe(conEntrega);
    expect(await correr('tecnico', Ctrl.prototype.orden, deTaller)).toEqual({ ...deTaller, cliente: { telefono: '•••• 7788' } });
  });
});
