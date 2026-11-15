import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

import {
  CAMPOS_PERSONALES_DEL_CLIENTE,
  datoPersonalDeRotulo,
  tapar,
  veDatosCompletos,
} from './datos-personales.util';

/**
 * DAT-02 (backend): técnico y chofer reciben tapados el teléfono, el correo y
 * el DNI de los clientes, en cualquier respuesta. Mismo modelo que DAT-04
 * (`quitar-secretos.interceptor.ts`): una barrera global sobre el objeto ya
 * serializado, que actúa aunque el servicio arme la respuesta a mano.
 *
 * Qué es «un cliente» en la respuesta:
 * - lo que cuelga de una clave `cliente`/`customer` (o `clientes`/`customers`);
 * - un objeto con la forma de la ficha: `segmento`, `cantidad_visitas` o
 *   `direccion_principal` (el pedido web, que es un cliente en potencia, cae acá).
 * Los empleados (`tecnico`, `creado_por`…), los proveedores y la empresa
 * también tienen `email` y `telefono`, pero no esa forma: no se tocan.
 * Las coincidencias de los buscadores (`{ campo: 'Teléfono', valor }`) se
 * tapan por el rótulo.
 *
 * Excepciones, con `@DatosClienteCompletos()`: la ruta del día (el chofer y el
 * técnico llaman al cliente y van a su casa), los avisos (el técnico los
 * manda por WhatsApp con el número) y la ficha de una orden con visita o
 * retiro a domicilio. La dirección y la ciudad nunca se tapan.
 */
export const DATOS_CLIENTE_COMPLETOS = 'datos_cliente_completos';

/** Sin argumento: completos siempre. Con función: completos si la respuesta la cumple. */
export const DatosClienteCompletos = (cuando?: (respuesta: unknown) => boolean) =>
  SetMetadata(DATOS_CLIENTE_COMPLETOS, cuando ?? true);

const CLAVES_DE_CLIENTE = new Set(['cliente', 'customer', 'clientes', 'customers']);
const FORMA_DE_CLIENTE = ['segmento', 'cantidad_visitas', 'direccion_principal'];
const PROFUNDIDAD_MAXIMA = 12;

function esPlano(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function pareceCliente(o: Record<string, unknown>, clavePadre: string | null): boolean {
  if (clavePadre && CLAVES_DE_CLIENTE.has(clavePadre)) return true;
  return FORMA_DE_CLIENTE.some((k) => k in o);
}

function taparObjeto(o: Record<string, unknown>, clavePadre: string | null, profundidad: number, vistos: WeakSet<object>) {
  const cliente = pareceCliente(o, clavePadre);
  const rotulo = datoPersonalDeRotulo(o.campo);
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const tipo = cliente ? CAMPOS_PERSONALES_DEL_CLIENTE[k] : undefined;
    if (tipo) r[k] = tapar(v, tipo);
    else if (rotulo && k === 'valor') r[k] = tapar(v, rotulo);
    else r[k] = taparDatosDeClientes(v, k, profundidad + 1, vistos);
  }
  return r;
}

/** Copia de la respuesta con los datos personales de los clientes tapados. */
export function taparDatosDeClientes<T>(
  valor: T,
  clavePadre: string | null = null,
  profundidad = 0,
  vistos = new WeakSet<object>(),
): T {
  if (profundidad > PROFUNDIDAD_MAXIMA || valor === null || typeof valor !== 'object') return valor;
  if (vistos.has(valor as object)) return valor;
  vistos.add(valor as object);
  if (Array.isArray(valor)) {
    // Los elementos de `clientes: [...]` heredan la clave del arreglo.
    return valor.map((v) => taparDatosDeClientes(v, clavePadre, profundidad + 1, vistos)) as T;
  }
  if (!esPlano(valor)) return valor;
  return taparObjeto(valor, clavePadre, profundidad, vistos) as T;
}

@Injectable()
export class TaparDatosClienteInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const rol = context.switchToHttp().getRequest()?.user?.role?.nombre as string | undefined;
    if (veDatosCompletos(rol)) return next.handle();

    const excepcion = this.reflector.getAllAndOverride<true | ((r: unknown) => boolean) | undefined>(
      DATOS_CLIENTE_COMPLETOS,
      [context.getHandler(), context.getClass()],
    );
    if (excepcion === true) return next.handle();
    return next.handle().pipe(
      map((data) => (typeof excepcion === 'function' && excepcion(data) ? data : taparDatosDeClientes(data))),
    );
  }
}
