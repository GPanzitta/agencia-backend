/**
 * El correo del admin inicial de un taller nuevo, derivado del nombre.
 *
 * #37 (triage 23/09) y CLI-01: se armaba con el nombre tal cual, sin sacar
 * acentos ni símbolos, y «Taller Ñandú & Cía.» daba un correo inválido que
 * después nadie podía usar para entrar. Ahora queda sólo con letras y
 * números; si no queda nada, `taller`.
 */
export function emailDelAdmin(nombreTaller: string): string {
  const slug = nombreTaller
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40);
  return `admin@${slug || 'taller'}.com`;
}
