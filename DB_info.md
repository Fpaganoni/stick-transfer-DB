# DB_info

## Paises (`User.country`, `JobOpportunity.country`)

`Club.country` ya no es una columna: el pais de un club es el `User.country` de su cuenta (ver "Identidad de club").
Se guardan como codigo ISO 3166-1 alfa-2 en mayuscula (`"AR"`, `"ES"`, `"NL"`), mas `GB-ENG`, `GB-SCT` y `GB-WLS`
(Inglaterra, Escocia y Gales juegan por separado). Lista cerrada en `src/common/geo/countries.ts` (`COUNTRY_CODES`).
El front muestra el nombre a partir del codigo (por ejemplo `Intl.DisplayNames`).

### Entrada (`register`, `updateUser`, `createClub`, `updateClub`, `createJobOpportunity`)
Se acepta el codigo en cualquier caso y con espacios (`" ar "` se guarda `"AR"`). Cualquier otra cosa (nombre, bandera,
`""`) -> 400 `VALIDATION_ERROR`, `field: "country"`, `code: "COUNTRY_INVALID"`.
- `register`: opcional (obligatorio para CLUB, que sin pais sigue dando `FIELD_REQUIRED`).
- `updateUser`: sin enviar = sin cambio; `null` = borrar.
- `updateClub`: `null` = sin cambio (columna obligatoria); `""` -> `COUNTRY_INVALID`.
- `createClub` / `createJobOpportunity`: obligatorio.

### Filtros (`jobOpportunities`, `exploreUsers`, `exploreClubs`)
Igualdad sobre el codigo normalizado: `"ar"` encuentra `"AR"`. Un valor desconocido (`"Argentina"`) devuelve lista
vacia, sin error. `availableCountries` devuelve codigos.

### Migracion `20261010120000_normalize_country_codes`
Generada por `prisma/scripts/generate-country-mapping.ts` (no editar a mano; regenerar con
`npx ts-node prisma/scripts/generate-country-mapping.ts`). Mapea banderas emoji, nombres en/es/fr (con y sin acentos),
`"🇪🇸 España"` y los alias de las home nations (England/Inglaterra/...). Lo que no mapea queda igual; `User.country = ""`
pasa a `NULL`. Agrega `CHECK (country IS NULL OR country ~ '^[A-Z]{2}(-[A-Z]{3})?$') NOT VALID` en las 3 tablas
(`<Tabla>_country_format_check`). Con NOT VALID una fila vieja sin mapear bloquea cualquier UPDATE de esa fila. Tras
confirmar que no queda ninguna: `ALTER TABLE "<Tabla>" VALIDATE CONSTRAINT "<Tabla>_country_format_check";`

## Multimedia de UMPIRE

Los perfiles UMPIRE no tienen multimedia.
- `updateUser` con `multimedia` (cualquier valor, incluso `[]`) sobre un usuario cuyo rol GUARDADO es UMPIRE -> 400
  `VALIDATION_ERROR`, `field: "multimedia"`, `code: "FIELD_NOT_ALLOWED"`.
- `User.multimedia` devuelve siempre `[]` para UMPIRE (y `[]` en vez de `null` para filas viejas de otros roles).
- Migracion `20261010120200_remove_umpire_multimedia`: borra los UMPIRE que tenian multimedia (datos mock; en Supabase
  era 1 usuario) y agrega `CHECK ("role" <> 'UMPIRE' OR "multimedia" IS NULL OR cardinality("multimedia") = 0)`
  (`User_umpire_no_multimedia_check`, validado).

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
- `modality: UmpireModality` (OUTDOOR | INDOOR). El mismo enum usa `User.modalities`. Antes era
  CESPED | SALA | INDOOR; la migracion `20261010120100_umpire_modality_outdoor_indoor` mapea CESPED -> OUTDOOR y
  SALA/INDOOR -> INDOOR (en el array sin duplicados). Valores viejos en filtros o en `createJobOpportunity` -> 400
  `Invalid modality. Allowed: OUTDOOR, INDOOR` (GraphQL ya los rechaza por el enum).
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
6 jobs UMPIRE (OPEN) en clubs[0] Madrid (NACIONAL/OUTDOOR/MASCULINO), clubs[1] Barcelona (REGIONAL/INDOOR/JUVENIL),
clubs[5] Buenos Aires (INTERNACIONAL/OUTDOOR/FEMENINO), clubs[10] Rotterdam (REGIONAL/INDOOR/VETERANOS),
clubs[3] Terrassa (REGIONAL/OUTDOOR/FEMENINO) y clubs[6] Buenos Aires (NACIONAL/OUTDOOR/MAYORES).
Paises del seed: `ES`, `AR`, `NL`.
`umpire_garcia` tiene 4 postulaciones (PENDING, UNDER_REVIEW, ACCEPTED, REJECTED) sobre los 4 primeros y guardo los 2
ultimos. Los ids son uuid generados en cada seed. Ver "Cuentas de prueba por rol".

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

