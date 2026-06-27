# Plataforma Unidos

Plataforma web y móvil para **coordinar equipos de respuesta** al terremoto de Venezuela (junio 2026): roles, asignación de tareas, grupos por área, tablón, notificaciones y manejo seguro de información sensible.

> Estado: **Fase 1 (MVP) completa en web**: auth, perfiles, verificación, grupos, tareas (tiempo real), tablón con sensibilidad y notificaciones. Próximo: paridad móvil y Fase 2 (push, mapa, offline).

## Documentación

| Doc | Contenido |
|-----|-----------|
| [docs/01-PLAN.md](docs/01-PLAN.md) | Visión, objetivos, alcance, roles, features, casos de uso. |
| [docs/02-ARQUITECTURA.md](docs/02-ARQUITECTURA.md) | Stack, monorepo, decisiones técnicas, diagrama. |
| [docs/03-MODELO-DATOS.md](docs/03-MODELO-DATOS.md) | Entidades, relaciones, diccionario, ERD. |
| [docs/04-SEGURIDAD.md](docs/04-SEGURIDAD.md) | Auth, RBAC, RLS, datos sensibles, auditoría. |
| [docs/05-ROADMAP.md](docs/05-ROADMAP.md) | Fases, hitos y sprints sugeridos. |
| [docs/06-MEJORAS.md](docs/06-MEJORAS.md) | Mejoras priorizadas. |
| [docs/07-DECISION-ARCHIVOS.md](docs/07-DECISION-ARCHIVOS.md) | Decisión (ADR): archivos con Supabase Storage. |
| [DEPLOY.md](DEPLOY.md) | Runbook de despliegue: GitHub, Vercel, Supabase. |
| [CLAUDE.md](CLAUDE.md) | Contexto para trabajar el repo con Claude Code. |

## Stack

Next.js 14 (web/PWA) · Expo / React Native (móvil) · Supabase (Auth + Postgres + Realtime + Storage) · TypeScript · pnpm + Turborepo. Detalle en `docs/02-ARQUITECTURA.md`.

## Estructura

```
apps/web      Next.js (PWA)
apps/mobile   Expo (React Native)
packages/     types + supabase-client compartidos
supabase/     migraciones SQL (esquema + RLS + seed)
docs/         documentación del proyecto
```

## Puesta en marcha

Requisitos: Node 20+, pnpm 9+, Docker (para Supabase local) y Supabase CLI.

```bash
# 1) Instalar dependencias
pnpm install

# 2) Configurar variables de entorno
cp .env.example apps/web/.env.local
cp .env.example apps/mobile/.env.local
#   (rellena URL y claves del proyecto Supabase)

# 3) Base de datos local + migraciones
pnpm db:start        # levanta Supabase con Docker
pnpm db:reset        # aplica migraciones de supabase/migrations
pnpm db:types        # genera tipos TS desde el esquema

# 4) Levantar las apps
pnpm dev             # web (localhost:3000) y móvil (Expo)
```

Para producción: crear un proyecto en supabase.com, `pnpm db:push`, desplegar la web en Vercel y la app con EAS.

## Primer usuario admin

Tras registrarte por primera vez, promuévete desde el SQL editor de Supabase:

```sql
update public.perfiles set rol = 'admin', verificado = true
where id = '<tu-uuid-de-auth.users>';
```

## Próximos pasos

Ver `docs/05-ROADMAP.md`. Sugerido: Sprint 1 = Auth + perfiles + verificación + grupos.

## Licencia

Pendiente de definir. Para un proyecto humanitario se recomienda una licencia abierta (p. ej. MIT o AGPL-3.0).
