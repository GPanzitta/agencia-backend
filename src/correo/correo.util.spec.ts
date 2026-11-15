import { configDeCorreo, mensajeDeCorreo, opcionesDeTransporte, textoAHtml } from './correo.util';

/**
 * Lo puro del envío de correos: cómo se lee la configuración del entorno y
 * cómo se arma el mensaje (texto plano + HTML) a partir de lo que el taller
 * escribió. El transporte real (nodemailer) queda afuera.
 */
describe('configDeCorreo', () => {
  const env = {
    MAIL_HOST: 'smtp.gmail.com', MAIL_PORT: '587', MAIL_USER: 'taller@gmail.com', MAIL_PASS: 'app-pass',
    MAIL_FROM: 'GUSMAT Taller <taller@gmail.com>', MAIL_REPLY_TO: 'consultas@taller.com',
  };

  it('con host, usuario y clave el correo está configurado; el puerto 587 va sin TLS implícito', () => {
    expect(configDeCorreo(env)).toEqual({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: 'taller@gmail.com', pass: 'app-pass' },
      from: 'GUSMAT Taller <taller@gmail.com>', replyTo: 'consultas@taller.com',
    });
  });

  it('el puerto 465 es TLS implícito; sin puerto se asume 587; sin FROM se usa el usuario', () => {
    const c = configDeCorreo({ ...env, MAIL_PORT: '465', MAIL_FROM: '', MAIL_REPLY_TO: '' });
    expect(c?.port).toBe(465);
    expect(c?.secure).toBe(true);
    expect(c?.from).toBe('taller@gmail.com');
    expect(c?.replyTo).toBeUndefined();
    expect(configDeCorreo({ ...env, MAIL_PORT: undefined })?.port).toBe(587);
  });

  it('sin host o sin credenciales no está configurado', () => {
    expect(configDeCorreo({})).toBeNull();
    expect(configDeCorreo({ ...env, MAIL_HOST: '' })).toBeNull();
    expect(configDeCorreo({ ...env, MAIL_PASS: undefined })).toBeNull();
  });
});

describe('textoAHtml', () => {
  it('escapa lo que podría ser HTML y convierte los saltos de línea', () => {
    expect(textoAHtml('Hola <Juan> & cía\nSaludos')).toBe('Hola &lt;Juan&gt; &amp; cía<br>Saludos');
  });
});

describe('mensajeDeCorreo', () => {
  it('arma el mensaje para nodemailer con el texto plano y el HTML ya armados (correoMaquetado), remitente y reply-to', () => {
    const m = mensajeDeCorreo(
      {
        para: 'juan@mail.com', asunto: 'Tu heladera está lista',
        texto: 'Hola Juan!\nPodés pasar a retirarla.', html: '<!doctype html><p>Hola Juan!</p>',
      },
      { from: 'GUSMAT <taller@gmail.com>', replyTo: 'consultas@taller.com' },
    );
    expect(m).toEqual({
      from: 'GUSMAT <taller@gmail.com>', replyTo: 'consultas@taller.com', to: 'juan@mail.com',
      subject: 'Tu heladera está lista',
      text: 'Hola Juan!\nPodés pasar a retirarla.',
      html: '<!doctype html><p>Hola Juan!</p>',
    });
  });

  it('sin reply-to no manda la clave', () => {
    expect('replyTo' in mensajeDeCorreo({ para: 'a@b.c', asunto: 'x', texto: 'y', html: '<p>y</p>' }, { from: 'f@t.c' })).toBe(false);
  });
});

