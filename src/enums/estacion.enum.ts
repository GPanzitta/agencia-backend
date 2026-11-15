/**
 * Puesto de producción al que rutea un producto en el KDS.
 * `null` en `Product.estacion` = no pasa por ningún tablero (sale directo).
 */
export enum Estacion {
  COCINA = 'cocina',
  BARRA = 'barra',
}
