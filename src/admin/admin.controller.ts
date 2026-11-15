import { Controller, Post, Body, Get, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UserProtected } from '../auth/decorators/user-protected.decorator';
import { Roles } from '../enums/roles.enum';
import { CrearTallerDto } from './dto/crear-taller.dto';
import { ConfigPlataformaDto, PlanTallerDto } from './dto/plataforma.dto';
import { PlataformaService } from './plataforma.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly plataforma: PlataformaService,
  ) {}

  @Post('setup-company')
  @UserProtected(Roles.SUPERADMIN)
  createCompanyWithUsers(@Body() createData: CrearTallerDto) {
    return this.adminService.createCompanyWithUsers(createData);
  }

  @Get('companies')
  @UserProtected(Roles.SUPERADMIN)
  getCompanies() {
    return this.adminService.getCompanies();
  }

  // ─── Panel de la plataforma (spec 2026-10-28 §7) ───

  @Get('plataforma/talleres')
  @UserProtected(Roles.SUPERADMIN)
  talleresPlataforma() {
    return this.plataforma.talleres();
  }

  @Patch('plataforma/talleres/:id')
  @UserProtected(Roles.SUPERADMIN)
  cambiarPlanTaller(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanTallerDto) {
    return this.plataforma.cambiarPlan(id, dto);
  }

  @Get('plataforma/config')
  @UserProtected(Roles.SUPERADMIN)
  configPlataforma() {
    return this.plataforma.config();
  }

  @Patch('plataforma/config')
  @UserProtected(Roles.SUPERADMIN)
  guardarConfigPlataforma(@Body() dto: ConfigPlataformaDto) {
    return this.plataforma.guardarConfig(dto);
  }
}
