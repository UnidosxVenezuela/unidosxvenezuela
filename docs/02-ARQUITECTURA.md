# Arquitectura

## 1. Resumen

Monorepo con un **backend compartido (Supabase)** y dos clientes: **web (Next.js, PWA)** y **móvil (Expo / React Native)**. Lógica y tipos comunes viven en `packages/` para no duplicar código entre web y móvil.

```
┌─────────────┐     ┌──────────────┐
│  Web (PWA)  │     │ Móvil (Expo) │
│  Next.js 14 │     │ React Native │
└──────┬──────┘     └──────┬───────┘
       │   @unidos/types           │
       │   @unidos/supabase-client │
       └─────────────┬─────────────┘
                     │ HTTPS / WebSocket (Realtime)
              ┌──────▼───────────────────────┐
              │          Supabase            │
              │  Auth · Postgres + RLS       │
              │  Realtime · Storage          │
              │  Edge Functions (push, cron) │
              └──────────────────────────────┘
```

## 2. Stack

| Capa | Tecnología | Por qué |
|------|------------|---------|
| Web | Next.js 14 (App Router) + PWA | SSR, rutas protegidas, instalable y offline. |
| Móvil | Expo (React Native) + expo-router | Un código para iOS/Android; push nativo. |
| Backend | Supabase | Auth + Postgres + Realtime + Storage gestionados; menos infra que mantener en una emergencia. |
| Base de datos | PostgreSQL 16 | Relacional, robusta, con RLS para seguridad real. |
| Seguridad de datos | Row Level Security (RLS) | Las reglas viven en la BD, no solo en el cliente. |
| Tiempo real | Supabase Realtime | Tareas y tablón se actualizan en vivo. |
| Notificaciones | Edge Functions + Expo Push / Web Push | Push a móvil y navegador. |
| Monorepo | pnpm workspaces + Turborepo | Comparte tipos y cliente; builds rápidos. |
| Lenguaje | TypeScript (estricto) | Tipos extremo a extremo (BD → UI). |

## 3. Estructura del monorepo

```
plataforma-unidos/
├── apps/
│   ├── web/                 # Next.js (App Router, PWA)
│   │   ├── app/             # rutas: (auth)/login, (app)/dashboard, tareas, grupos, tablon, mapa
│   │   ├── lib/supabase/    # clientes SSR (browser/server)
│   │   ├── middleware.ts    # protege rutas privadas + refresca sesión
│   │   └── public/manifest.json
│   └── mobile/              # Expo / React Native
│       ├── app/             # expo-router
│       └── lib/supabase.ts
├── packages/
│   ├── types/               # tipos de dominio + database.types.ts (generado)
│   └── supabase-client/     # fábrica de cliente Supabase reutilizable
├── supabase/
│   ├── config.toml
│   └── migrations/          # 0001 esquema · 0002 RLS · 0003 seed
├── docs/                    # esta documentación
├── package.json             # workspaces + scripts (turbo, supabase)
├── turbo.json
└── pnpm-workspace.yaml
```

## 4. Decisiones clave

- **Seguridad en la base de datos, no solo en la app.** Toda regla de acceso se expresa con RLS (ver `0002_rls_policies.sql` y `docs/04-SEGURIDAD.md`). Aunque alguien obtenga la `anon key` (que es pública por diseño), no puede leer lo que su rol no permite.
- **Tipos generados desde la BD.** `pnpm db:types` genera `packages/types/src/database.types.ts` desde el esquema real; web y móvil comparten esos tipos.
- **Realtime para coordinación viva.** Tareas y tablón usan suscripciones para reflejar cambios al instante.
- **Offline-first en móvil.** Cache local + cola de mutaciones; se sincroniza al volver la señal (fase 3).
- **Edge Functions para lo sensible/servidor.** Envío de push, tareas programadas (recordatorios de vencimiento) y operaciones con la `service_role` key nunca tocan el cliente.

## 5. Entornos

| Entorno | Uso |
|---------|-----|
| Local | `supabase start` (Docker) + `pnpm dev`. |
| Staging | Proyecto Supabase de pruebas + previews de Vercel/EAS. |
| Producción | Proyecto Supabase productivo; web en Vercel; móvil vía EAS/stores. |

## 6. Flujo de autenticación (web)

1. El usuario inicia sesión (`/login`) → Supabase Auth emite sesión en cookies.
2. `middleware.ts` valida la sesión en cada request y redirige a `/login` si falta.
3. Server Components leen datos con el cliente de servidor; RLS filtra según el usuario.
4. Componentes de cliente se suscriben a Realtime para actualizaciones en vivo.
