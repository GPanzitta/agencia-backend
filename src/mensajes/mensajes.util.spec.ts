import { correoDeAgencia, cuerpoAHtml, urlSegura } from './correo-html.util';
import { datosDeInteresado, datosDeOperacion, normalizarTelefono, renderizarPlantilla, sitioDeAgencia, variablesDesconocidas, VARIABLES_POR_CONTEXTO } from './plantilla.util';
import { PLANTILLAS_DE_FABRICA } from './plantillas-agencia';

const agencia = { name: 'García Automotores', direccion: 'Av. Rivadavia 1234', telefono: '11 5555 0100', slug: 'garcia' };
const auto = { id: 'u1', marca: 'Fiat', modelo: 'Cronos', version: 'Drive 1.3', anio: 2022, precio_venta: 15200, moneda: 'USD', publicada: true };
const PORTAL = 'https://fgautos.example';

describe('plantillas de mensajes', () => {
  it('la línea de una variable vacía desaparece entera; el resto queda', () => {
    const texto = 'Hola {cliente}\nSaldo: {saldo}\n\nGracias.';
    expect(renderizarPlantilla(texto, { cliente: 'Ana', saldo: '' })).toBe('Hola Ana\n\nGracias.');
    expect(renderizarPlantilla(texto, { cliente: 'Ana', saldo: 'US$ 500' })).toBe('Hola Ana\nSaldo: US$ 500\n\nGracias.');
  });

  it('una variable que no existe queda a la vista, para que se note el error', () => {
    expect(renderizarPlantilla('Hola {clente}', { cliente: 'Ana' })).toBe('Hola {clente}');
    expect(variablesDesconocidas('Hola {cliente}, tu {orden} y {saldo}', 'interesado')).toEqual(['orden', 'saldo']);
    expect(variablesDesconocidas('Saldo {saldo}', 'operacion')).toEqual([]);
  });

  it('arma el sitio de la agencia sobre la dirección del portal', () => {
    expect(sitioDeAgencia('https://www.fgautos.example', 'garcia')).toBe('https://garcia.fgautos.example');
    expect(sitioDeAgencia('http://localhost:3201', 'agencia-demo')).toBe('http://agencia-demo.localhost:3201');
    expect(sitioDeAgencia(PORTAL, null)).toBe('');
  });

  it('los datos de un interesado: nombre de pila, auto con año, y el enlace sólo si está publicado', () => {
    const i = { nombre: 'Carolina Méndez', tiene_usado: 'Gol Trend 2015', cotizacion_valor: 6500, cotizacion_moneda: 'USD' };
    const d = datosDeInteresado(i, auto, 'Lucas', agencia, PORTAL);
    expect(d).toEqual(expect.objectContaining({
      cliente: 'Carolina', auto: 'Fiat Cronos Drive 1.3 2022', precio: 'US$ 15.200', link_auto: 'https://garcia.fgautos.example/autos/u1',
      su_auto: 'Gol Trend 2015', cotizacion: 'US$ 6.500', vendedor: 'Lucas', agencia: 'García Automotores', link_sitio: 'https://garcia.fgautos.example',
    }));
    expect(datosDeInteresado(i, { ...auto, publicada: false }, 'Lucas', agencia, PORTAL)['link_auto']).toBe('');
    expect(datosDeInteresado({ nombre: 'Juan' }, null, null, agencia, PORTAL)).toEqual(expect.objectContaining({ auto: '', precio: '', cotizacion: '' }));
  });

  it('los datos de una operación: saldo sólo si debe, vencimiento sólo si es una reserva', () => {
    const o = { numero: 'OP-2026-0010', cliente_nombre: 'Rocío Reserva', precio: 27500, moneda: 'USD', reserva_vence: '2026-11-20', estado: 'reservada', pagado: 500 };
    expect(datosDeOperacion(o, auto, 'Lucas', agencia, PORTAL)).toEqual(expect.objectContaining({ cliente: 'Rocío', operacion: 'OP-2026-0010', pagado: 'US$ 500', saldo: 'US$ 27.000', vence: '20/11/2026' }));
    expect(datosDeOperacion({ ...o, estado: 'vendida', pagado: 27500 }, auto, 'Lucas', agencia, PORTAL)).toEqual(expect.objectContaining({ saldo: '', vence: '' }));
  });

  it('los mensajes de fábrica sólo usan variables de su contexto, y los correos traen asunto', () => {
    expect(new Set(PLANTILLAS_DE_FABRICA.map((p) => p.clave)).size).toBe(PLANTILLAS_DE_FABRICA.length);
    for (const p of PLANTILLAS_DE_FABRICA) {
      expect([p.clave, variablesDesconocidas(`${p.texto}\n${p.asunto ?? ''}`, p.contexto)]).toEqual([p.clave, []]);
      expect(p.clave.length).toBeLessThanOrEqual(40);
      if (p.canal === 'email') expect(p.asunto).toBeTruthy();
    }
    expect(VARIABLES_POR_CONTEXTO.operacion).toContain('saldo');
  });

  it('un mensaje de fábrica queda prolijo cuando faltan datos', () => {
    const reserva = PLANTILLAS_DE_FABRICA.find((p) => p.clave === 'op_reserva')!;
    const d = datosDeOperacion({ numero: 'OP-1', cliente_nombre: 'Ana', precio: 10000, moneda: 'USD', reserva_vence: null, estado: 'vendida', pagado: 10000 }, auto, 'Lucas', agencia, PORTAL);
    const texto = renderizarPlantilla(reserva.texto, d);
    expect(texto).not.toMatch(/\{|Saldo:|hasta el/);
    expect(texto).toContain('Recibimos: US$ 10.000');
  });

  it('el teléfono queda listo para WhatsApp', () => {
    expect(normalizarTelefono('11 5555 0199')).toBe('5491155550199');
    expect(normalizarTelefono('')).toBeNull();
  });
});

describe('el correo que recibe el cliente', () => {
  it('el cuerpo es texto: lo que parezca HTML sale escapado y las direcciones web quedan como enlace', () => {
    const html = cuerpoAHtml('Hola <b>Ana</b>\nMirá: https://garcia.fgautos.example/autos/u1.\n\nSaludos');
    expect(html).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;<br>');
    expect(html).toContain('<a href="https://garcia.fgautos.example/autos/u1"');
    expect(html).toContain('</a>.');
    expect(html.match(/<p /g)?.length).toBe(2);
  });

  it('sólo acepta direcciones http o https', () => {
    expect(urlSegura('javascript:alert(1)')).toBeNull();
    expect(urlSegura('https://fgautos.example')).toBe('https://fgautos.example/');
  });

  it('lleva el nombre y los datos de la agencia, en HTML y en texto plano', () => {
    const { html, texto } = correoDeAgencia('Hola Ana', { nombre: 'García <Autos>', direccion: 'Av. Rivadavia 1234', telefono: '11 5555 0100', sitio: 'https://garcia.fgautos.example' });
    expect(html).toContain('García &lt;Autos&gt;');
    expect(html).toContain('Av. Rivadavia 1234 · 11 5555 0100');
    expect(texto).toBe('Hola Ana\n\n--\nGarcía <Autos>\nAv. Rivadavia 1234 · 11 5555 0100\nhttps://garcia.fgautos.example/');
  });
});
