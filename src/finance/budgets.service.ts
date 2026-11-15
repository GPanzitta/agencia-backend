import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Budget } from './entities/budget.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { CategoriaGasto } from '../expenses/entities/expense.enums';
import { CrearPresupuestoDto } from './dto/crear-presupuesto.dto';
import { inicioDelMesActual } from '../common/fechas.util';
import { condicionGastoVigente } from '../expenses/deuda-exigible.util';

const dec = (n: number) => Number(Number(n).toFixed(2));

/**
 * Primer día del mes, que es como se guarda el período.
 *
 * Se leen los componentes en UTC, no en hora local. Con `getFullYear()` /
 * `getMonth()` el período se guardaba **un mes antes** del pedido en toda
 * zona horaria al oeste de UTC: `new Date('2026-08-01')` se parsea como
 * medianoche UTC, que en Argentina (UTC-3) es el 31 de julio a las 21:00, y
 * `getMonth()` devolvía julio. El presupuesto de agosto quedaba cargado en
 * julio, y la pantalla de ejecución de agosto salía vacía.
 *
 * Ojo: esto vale para una fecha que VIENE del cliente como `YYYY-MM-DD`. Para
 * "el mes en curso" hay que usar `inicioDelMesActual()`, porque ahí los
 * componentes UTC de un `new Date()` de las 22:00 ya son del mes siguiente.
 */