Columnas: `User.avatar` y `User.coverImage` (String?). Para un CLUB el escudo es `User.avatar` y la portada
`User.coverImage` (`Club.logo` / `Club.coverImage` son campos GraphQL que leen esas columnas). `Club.id` = `User.id`.
Para un CLUB valen las URLs de `stick-transfer/users/{id}` Y de `stick-transfer/clubs/{id}` (mismo id): los targets
`USER_AVATAR`/`USER_COVER` y `CLUB_LOGO`/`CLUB_COVER` sirven los dos.

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
Ahora acepta `logo`, `coverImage`, `city`, `country`. `city`/`country` null = sin cambio; vacio = 400 (`country` debe
ser un codigo, ver "Paises").

### Legacy base64 (deprecadas, no se borran)
`uploadAvatar`, `uploadCoverImage`, `uploadClubLogo`, `uploadClubCoverImage` siguen funcionando pero exigen `data:image/(jpeg|png|webp);base64,` (si no: `IMAGE_FORMAT_INVALID`). Nadie del front las usa.

### Limitaciones conocidas
- Un SUPERADMIN no puede firmar subidas de avatar/cover de otro usuario (solo de clubes via `clubId`).
- Los valores legacy ya guardados se siguen aceptando si el form los reenvia sin cambios.

## Identidad de club

La cuenta del club ES el club. La identidad vive en `User` (rol CLUB): `name` = nombre del club, `avatar` = escudo,
`coverImage`/`coverImagePosition` = portada, `bio` = bio corta, `city`/`country` = sede. `Club` (mismo id) conserva solo:
`description`, `league`, `foundedYear`, `email`, `phone`, `website`, `instagram`, `twitter`, `facebook`, `tiktok`,
`benefits`, `isVerified`, `verificationStatus`, `verificationDoc`, `managedByFirstName`, `managedByLastName`.
`Club.email` es el contacto publico del club; `User.email` es el login (privado).

- **Nombre unico**: `User.clubNameKey` (`@unique`, NULL fuera de CLUB). Lo calcula SOLO la DB: funcion IMMUTABLE
  `club_name_key(text)` + trigger `User_club_name_key_trg` (BEFORE INSERT/UPDATE OF name, role). Algoritmo: NFKC, NFD, quitar
  U+0300-U+036F, minusculas, colapsar espacios (incluye NBSP), trim. `normalizeClubNameKey` (`src/clubs/club-name.ts`)
  es el gemelo en TS solo para el pre-check; si discrepan manda el indice (P2002 -> `CLUB_NAME_TAKEN`). Los nombres de
  persona NO son unicos (Google sign-up crea usuarios con `displayName`). Se descarto `unaccent` (STABLE, y trata
  ø/ß distinto que JS).
- `CHECK User_club_location_check`: un CLUB siempre tiene `city` y `country` (por eso `Club.city/country` son `String!`).
- `clubs` y `exploreClubs` solo listan cuentas con `isActive = true` Y rol CLUB. `adminChangeUserRole` rechaza (400)
  pasar a o desde CLUB: un cambio de rol suelto no puede crear ni desarmar la fila `Club`, la clave de nombre ni la ubicacion.
