# Despliegue — Plataforma Unidos

Flujo: **GitHub** (código) → **Vercel** (web) + **Supabase** (backend). La app móvil (Expo) se publica aparte con EAS.

El proyecto ya viene con **git inicializado, commit inicial y el remoto `origin`** apuntando a
`https://github.com/UnidosxVenezuela/unidosxvenezuela.git`.

---

## 1. Subir el código a GitHub

Desde la carpeta del proyecto (ya descomprimida en tu computadora):

```bash
# Verifica el remoto (ya configurado)
git remote -v
# origin  https://github.com/UnidosxVenezuela/unidosxvenezuela.git

# Sube la rama main
git push -u origin main
```

Te pedirá autenticación de GitHub (usuario + token personal/PAT, o GitHub CLI `gh auth login`).

> Si el repositorio remoto ya tenía commits (por ejemplo un README creado al abrirlo),
> el push será rechazado. En ese caso:
> ```bash
> git pull --rebase origin main   # integra lo remoto
> git push -u origin main
> ```
> Si el repo remoto está vacío y quieres partir de este commit, puedes forzar la primera vez:
> `git push -u origin main --force`

---

## 2. Crear el proyecto en Supabase

1. Crea un proyecto en https://supabase.com (región más cercana a Venezuela).
2. En **Project Settings → API**, copia: `Project URL`, `anon public key` y `service_role key`.
3. Aplica las migraciones (`supabase/migrations/`). Dos opciones:

   **Opción A — Supabase CLI (recomendada):**
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref TU_PROJECT_REF
   supabase db push          # aplica 0001…0005 en orden
   ```

   **Opción B — SQL Editor:** pega y ejecuta, en orden, el contenido de
   `0001_init_schema.sql`, `0002_rls_policies.sql`, `0003_seed.sql`,
   `0004_realtime.sql`, `0005_notif_tablon.sql`.

4. **Auth:** en **Authentication → URL Configuration** añade la URL de tu sitio de Vercel
   (y `http://localhost:3000` para desarrollo) en *Site URL* y *Redirect URLs*.
5. En producción, activa la confirmación de correo en **Authentication → Providers → Email**.

---

## 3. Crear el proyecto en Vercel

1. En https://vercel.com → **Add New → Project → Import Git Repository** y elige
   `UnidosxVenezuela/unidosxvenezuela`.
2. **Configuración clave (monorepo):**
   - **Root Directory:** `apps/web`  ← imprescindible.
   - **Framework Preset:** Next.js (autodetectado).
   - **Install Command:** dejar el de Vercel (usa pnpm por el campo `packageManager`).
3. **Environment Variables** (Production y Preview):

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (solo servidor) |

4. **Deploy.** Cada `git push` a `main` desplegará automáticamente.

> Nota: el equipo de Vercel conectado en esta sesión es **maizodev's projects**. Una vez
> importado el repo, puedo ayudarte a revisar el estado del deployment, logs y errores desde aquí.

---

## 4. Después del primer deploy

1. Copia el dominio de Vercel (p. ej. `https://unidosxvenezuela.vercel.app`) y añádelo en
   Supabase → Auth → Redirect URLs (paso 2.4).
2. Regístrate en la app una vez y promuévete a administrador desde el SQL Editor de Supabase:
   ```sql
   update public.perfiles set rol = 'admin', verificado = true
   where id = '<tu-uuid-de-auth.users>';
   ```
   (El UUID está en Authentication → Users.)
3. Ya puedes verificar usuarios, crear grupos, tareas, publicar en el tablón y recibir notificaciones.

---

## 5. App móvil (Expo) — opcional, fase posterior

```bash
cd apps/mobile
cp .env.local.example .env.local   # mismas URL y anon key de Supabase
npx expo start                     # desarrollo con Expo Go
# Publicación: npx eas build (requiere cuenta Expo/EAS)
```

---

## Integración continua

`.github/workflows/ci.yml` ejecuta `pnpm install` y el build de la web en cada push/PR,
para detectar errores antes de desplegar.

## Nota sobre el lockfile

Este commit aún no incluye `pnpm-lock.yaml`. Tras el primer `pnpm install` local,
**haz commit del `pnpm-lock.yaml`** generado para builds reproducibles en Vercel y CI.