const inicioDeMes = (fecha: Date) =>
  new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1));

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget)
    private readonly budgetRepo: Repository<Budget>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
  ) {}

  async crear(dto: CrearPresupuestoDto) {
    const periodo = inicioDeMes(new Date(dto.periodo));

    // Un solo presupuesto por categoría y mes: dos presupuestos para lo mismo
    // no se pueden comparar contra un único gasto acumulado.
    const existente = await this.budgetRepo.findOne({
      where: { categoria: dto.categoria, periodo, companyId: dto.companyId },
    });
    if (existente) {
      existente.monto_asignado = dec(dto.monto_asignado);
      existente.umbral_alerta = dto.umbral_alerta ?? existente.umbral_alerta;
      existente.notas = dto.notas ?? existente.notas;
      return this.budgetRepo.save(existente);
    }

    return this.budgetRepo.save(
      this.budgetRepo.create({
        ...dto,
        periodo,
        monto_asignado: dec(dto.monto_asignado),
      }),
    );
  }

  async eliminar(id: string) {
    const b = await this.budgetRepo.findOne({ where: { id } });
    if (!b) throw new NotFoundException('Presupuesto inexistente');
    return this.budgetRepo.remove(b);
  }

  /**
   * Presupuestado vs gastado del mes, por categoría.
   *
   * Cuenta los gastos por `fecha`, no por fecha de pago: el presupuesto mide
   * cuánto se comprometió en el mes, no cuánto salió de caja. Un gasto de enero
   * pagado en marzo consume el presupuesto de enero.
   */
  async ejecucion(periodo?: string, companyId?: string) {
    // Sin período explícito, el mes en curso del TALLER. `inicioDeMes` mira el
    // mes UTC, así que el último día del mes después de las 21:00 devolvía el
    // mes siguiente y la ejecución salía vacía justo cuando se la consulta para
    // cerrar el mes.
    const mes = periodo ? inicioDeMes(new Date(periodo)) : inicioDelMesActual();
    // También en UTC: `mes` se construye en UTC, así que leerlo con getters
    // locales devolvería el mes anterior y el rango de gastos quedaría corrido.
    const finMes = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0));

    const presupuestos = await this.budgetRepo.find({
      where: companyId ? { periodo: mes, companyId } : { periodo: mes },
    });

    // Solo lo vigente: un gasto rechazado no se gastó y no consume
    // presupuesto. Uno pendiente de firma sí, porque ya está comprometido.
    const qb = condicionGastoVigente(
      this.expenseRepo
        .createQueryBuilder('e')
        .select('e.categoria', 'categoria')
        .addSelect('COALESCE(SUM(e.monto), 0)', 'gastado')
        .addSelect('COUNT(e.id)', 'comprobantes'),
    )
      .andWhere('e.fecha >= :desde', { desde: mes })
      .andWhere('e.fecha <= :hasta', { hasta: finMes })
      .groupBy('e.categoria');

    if (companyId) qb.andWhere('e.company_id = :companyId', { companyId });

    const gastos = await qb.getRawMany<{
      categoria: CategoriaGasto;
      gastado: string;
      comprobantes: string;
    }>();
    const gastadoPor = new Map(gastos.map((g) => [g.categoria, Number(g.gastado)]));
    const comprobantesPor = new Map(gastos.map((g) => [g.categoria, Number(g.comprobantes)]));

    const lineas = presupuestos.map((p) => {
      const asignado = dec(Number(p.monto_asignado));
      const gastado = dec(gastadoPor.get(p.categoria) ?? 0);
      const consumo = asignado > 0 ? dec((gastado / asignado) * 100) : 0;

      return {
        categoria: p.categoria,
        asignado,
        gastado,
        disponible: dec(asignado - gastado),
        consumo_porcentual: consumo,
        comprobantes: comprobantesPor.get(p.categoria) ?? 0,
        umbral_alerta: p.umbral_alerta,
        estado:
          consumo >= 100 ? 'excedido' : consumo >= p.umbral_alerta ? 'en_alerta' : 'ok',
      };
    });

    // Categorías con gasto pero sin presupuesto: es justo lo que conviene ver,
    // porque es plata que sale sin que nadie la haya planificado.
    const presupuestadas = new Set(presupuestos.map((p) => p.categoria));
    const sinPresupuesto = gastos
      .filter((g) => !presupuestadas.has(g.categoria))
      .map((g) => ({
        categoria: g.categoria,
        gastado: dec(Number(g.gastado)),
        comprobantes: Number(g.comprobantes),
      }));

    const totalAsignado = dec(lineas.reduce((s, l) => s + l.asignado, 0));
    const totalGastado = dec(
      lineas.reduce((s, l) => s + l.gastado, 0) +
        sinPresupuesto.reduce((s, l) => s + l.gastado, 0),
    );

    return {
      periodo: mes.toISOString().slice(0, 10),
      total_asignado: totalAsignado,
      total_gastado: totalGastado,
      total_disponible: dec(totalAsignado - totalGastado),
      lineas,
      sin_presupuesto: sinPresupuesto,
      alertas: lineas.filter((l) => l.estado !== 'ok'),
    };
  }

  /** Copia los montos de un mes al siguiente, para no recargarlos a mano. */
  async copiarPeriodo(desde: string, hacia: string, companyId?: string) {
    const origen = inicioDeMes(new Date(desde));
    const destino = inicioDeMes(new Date(hacia));
    if (origen.getTime() === destino.getTime()) {
      throw new BadRequestException('El período de origen y destino son el mismo');
    }

    const previos = await this.budgetRepo.find({
      where: companyId ? { periodo: origen, companyId } : { periodo: origen },
    });
    if (!previos.length) {
      throw new NotFoundException('No hay presupuestos en el período de origen');
    }

    const creados: Budget[] = [];
    for (const p of previos) {
      const yaExiste = await this.budgetRepo.findOne({
        where: { categoria: p.categoria, periodo: destino, companyId: p.companyId },
      });
      if (yaExiste) continue;
      creados.push(
        await this.budgetRepo.save(
          this.budgetRepo.create({
            categoria: p.categoria,
            periodo: destino,
            monto_asignado: p.monto_asignado,
            umbral_alerta: p.umbral_alerta,
            companyId: p.companyId,
          }),
        ),
      );
    }

    return { copiados: creados.length, presupuestos: creados };
  }
}
