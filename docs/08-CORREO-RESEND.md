# 08 — Correo con Resend (recuperación de contraseña y demás)

Guía para dejar el correo funcionando en producción. Explica **por qué** un correo puede
no llegar y **cómo** configurar Resend correctamente.

## Lo primero: hay DOS caminos de correo (no confundir)

| Correo | ¿Quién lo envía? | ¿Con qué se configura? |
|---|---|---|
| **Recuperar/restablecer contraseña, confirmar cuenta, magic link, invitación, cambio de correo** | **Supabase Auth** (el servidor de auth), NO la app | El **SMTP del proyecto de Supabase** (Dashboard → Authentication) |
| Correos propios de la app (p. ej. Admin envía una contraseña temporal al crear un usuario) | La app, vía `apps/web/lib/email.ts` → **Resend API** | Variables `RESEND_API_KEY` y `RESEND_FROM` en Vercel |

> **Causa más común de «no llegan los correos de recuperación»:** el proyecto de Supabase
> **no tiene SMTP propio configurado**, así que usa el **servicio de correo por defecto de
> Supabase**, que está **limitado a unos pocos correos por hora** y **no es para
> producción** (muchos se caen o no llegan). La página `/recuperar` llama a
> `supabase.auth.resetPasswordForEmail(...)`; ese correo lo manda Supabase, así que
> «configurar Resend» aquí significa **poner Resend como el SMTP de Supabase**. El
> `lib/email.ts` de la app NO interviene en estos correos.

---

## Paso 1 — Verificar un dominio en Resend (obligatorio)

Con `onboarding@resend.dev` solo se puede enviar al correo dueño de la cuenta de Resend.
Para enviar a cualquier persona necesitas un **dominio verificado**:

1. En https://resend.com → **Domains → Add Domain** (p. ej. `apoyoporvenezuela.org`).
2. Agrega en tu proveedor de DNS los registros que muestra Resend (**SPF** y **DKIM**, y el
   `MX` del subdominio `send`). Espera a que Resend marque el dominio como **Verified**.
3. **API Keys → Create API Key** (permiso *Sending access*). Guárdala: empieza por `re_…`.
   La usarás en dos lugares (Supabase SMTP y `RESEND_API_KEY` de la app).

Remitente recomendado: `Apoyo por Venezuela <no-reply@TU-DOMINIO>` (el correo debe ser de
un dominio **verificado**).

---

## Paso 2 — Poner Resend como SMTP de Supabase (arregla recuperación/confirmación)

En el **Dashboard de Supabase** → **Authentication → Emails → SMTP Settings** (en algunas
versiones: *Project Settings → Authentication → SMTP*): activa **Enable Custom SMTP** y pon:

| Campo | Valor |
|---|---|
| **Host** | `smtp.resend.com` |
| **Port** | `465` (SSL) — si tu proveedor bloquea 465, usa `587` |
| **Username** | `resend` |
| **Password** | tu **API key de Resend** (`re_…`) |
| **Sender email** | `no-reply@TU-DOMINIO` (dominio verificado en Resend) |
| **Sender name** | `Apoyo por Venezuela` |

Guarda. Desde ese momento **todos** los correos de Auth (recuperación, confirmación, magic
link, invitación, cambio de correo) salen por Resend.

### 2.1 — Subir el límite de correos de Auth
Supabase limita los correos de Auth. En **Authentication → Rate Limits** sube
**«Rate limit for sending emails»** (el default es muy bajo, p. ej. 30/h) a lo que
necesites. Si no, aunque el SMTP esté bien, algunos correos se rechazan por límite.

### 2.2 — URL del sitio y redirecciones (para que el ENLACE funcione)
`/recuperar` usa `redirectTo = <origen>/actualizar-clave`. En **Authentication → URL
Configuration**:
- **Site URL** = tu dominio de producción (p. ej. `https://apoyoporvenezuela.org`).
- **Redirect URLs** = ese dominio (y `http://localhost:3000` para desarrollo).

Si la Site URL sigue en `localhost`, el enlace del correo apuntará a localhost y no servirá.

### 2.3 — Plantillas en español (opcional pero recomendado)
Las plantillas de `supabase/templates/*.html` solo aplican al stack **local** (via
`config.toml`). Para producción, pégalas en **Authentication → Emails → Templates**
(Recovery, Confirmation, Magic Link, Invite, Change Email) con los asuntos de `config.toml`.

---

## Paso 3 — Variables de la app en Vercel (correos propios de la app)

Para los correos que envía la app (p. ej. contraseña temporal al crear un usuario), en
**Vercel → Project → Settings → Environment Variables** (Production y Preview):

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | la API key de Resend (`re_…`) |
| `RESEND_FROM` | `Apoyo por Venezuela <no-reply@TU-DOMINIO>` |

Si `RESEND_API_KEY` está vacía, `lib/email.ts` **no envía nada** (silencioso). Vuelve a
desplegar tras agregarlas (o *Redeploy*).

---

## Paso 4 — Probar

1. **Recuperación (Supabase):** en `/recuperar` pide el enlace con tu correo real. Debe
   llegar en segundos. Revisa **Resend → Logs**: si aparece el envío, Resend funciona; si
   no aparece, el SMTP de Supabase no está tomando (revisa Paso 2).
2. **Correo de la app (Resend directo):** como admin, crea un usuario que dispare el envío
   de contraseña temporal. Si `RESEND_API_KEY` falta, la propia app avisa
   («El correo (RESEND) no está configurado…»).
3. Ante fallos, **Resend → Logs** y **Supabase → Logs → Auth** dicen el motivo exacto
   (dominio no verificado, remitente inválido, límite excedido, etc.).

---

## Checklist rápido

- [ ] Dominio **verificado** en Resend (SPF + DKIM en verde).
- [ ] SMTP de Supabase = Resend (`smtp.resend.com`, `465`, user `resend`, pass `re_…`).
- [ ] Sender email con dominio verificado.
- [ ] Rate limit de correos de Auth subido.
- [ ] Site URL / Redirect URLs con el dominio de producción.
- [ ] `RESEND_API_KEY` + `RESEND_FROM` en Vercel (para los correos de la app).
- [ ] Probado desde `/recuperar` y confirmado en Resend → Logs.

## Infra como código (opcional)

`supabase/config.toml` incluye un bloque `[auth.email.smtp]` **comentado**. Si prefieres
versionar la configuración en vez de usar el Dashboard, descoméntalo, exporta
`RESEND_SMTP_PASSWORD` (= tu API key) y aplica con `supabase config push`. Déjalo comentado
si usas el stack local, para que el correo local siga cayendo en Inbucket.