- Nombres (club y `managedBy*`): maximo 100 caracteres y sin caracteres de control ni invisibles (`NAME_INVALID`).
- Los campos de persona (`dateOfBirth`, `level`, `yearsOfExperience`, `clubId`, `cvUrl`, `multimedia`) se limpian para los CLUB
  en la migracion; `updateUser` no los bloquea (pendiente si se quiere).

### Migracion de identidad (2 pasos, pensada para una DB con datos)
1. `20261014140000_club_identity_expand`: crea `club_name_key`, **preflight** (aborta con la lista de ids si hay: CLUB sin fila
   Club, Club cuyo usuario no es CLUB, `Club.country` sin normalizar, nombre/ciudad en blanco, o nombres que chocan ignorando
   mayusculas/acentos/espacios), **respaldo** en `backup.club_identity_20261014` (schema aparte: Prisma no lo ve), agrega
   `clubNameKey` + trigger, copia la identidad SOLO para `role = 'CLUB'` (`Club.logo` -> `avatar` aunque sea NULL; portada, posicion
   y bio SOLO del club, nunca se rellenan con los de la persona), limpia los campos de persona, crea el indice unico, el CHECK
   y `User(role, name)`. Aditiva: no borra nada de `Club`.
2. `20261014140100_club_identity_contract`: dropea de `Club` `name`, `logo`, `coverImage`, `coverImagePosition`, `bio`, `city`,
   `country`, `videos` y sus indices/CHECK.
- **Despliegue (importante)**: `prisma migrate deploy` aplica TODAS las migraciones pendientes juntas, asi que los dos
  pasos corren uno tras otro. El codigo viejo no funciona con ninguno de los dos (el paso 1 agrega el CHECK de
  ubicacion, el indice unico y el trigger; el paso 2 borra columnas que el codigo viejo lee). Por eso: aplicar con una
  **ventana de mantenimiento** (escrituras detenidas, deploy del codigo nuevo en la misma ventana), o publicar el archivo
  del paso 2 en un release posterior. Usar la conexion directa (puerto 5432), no el pooler (pgbouncer). Ambos archivos
  empiezan con `SET LOCAL lock_timeout = '5s'`: si la tabla esta ocupada fallan rapido en vez de bloquear lecturas; reintentar
  (si queda en estado fallido, `prisma migrate resolve --rolled-back <nombre>`). El paso 1 toma un lock exclusivo sobre
  `"User"` hasta el commit (ADD COLUMN, UPDATE, indices): rapido con pocos miles de filas; con muchas, medir antes.
- Si el preflight aborta: la transaccion de Prisma revierte todo; corregir los datos y reintentar.
- El nombre de la persona que administraba un club con `managedBy = 'Sin definir'` (club viejo) se copia a `managedBy` ANTES
  de que `User.name` pase a ser el nombre del club.
- `club_name_key` aplica NFKC + NFD: formas de compatibilidad (`Ｒeal`, `①`, ligaduras) colisionan con su version normal.
  No cubre homoglifos de otro alfabeto (cirilico `а` vs latino `a`): `isVerified` es la mitigacion visible para los usuarios.
  `lower()` depende de la collation de la base (en `C` solo ASCII); tras NFD la parte latina queda ASCII, pero una
  restauracion en una base con otra collation podria cambiar las claves. Los nombres de club no admiten caracteres de
  control ni invisibles (`NAME_INVALID`).
- **Rollback** (antes del paso 2). Las ediciones hechas en `Club` despues del paso 1 estan en `User` y se pierden.
  Secuencia completa (el `UPDATE` vuelve a disparar el trigger y los CHECK, por eso se sueltan primero):
  1. `DROP TRIGGER "User_club_name_key_trg" ON "User"; DROP INDEX "User_clubNameKey_key"; DROP INDEX "User_role_name_idx"; ALTER TABLE "User" DROP CONSTRAINT "User_club_location_check";`
  2. `UPDATE "User" u SET name=b.user_name, avatar=b.user_avatar, "coverImage"=b.user_cover_image, "coverImagePosition"=b.user_cover_position, bio=b.user_bio, city=b.user_city, country=b.user_country, "dateOfBirth"=b.user_date_of_birth, level=b.user_level, "yearsOfExperience"=b.user_years_of_experience, "clubId"=b.user_club_id, "cvUrl"=b.user_cv_url, multimedia=b.user_multimedia FROM backup.club_identity_20261014 b WHERE b.id=u.id;` (un `dateOfBirth` anterior a 1900 falla el CHECK NOT VALID: poner `NULL`).
  3. `ALTER TABLE "User" DROP COLUMN "clubNameKey"; DROP FUNCTION user_set_club_name_key(); DROP FUNCTION club_name_key(text);`
  Despues del paso 2 hay que restaurar `Club` desde el respaldo (`club_*`) o desde un backup/PITR: tomar un `pg_dump`
  antes de aplicar en produccion.
