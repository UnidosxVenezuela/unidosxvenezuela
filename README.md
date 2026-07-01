# Plataforma Unidos

Plataforma web y móvil para **coordinar equipos de respuesta** al terremoto de Venezuela (junio 2026): roles, asignación de tareas, grupos por área, tablón, notificaciones y manejo seguro de información sensible.

> Estado: **Fase 1 (MVP) completa en web**: auth, perfiles, verificación, grupos, tareas (tiempo real), tablón con sensibilidad y notificaciones. Próximo: paridad móvil y Fase 2 (push, mapa, offline).

---

## Guía de uso

Guía simple para todo el equipo. Explica **qué hace cada rol** y **cómo usar cada parte** de la plataforma. No necesitas saber de tecnología: si sabes usar WhatsApp, puedes usar esto. (También dentro de la app en la sección **Ayuda** y en [docs/GUIA-DE-USO.md](docs/GUIA-DE-USO.md).)

### 1. Primeros pasos

1. **Entrar:** tu correo y contraseña. La primera vez, usa la contraseña temporal que te dio la coordinación y cámbiala al entrar (menú de tu nombre → *Mi perfil*).
2. **Esperar aprobación:** las cuentas nuevas quedan "pendientes" hasta que un administrador las verifica. Te avisamos por correo.
3. **Completar tu perfil:** agrega tu **foto**, tu teléfono y tus **habilidades** (tus fortalezas, para saber en qué puedes ayudar más).
4. **Sonidos:** clic suave al tocar botones; puedes silenciarlos en el menú de tu nombre → *Sonidos*.

### 2. Cómo moverte

- **Barra lateral:** el menú principal; solo ves las secciones de tu rol.
- **Barra superior:** ☰ abre/cierra el menú · 🔔 tus avisos · tu nombre abre perfil, sonidos y salir.
- **Panel (inicio):** saludo, **acciones rápidas** de tu rol, **tira del flujo** y un resumen de tareas, grupos, avisos y horas.

### 3. Los roles (qué hace cada uno)

Un usuario **puede tener más de un rol** (p. ej. verificar *y* redactar). La coordinación los asigna. El **administrador tiene acceso a todo**.

| Rol | Para qué sirve |
|-----|----------------|
| **Voluntario** | Toma tareas abiertas y se une a los grupos **abiertos** (a los privados, solo por invitación). Registra sus horas. |
| **Observador** | Solo mira (no toma tareas ni publica). |
| **Líder de grupo** | Gestiona su grupo: crea/asigna tareas, lidera la pizarra y los anuncios. |
| **Coordinador** | Coordina equipos: tareas, grupos, verifica usuarios y ve todo el flujo. |
| **Administración (admin)** | Acceso total: aprueba usuarios, asigna roles, gestiona todo. |
| **Recopilación** | Reporta información (casos) para que se verifique. |
| **Verificación** | Revisa los casos reportados y los confirma o descarta. |
| **Redacción** | Escribe el contenido de los casos confirmados. |
| **Diseño Gráfico** | Crea las piezas gráficas. |
| **Edición de Videos** | Edita los videos / reels. |
| **Redes Sociales** | Publica el contenido final en las redes. |
| **Líder de plataforma aliada** | Accede a la base de datos compartida de aliados. |

> **Tu espacio por rol:** si tienes un rol de recopilación o producción, en **"Espacios de trabajo"** tienes tu sección propia con tu cola de trabajo y tu grupo a la mano.
>
> **¿A qué grupos entra cada quién?** *Abiertos:* cualquier verificado se une solo. *Privados:* solo por invitación. **Voluntario** entra a los abiertos; **Observador** solo mira; **Líder** gestiona el suyo; **Coordinación/Admin** ven y gestionan **todos** (también privados) para supervisar. Detalle en [docs/ROLES.md](docs/ROLES.md).

### 4. El flujo completo (de la información a la publicación)

**Recopilación → Verificación → Confirmado → Redacción → Diseño / Video → Redes → Publicado**

1. **Recopilación** reporta un caso.
2. **Verificación** lo confirma (es real) o lo marca falso/resuelto.
3. Un caso **confirmado** se envía a **Redacción**.
4. Redacción escribe y lo manda a **Diseño** o **Video**.
5. Diseño/Video crea la pieza y la pasa a **Redes**.
6. **Redes** la publica. ✅

