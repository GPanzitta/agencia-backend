/**
 * El correo que recibe el cliente: el texto que escribió el vendedor, con el
 * nombre de la agencia arriba y sus datos de contacto abajo. Puro.
 * Todo lo que viene de afuera se escapa: el cuerpo es texto, nunca HTML.
 */
export interface MarcaDeCorreo { nombre: string; direccion?: string | null; telefono?: string | null; sitio?: string | null; logo?: string | null }

export const escapar = (s: string | null | undefined): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Sólo http(s): una dirección rara no llega a ser un enlace. */
export function urlSegura(u: string | null | undefined): string | null {
  try {
    const url = new URL(String(u ?? ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

/** El texto en párrafos, con las direcciones web convertidas en enlaces. */
export function cuerpoAHtml(texto: string): string {
  const enlazar = (linea: string) => escapar(linea).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (crudo) => {
    const segura = urlSegura(crudo.replace(/&amp;/g, '&'));
    return segura ? `<a href="${escapar(segura)}" style="color:#1f4fa3;">${crudo}</a>` : crudo;
  });
  return texto.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;">${p.split('\n').map(enlazar).join('<br>')}</p>`).join('');
}

export function correoDeAgencia(cuerpo: string, marca: MarcaDeCorreo): { html: string; texto: string } {
  const sitio = urlSegura(marca.sitio);
  const logo = urlSegura(marca.logo);
  const pie = [marca.direccion, marca.telefono].filter(Boolean).map((x) => escapar(x)).join(' · ');
  const cabecera = logo
    ? `<img src="${escapar(logo)}" alt="${escapar(marca.nombre)}" height="44" style="display:block;height:44px;border:0;">`
    : `<span style="font-size:20px;font-weight:700;color:#ffffff;">${escapar(marca.nombre)}</span>`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#edefee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edefee;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#162028;">
<tr><td style="background:#1e2a32;padding:18px 28px;border-bottom:4px solid #f5be0b;">${cabecera}</td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.55;">${cuerpoAHtml(cuerpo)}</td></tr>
<tr><td style="padding:18px 28px;background:#f6f7f6;font-size:13px;line-height:1.5;color:#636e77;">
<strong style="color:#162028;">${escapar(marca.nombre)}</strong>${pie ? `<br>${pie}` : ''}${sitio ? `<br><a href="${escapar(sitio)}" style="color:#1f4fa3;">${escapar(sitio.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : ''}
</td></tr></table></td></tr></table></body></html>`;
  const texto = [cuerpo.trim(), '', '--', marca.nombre, [marca.direccion, marca.telefono].filter(Boolean).join(' · '), sitio ?? ''].filter((l, i) => i < 4 || l).join('\n');
  return { html, texto };
}
