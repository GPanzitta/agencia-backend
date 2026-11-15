/**
 * Las dos URLs públicas del sistema, en un solo lugar.
 *
 * Estaban copiadas en cinco archivos (`mensajes`, `portal`, `repair-orders`,
 * `ventas-tienda` y `mercado-libre`): cada enlace que se le manda a un
 * cliente dependía de que esa copia tuviera el mismo respaldo. Se leen en
 * cada llamada y no en una constante de módulo porque el entorno se termina
 * de armar después de los imports.
 */
const sinBarraFinal = (url: string) => url.replace(/\/+$/, '');

/** De dónde cuelgan los enlaces que ve el cliente: `/o/<token>` de una orden, `/v/<token>` de una venta. */
export function urlPublicaDelPortal(): string {
  return sinBarraFinal(process.env.PORTAL_URL || 'http://localhost:3201');
}

/** La API vista desde afuera: webhooks de Mercado Pago, callbacks de OAuth, fotos públicas. */
export function urlPublicaDeLaApi(): string {
  return sinBarraFinal(process.env.API_PUBLIC_URL || 'http://localhost:3100/api');
}

/** El ERP del taller: el QR del remito lleva a la OS ahí (`/home/ordenes/os/<número>`), como el del papel. */
export function urlDelErp(): string {
  return sinBarraFinal(process.env.ERP_URL || 'http://localhost:4400');
}
