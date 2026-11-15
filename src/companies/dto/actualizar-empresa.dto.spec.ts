import { ValidationPipe } from '@nestjs/common';

import { ActualizarEmpresaDto } from './actualizar-empresa.dto';

/**
 * El modo de falla que este spec cubre no es "el valor es inválido": es que el
 * `whitelist` global BORRE la clave y el PATCH devuelva 200 sin haber guardado
 * nada, que es la peor forma de fallar (spec §3, conflicto 5). Por eso se usa
 * el `ValidationPipe` con la misma configuración de `main.ts` y se mira lo que
 * SALE del pipe, no lo que entra.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const meta = { type: 'body' as const, metatype: ActualizarEmpresaDto };

describe('ActualizarEmpresaDto — margen y alerta de suba', () => {
  it('el margen sobrevive al whitelist', async () => {
    const salida = await pipe.transform({ margen_repuestos_porcentaje: 50 }, meta);
    expect(salida.margen_repuestos_porcentaje).toBe(50);
  });

  it('la alerta de suba también', async () => {
    const salida = await pipe.transform({ alerta_suba_costo_porcentaje: 25 }, meta);
    expect(salida.alerta_suba_costo_porcentaje).toBe(25);
  });

  it('las dos juntas, con el resto del formulario', async () => {
    const salida = await pipe.transform(
      { name: 'Taller', margen_repuestos_porcentaje: 40, alerta_suba_costo_porcentaje: 15 },
      meta,
    );
    expect(salida).toMatchObject({
      name: 'Taller',
      margen_repuestos_porcentaje: 40,
      alerta_suba_costo_porcentaje: 15,
    });
  });

  it('un margen mayor a 500 se rechaza', async () => {
    await expect(pipe.transform({ margen_repuestos_porcentaje: 501 }, meta)).rejects.toBeDefined();
  });

  it('una alerta mayor a 100 se rechaza', async () => {
    await expect(pipe.transform({ alerta_suba_costo_porcentaje: 101 }, meta)).rejects.toBeDefined();
  });

  it('un margen negativo se rechaza', async () => {
    await expect(pipe.transform({ margen_repuestos_porcentaje: -1 }, meta)).rejects.toBeDefined();
  });

  it('un margen con decimales se rechaza (@IsInt)', async () => {
    await expect(pipe.transform({ margen_repuestos_porcentaje: 40.5 }, meta)).rejects.toBeDefined();
  });

  it('una clave inventada sigue rechazándose', async () => {
    await expect(pipe.transform({ margen_inventado: 40 }, meta)).rejects.toBeDefined();
  });
});

describe('ActualizarEmpresaDto — envío y reserva de la tienda (T11b)', () => {
  it('envio_habilitado sobrevive al whitelist', async () => {
    const salida = await pipe.transform({ envio_habilitado: true }, meta);
    expect(salida.envio_habilitado).toBe(true);
  });

  it('costo_envio_tienda también', async () => {
    const salida = await pipe.transform({ costo_envio_tienda: 3500 }, meta);
    expect(salida.costo_envio_tienda).toBe(3500);
  });

  it('reserva_horas también', async () => {
    const salida = await pipe.transform({ reserva_horas: 48 }, meta);
    expect(salida.reserva_horas).toBe(48);
  });

  it('las tres juntas, con el resto del formulario', async () => {
    const salida = await pipe.transform(
      {
        name: 'Taller', envio_habilitado: true, costo_envio_tienda: 3500, reserva_horas: 48,
      },
      meta,
    );
    expect(salida).toMatchObject({
      name: 'Taller', envio_habilitado: true, costo_envio_tienda: 3500, reserva_horas: 48,
    });
  });

  it('un costo de envío negativo se rechaza', async () => {
    await expect(pipe.transform({ costo_envio_tienda: -1 }, meta)).rejects.toBeDefined();
  });

  it('reserva_horas en 0 se rechaza — nacería vencida toda venta', async () => {
    await expect(pipe.transform({ reserva_horas: 0 }, meta)).rejects.toBeDefined();
  });

  it('reserva_horas negativo se rechaza', async () => {
    await expect(pipe.transform({ reserva_horas: -5 }, meta)).rejects.toBeDefined();
  });

  it('reserva_horas con decimales se rechaza (@IsInt)', async () => {
    await expect(pipe.transform({ reserva_horas: 24.5 }, meta)).rejects.toBeDefined();
  });

  it('envio_habilitado con un valor no booleano se rechaza', async () => {
    await expect(pipe.transform({ envio_habilitado: 'si' }, meta)).rejects.toBeDefined();
  });

  it('costo_envio_tienda con un valor no numérico se rechaza', async () => {
    await expect(pipe.transform({ costo_envio_tienda: 'gratis' }, meta)).rejects.toBeDefined();
  });
});

describe('ActualizarEmpresaDto — billetera de transferencias (D2)', () => {
  const uuid = '8f14e45f-ceea-4e67-a5b4-1c0f2b3d4e5f';

  it('transferencia_wallet_id sobrevive al whitelist', async () => {
    const salida = await pipe.transform({ transferencia_wallet_id: uuid }, meta);
    expect(salida.transferencia_wallet_id).toBe(uuid);
  });

  it('null pasa y llega como null: es "sin configurar" (igual que mp_wallet_id)', async () => {
    const salida = await pipe.transform({ transferencia_wallet_id: null, mp_wallet_id: null }, meta);
    expect(salida.transferencia_wallet_id).toBeNull();
    expect(salida.mp_wallet_id).toBeNull();
  });

  it('un texto que no es uuid se rechaza', async () => {
    await expect(pipe.transform({ transferencia_wallet_id: 'banco' }, meta)).rejects.toBeDefined();
  });
});

describe('ActualizarEmpresaDto — descuento máximo del mostrador (spec 2026-10-02 §3.6)', () => {
  it('sobrevive al whitelist', async () => {
    const salida = await pipe.transform({ descuento_maximo_mostrador: 12.5 }, meta);
    expect(salida.descuento_maximo_mostrador).toBe(12.5);
  });
  it('fuera de 0–100 se rechaza', async () => {
    await expect(pipe.transform({ descuento_maximo_mostrador: 101 }, meta)).rejects.toBeDefined();
    await expect(pipe.transform({ descuento_maximo_mostrador: -1 }, meta)).rejects.toBeDefined();
  });
});

describe('ActualizarEmpresaDto — capa comercial de la tienda (spec 2026-10-07 §3.2)', () => {
  it('los campos comerciales sobreviven al whitelist', async () => {
    const salida = await pipe.transform(
      {
        alicuota_iva_defecto: 10.5,
        cuotas_tienda: [{ cuotas: 3, sin_interes: true }, { cuotas: 12, sin_interes: false }],
        transferencia_tienda_habilitada: true,
        transferencia_descuento_porcentaje: 10,
        transferencia_cbu: '0170001540000001234567',
        transferencia_alias: 'taller.demo.mp',
        transferencia_titular: 'Taller Demo SRL',
        envio_gratis_desde: 50000,
      },
      meta,
    );
    expect(salida).toMatchObject({
      alicuota_iva_defecto: 10.5,
      cuotas_tienda: [{ cuotas: 3, sin_interes: true }, { cuotas: 12, sin_interes: false }],
      transferencia_descuento_porcentaje: 10,
      transferencia_alias: 'taller.demo.mp',
      envio_gratis_desde: 50000,
    });
  });

  it('null borra CBU, alias, titular y el envío gratis', async () => {
    const salida = await pipe.transform(
      { transferencia_cbu: null, transferencia_alias: null, transferencia_titular: null, envio_gratis_desde: null },
      meta,
    );
    expect(salida).toMatchObject({ transferencia_cbu: null, transferencia_alias: null, transferencia_titular: null, envio_gratis_desde: null });
  });

  it('rechaza lo que está fuera de la spec', async () => {
    for (const malo of [
      { alicuota_iva_defecto: 27 },
      { cuotas_tienda: [{ cuotas: 1, sin_interes: true }] },
      { cuotas_tienda: [{ cuotas: 25, sin_interes: true }] },
      { cuotas_tienda: Array.from({ length: 7 }, (_, i) => ({ cuotas: i + 2, sin_interes: true })) },
      { transferencia_descuento_porcentaje: 51 },
      { transferencia_cbu: '123' },
      { transferencia_cbu: '01700015400000012345AB' },
      { transferencia_alias: 'corto' },
      { transferencia_alias: 'con espacio.mp' },
      { envio_gratis_desde: -1 },
    ]) {
      await expect(pipe.transform(malo, meta)).rejects.toBeDefined();
    }
  });
});

describe('ActualizarEmpresaDto — datos legales de los documentos (opción B)', () => {
  const completo = {
    razon_social: 'GUSMAT S.R.L.',
    condicion_iva: 'responsable_inscripto',
    iibb: '1234567-08',
    inicio_actividades: '2020-03-01',
    email_contacto: 'hola@gusmat.com.ar',
    horario_atencion: 'lunes a sábados de 9 a 18 h',
    costo_revision: 15000,
    revision_se_descuenta: true,
    plazo_presupuesto_dias: 2,
    plazo_reparacion_dias: 10,
    canon_guarda_diario: 1000,
    revision_garantia_dias: 5,
    factura_momento: 'al_senar',
    traslado_garantia: 'Lo traés y lo retirás vos.',
  };

  it('los 14 campos sobreviven al whitelist', async () => {
    const salida = await pipe.transform({ ...completo }, meta);
    expect(salida).toMatchObject(completo);
  });

  it('null borra los de texto y la fecha (el papel vuelve a su respaldo)', async () => {
    const nulos = {
      razon_social: null, condicion_iva: null, iibb: null, inicio_actividades: null,
      email_contacto: null, horario_atencion: null, traslado_garantia: null,
    };
    expect(await pipe.transform({ ...nulos }, meta)).toMatchObject(nulos);
  });

  it('montos en 0 valen (revisión sin cargo, sin canon)', async () => {
    const salida = await pipe.transform({ costo_revision: 0, canon_guarda_diario: 0 }, meta);
    expect(salida).toMatchObject({ costo_revision: 0, canon_guarda_diario: 0 });
  });

  it('rechaza lo que está fuera del contrato', async () => {
    for (const malo of [
      { razon_social: 'x'.repeat(121) },
      { condicion_iva: 'consumidor_final' },
      { iibb: 'x'.repeat(31) },
      { inicio_actividades: '01/03/2020' },
      { inicio_actividades: '2020-02-30' },
      { email_contacto: 'no-es-un-correo' },
      { horario_atencion: 'x'.repeat(121) },
      { costo_revision: -1 },
      { costo_revision: 10_000_001 },
      { costo_revision: 10.005 },
      { canon_guarda_diario: -1 },
      { canon_guarda_diario: 10_000_001 },
      { plazo_presupuesto_dias: 0 },
      { plazo_presupuesto_dias: 16 },
      { plazo_reparacion_dias: 31 },
      { plazo_reparacion_dias: 2.5 },
      { revision_garantia_dias: 0 },
      { revision_garantia_dias: 31 },
      { factura_momento: 'al_entregar' },
      { traslado_garantia: 'x'.repeat(601) },
      { revision_se_descuenta: 'si' },
    ]) {
      await expect(pipe.transform(malo, meta)).rejects.toBeDefined();
    }
  });
});

describe('ActualizarEmpresaDto — SEG-53: forma de sla_config y topes', () => {
  it('el SLA que manda el ERP (tres plazos en horas) pasa y sobrevive al whitelist', async () => {
    const sla = { diagnostico_horas: 24, cotizacion_horas: 48, reparacion_horas: 72 };
    const salida = await pipe.transform({ sla_config: sla }, meta);
    expect(salida.sla_config).toEqual(sla);
  });

  it.each([
    ['una clave inventada', { diagnostico_horas: 24, cotizacion_horas: 48, reparacion_horas: 72, x: 1 }],
    ['un plazo que falta', { diagnostico_horas: 24, cotizacion_horas: 48 }],
    ['un texto', { diagnostico_horas: 'mañana', cotizacion_horas: 48, reparacion_horas: 72 }],
    ['un cero', { diagnostico_horas: 0, cotizacion_horas: 48, reparacion_horas: 72 }],
    ['más de 30 días', { diagnostico_horas: 24, cotizacion_horas: 48, reparacion_horas: 721 }],
    ['un arreglo', [24, 48, 72]],
  ])('sla_config con %s es 400', async (_caso, sla) => {
    await expect(pipe.transform({ sla_config: sla }, meta)).rejects.toBeDefined();
  });

  it('costo de visita, envío, envío gratis y horas de reserva tienen tope', async () => {
    for (const malo of [
      { costo_visita_domicilio: 10_000_001 },
      { costo_envio_tienda: 10_000_001 },
      { envio_gratis_desde: 100_000_001 },
      { reserva_horas: 721 },
    ]) {
      await expect(pipe.transform(malo, meta)).rejects.toBeDefined();
    }
    const bien = await pipe.transform({ costo_visita_domicilio: 15000, costo_envio_tienda: 3500, envio_gratis_desde: 80000, reserva_horas: 48 }, meta);
    expect(bien).toMatchObject({ costo_visita_domicilio: 15000, costo_envio_tienda: 3500, envio_gratis_desde: 80000, reserva_horas: 48 });
  });
});