describe('mensajeDeCorreo con adjuntos (spec 2026-10-07 §5.3)', () => {
  it('los adjuntos van como attachments de nodemailer, con nombre, bytes y tipo', () => {
    const pdf = Buffer.from('%PDF-1.7');
    const m = mensajeDeCorreo(
      { para: 'a@b.c', asunto: 'x', texto: 'y', html: '<p>y</p>', adjuntos: [{ nombre: 'Presupuesto OR-1.pdf', contenido: pdf, mime: 'application/pdf' }] },
      { from: 'f@t.c' },
    );
    expect(m.attachments).toEqual([{ filename: 'Presupuesto OR-1.pdf', content: pdf, contentType: 'application/pdf' }]);
  });

  it('sin adjuntos (o con la lista vacía) no manda la clave', () => {
    expect('attachments' in mensajeDeCorreo({ para: 'a@b.c', asunto: 'x', texto: 'y', html: '<p>y</p>' }, { from: 'f@t.c' })).toBe(false);
    expect('attachments' in mensajeDeCorreo({ para: 'a@b.c', asunto: 'x', texto: 'y', html: '<p>y</p>', adjuntos: [] }, { from: 'f@t.c' })).toBe(false);
  });
});

describe('opcionesDeTransporte', () => {
  const config = { host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: 'u', pass: 'p' }, from: 'u' };

  it('sin adjuntos el socket espera 20 s; con adjuntos, 60 s (subir 20 MB por SMTP tarda)', () => {
    expect(opcionesDeTransporte(config, false)).toEqual({
      host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: 'u', pass: 'p' },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    });
    expect(opcionesDeTransporte(config, true).socketTimeout).toBe(60_000);
  });
});

describe('asuntoSeguro — SEG-38', () => {
  it('un asunto con saltos de línea no puede inyectar cabeceras', () => {
    const { asuntoSeguro, mensajeDeCorreo } = require('./correo.util');
    expect(asuntoSeguro('Pedido VT-1\r\nBcc: victima@x.com')).toBe('Pedido VT-1 Bcc: victima@x.com');
    const m = mensajeDeCorreo({ para: 'a@b.com', asunto: 'Hola\nX-Otra: 1', texto: 't' }, { from: 'T <t@t.com>' });
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
});

describe('mensajeDeCorreo — el taller como remitente (etapa 1, spec 2026-10-28 §13.6)', () => {
  const plataforma = { from: 'Plataforma <no-reply@plataforma.com>', replyTo: 'soporte@plataforma.com' };
  const base = { para: 'cliente@mail.com', asunto: 'Tu orden', texto: 't', html: '<p>t</p>' };

  it('el nombre visible es el del taller, desde la casilla de la plataforma, y las respuestas le llegan al taller', () => {
    const m = mensajeDeCorreo({ ...base, remitente: { nombre: 'Taller Ñandú', responderA: 'nandu@mail.com' } }, plataforma);
    expect(m.from).toBe('"Taller Ñandú" <no-reply@plataforma.com>');
    expect(m.replyTo).toBe('nandu@mail.com');
  });
  it('sin correo de contacto, las respuestas van a donde van hoy', () => {
    const m = mensajeDeCorreo({ ...base, remitente: { nombre: 'Taller Ñandú', responderA: null } }, plataforma);
    expect(m.from).toBe('"Taller Ñandú" <no-reply@plataforma.com>');
    expect(m.replyTo).toBe('soporte@plataforma.com');
  });
  it('sin remitente, todo como hoy (correos de la tienda)', () => {
    const m = mensajeDeCorreo(base, plataforma);
    expect(m.from).toBe('Plataforma <no-reply@plataforma.com>');
    expect(m.replyTo).toBe('soporte@plataforma.com');
  });
  it('un from configurado sin nombre también sirve de casilla', () => {
    const m = mensajeDeCorreo({ ...base, remitente: { nombre: 'Taller Ñandú' } }, { from: 'no-reply@plataforma.com' });
    expect(m.from).toBe('"Taller Ñandú" <no-reply@plataforma.com>');
  });
  it('comillas y saltos de línea en el nombre no rompen la cabecera ni inyectan otra', () => {
    const m = mensajeDeCorreo({ ...base, remitente: { nombre: 'Taller "El\r\nBcc: x@y.com Rayo"' } }, plataforma);
    expect(m.from).not.toMatch(/[\r\n]/);
    expect(m.from).toBe('"Taller \\"El Bcc: x@y.com Rayo\\"" <no-reply@plataforma.com>');
  });
});