- **Respaldo = datos personales** (fecha de nacimiento, CV, multimedia de los administradores): el schema `backup` queda
  cerrado (`REVOKE` a PUBLIC/anon/authenticated y RLS sin politicas). Una vez verificado el paso 1, vaciar lo personal
  (`UPDATE backup.club_identity_20261014 SET user_date_of_birth=NULL, user_cv_url=NULL, user_multimedia=NULL, user_level=NULL, user_years_of_experience=NULL;`)
  y borrar el schema en 30 dias como maximo: `DROP SCHEMA backup CASCADE;`. Los `pg_dump`/PITR existentes conservan esos datos.
- Verificado en una DB local descartable: 42 migraciones desde cero, `prisma migrate diff` sin diferencias, y una prueba con
  datos (identidad copiada, trigger, indice unico, CHECK, paridad SQL/TS, los 4 abortos del preflight).

## Cuentas de prueba por rol (`pnpm prisma:seed`)

Solo el email; la contrasena de desarrollo esta en `prisma/seed.ts`. Cada cuenta de prueba tiene datos para probar
"Mis postulaciones", empleos guardados y los contadores de follows.

| Rol | Email | Que tiene |
|-----|-------|-----------|
| PLAYER | `lucia@hockey-test.com` (`lucia_jimenez`) | 4 postulaciones (PENDING, UNDER_REVIEW, ACCEPTED, REJECTED), 3 guardados, sigue a 3 usuarios y 3 clubes, tiene seguidores |
| COACH | `coach.martinez@hockey-test.com` | 4 postulaciones (3 COACH + 1 STAFF, estados distintos), 3 guardados, sigue a 3 usuarios y 2 clubes |
| UMPIRE | `umpire.garcia@hockey-test.com` | 4 postulaciones (estados distintos), 2 guardados, sigue a 2 usuarios y 3 clubes |
| CLUB | `admin.campomadrid@hockey-test.com` (`ccvillamadrid`) | Club verificado; sigue a `lucia_jimenez` como CLUB |
| CLUB sin verificar | `admin.italiano@hockey-test.com` (`clubitaliano`) | Para probar la verificacion |
| SUPERADMIN | `superadmin@hockey-test.com` | Panel admin |

Los 12 clubes: usuario = slug corto (`ccvillamadrid`, `rcpolobarcelona`, `realclubpolo`, `cdterrassa`, `atleticterrassa`,
`casanisidro`, `belgranoac`, `gimnasiaesgrima`, `clubitaliano`, `lomasathletic`, `hcrotterdam`, `amsterdamhc`), `name` = nombre
del club, `avatar` = logo, portada y bio del club, `managedBy` = la persona que antes estaba en `name`. El seed hace un HEAD a
cada logo/portada: lo que no responde 200 se guarda como `null` y se lista al final (`broken image URLs`); sin red conserva la
URL y avisa. Ultima corrida: 0 rotas (las 4 portadas de unsplash que daban 404 se cambiaron por otras ya verificadas). Termina
con un assert: falla si dos clubes comparten `clubNameKey` o si algun CLUB no tiene clave.

## Contrato para el FRONT (fase 2)

**Lo que cambio**
- `User` de rol CLUB: `name` es el nombre del CLUB y `avatar` el escudo (ya no la persona ni una foto de randomuser). La
  persona que administra esta en `User.clubProfile.managedBy` (privado).
