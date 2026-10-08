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

## Imagenes de perfil (avatar, cover, escudo)

Columnas: `User.avatar`, `User.coverImage`, `Club.logo`, `Club.coverImage` (String?). `Club.id` = `User.id` del dueno.

### Subida firmada directa a Cloudinary
1. `createImageUploadSignature(target: ImageUploadTarget!, clubId: ID)` (requiere sesion, 20/min). Targets: `USER_AVATAR`, `USER_COVER`, `CLUB_LOGO`, `CLUB_COVER`.
   - `USER_*`: carpeta `stick-transfer/users/{userId}` del usuario con sesion.
   - `CLUB_*`: solo rol `CLUB` (carpeta `stick-transfer/clubs/{userId}`; `clubId` opcional, debe ser el propio) o `SUPERADMIN` (`clubId` obligatorio). Otro rol: 403. Sin sesion: 401.
2. El navegador hace POST multipart a `uploadUrl` con EXACTAMENTE: `file`, `api_key`, `timestamp`, `signature`, `public_id` (= `publicId` devuelto, ruta completa), `overwrite=true`, `invalidate=true`, `allowed_formats=jpg,png,webp`. No enviar `folder` ni otro parametro: Cloudinary rechaza la firma.
3. `publicId` es fijo por target (`.../avatar`, `.../cover`, `.../logo`, `.../club-cover`): cada subida reemplaza la anterior.
4. Se guarda el `secure_url` devuelto con `updateUser(avatar|coverImage)` o `updateClub(logo|coverImage)`.

### Validacion de URLs guardadas (`IMAGE_URL_INVALID`, 400)
`updateUser` y `updateClub` aceptan en esos campos solo: omitido, `null`/`""` (quita la imagen, se guarda null), el valor ya guardado (URLs legacy: randomuser.me, images.unsplash.com, res.cloudinary.com) o una URL `https://res.cloudinary.com/{cloud}/image/upload/[v123/]stick-transfer/(users|clubs)/{ownerId}/...` solo con caracteres `[A-Za-z0-9._~/:-]`. Si no: `extensions.code=VALIDATION_ERROR`, `fields[0] = {field: avatar|coverImage|logo, code: IMAGE_URL_INVALID}`.

### updateClub
Ahora acepta `logo`, `coverImage`, `city`, `country`. `city`/`country` null = sin cambio; vacio = 400.

### Legacy base64 (deprecadas, no se borran)
`uploadAvatar`, `uploadCoverImage`, `uploadClubLogo`, `uploadClubCoverImage` siguen funcionando pero exigen `data:image/(jpeg|png|webp);base64,` (si no: `IMAGE_FORMAT_INVALID`). Nadie del front las usa.

### Limitaciones conocidas
- Un SUPERADMIN no puede firmar subidas de avatar/cover de otro usuario (solo de clubes via `clubId`).
- Los valores legacy ya guardados se siguen aceptando si el form los reenvia sin cambios.
