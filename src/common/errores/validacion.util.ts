import type { ValidationError } from 'class-validator';

import { ErrorDeNegocio } from './error-negocio';

/**
 * Cómo se llama cada campo para el que lo carga.
 *
 * No están todos los campos del sistema y no hace falta: el que no está sale
 * con su nombre técnico, que es exactamente lo que pasa hoy con TODOS. Se
 * agregan a medida que aparecen en pantalla.
 */
export const NOMBRES_CAMPOS: Record<string, string> = {
  monto: 'Importe',
  monto_presupuestado: 'Presupuesto',
  nombre: 'Nombre',
  apellido: 'Apellido',
  email: 'Correo electrónico',
  telefono: 'Teléfono',
  documento: 'DNI o CUIT',
  fecha: 'Fecha',
  fecha_vencimiento: 'Vencimiento',
  categoria: 'Rubro',
  descripcion: 'Descripción',
  metodo_pago: 'Forma de pago',
  wallet_id: 'Billetera',
  proveedor_id: 'Proveedor',
  cliente_id: 'Cliente',
  cantidad: 'Cantidad',
  cantidad_pedida: 'Cantidad pedida',
  precio_unitario: 'Precio unitario',
  falla_declarada: 'Falla declarada',
  diagnostico: 'Diagnóstico',
  tipo: 'Tipo',
  slot: 'Horario',
  password: 'Contraseña',
  texto: 'Texto del mensaje',
  contexto: 'Contexto',
  orden_visual: 'Orden en la lista',
  // D2: el selector del chofer en la puerta. Un ERP viejo que mande «tarjeta»
  // tiene que leer qué campo rebotó, no el nombre técnico.
  cobrado_medio: 'Cómo pagó',
  // Configuración › Empresa › agenda (13/10/2026: turnos a domicilio en bloques).
  duracion_min: 'Duración del turno',
  cupo_por_bloque: 'Cupo por turno',
  cupo_por_hora: 'Turnos por hora',
};

/**
 * Qué decir para cada restricción de class-validator.
 *
 * La clave es el nombre de la restricción tal como la nombra class-validator
 * en `constraints`, no el texto en inglés: el texto en inglés es justamente lo
 * que estamos tapando.
 */
const TEXTOS: Record<string, string> = {
  isNotEmpty: 'es obligatorio.',
  isDefined: 'es obligatorio.',
  isString: 'tiene que ser texto.',
  isInt: 'tiene que ser un número entero.',
  isNumber: 'tiene que ser un número.',
  isPositive: 'tiene que ser un número mayor a cero.',
  min: 'es más chico que el mínimo permitido.',
  max: 'es más grande que el máximo permitido.',
  isEmail: 'no parece un correo válido.',
  isUuid: 'no es una opción válida: elegila de la lista.',
  isEnum: 'no es una opción válida: elegila de la lista.',
  isIn: 'no es una opción válida: elegila de la lista.',
  isDate: 'no es una fecha válida.',
  isDateString: 'no es una fecha válida.',
  isBoolean: 'tiene que ser sí o no.',
  isArray: 'tiene que ser una lista.',
  arrayNotEmpty: 'no puede quedar vacío.',
  arrayMaxSize: 'tiene más elementos de los permitidos.',
  arrayMinSize: 'tiene menos elementos de los permitidos.',
  maxLength: 'es más largo de lo permitido.',
  minLength: 'es más corto de lo permitido.',
  whitelistValidation: 'este dato no corresponde a esta pantalla.',
};

const GENERICO = 'el dato cargado no es válido.';

/** Aplana el árbol de errores: los DTOs anidados vienen en `children`. */
function aplanar(errores: ValidationError[], prefijo = ''): { campo: string; restriccion: string }[] {
  const filas: { campo: string; restriccion: string }[] = [];

  for (const error of errores) {
    const camino = prefijo ? `${prefijo}.${error.property}` : error.property;

    for (const restriccion of Object.keys(error.constraints ?? {})) {
      filas.push({ campo: camino, restriccion });
    }

    if (error.children?.length) {
      filas.push(...aplanar(error.children, camino));
    }
  }

  return filas;
}

/** El nombre visible de un campo, que puede venir anidado como `pago.wallet_id`. */
function nombreVisible(camino: string): string {
  const hoja = camino.split('.').pop() ?? camino;
  return NOMBRES_CAMPOS[hoja] ?? camino;
}

/**
 * Convierte el resultado de class-validator en un error que se entiende.
 *
 * Se engancha como `exceptionFactory` del ValidationPipe global, así que
 * arregla TODOS los formularios de alta y edición del sistema de una sola vez:
 * hoy solo tres decoradores en todo el repo tienen `message` propio.
 */
export function traducirValidacion(errores: ValidationError[]): ErrorDeNegocio {
  const filas = aplanar(errores);

  if (filas.length === 0) {
    return new ErrorDeNegocio('DATOS_INVALIDOS', 'Revisá los datos cargados.');
  }

  const renglones = filas.map(
    ({ campo, restriccion }) => `${nombreVisible(campo)}: ${TEXTOS[restriccion] ?? GENERICO}`,
  );

  return new ErrorDeNegocio('DATOS_INVALIDOS', renglones.join('\n'), {
    campos: filas.map((f) => f.campo),
  });
}