- **Nuevo** `User.clubProfile: Club` (null si no es CLUB). `me` y `getUserByUsername` traen identidad + datos del club en un
  solo request. Se resuelve por lote (sin N+1).
- `Club.name`, `logo`, `coverImage`, `coverImagePosition`, `bio`, `city`, `country`: misma forma que antes, ahora leidos del
  `User` duenio. `Club.logo` es `User.avatar`. `Club.user` siempre resuelve.
- `Club.managedBy` pasa a **nullable**: solo lo ven el propio club y SUPERADMIN (los demas reciben `null`). Regenerar los tipos.
- `ClubAdminView.adminName` es ahora el nombre de `managedBy`; `adminAvatar` es el escudo del club.
- `clubs` y `exploreClubs` ya no devuelven clubes de cuentas desactivadas (`isActive = false`). `availableCountries` sale solo
  de `User`.
- `isUsernameAvailable`: con sesion, el username propio devuelve `true` (validar al editar el perfil).

**Mutations**
- `register` (CLUB): el nombre de la cuenta es `clubName`; el argumento `name` se IGNORA (sigue siendo `String!`, mandar
  cualquier valor no vacio). `managedByFirstName`/`managedByLastName` obligatorios. Los errores de nombre salen con
  `field: "clubName"`. Usuario y club se crean juntos.
- `updateClub`: acepta identidad (`name`, `username`, `bio`, `logo`, `coverImage`, `coverImagePosition`, `city`, `country`) +
  datos de club, en una sola transaccion. `city`/`country` en `null` = sin cambio; en blanco = 400. Un id que no es un
  club -> 404. Para un CLUB valen las URLs de imagen de `users/{id}` y de `clubs/{id}`.
- `updateUser` sobre un CLUB: `name` sigue la misma regla de nombre unico; `city`/`country` no se pueden borrar. `name` se valida
  (vacio o > 100 caracteres -> `NAME_REQUIRED` / `NAME_TOO_LONG`) para todos los roles.
- `createClub`: ahora tambien escribe `name`, `city` y `country` en el usuario. `register` ya lo hace; solo sirve para una
  cuenta CLUB sin fila de club.

**Deprecated**
- `Club.videos` (siempre `[]`) y el argumento `updateClub(videos:)` (ignorado). Quitarlos del front.
- `uploadAvatar`, `uploadCoverImage`, `uploadClubLogo`, `uploadClubCoverImage` (ya lo estaban).

**Errores nuevos y relevantes**
- `CLUB_NAME_TAKEN`: HTTP 409, `extensions.code`, `field: "name"` (`updateClub`, `updateUser`, `createClub`) o `"clubName"`
  (`register`). Compara ignorando mayusculas, acentos y espacios repetidos.
- `NAME_INVALID` (400, `VALIDATION_ERROR`, `field: "name" | "clubName" | "managedByFirstName" | "managedByLastName"`): el
  nombre trae caracteres de control o invisibles. `NAME_TOO_LONG` tambien aplica a `managedBy*` (maximo 100).
- `adminChangeUserRole` a o desde CLUB -> 400 `Roles cannot be changed to or from CLUB`, con `extensions.code: "ROLE_CHANGE_NOT_ALLOWED"`
  (codigo estable: el front mapea el codigo, no el texto). Un cambio de rol real sube `tokenVersion` del usuario: sus sesiones
  vigentes dejan de valer (el JWT lleva el rol). Reasignar el mismo rol no revoca nada.
- `updateJobOpportunity(status: OPEN)` sobre una vacante CLOSED/FILLED con el club ya en 5 vacantes OPEN -> 403
  `ACTIVE_JOBS_LIMIT_REACHED` (mismo tope que `createJobOpportunity`; la propia vacante no cuenta). El front lo muestra como
  "ya tenes 5 vacantes abiertas" y deja la vacante como estaba.
- `requestClubVerification(documentUrl:)` solo acepta un documento subido a la carpeta Cloudinary del propio club; si no ->
  `VALIDATION_ERROR` con `field: "documentUrl"`, `code: "DOCUMENT_URL_INVALID"`.
