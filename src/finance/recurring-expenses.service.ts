import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';

import { RecurringExpense } from './entities/recurring-expense.entity';
import { fechaLocal, primeraFecha, primeraNoAnteriorA, siguienteFecha } from './recurrencia-fechas.util';
import { fechaLocal as fechaDelTaller } from '../common/fechas.util';
import { Expense } from '../expenses/entities/expense.entity';
import { EstadoAprobacion, EstadoPagoGasto } from '../expenses/entities/expense.enums';
import { FinanceSettings } from './entities/finance-settings.entity';
import { CrearRecurrenteDto } from './dto/crear-recurrente.dto';
import { ActualizarRecurrenteDto, DesdeReactivar } from './dto/actualizar-recurrente.dto';
import { bloquearNumeracion, siguienteCorrelativo } from '../common/numeracion.util';
import { Proveedor } from '../proveedores/entities/proveedore.entity';

const dec = (n: number) => Number(Number(n).toFixed(2));

/**
 * Genera los gastos que se repiten.
 *
 * El alquiler, los sueldos y los servicios hoy se cargan a mano cada mes, y lo
 * que se carga a mano se olvida: un gasto fijo no registrado no aparece en la
 * proyección de pagos y el mes cierra mostrando una ganancia que no existe.
 */
@Injectable()
export class RecurringExpensesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecurringExpensesService.name);

  /**
   * Catch-up al arrancar: el cron de las 6 AM solo dispara si el proceso está
   * vivo justo a esa hora, y la máquina del local se prende cuando abre — o
   * sea, el cron no corría nunca y los gastos fijos no aparecían hasta que
   * alguien tocaba el botón manual. `generarPendientes` es idempotente, así
   * que arrancar dos veces el mismo día no duplica nada.
   */
  onApplicationBootstrap(): void {
    void this.generarProgramado();
  }

  constructor(
    @InjectRepository(RecurringExpense)
    private readonly recurrenteRepo: Repository<RecurringExpense>,
    @InjectRepository(FinanceSettings)
    private readonly settingsRepo: Repository<FinanceSettings>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── ABM ────────────────────────────────────────────────────────────────

  /**
   * SEG-07: el proveedor del DTO se carga antes de asignarlo, con el filtro de
   * empresa: un id de otro taller (o inexistente) se rechaza en vez de quedar
   * colgado de la plantilla.
   */
  private async proveedorDeLaEmpresa(em: EntityManager, id: string): Promise<Proveedor> {
    const proveedor = await em.findOne(Proveedor, { where: { id } });
    if (!proveedor) throw new NotFoundException('Ese proveedor no existe.');
    return proveedor;
  }

  async crear(dto: CrearRecurrenteDto) {
    if (dto.proveedor_id) await this.proveedorDeLaEmpresa(this.dataSource.manager, dto.proveedor_id);
    if (dto.dia_vencimiento < 1 || dto.dia_vencimiento > 31) {
      throw new BadRequestException('El día de vencimiento debe estar entre 1 y 31');
    }
    // fechaLocal, no `new Date`: el string 'YYYY-MM-DD' del DTO parseado como
    // UTC caía un día antes en hora local y corría todos los vencimientos.
    const inicio = fechaLocal(dto.fecha_inicio);
    const recurrente = this.recurrenteRepo.create({
      ...dto,
      // El DTO trae `proveedor_id` plano pero la entidad expone la RELACIÓN:
      // sin este mapeo TypeORM lo descartaba en silencio y todas las
      // plantillas quedaban sin proveedor — con lo cual sus gastos generados
      // no aparecían nunca en Cuentas por Pagar.
      proveedor: dto.proveedor_id ? { id: dto.proveedor_id } as never : undefined,
      fecha_inicio: inicio,
      fecha_fin: dto.fecha_fin ? fechaLocal(dto.fecha_fin) : null,
      // La primera generación cae en el próximo vencimiento a partir del inicio,
      // no en la fecha de alta: cargar la plantilla no debería crear un gasto
      // retroactivo por sorpresa.
      proxima_generacion: primeraFecha(inicio, dto.dia_vencimiento),
      generados: 0,
      activo: true,
    });
    const guardado = await this.recurrenteRepo.save(recurrente);

    // Materializar en el acto SOLO esta plantilla si su vencimiento cae en la
    // ventana: quien carga el alquiler espera verlo en Cuentas por Pagar al
    // instante. Las demás plantillas no se tocan — sus vencimientos llegan
    // por el cron o el botón, sin efectos colaterales del alta.
    const hasta = this.horizonte();
    if (this.generaAhora(guardado, hasta)) {
      await this.generarDe(guardado, hasta);
    }

    // Releer: generarDe avanzó proxima_generacion y el contador.
    return this.recurrenteRepo.findOne({ where: { id: guardado.id } });
  }

  async listar(companyId?: string) {
    const where = companyId ? { companyId } : {};
    return this.recurrenteRepo.find({ where, order: { proxima_generacion: 'ASC' } });
  }

  async actualizar(id: string, cambios: ActualizarRecurrenteDto) {
    // Bajo lock, como la generación: con una copia leída sin lock, el save
    // devolvía a su valor viejo la `proxima_generacion` y los `generados` que
    // una corrida del cron había avanzado en el medio, y el próximo cron
    // volvía a crear esos vencimientos.
    const guardado = await this.dataSource.transaction(async (em) => {
      const recurrente = await this.bloquear(em, id);
      if (!recurrente) throw new NotFoundException('Recurrencia inexistente');
      // Mismo mapeo id → relación que en crear(); `proveedor_id` null significa
      // quitar el proveedor, ausente significa no tocarlo. Tiene que ser null y
      // no undefined: TypeORM saltea una relación en undefined y el proveedor
      // viejo quedaba puesto, y con él los gastos que se seguían generando (#16).
      const { proveedor_id, fecha_inicio, fecha_fin, ...resto } = cambios;
      if (proveedor_id !== undefined) {
        recurrente.proveedor = proveedor_id ? await this.proveedorDeLaEmpresa(em, proveedor_id) : (null as never);
      }
      Object.assign(recurrente, resto);
      // Las fechas a mediodía local, como en crear(): la columna `date` guarda
      // el día que se eligió en cualquier huso.
      if (fecha_inicio) recurrente.fecha_inicio = fechaLocal(fecha_inicio);
      if (fecha_fin !== undefined) recurrente.fecha_fin = fecha_fin ? fechaLocal(fecha_fin) : null;
      return em.save(RecurringExpense, recurrente);
    });

    // Como en crear(): extender «Hasta» de un alquiler que terminó tiene que
    // mostrar el vencimiento que ya cae en la ventana ahora, no mañana a las 6
    // (#42).
    const hasta = this.horizonte();
    if (this.generaAhora(guardado, hasta)) await this.generarDe(guardado, hasta);
    // Releer: la lectura con lock no trae el proveedor, y generarDe avanzó el reloj.
    return this.recurrenteRepo.findOne({ where: { id } });
  }

  /**
   * Relee la plantilla con FOR UPDATE dentro de la transacción `em`.
   * QueryBuilder sin joins: Postgres no acepta FOR UPDATE sobre el lado
   * nulleable de un outer join, y `find` arrastraría el proveedor eager. Por
   * eso lo que devuelve no trae `proveedor`, y guardarla no lo toca.
   */
  private bloquear(em: EntityManager, id: string): Promise<RecurringExpense | null> {
    return em
      .createQueryBuilder(RecurringExpense, 'r')
      .where('r.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }

  /**
   * Vuelve a poner en marcha una plantilla dada de baja (#42). Dos modos,
   * porque no se sabe si el servicio siguió mientras estuvo parada:
   * - `pendiente`: genera desde donde quedó (`proxima_generacion`), incluidos
   *   los vencimientos del hueco. Es lo que corresponde si se siguió pagando.
   * - `hoy`: saltea lo vencido y retoma en el primer vencimiento desde hoy.
   *
   * «Hoy» es la fecha del taller y no `new Date()`: en Render (UTC), pasadas
   * las 21 de Argentina, ya sería mañana y se salteaba un vencimiento de hoy.
   * Sólo sobre una dada de baja: sobre una activa da 400. El ERP ofrece
   * «Reactivar» sólo en las dadas de baja, así que el 400 lo ve un doble clic
   * o una segunda pestaña, y con el lock no hay dos reactivaciones que pisen
   * la `proxima_generacion` una de la otra.
   * Una plantilla terminada por «Hasta» queda activa y no genera: para eso
   * hay que extender «Hasta».
   */
  async reactivar(id: string, desde: DesdeReactivar) {
    const guardado = await this.dataSource.transaction(async (em) => {
      const recurrente = await this.bloquear(em, id);
      if (!recurrente) throw new NotFoundException('Recurrencia inexistente');
      if (recurrente.activo) {
        throw new BadRequestException(
          'Este gasto fijo ya está activo: no hay nada que reactivar. Si terminó por «Hasta», extendé «Hasta».',
        );
      }
      recurrente.activo = true;
      if (desde === 'hoy') {
        recurrente.proxima_generacion = primeraNoAnteriorA(
          fechaLocal(recurrente.proxima_generacion),
          fechaLocal(fechaDelTaller()),
          recurrente.frecuencia,
          recurrente.dia_vencimiento,
        );
      }
      return em.save(RecurringExpense, recurrente);
    });
    const hasta = this.horizonte();
    if (this.generaAhora(guardado, hasta)) await this.generarDe(guardado, hasta);
    return (await this.recurrenteRepo.findOne({ where: { id } }))!;
  }

  /**
   * La plantilla llegó a su «Hasta»: la próxima ocurrencia cae después. No es
   * una baja: sigue activa, y extender «Hasta» la vuelve a poner en marcha.
   */
  private terminada(r: RecurringExpense): boolean {
    return !!r.fecha_fin && fechaLocal(r.proxima_generacion) > fechaLocal(r.fecha_fin);
  }

  private generaAhora(r: RecurringExpense, hasta: Date): boolean {
    return r.activo && !this.terminada(r) && fechaLocal(r.proxima_generacion) <= hasta;
  }

  async eliminar(id: string) {
    const recurrente = await this.recurrenteRepo.findOne({ where: { id } });
    if (!recurrente) throw new NotFoundException('Recurrencia inexistente');
    // Se desactiva en vez de borrarse: los gastos ya generados siguen
    // apuntando a esta plantilla conceptualmente, y perder el motivo por el que
    // existen complica cualquier auditoría posterior.
    recurrente.activo = false;
    return this.recurrenteRepo.save(recurrente);
  }

  // ─── Generación ─────────────────────────────────────────────────────────

  /**
   * Corre todos los días a las 6 de la mañana.
   *
   * La hora no es casual: temprano, antes de que abra el local, para que los
   * vencimientos del día ya estén cargados cuando alguien mire la pantalla.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async generarProgramado() {
    try {
      const resultado = await this.generarPendientes();
      if (resultado.generados > 0) {
        this.logger.log(`Gastos recurrentes generados: ${resultado.generados}`);
      }
    } catch (err) {
      // Que falle la generación no puede tumbar el proceso.
      this.logger.error(`Falló la generación de recurrentes: ${(err as Error).message}`);
    }
  }

  /**
   * Días hacia adelante que se materializan. Una obligación conocida no debe
   * ser invisible hasta el día que vence: con la ventana, el gasto existe con
   * su fecha_vencimiento real y aparece en Vencimientos y Cuentas por Pagar
   * con tiempo para decidir cuándo pagarlo. No distorsiona presupuestos: el
   * gasto lleva `fecha` = día de vencimiento, impacta el mes correcto.
   */
  private static readonly DIAS_ANTICIPACION = 30;

  /**
   * Genera todos los gastos que vencen hasta el horizonte (hoy + 30 días).
   *
   * Es idempotente por diseño: avanza `proxima_generacion` dentro de la misma
   * transacción que crea el gasto, así que correrlo dos veces el mismo día no
   * duplica nada. También recupera lo atrasado — si el sistema estuvo tres días
   * caído, genera los tres.
   */
  async generarPendientes(hasta: Date = this.horizonte()) {
    const vencidas = await this.recurrenteRepo.find({
      where: { activo: true, proxima_generacion: LessThanOrEqual(hasta) },
    });

    const creados: { numero_gasto: string; descripcion: string; monto: number }[] = [];
    for (const recurrente of vencidas) {
      creados.push(...(await this.generarDe(recurrente, hasta)));
    }

    return { generados: creados.length, gastos: creados };
  }

  /**
   * Hoy del taller + 30 días, a mediodía local como los vencimientos. Con
   * `new Date()` se comparaban instantes: a la mañana el vencimiento de
   * dentro de 30 días quedaba afuera, y en Render (UTC), pasadas las 21 de
   * Argentina, la ventana se corría un día.
   */
  private horizonte(): Date {
    const h = fechaLocal(fechaDelTaller());
    h.setDate(h.getDate() + RecurringExpensesService.DIAS_ANTICIPACION);
    return h;
  }

  /**
   * Genera las ocurrencias de UNA plantilla hasta el horizonte, en su propia
   * transacción: que una falle no debe impedir que se generen las demás. Es
   * la unidad que comparten el cron/botón (todas las plantillas) y el alta
   * (solo la recién creada).
   */
  private async generarDe(
    recurrente: RecurringExpense,
    hasta: Date,
  ): Promise<{ numero_gasto: string; descripcion: string; monto: number }[]> {
    const creados: { numero_gasto: string; descripcion: string; monto: number }[] = [];
    // Terminada por «Hasta»: no hay nada que generar y no se toca. Antes se
    // la daba de baja acá (`activo = false`), y extender «Hasta» después no la
    // revivía: el alquiler renovado dejaba de generarse sin aviso (#42).
    if (this.terminada(recurrente)) return creados;
    try {
      await this.dataSource.transaction(async (em) => {
        // La copia de afuera puede estar vieja: el cron de las 6, el arranque,
        // el botón «Generar» y editar o reactivar corren sin coordinarse. Con
        // esa copia, dos corridas creaban el mismo vencimiento dos veces. Se
        // relee la fila con FOR UPDATE: la segunda corrida espera el commit
        // de la primera y ve la `proxima_generacion` ya avanzada.
        // QueryBuilder sin joins: Postgres no acepta FOR UPDATE sobre el lado
        // nulleable de un outer join, y el `find` arrastraría el proveedor eager.
        const r = await em
          .createQueryBuilder(RecurringExpense, 'r')
          .where('r.id = :id', { id: recurrente.id })
          .setLock('pessimistic_write')
          .getOne();
        if (!r || !r.activo || this.terminada(r)) return;
        // El proveedor (relación eager) se lee ya con la fila bloqueada, así
        // que también es el vigente.
        const proveedor = (await em.findOne(RecurringExpense, { where: { id: r.id } }))?.proveedor;
        const paraGasto = Object.assign(new RecurringExpense(), r, { proveedor });

        let cursor = fechaLocal(r.proxima_generacion);
        let vueltas = 0;

        while (cursor <= hasta && vueltas < 24) {
          if (r.fecha_fin && cursor > fechaLocal(r.fecha_fin)) break;

          const gasto = await this.crearGasto(em, paraGasto, cursor);
          creados.push({
            numero_gasto: gasto.numero_gasto,
            descripcion: gasto.descripcion,
            monto: Number(gasto.monto),
          });

          r.ultima_generacion = cursor;
          r.generados += 1;
          cursor = siguienteFecha(cursor, r.frecuencia, r.dia_vencimiento);
          vueltas++;
        }

        // `r` no trae la relación: el save no toca el proveedor.
        r.proxima_generacion = cursor;
        await em.save(RecurringExpense, r);
      });
    } catch (err) {
      this.logger.error(
        `Recurrencia "${recurrente.descripcion}" falló: ${(err as Error).message}`,
      );
    }
    return creados;
  }

  private async crearGasto(
    em: EntityManager,
    recurrente: RecurringExpense,
    fecha: Date,
  ): Promise<Expense> {
    const year = fecha.getFullYear();
    const prefix = `GST-${year}-`;
    // Misma clave, carácter por carácter, que la recepción de OC
    // (`purchase-receiving.service.ts`): si no, las dos no se excluyen y una
    // colisión del correlativo rompe el unique, el catch de generarDe la traga
    // y la plantilla no genera nada hasta el día siguiente.
    await bloquearNumeracion(em, `numero_gasto:${prefix}`);
    const ultimo = await em
      .createQueryBuilder(Expense, 'e')
      .where('e.numero_gasto LIKE :prefix', { prefix: `${prefix}%` })
      // SEG-45: desde el cron no hay tenant: sin esto tomaba el máximo de
      // TODOS los talleres (saltos en la numeración que dejan ver el volumen
      // de gastos de los otros).
      .andWhere('e.company_id = :empresaDelGasto', { empresaDelGasto: recurrente.companyId })
      .orderBy('LENGTH(e.numero_gasto)', 'DESC')
      .addOrderBy('e.numero_gasto', 'DESC')
      .getOne();

    const monto = dec(Number(recurrente.monto));
    const umbral = await this.umbral(recurrente.companyId);

    const gasto = em.create(Expense, {
      numero_gasto: siguienteCorrelativo(prefix, ultimo?.numero_gasto),
      fecha,
      categoria: recurrente.categoria,
      descripcion: recurrente.descripcion,
      monto,
      neto: monto,
      iva: 0,
      percepciones: 0,
      metodo_pago: recurrente.metodo_pago,
      proveedor: recurrente.proveedor,
      fecha_vencimiento: fecha,
      // Nace pendiente de pago, no pagado: que se genere solo no significa que
      // el dinero ya salió.
      estado_pago: EstadoPagoGasto.PENDIENTE,
      monto_pagado: 0,
      estado_aprobacion:
        umbral > 0 && monto >= umbral ? EstadoAprobacion.PENDIENTE : EstadoAprobacion.APROBADO,
      notas: `Generado automáticamente · ${recurrente.frecuencia}`,
      companyId: recurrente.companyId,
      created_at: new Date(),
      // La plantilla no tiene empleado: lo generó el sistema.
      empleado: null as never,
    });

    return em.save(Expense, gasto);
  }

  private async umbral(companyId?: string): Promise<number> {
    if (!companyId) return 0;
    const s = await this.settingsRepo.findOne({ where: { companyId } });
    return Number(s?.umbral_aprobacion ?? 0);
  }
}
