# Comands to run tests

pnpm test # Corre todos los tests una vez
pnpm test:watch # Modo watch (re-ejecuta al guardar)
pnpm test:cov # Genera reporte de cobertura (coverage/)

# Comands to generate stories

npx ts-node prisma/generate-stories.ts

# Acciones sobre la base de datos

# Repoblar: pnpm prisma:seed

# Limpiar y Repoblar: pnpm prisma:reset

# Generar Cliente: pnpm prisma:generate
