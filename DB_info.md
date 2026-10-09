# DB_info

## Fecha de nacimiento y position de User

### `dateOfBirth` (`register` y `updateUser`)
Formato estricto `YYYY-MM-DD` (fecha real: `2001-02-30` es invalida). Todo se calcula en UTC. Los terminos exigen
16 anios minimo; maximo 100. Constantes `MIN_AGE = 16` y `MAX_AGE = 100` en `src/users/validation/credentials.ts`.
Error -> 400 `VALIDATION_ERROR`, `field: "dateOfBirth"`, con uno de estos `code`:
- `DATE_OF_BIRTH_INVALID`: formato distinto (`01/02/2000`, con hora, `""`) o fecha inexistente
- `DATE_OF_BIRTH_TOO_YOUNG`: menor de 16 al dia de hoy (incluye fechas futuras)
- `DATE_OF_BIRTH_TOO_OLD`: mas de 100 anios

En `register` el error viene junto a los demas (email, password, role, ...) en UNA sola respuesta `VALIDATION_ERROR`.
No enviar el campo (o `null`) lo deja sin validar.

### CHECK en DB
Migracion `20261009120000_add_user_dateofbirth_check`: `CHECK ("dateOfBirth" IS NULL OR "dateOfBirth" >= DATE '1900-01-01') NOT VALID`
(constraint `User_dateOfBirth_min_check`). La edad minima/maxima NO esta en la DB porque depende de la fecha actual.
`NOT VALID`: filas viejas no se escanean, pero un UPDATE sobre una fila que viole el CHECK falla igual. Tras limpiar:
`ALTER TABLE "User" VALIDATE CONSTRAINT "User_dateOfBirth_min_check";`

### `position`
Solo el rol PLAYER guarda `position`. Valores: `goalkeeper | defender | midfielder | attacker`. Otro valor para un PLAYER
-> 400 `VALIDATION_ERROR`, `field: "position"`, `code: "POSITION_INVALID"`. Para cualquier otro rol (COACH, CLUB, UMPIRE,
SUPERADMIN) se ignora lo enviado y se guarda `null`.
- `register`: usa el rol normalizado (sin rol = PLAYER).
- `updateUser`: usa el rol GUARDADO del usuario editado (no el del que llama; un admin puede editar a otro). Si no se
  envia `position` queda sin tocar; `null` la borra (PLAYER).

Migracion de datos `20261009120100_normalize_user_positions`: `Goalkeeper|Defender|Midfielder|Forward` -> `goalkeeper|defender|midfielder|attacker`
(solo PLAYER), `""` -> `NULL`, y position de roles no PLAYER -> `NULL`.

### Datos mock eliminados
Antes de esta regla se borraron 2 usuarios mock fuera de [hoy-100, hoy-16] (`1800-05-05` y `2030-01-01`). Repoblar con `pnpm prisma:seed`.

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

## Empleos guardados y postulaciones

### Guardar empleos (`SavedJob`, `@@unique([userId, jobOpportunityId])`)
- `saveJobOpportunity` es idempotente: guardar dos veces devuelve `true` (P2002 se trata como exito).
- Si el empleo no existe responde 404 `Job opportunity not found` (FK P2003 mapeada a `NotFoundException`, sin query extra).
- `unsaveJobOpportunity` usa `deleteMany`, tambien idempotente.

### Campos por usuario en `JobOpportunity` (sin N+1)
- `isSavedByCurrentUser` y `hasAppliedByCurrentUser` (`Boolean!`): `false` sin sesion.
- `hasAppliedByCurrentUser` ignora postulaciones `WITHDRAWN`.
- Se resuelven con loaders por request (`src/jobs/jobs.loaders.ts`): los jobs pedidos en el mismo tick se agrupan en UNA query
  (`savedJob.findMany` / `jobApplication.findMany` con `in`). Los loaders viven en un `WeakMap` por contexto GraphQL y por
  userId, asi que no se cachea nada entre requests ni usuarios. Aplica a cualquier camino que devuelva `JobOpportunity`
  (`jobOpportunities`, `savedJobOpportunities`, `userApplications.jobOpportunity`, ...).
- El batcher es propio (misma interfaz `load` que DataLoader): `pnpm add dataloader` fallo por permisos de symlink en Windows.

### Volver a postularse tras retirar
`@@unique([jobOpportunityId, userId])` impide una segunda fila. `applyForJob` sobre una postulacion `WITHDRAWN` la
reactiva: vuelve a `PENDING`, reemplaza `coverLetter`/`resumeUrl`, `appliedAt = now()` y limpia `reviewedAt`, `reviewedBy`
y `notes`; emite `job.application_received` otra vez. Cualquier otro estado sigue fallando con "You have already applied".
- La reactivacion es atomica (`updateMany` con `status: WITHDRAWN` en el WHERE): un doble submit o una decision del club
  entre la lectura y la escritura no se pisa; el perdedor recibe "already applied".
- `withdrawApplication` rechaza (403) retirar una postulacion `ACCEPTED` o `REJECTED` (decisiones finales del club), para que
  retirar + volver a postular no las revierta a `PENDING`. La guarda esta en el WHERE del `updateMany`, asi que una decision
  del club entre la lectura y la escritura tampoco se pisa. `PENDING`/`UNDER_REVIEW` si se pueden retirar.
