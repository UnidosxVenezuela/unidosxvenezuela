# CLAUDE.md — contexto para Claude Code

Guía para que Claude Code (o cualquier IA) trabaje este repositorio con el contexto correcto.

## Qué es

Plataforma web y móvil para **coordinar equipos de respuesta** al terremoto de Venezuela (junio 2026): roles, asignación de tareas, grupos por área, tablón con niveles de sensibilidad, notificaciones y manejo seguro de información sensible. Alineada con el modelo de *clusters* humanitarios (OCHA).

## Stack y estructura

Monorepo **pnpm + Turborepo**, TypeScript estricto.

```
apps/web      Next.js 14 (App Router, PWA)   ← foco actual
apps/mobile   Expo / React Native            ← pendiente paridad
packages/types            tipos de dominio compartidos
packages/supabase-client  fábrica de cliente Supabase
supabase/migrations       SQL: esquema + RLS + realtime + triggers
docs/                     01–07 (plan, arquitectura, datos, seguridad, roadmap, mejoras, ADR archivos)
DEPLOY.md                 runbook GitHub + Vercel + Supabase
```

## Comandos

```bash
pnpm install
pnpm dev                       # todas las apps (turbo)
pnpm --filter @unidos/web dev  # solo web -> http://localhost:3000
pnpm db:start                  # Supabase local (Docker)
pnpm db:reset                  # aplica migraciones
pnpm db:types                  # regenera tipos TS desde el esquema
pnpm --filter @unidos/web build
```

## Convenciones (IMPORTANTES)

- **Idioma:** dominio y UI en español (perfiles, tareas, grupos, tablón…); identificadores de framework en inglés.
- **Next 14.2 App Router:** `params` y `searchParams` son **síncronos** (no `Promise`). `typedRoutes` está **desactivado** a propósito (hrefs dinámicos como `'/tareas/' + id`).
- **Datos:** lecturas en Server Components con `lib/supabase/server`; mutaciones en **Server Actions** (`'use server'`); autenticación en cliente con `lib/supabase/client`.
- **Seguridad:** la **RLS es la fuente de verdad**. Nunca exponer `service_role` en el cliente. Respetar los niveles de sensibilidad del tablón.
- **Tiempo real:** componente `apps/web/components/RealtimeRefrescar.tsx`.
- **Etiquetas/constantes:** `apps/web/lib/constantes.ts`.

## Base de datos

Migraciones en orden: `0001` esquema · `0002` RLS · `0003` seed de áreas · `0004` realtime · `0005` triggers de notificación. Tras cambiar el esquema, ejecuta `pnpm db:types`.

## Estado actual

**Fase 1 (web) completa:** auth, perfiles, verificación de usuarios y roles, grupos y membresías, tareas (CRUD, asignación, estados, comentarios, tiempo real), tablón con sensibilidad, notificaciones (campana + página + triggers).

**Pendiente:** paridad móvil (Expo), Fase 2 (push, mapa con MapLibre + PostGIS, modo offline), pruebas de políticas RLS y CI con lockfile.

## Gotchas

- Aún no hay `pnpm-lock.yaml`: tras el primer `pnpm install`, **commitéalo**.
- Archivos: se usa **Supabase Storage** (no Google Drive) — ver `docs/07-DECISION-ARCHIVOS.md`.
- Primer administrador: se promueve por SQL (ver `DEPLOY.md`).
- Variables de entorno: ver `.env.example` y `apps/web/.env.local.example`.
