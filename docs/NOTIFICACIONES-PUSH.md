# Notificaciones push (Web Push / VAPID)

Cómo activar los avisos push del navegador para **Apoyo por Venezuela**.
Cuando algo genera una notificación (comentario en tu tarea, publicación en tu
grupo, traspaso de caso, etc.), la persona recibe un aviso del sistema **aunque
no tenga la página abierta**.

## Cómo funciona (resumen)

1. El navegador de cada persona se **suscribe** desde `/notificaciones`
   (tarjeta «Notificaciones en este dispositivo»). La suscripción se guarda en
   la tabla `push_suscripciones` (migración `0060`).
2. Los mismos triggers que ya crean la campana insertan una fila en
   `notificaciones`.
3. Un **Database Webhook** de Supabase dispara, en ese INSERT, una petición
   `POST` a `/api/push` (en Vercel).
4. `/api/push` valida el secreto, busca las suscripciones del destinatario y
   envía el push con la librería `web-push` (claves VAPID). Las suscripciones
   caducadas (404/410) se borran solas.

Nada de esto expone la `service_role` al cliente: el envío corre solo en el
servidor (Route Handler), y la RLS de `push_suscripciones` es de fila propia.

## Pasos para dejarlo funcionando (una sola vez)

### 1. Generar el par de claves VAPID

En tu computadora:

```bash
npx web-push generate-vapid-keys
```

Te dará una **Public Key** y una **Private Key**. Guárdalas.

### 2. Variables de entorno en Vercel

En **Vercel → proyecto `unidosxvenezuela-web` → Settings → Environment
Variables** (entorno **Production**; añade también **Preview** si quieres
probar en las ramas):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | la **Public Key** del paso 1 |
| `VAPID_PRIVATE_KEY` | la **Private Key** del paso 1 |
| `VAPID_SUBJECT` | `mailto:soporte@unidosxvnezuela.com` (o tu correo) |
| `PUSH_WEBHOOK_SECRET` | una cadena larga al azar, p.ej. `openssl rand -hex 32` |

`SUPABASE_SERVICE_ROLE_KEY` ya debería estar configurada (la usa el panel de
administración); si no, añádela también.

> ⚠️ **Importante:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` se incrusta en el momento
> del *build*. Después de guardarla, **haz un Redeploy** (Deployments → ⋯ →
> Redeploy) para que el cliente la reciba. Si no, la tarjeta de activación no
> aparece.

### 3. Correr la migración

En **Supabase → SQL Editor**, ejecuta el contenido de
`supabase/migrations/0060_push_suscripciones.sql`. Es idempotente.

### 4. Crear el Database Webhook en Supabase

En **Supabase → Database → Webhooks → Create a new hook**:

- **Name:** `push_notificaciones`
- **Table:** `public.notificaciones`
- **Events:** solo `INSERT`
- **Type:** `HTTP Request`
- **Method:** `POST`
- **URL:** `https://unidosxvnezuela.com/api/push`
  (o el alias de producción de Vercel:
  `https://unidosxvenezuela-web-unidosxvenezuela.vercel.app/api/push`)
- **HTTP Headers:** añade uno →
  `x-webhook-secret` = el **mismo** valor que pusiste en `PUSH_WEBHOOK_SECRET`.

Guarda.

### 5. Probar

1. Entra a la app **de producción** (con HTTPS) desde el teléfono o el
   navegador, ve a **Avisos** (`/notificaciones`) y pulsa **Activar**; acepta
   el permiso del navegador.
2. Provoca una notificación (p.ej. que otra persona comente una tarea tuya o
   publique en tu grupo).
3. Debe llegar el aviso push del sistema; al tocarlo abre la app en el enlace.

## Notas y límites

- **iPhone/iOS:** el push web solo funciona si la persona **añade la app a la
  pantalla de inicio** (PWA instalada) y activa desde ahí. En Safari normal de
  iOS no llega.
- **HTTPS obligatorio:** funciona en el dominio de producción y en `localhost`
  para desarrollo, no en `http://` a secas.
- **Un dispositivo/navegador = una suscripción.** La misma persona puede
  activarlo en varios dispositivos; a todos les llega.
- Si alguien desinstala o revoca el permiso, la suscripción se marca caducada
  al primer envío fallido (404/410) y se borra automáticamente.
- **Móvil nativo (Expo):** pendiente; esto cubre la web/PWA.

## Diagnóstico rápido

- **No aparece el botón «Activar»:** falta `NEXT_PUBLIC_VAPID_PUBLIC_KEY` o no
  se hizo Redeploy tras añadirla; o el navegador no soporta push.
- **Activo pero no llega nada:** revisa que el Database Webhook apunte a
  `/api/push`, que el header `x-webhook-secret` coincida con
  `PUSH_WEBHOOK_SECRET`, y que la migración `0060` esté aplicada. En Supabase,
  el webhook muestra el historial de envíos y el código de respuesta (un `401`
  = secreto que no coincide; `500` = faltan claves VAPID en Vercel).
