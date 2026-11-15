import { decidirReversa } from './anulacion.util';

describe('decidirReversa', () => {
  it('escribe el contrario cuando el original no pertenecía a ningún turno', () => {
    expect(
      decidirReversa({ turnoOriginalId: null, turnoAbiertoId: null }),
    ).toEqual({ accion: 'escribir' });
  });

  it('escribe el contrario aunque hoy haya turno abierto, si el original no tenía', () => {
    expect(
      decidirReversa({ turnoOriginalId: null, turnoAbiertoId: 'T2' }),
    ).toEqual({ accion: 'escribir' });
  });

  it('exige caja abierta cuando el original pertenecía a un turno', () => {
    expect(
      decidirReversa({ turnoOriginalId: 'T1', turnoAbiertoId: null }),
    ).toEqual({ accion: 'error', codigo: 'CAJA_CERRADA' });
  });

  it('revierte sin preguntar dentro del mismo turno abierto', () => {
    expect(
      decidirReversa({ turnoOriginalId: 'T1', turnoAbiertoId: 'T1' }),
    ).toEqual({ accion: 'escribir' });
  });

  it('pide destino cuando el turno original está cerrado', () => {
    expect(
      decidirReversa({ turnoOriginalId: 'T1', turnoAbiertoId: 'T2' }),
    ).toEqual({ accion: 'error', codigo: 'DESTINO_REQUERIDO' });
  });

  it('con destino turno_actual escribe: la plata volvió hoy', () => {
    expect(
      decidirReversa({
        turnoOriginalId: 'T1',
        turnoAbiertoId: 'T2',
        destino: 'turno_actual',
      }),
    ).toEqual({ accion: 'escribir' });
  });

  it('con destino sin_arqueo no escribe nada: el arqueo de apertura ya corrigió', () => {
    expect(
      decidirReversa({
        turnoOriginalId: 'T1',
        turnoAbiertoId: 'T2',
        destino: 'sin_arqueo',
      }),
    ).toEqual({ accion: 'omitir' });
  });
});
