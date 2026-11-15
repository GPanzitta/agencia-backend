/**
 * Roles de Taller: los cinco puestos reales del negocio más el superadmin
 * de la plataforma. El superadmin no se lista en los @UserProtected: el
 * UserRoleGuard lo deja pasar siempre.
 */
export enum Roles {
    SUPERADMIN = 'superadmin',
    ADMIN = 'admin',
    MOSTRADOR = 'mostrador',
    TECNICO = 'tecnico',
    PANOL = 'panol',
    /** T6b — Sale a la calle: retira y entrega equipos, y cobra en la puerta. */
    CHOFER = 'chofer',
}