- Ya existentes que ahora tambien salen de `updateClub`: `USERNAME_TAKEN` (409, `field: "username"`), `IMAGE_URL_INVALID`
  (`field: "logo" | "coverImage"`), `COUNTRY_INVALID`, `FIELD_REQUIRED` (`field: "city"`).

## Un solo eje social por club y sin campos de persona (fase 3)

Una cuenta CLUB **es** el club: no es una persona y no tiene dos identidades sociales.

### Reglas
- **Follow y Report solo por el eje `CLUB`** (mismo id que el `User`). Con `USER` y el id de una cuenta CLUB el back no falla:
  lo normaliza a `CLUB` (una consulta de rol por llamada) para que clientes viejos sigan andando. Nunca hay filas `USER`
  apuntando a un club, asi que no hay dos contadores.
  - Aplica a `follow`, `unfollow`, `followers`, `following` (los dos lados: el club como seguido y como seguidor),
    `User.followersCount/followingCount/followers/following/isFollowedByCurrentUser` y `createReport`.
  - **`User.followersCount` de una cuenta CLUB == `Club.followersCount`** (misma consulta, mismo eje). Esta en el SDL.
  - Seguir dos veces (por cualquier eje) -> 400 `Already following`; reportar dos veces -> 400 `You have already reported this.`
  - `follow` ahora **notifica tambien a un club** (`NEW_FOLLOWER`, destinatario = id del club). Antes solo notificaba a personas.
  - Likes: no existen mas (`20261014130000_drop_likes`), nada que migrar.
- **Campos de persona prohibidos para CLUB** (`FIELD_NOT_ALLOWED`, 400 `VALIDATION_ERROR`): `dateOfBirth`, `cvUrl`, `position`,
  `yearsOfExperience`, `level`, `trajectories`, `multimedia`, `licenseLevel`, `certifyingBody`, `licenseNumber`,
  `certificationYear`, `matchesOfficiated`, `travelAvailability`, `languages`, `modalities`, `umpireCategories`,
  `umpireCertifications`. Cualquier valor enviado (incluso `null` o `[]`) se rechaza, todos los campos juntos en un solo error,
  y no se guarda nada. Se juzga por el rol **guardado** (un SUPERADMIN que edita un club tambien choca).
  - `updateUser`, `register` (solo `dateOfBirth` y `position` existen como argumentos) y `uploadCV` (error en `cvUrl`).
  - Lista unica en `src/users/validation/club-person-fields.ts`; la espeja el CHECK `User_club_no_person_fields_check`.
- **Una sola validacion del nombre de club**: `checkClubName` (`src/clubs/club-name.ts`) la usan `register` y
  `assertClubIdentityUpdate` (`updateClub`, `updateUser`, `createClub`). Mismos codigos y mensajes; solo cambia `field`
  (`clubName` en `register`, `name` en los demas). La disponibilidad sigue en `assertClubNameAvailable`.
- Las columnas de persona **siguen en `User`** porque las usan PLAYER, COACH y UMPIRE; para un CLUB estan siempre en `NULL`/vacio
  (servicio + CHECK). Separarlas en otra tabla (`PlayerProfile`) se evaluo y se dejo fuera de esta fase.

### Migracion `20261015120000_club_single_social_axis` (solo datos + 1 CHECK, sin drift)
- Mueve los `Follow`/`Report` con eje `USER` de cuentas CLUB al eje `CLUB` (`followingUserId` -> `followingClubId`).
  Deduplica: si ya existia el par en `CLUB`, se borra el de `USER` (el de `CLUB` gana; si el reporte `USER` ya estaba revisado
  su estado queda en el respaldo). Un follow que quedaria como auto-follow (un club que se seguia a si mismo por ejes
  distintos) se borra: violaria `Follow_no_self_follow_check`.
- Borra `Trajectory` y `UmpireCertification` de cuentas CLUB y deja en `NULL`/`{}` sus campos de persona; despues agrega
  `User_club_no_person_fields_check` **ya validado**.