- Al reactivar se conservan `reviewedAt`, `reviewedBy` y `notes` (historial del club); solo se reemplazan `status`,
  `coverLetter`, `resumeUrl` y `appliedAt`.
- "You have already applied for this job" responde 409 (`ConflictException`); antes era un `Error` plano enmascarado como 500.

## Notificaciones en tiempo real (Socket.IO)
`NotificationsGateway` autentica el socket en el handshake (cookie `st_session`, `Authorization: Bearer` o la opcion
`auth: { token }` de socket.io) con `AuthService.getUserFromRequest`; un socket anonimo o con token invalido se desconecta
antes de entrar a ninguna sala. Cada socket se une solo a `user_<userId>` de su identidad verificada. El evento `join` se
mantiene por compatibilidad pero ignora el `userId` del payload: responde `{status:"joined"}` para la sala propia,
`{status:"forbidden"}` si piden la de otro y `{status:"unauthorized"}` si no hay identidad. `sendNotification` emite a `user_<recipientId>`.
CORS del socket usa la misma lista estricta que HTTP (`src/common/cors.ts`: localhost + `FRONTEND_URL`) con `credentials: true`.
Como los navegadores no aplican CORS a WebSockets y la cookie es `SameSite=None`, el handshake tambien se filtra con
`allowRequest` (`allowRequestFromAllowedOrigin`): un `Origin` presente y fuera de la lista se rechaza (evita CSWSH). Sin
`Origin` (clientes no-navegador) se acepta, pero igual necesitan un token valido. El socket se cierra solo cuando vence el
JWT (`exp`); el logout todavia no cierra los sockets abiertos (limitacion conocida, acotada por `JWT_EXPIRES_IN`).
**Cambio para el front:** el cliente debe conectar con `withCredentials: true` (o pasar `auth: { token }`); sin credenciales el
socket se desconecta y no llegan notificaciones.

## JWT y logout (limitacion conocida)
El logout solo borra la cookie: el JWT firmado sigue siendo valido hasta `JWT_EXPIRES_IN` (default `1h`; mantenerlo corto) y
`getUserFromRequest` sigue aceptando `Authorization: Bearer`. Revocar de verdad (p. ej. `tokenVersion` en `User`) obligaria a
volver asincrono `getUserFromRequest` en todos los resolvers; se decidio documentarlo por ahora.

### Paginacion (`jobOpportunities`, `savedJobOpportunities`, `jobApplications`, `userApplications`, `getClubApplications`)
`normalizePagination` (`src/common/pagination.ts`): `limit` por defecto 50, maximo 100; `page` y `limit` deben ser enteros >= 1.
Un `limit` > 100, un valor invalido o un offset fuera del rango int32 responden 400 (no se recorta en silencio: recortar
desalinearia `skip`). Antes sin `limit` devolvian toda la tabla; ahora devuelven 50, y el SDL no expone `total`/`hasMore`.
Orden estable: fecha desc con `id` desc como desempate, para que las paginas no repitan ni pierdan filas.
El batcher parte los lotes en trozos de 500 ids (`maxBatchSize`, minimo 1) para no pasar el limite de parametros de Postgres.
Pendiente: `explore`, `news` y `report` tienen su propio manejo de `limit`.

### Invalidacion de loaders
`saveJobOpportunity`, `unsaveJobOpportunity`, `applyForJob` y `withdrawApplication` llaman a `JobsLoaders.reset(context)`
al terminar (incluso si fallan), para que un campo posterior de la misma operacion no lea valores previos a la mutacion.

## Sesion (cookie `st_session`)
`setAuthCookie` y `clearAuthCookie` usan los mismos atributos base (`authCookieBaseOptions`: httpOnly, secure, sameSite,
path). En produccion el logout emite `Set-Cookie: st_session=; Path=/; Expires=1970...; HttpOnly; Secure; SameSite=None`
(Express no emite `Max-Age=0`; el `Expires` en el pasado borra igual). `clearCookie` no recibe `maxAge`.
- `AUTH_COOKIE_CROSS_SITE=true|false` (opcional) manda sobre `NODE_ENV`: `true` fuerza `SameSite=None; Secure` (staging con el front en
  otro dominio), `false` fuerza Lax. Cualquier otro valor se ignora y se sigue `NODE_ENV` (production = cross-site).
- Con `SameSite=None` el navegador manda la cookie en requests cross-site, asi que `csrfPrevention: true` esta explicito en
  `baseGraphqlConfig` (`src/graphql.module.ts`): un POST `text/plain`/urlencoded/multipart o un GET sin cabecera de preflight
  responde 400 `BAD_REQUEST` sin ejecutar la operacion (cubierto por `graphql.module.spec.ts`).
- Limitaciones conocidas: el JWT no se revoca en el servidor al hacer logout (vive hasta `JWT_EXPIRES_IN`) y `getUserFromRequest`
  sigue aceptando `Authorization: Bearer`. Safari/Firefox estricto bloquean cookies `SameSite=None` de terceros si front y back
  no comparten dominio registrable.

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