### 5. Cómo usar cada sección

- **Panel:** toca una acción rápida o una etapa de la tira de flujo.
- **Tareas:** toma *tareas abiertas* (algunas con cupo), sigue *las tuyas* en tarjetas, sube *entregables*. Coordinación y líderes crean y asignan.
- **Grupos:** abiertos (cualquiera se une) o privados (solo miembros). Traen tareas, videollamadas, miembros, **pizarra**, anuncios y WhatsApp.
- **Espacios de trabajo:** tu sección propia con tu **cola** de piezas en tu etapa y tu **equipo** (grupo, pizarra, chat). Quedas en el de tu rol automáticamente.
- **Verificación de casos:** reporta (avisa duplicados), asigna y cambia el estado (*en proceso* / *confirmado* / *falso*); envía a Redacción. Solo un admin borra casos.
- **Producción de contenido:** tablero por etapas; abre una pieza para escribir/cargar, asignar y avanzar.
- **Centros de acopio:** registra qué necesitan, capacidad, horario, contacto y ubicación; un admin asigna **coordinadores responsables**.
- **Mapa:** centros por urgencia y tareas con ubicación.
- **Tablón:** anuncios con niveles de sensibilidad.
- **Mis horas:** registra tus horas; suman al total de la comunidad.
- **Avisos:** la campana 🔔 te avisa cuando te asignan algo o llega una pieza a tu etapa.
- **Administración:** aprueba registros, asigna rol y **roles adicionales**, ve **habilidades** y el registro de actividad.

### 6. Paso a paso (lo más común)

- **Reportar un caso (Recopilación):** Verificación de casos → *Nuevo caso* → título (ojo a duplicados), categoría, descripción y fuente → *Guardar* (queda *en proceso*).
- **Verificar (Verificación):** abre el caso → asígnalo → cambia el estado (*Confirmado* / *Falso*) → si confirmado, *Enviar a Redacción*.
- **Trabajar tu pieza (producción):** Espacios de trabajo → tu cola → abre la pieza → asígnatela → haz tu parte (escribir / subir archivo / publicar) → *Enviar a la siguiente etapa*.
- **Tomar una tarea:** Tareas → *Tareas abiertas* → *Tomar tarea* / *Unirme* → súbele el entregable.
- **Aprobar y asignar roles (Admin):** Administración → *Aprobar* la solicitud → cambia el *Rol*; para varios, *Roles adicionales* → *Guardar roles*.

### 7. Consejos rápidos

- **No ves una sección:** tu rol no la usa; pide a coordinación el rol que necesitas.
- **El primer sonido no suena:** el navegador activa el audio con tu primer clic.
- **En el teléfono:** todo funciona; ☰ abre el menú y las tablas se deslizan de lado.
- **Datos sensibles:** respeta los niveles del Tablón y no compartas datos de personas fuera del equipo.

---

## Documentación

| Doc | Contenido |
|-----|-----------|
| [docs/DOCUMENTO-DEL-PROYECTO.md](docs/DOCUMENTO-DEL-PROYECTO.md) | **Documento del proyecto**: funciones y características en detalle (visión, flujo, secciones, seguridad, arquitectura). |
| [docs/GUIA-DE-USO.md](docs/GUIA-DE-USO.md) | **Guía de uso por rol y funcionalidades** (también abajo y dentro de la app en *Ayuda*). |
| [docs/ROLES.md](docs/ROLES.md) | **Funciones de cada rol y a qué grupos entra** — referencia simple para organizadores. |
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

Copyright (C) 2026 UnidosXVenezuela

Este proyecto es software libre bajo la **GNU Affero General Public License v3.0** (`AGPL-3.0-only`). Puedes usarlo, estudiarlo, modificarlo y compartirlo. Por ser una aplicación que se usa **en red**, la AGPL añade una condición clave: **si despliegas una versión —modificada o no— como servicio, debes ofrecer su código fuente a quienes la usen**. Así las mejoras vuelven a la comunidad y la plataforma humanitaria se mantiene abierta para todos.

Texto completo en [LICENSE](LICENSE).