- **Respaldo** en el schema `backup` (mismo cierre que `club_identity_20261014`: `REVOKE` y RLS sin politicas):
  `club_axis_follow_20261015`, `club_axis_report_20261015` (con columna `action`: `MOVE` | `DELETE_DUPLICATE` | `DELETE_SELF`),
  `club_person_fields_20261015`, `club_trajectories_20261015`, `club_umpire_certifications_20261015`. Contienen datos
  personales: borrarlos con `DROP SCHEMA backup CASCADE` cuando se verifique.
- Aborta (sin dejar nada a medias) si hay una cuenta CLUB sin fila `Club`, y termina verificando que no queda ninguna fila `USER`
  hacia un club. Imprime los conteos con `RAISE NOTICE`.
- **Conteos antes de correrla**: `pnpm ts-node prisma/scripts/club-single-axis-counts.ts` (solo lectura). En la DB de
  desarrollo del 2026-10-15: 12 cuentas CLUB, **0** follows/reportes en el eje `USER` hacia clubes, 0 clubes con campos de
  persona, 0 trayectorias/certificaciones de clubes: la migracion no cambia datos ahi y solo agrega el CHECK.
- Verificada en una DB local descartable: todas las migraciones desde cero + una prueba con conflictos (mover, duplicado entre
  ejes, dos filas que van a la misma tupla, auto-follow, reportes duplicados, club con campos de persona, aborto sin fila
  `Club`, DB vacia): 19 comprobaciones OK.
- Rollback: restaurar desde `backup.*` (`UPDATE "Follow"` con la tupla original y `INSERT` de las filas `DELETE_*`; los campos
  de persona desde `club_person_fields_20261015`) y `ALTER TABLE "User" DROP CONSTRAINT "User_club_no_person_fields_check"`.
- El seed ya era consistente (los clubes no reciben campos de persona y su unico follow usa `followerType: CLUB`): no cambio.

### Contrato para el FRONT (fase 3)

| Que hacer | Antes | Ahora |
|-----------|-------|-------|
| Seguir / dejar de seguir un club | `follow(followingType: CLUB)` (o `USER`, que dejaba un 2do eje) | **Siempre `CLUB`** con el id del club. `USER` con ese id funciona pero se guarda como `CLUB`. |
| Que un club siga a alguien | `followerType: CLUB` o `USER` | **`CLUB`** (`followerId` = id de la cuenta) |
| Reportar un club | `targetType: CLUB` o `USER` | **`CLUB`** |
| Contador de seguidores de un club | `Club.followersCount` o `User.followersCount` (podian diferir) | **Cualquiera: siempre el mismo numero** |
| `isFollowedByCurrentUser` de un club | por tipo | igual desde `Club` o `User` |
| Editar perfil de un club | `updateUser` aceptaba campos de persona | enviar **solo** identidad (`name`, `username`, `bio`, `avatar`, `coverImage`, `coverImagePosition`, `city`, `country`, `clubId`) |
| Formulario de registro de un club | mandaba `dateOfBirth`/`position` (se ignoraban o guardaban) | **no mandarlos**: 400 `FIELD_NOT_ALLOWED` |
| Perfil publico de un club | podia mostrar edad, CV, posicion, nivel, trayectorias, multimedia | no mostrarlos: llegan vacios (`null`/`[]`) |
| Subir CV | cualquier rol permitido | `uploadCV` de un CLUB -> 400 `FIELD_NOT_ALLOWED` (`field: "cvUrl"`): ocultar la opcion |

- **Error nuevo para manejar**: `FIELD_NOT_ALLOWED` en `register` y `updateUser` de un CLUB. Trae un elemento por campo enviado
  (`field`, `code`, `message`), en la lista de errores por campo, igual que los demas `VALIDATION_ERROR`. Es un error de
  programacion del front: no deberia verse.
- Los campos `Follow.followerType`/`followingType` que devuelve `follow` ya vienen normalizados (`CLUB` para un club).
- Notificaciones: un club recibe `NEW_FOLLOWER` cuando lo siguen.

## Borrado de vacantes y `filledAt` (fase 4)

Migracion `20261015130000_job_filled_at`: columna `JobOpportunity.filledAt` (`TIMESTAMP(3)`, nullable, aditiva). Las vacantes ya
`FILLED` reciben `filledAt = updatedAt`. Se expone en el SDL como `JobOpportunity.filledAt: String` (ISO 8601). Falta aplicarla
(`prisma migrate deploy`) en cada entorno.

