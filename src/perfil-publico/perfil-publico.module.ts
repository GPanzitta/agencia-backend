import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PerfilPublico } from './entities/perfil-publico.entity';
import { PerfilPublicoController } from './perfil-publico.controller';
import { PerfilPublicoService } from './perfil-publico.service';
import { Company } from '../companies/entities/company.entity';
import { AuthModule } from '../auth/auth.module';
import { FotosAlmacenModule } from '../orden-fotos/fotos-almacen.module';
import { ConsultorOembed, ConsultorOembedYoutube } from './oembed.consultor';

/** El perfil público del taller: lo edita el ERP, lo lee la home del comercio. */
@Module({
  imports: [TypeOrmModule.forFeature([PerfilPublico, Company]), AuthModule, FotosAlmacenModule],
  controllers: [PerfilPublicoController],
  providers: [
    PerfilPublicoService,
    // El real sale a YouTube; los specs inyectan `ConsultorOembedFalso`.
    { provide: ConsultorOembed, useClass: ConsultorOembedYoutube },
  ],
  // `UnidadesModule` lo usa para `GET /catalogo/perfil`.
  exports: [PerfilPublicoService],
})
export class PerfilPublicoModule {}
