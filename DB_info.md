# DB_info

## Oportunidades UMPIRE

### Enum de DB `PositionType`
`PLAYER | COACH | STAFF | UMPIRE | OTHER` (migracion `20261003120000_add_umpire_job_opportunities`).
En GraphQL `positionType` sigue siendo `String`. Se acepta case-insensitive ("umpire" -> "UMPIRE") en
`createJobOpportunity` y en `JobOpportunityFiltersInput.positionType`. Valor invalido -> 400:

    Invalid positionType. Allowed: PLAYER, COACH, STAFF, UMPIRE, OTHER

### Campos nuevos en `JobOpportunity` (todos opcionales, solo con positionType UMPIRE)
- `licenseLevelRequired: UmpireLicenseLevel` (REGIONAL | NACIONAL | INTERNACIONAL), filtro por igualdad
- `modality: UmpireModality` (CESPED | SALA | INDOOR)
- `umpireCategory: UmpireCategory` (JUVENIL | MAYORES | MASCULINO | FEMENINO | VETERANOS)
- `matchDate: String` (ISO 8601, DateTime en DB, indexado)

Enviarlos con un positionType distinto de UMPIRE -> 400:
`licenseLevelRequired, modality, umpireCategory and matchDate are only allowed when positionType is UMPIRE`

### Permisos
- Crear/editar/borrar: solo role CLUB (dueno) o SUPERADMIN para update/delete. Sin cambios.
- `applyForJob` sobre job UMPIRE: solo role UMPIRE o SUPERADMIN. Otros -> 403
  `Only umpires can apply to UMPIRE job opportunities`.
- `applyForJob` sobre PLAYER/COACH/STAFF/OTHER: sin cambios (cualquier autenticado).
- `applyForJob` con job inexistente -> 404 `Job opportunity not found` (antes 500 enmascarado).

### Notificaciones
`APPLICATION_RECEIVED` se emite igual (`job.application_received`, recipient = club). `JobApplication.user`
devuelve el `User` completo, incluyendo campos umpire (`licenseLevel`, `modalities`, `umpireCategories`, ...).

### Admin
No existe `adminJobOpportunities`. `jobOpportunities(filters: {positionType: "UMPIRE"})` es publico y sirve
para listar. `adminDashboardStats` suma `umpireJobsCount` y `umpireApplicationsCount`.

### Seed (`pnpm prisma:seed`)
4 jobs UMPIRE (OPEN) en clubs[0] Madrid (NACIONAL/CESPED/MASCULINO), clubs[1] Barcelona (REGIONAL/SALA/JUVENIL),
clubs[5] Buenos Aires (INTERNACIONAL/CESPED/FEMENINO), clubs[10] Rotterdam (REGIONAL/INDOOR/VETERANOS).
1 application de `umpire_garcia` al job de Madrid. Los ids son uuid generados en cada seed.
