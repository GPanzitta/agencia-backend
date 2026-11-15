import { comparar, esComparable, mediana, UnidadPropia } from './comparacion.util';
import { aNumero, esDireccionInterna, extraerUnidades, kmDe, marcaDe, precioDe } from './lector.util';

const mia = (x: Partial<UnidadPropia> = {}): UnidadPropia => ({ id: 'u1', numero: 'U-0001', marca: 'Toyota', modelo: 'Corolla', version: 'XEI', anio: 2019, km: 80000, precio: 18500, moneda: 'USD', ...x });

describe('leer una página de otro vendedor', () => {
  it('entiende los números como se escriben acá', () => {
    expect(aNumero('18.500')).toBe(18500);
    expect(aNumero('25.900.000,00')).toBe(25900000);
    expect(aNumero('12,500')).toBe(12500);
    expect(kmDe('85.000 km · Nafta')).toBe(85000);
    expect(kmDe('0 km')).toBe(0);
  });

  it('distingue el precio de un auto de una cuota o un accesorio', () => {
    expect(precioDe('US$ 18.500')).toEqual({ precio: 18500, moneda: 'USD' });
    expect(precioDe('$ 25.900.000')).toEqual({ precio: 25900000, moneda: 'ARS' });
    expect(precioDe('Cuotas de $ 350.000')).toBeNull();
  });

  it('reconoce la marca aunque venga abreviada o sin acento', () => {
    expect(marcaDe('VW Gol Trend 1.6')).toBe('Volkswagen');
    expect(marcaDe('citroen c3')).toBe('Citroën');
    expect(marcaDe('Oferta de la semana')).toBeNull();
  });

  it('lee los datos estructurados de la página', () => {
    const html = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"@type":"Car","name":"Toyota Corolla XEI 2.0","brand":{"name":"Toyota"},
      "vehicleModelDate":"2019","mileageFromOdometer":{"value":"75000"},"url":"/autos/1","offers":{"price":"17900","priceCurrency":"USD"}}}]}</script>`;
    expect(extraerUnidades(html, 'https://otra.example/usados')).toEqual([
      { titulo: 'Toyota Corolla XEI 2.0', marca: 'Toyota', anio: 2019, km: 75000, precio: 17900, moneda: 'USD', url: 'https://otra.example/autos/1' },
    ]);
  });

  it('si no hay datos estructurados, junta cada precio con el título que tiene cerca', () => {
    const html = `<ul><li><a href="/a/peugeot-208"><h3>Peugeot 208 Feline 1.6</h3><p>2020 | 42.000 km</p><span>US$ 16.900</span></a></li>
      <li><a href="/a/hilux"><h3>Toyota Hilux SRX 4x4</h3><p>2021 | 60.000 km</p><span>$ 48.000.000</span></a></li><li>Financiá en cuotas de $ 250.000</li></ul>`;
    const l = extraerUnidades(html, 'https://otra.example/');
    expect(l.map((u) => [u.titulo, u.anio, u.km, u.precio, u.moneda, u.url])).toEqual([
      ['Peugeot 208 Feline 1.6', 2020, 42000, 16900, 'USD', 'https://otra.example/a/peugeot-208'],
      ['Toyota Hilux SRX 4x4', 2021, 60000, 48000000, 'ARS', 'https://otra.example/a/hilux'],
    ]);
  });

  it('guarda la versión y la caja que publica el aviso, sin el año ni los km', () => {
    const html = `<a href="/v/fiat-cronos-2021"><h3>Fiat • Cronos</h3><p>2021 • 49.108 km • 1.8 PRECISION PACK STYLE • Manual</p><span>$</span><span>20.450.000</span></a>
      <a href="/v/vw-polo"><h3>Volkswagen Polo 2020</h3><span>US$ 15.900</span></a>`;
    expect(extraerUnidades(html, 'https://otra.example/').map((u) => [u.titulo, u.detalle])).toEqual([['Fiat Cronos', '1.8 PRECISION PACK STYLE · Manual'], ['Volkswagen Polo 2020', null]]);
  });

  it('le agrega a cada enlace el número de su aviso, cuando la página lo trae', () => {
    const Q = String.fromCharCode(92) + '"';
    const dato = (id: string, url: string) => '{' + Q + 'id' + Q + ':' + Q + id + Q + ',' + Q + 'url' + Q + ':' + Q + url + Q + '}';
    const tarjeta = (km: string, precio: string) => '<a href="/v/fiat-cronos-13-2022"><h3>Fiat • Cronos</h3><p>2022 • ' + km + ' km • 1.3 DRIVE • Manual</p><span>$ ' + precio + '</span></a>';
    const html = tarjeta('17.687', '20.787.874') + tarjeta('63.646', '21.585.043') + '<a href="/v/fiat-argo-2020"><h3>Fiat • Argo</h3><p>2020 • 60.000 km</p><span>$ 17.000.000</span></a>'
      + '<script>self.x.push("' + dato('558492', 'https://otra.example/v/fiat-cronos-13-2022') + ',' + dato('553704', 'https://otra.example/v/fiat-cronos-13-2022') + '")</script>';
    expect(extraerUnidades(html, 'https://otra.example/').map((u) => u.url)).toEqual([
      'https://otra.example/v/fiat-cronos-13-2022?id=558492', 'https://otra.example/v/fiat-cronos-13-2022?id=553704', 'https://otra.example/v/fiat-argo-2020',
    ]);
  });

  it('si la página trae los datos de cada aviso, los lee de ahí: cada dato en su lugar', () => {
    const Q = String.fromCharCode(92) + '"';
    const aviso = { id: '553704', url: 'https://otra.example/v/fiat-cronos-18-2022', title: 'Fiat • Cronos', subtitle: '2022 • 84.096 km • 1.8 PRECISION PACK PREMIUM • Manual',
      symbol: '$', mainPrice: '20.784.210', footerInfo: 'Buenos Aires', analytics: { car_make: 'Fiat', car_model: 'Cronos', car_price: '20784210', car_year: 2022 } };
    const html = '<script>self.x.push([1,"' + JSON.stringify([aviso]).split('"').join(Q) + '"])</script>';
    expect(extraerUnidades(html, 'https://otra.example/')).toEqual([{
      titulo: 'Fiat Cronos', marca: 'Fiat', anio: 2022, km: 84096, precio: 20784210, moneda: 'ARS',
      url: 'https://otra.example/v/fiat-cronos-18-2022?id=553704', detalle: '1.8 PRECISION PACK PREMIUM · Manual',
    }]);
  });

  it('no le pega a un auto el año del que está al lado', () => {
    const html = `<a href="/v/renault-koleos-2011"><h3>Renault • Koleos</h3><b>$ 12.200.000</b><p>2011 • 189.787 km</p></a>
      <a href="/v/renault-captur-2017"><h3>Renault • Captur</h3><b>$ 21.679.749</b><p>2017 • 233.000 km</p></a>`;
    expect(extraerUnidades(html, 'https://otra.example/').map((u) => [u.titulo, u.anio, u.km])).toEqual([['Renault Koleos', 2011, 189787], ['Renault Captur', 2017, 233000]]);
  });

  it('lee el precio partido en dos renglones y, si hay uno tachado, toma el que vale', () => {
    const html = `<a href="/v/fiat-cronos-2021"><p>Nuevo ingreso</p><h3>Fiat • Cronos</h3><p>2021 • 49.108 km • Manual</p><p>Precio desde</p><span>$</span><span>20.450.000</span><p>Buenos Aires</p></a>
      <a href="/v/fiat-cronos-2022"><p>Precio financiando</p><h3>Fiat • Cronos</h3><p>2022 • 84.096 km • Manual</p><p>Precio desde</p><s>$ 21.475.874</s><span>$</span><span>20.000.000</span><p>Buenos Aires</p></a>
      <a href="/v/fiat-argo-2020"><h3>Fiat • Argo</h3><p>2020 • 60.000 km</p><span>$</span><span>17.000.000</span></a>`;
    expect(extraerUnidades(html, 'https://otra.example/').map((u) => [u.titulo, u.anio, u.km, u.precio])).toEqual([
      ['Fiat Cronos', 2021, 49108, 20450000], ['Fiat Cronos', 2022, 84096, 20000000], ['Fiat Argo', 2020, 60000, 17000000],
    ]);
  });

  it('no le pide nada a la propia máquina ni a la red interna', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) expect(esDireccionInterna(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '190.210.1.1', '2800:3f0::1']) expect(esDireccionInterna(ip)).toBe(false);
  });
});

describe('comparar mi precio', () => {
  const ajena = (precio: number, km: number | null = 80000, anio: number | null = 2019, moneda: 'ARS' | 'USD' = 'USD') =>
    ({ titulo: 'Toyota Corolla XEI', marca: 'Toyota', anio, km, precio, moneda, url: null, fuente: 'Otra agencia' });

  it('sólo compara el mismo modelo, con un año de tolerancia', () => {
    expect(esComparable(mia(), ajena(18000, 80000, 2020))).toBe(true);
    expect(esComparable(mia(), ajena(18000, 80000, 2016))).toBe(false);
    expect(esComparable(mia(), { ...ajena(18000), titulo: 'Toyota Corolla Cross XEI' })).toBe(true);
    expect(esComparable(mia(), { ...ajena(18000), titulo: 'Toyota Etios XLS' })).toBe(false);
  });

  it('la referencia es el precio del medio', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  it('da el veredicto mirando precio, kilómetros y año', () => {
    expect(comparar(mia({ precio: 17000 }), [ajena(18500), ajena(18000)], null).veredicto).toBe('buen_precio');
    expect(comparar(mia(), [ajena(18500), ajena(18300)], null).veredicto).toBe('en_precio');
    expect(comparar(mia({ precio: 20500 }), [ajena(18500), ajena(18000)], null).veredicto).toBe('caro');
    expect(comparar(mia({ precio: 20500, km: 30000 }), [ajena(18500), ajena(18000)], null).veredicto).toBe('caro_pero_mejor');
    expect(comparar(mia({ precio: null }), [ajena(18500)], null).veredicto).toBe('sin_precio');
    expect(comparar(mia(), [], null).veredicto).toBe('sin_comparables');
  });

  it('con autos publicados en la otra moneda pide el dólar, y con el dólar los convierte', () => {
    const enPesos = [ajena(27_000_000, 80000, 2019, 'ARS')];
    expect(comparar(mia(), enPesos, null).veredicto).toBe('falta_dolar');
    const c = comparar(mia(), enPesos, 1500);
    expect(c.referencia).toBe(18000);
    expect(c.veredicto).toBe('en_precio');
  });
});

describe('seguir leyendo más allá de la primera página', () => {
  // Se importa acá para no tocar el encabezado del archivo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { paginasSiguientes, listadoDeModelo } = require('./rastreo.util') as typeof import('./rastreo.util');

  it('encuentra las páginas siguientes del mismo listado, sin repetir la que ya leyó', () => {
    const html = `<a href="/ar/usados?page=0">1</a><a href="/ar/usados?page=1">2</a><a href="/ar/usados?page=2">3</a><a href="/ar/usados?page=1">sig</a><a href="/ar/otra?page=9">x</a>`;
    expect(paginasSiguientes(html, 'https://otra.example/ar/usados', 5)).toEqual(['https://otra.example/ar/usados?page=1', 'https://otra.example/ar/usados?page=2']);
    expect(paginasSiguientes(html, 'https://otra.example/ar/usados', 1)).toEqual(['https://otra.example/ar/usados?page=1']);
    expect(paginasSiguientes('<a href="/usados/page/2">2</a><a href="/usados/page/3">3</a>', 'https://otra.example/usados', 5)).toEqual(['https://otra.example/usados/page/2', 'https://otra.example/usados/page/3']);
    expect(paginasSiguientes('<a href="/contacto">c</a>', 'https://otra.example/usados', 5)).toEqual([]);
  });

  it('busca el listado de un modelo en un enlace de la página o prueba con la forma más común', () => {
    const html = `<a href="/ar/usados/fiat/cronos">Cronos</a><a href="/ar/venta/fiat-cronos-13-2021">uno</a>`;
    expect(listadoDeModelo(html, 'https://otra.example/ar/usados?page=2', 'Fiat', 'Cronos')).toBe('https://otra.example/ar/usados/fiat/cronos');
    expect(listadoDeModelo('', 'https://otra.example/ar/usados?page=2', 'Citroën', 'C3 Aircross')).toBe('https://otra.example/ar/usados/citroen/c3-aircross');
  });
});

describe('comparar contra lo más parecido', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { cajaDe, cilindradaDe, comparar: medir, firmaDeVersion, nivelDe, precioEsperado } = require('./comparacion.util') as typeof import('./comparacion.util');
  const mio = { id: 'u1', numero: 'U-0008', marca: 'Fiat', modelo: 'Cronos', version: 'Drive 1.3 GSE', anio: 2022, km: 38000, precio: 15200, moneda: 'USD' as const, transmision: 'manual' };
  const aviso = (detalle: string | null, precio: number, km = 40000, anio = 2022) => ({ titulo: 'Fiat Cronos', marca: 'Fiat', anio, km, precio, moneda: 'USD' as const, url: null, detalle, fuente: 'Otra' });

  it('lee el motor y la caja como vengan escritos', () => {
    expect(cilindradaDe('Drive 1.3 GSE')).toBe('1.3');
    expect(cilindradaDe('1,8 PRECISION')).toBe('1.8');
    expect(cilindradaDe('Highline V6 4x4')).toBeNull();
    expect(cajaDe('1.3 DRIVE · Manual')).toBe('manual');
    expect(cajaDe('1.3 PRECISION CVT')).toBe('automatica');
    expect(cajaDe('1.3 DRIVE')).toBeNull();
  });

  it('la firma de una versión deja lo que la distingue: sin motor, caja ni marca', () => {
    expect(firmaDeVersion('Drive 1.3 GSE', 'Fiat', 'Cronos')).toBe('drive');
    expect(firmaDeVersion('1.3 DRIVE PACK CONECTIVIDAD · Manual Fiat Cronos', 'Fiat', 'Cronos')).toBe('conectividad drive pack');
    expect(firmaDeVersion('SRX 2.8 AT 4WD', 'Toyota', 'Hilux')).toBe('4x4 srx');
    expect(firmaDeVersion(null, 'Fiat', 'Cronos')).toBe('');
  });

  it('distingue misma versión, mismo motor y sólo el modelo', () => {
    expect(nivelDe(mio, aviso('1.3 DRIVE · Manual', 1))).toBe(2);
    expect(nivelDe(mio, aviso('1.3 DRIVE PACK CONECTIVIDAD · Manual', 1))).toBe(1);
    expect(nivelDe(mio, aviso('1.3 PRECISION CVT · Automático', 1))).toBe(0);
    expect(nivelDe(mio, aviso('1.8 PRECISION · Manual', 1))).toBe(0);
    expect(nivelDe(mio, aviso(null, 1))).toBe(0);
    expect(nivelDe({ ...mio, version: null }, aviso('1.3 DRIVE · Manual', 1))).toBe(0);
  });

  it('mide contra la misma versión si hay dos; si no, contra el mismo motor; si no, contra el modelo', () => {
    const version = medir(mio, [aviso('1.3 DRIVE · Manual', 14000), aviso('1.3 DRIVE · Manual', 14400), aviso('1.3 DRIVE PACK CONECTIVIDAD · Manual', 16000), aviso('1.8 PRECISION · Automático', 19000)], null);
    expect([version.base, version.referencia, version.comparables.map((c) => c.medido)]).toEqual(['misma_version', 14200, [true, true, false, false]]);
    expect(version.motivo).toContain('los 2 publicados de su misma versión');

    const motor = medir(mio, [aviso('1.3 DRIVE · Manual', 14000), aviso('1.3 DRIVE PACK CONECTIVIDAD · Manual', 16000), aviso('1.8 PRECISION · Automático', 19000)], null);
    expect([motor.base, motor.referencia]).toEqual(['mismo_motor', 15000]);

    const modelo = medir(mio, [aviso('1.3 DRIVE · Manual', 14000), aviso('1.8 PRECISION · Automático', 19000), aviso('1.8 PRECISION · Manual', 18000)], null);
    expect([modelo.base, modelo.referencia]).toEqual(['mismo_modelo', 18000]);
  });

  it('estima el precio por kilómetros y año cuando los avisos alcanzan y la recta tiene sentido', () => {
    // 10.000 km menos = 500 más; un año más nuevo = 1.000 más.
    const recta = [[60000, 2021, 13000], [40000, 2021, 14000], [50000, 2022, 14500], [30000, 2022, 15500], [20000, 2023, 17000], [70000, 2023, 14500]].map(([km, anio, precio]) => ({ km, anio, precio }));
    expect(precioEsperado(recta, 40000, 2022)).toBe(15000);
    expect(precioEsperado(recta.slice(0, 4), 40000, 2022)).toBeNull();
    // Avisos donde más km sale más caro: no hay recta que valga.
    expect(precioEsperado(recta.map((a) => ({ ...a, anio: 2022, precio: 10000 + a.km / 10 })), 40000, 2022)).toBeNull();
    // No extrapola más allá de lo publicado.
    expect(precioEsperado(recta, 0, 2030)).toBe(18700);
  });

  it('con precio esperado, el veredicto ya descuenta los km y el año', () => {
    const avisos = [[60000, 13000], [50000, 13500], [40000, 14000], [30000, 14500], [20000, 15000]].map(([km, precio]) => aviso('1.3 DRIVE · Manual', precio, km));
    // Contra la mediana (14.000) un auto de 14.800 con 20.000 km parecería caro; por sus km vale 15.000.
    const c = medir({ ...mio, km: 20000, precio: 14800 }, avisos, null);
    expect([c.referencia, c.esperado, c.diferencia_pct, c.veredicto]).toEqual([14000, 15000, -1.3, 'en_precio']);
    expect(c.motivo).toBe('Por sus kilómetros y su año, los 5 publicados de su misma versión dan un precio esperado y este auto está en línea.');
    expect(medir({ ...mio, km: 60000, precio: 14800 }, avisos, null).veredicto).toBe('caro');
  });
});