### Reglas
- `updateJobOpportunity(id, status)` acepta solo `OPEN`, `CLOSED`, `FILLED` (sin importar mayusculas). Otro valor -> 400
  `VALIDATION_ERROR` con `field: "status"` y `code: "JOB_STATUS_INVALID"`. `status` `null` u omitido = sin cambio.
  - Pasar a `FILLED` guarda `filledAt = ahora`. Salir de `FILLED` lo deja en `null`. `FILLED` -> `FILLED` no lo reinicia.
- `deleteJobOpportunity(id)` de un CLUB solo funciona si se cumple **una**:
  1. Ninguna postulacion en `PENDING` ni `UNDER_REVIEW` (cero postulaciones tambien vale; `ACCEPTED`, `REJECTED` y `WITHDRAWN`
     cuentan como respondidas), o
  2. la vacante esta `FILLED` y `filledAt` tiene 14 dias o mas.
- SUPERADMIN borra sin estas reglas (moderacion).
- La regla va tambien dentro del `DELETE` (una sola sentencia), asi que una postulacion que llega entre la comprobacion y el
  borrado no se pierde.

### Errores nuevos (`extensions.code`, HTTP 409, sin `field`)
| Code | Cuando |
|------|--------|
| `JOB_HAS_UNANSWERED_APPLICATIONS` | Hay postulaciones `PENDING`/`UNDER_REVIEW` y la vacante no cumple el plazo de `FILLED` |
| `JOB_FILLED_COOLDOWN` | La vacante esta `FILLED` hace menos de 14 dias y tiene postulaciones sin responder; el mensaje trae la fecha ISO desde la que se puede borrar |

### Para el FRONT
- Calcular `canDelete` con la misma regla (`lib/job-deletion-rules.ts`) usando `status`, `filledAt` y el conteo de postulaciones
  sin responder; el back es la fuente de verdad: igual hay que mapear los dos codes a un mensaje.

## Publicar vacantes exige club verificado (fase 5)

Sin migracion ni campos nuevos: se usa `Club.verificationStatus` (`UNVERIFIED | PENDING | VERIFIED | REJECTED`), que ya estaba en
el SDL, no es privado y llega en `club(id)` y en `updateClub`.

### Reglas
- `createJobOpportunity` y `updateJobOpportunity(status: OPEN)` sobre una vacante que no estaba `OPEN` (reabrir) solo funcionan si
  el club es `VERIFIED`. `PENDING` (documento enviado, sin aprobar) **no** alcanza; tampoco `REJECTED` ni `UNVERIFIED`.
- Se comprueba **antes** del tope de 5 vacantes abiertas: un club sin verificar recibe `CLUB_NOT_VERIFIED`, no `ACTIVE_JOBS_LIMIT_REACHED`.
- No se pide verificacion para cerrar, marcar `FILLED`, borrar ni para vacantes que ya estan `OPEN`. Las vacantes abiertas de un club
  que aun no esta verificado siguen abiertas.
- SUPERADMIN puede reabrir (moderacion) aunque el club no este verificado. Crear sigue siendo solo del rol `CLUB`.

### Error nuevo
| Code | HTTP | Cuando |
|------|------|--------|
| `CLUB_NOT_VERIFIED` | 403 | El club no esta `VERIFIED` al crear o reabrir una vacante. Sin `field` |

### Para el FRONT
- Leer `verificationStatus` de `club(id)` (el club de la cuenta CLUB es su propio `User.id`) y deshabilitar "Publicar" y "Reabrir"
  cuando no sea `VERIFIED`, con un enlace a `/profile`, donde el banner de verificacion abre el modal que envia el documento
  (`requestClubVerification`).
- Aun asi mapear `CLUB_NOT_VERIFIED` a un mensaje: el back es la fuente de verdad (el estado puede cambiar entre la lectura y el envio).
- Los creditos de pago (5 EUR por 5 vacantes) no estan implementados; el tope sigue siendo `MAX_ACTIVE_JOBS = 5` abiertas a la vez.
