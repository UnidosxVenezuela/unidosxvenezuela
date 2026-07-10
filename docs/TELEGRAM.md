# Avisos por Telegram (Bot API)

Tercer canal de notificación de **Apoyo por Venezuela**, **adicional** a la
campana in-app y al web-push. Cuando algo genera un aviso (comentario en tu
tarea, publicación en tu grupo, traspaso de caso, etc.), quien haya **vinculado**
su Telegram lo recibe también ahí, con un botón que abre la app. Quien no lo
vincule sigue igual (campana + push).

## Cómo funciona (resumen)

1. La persona pulsa **«Vincular Telegram»** en su perfil. El servidor crea un
   **token de un solo uso** (15 min) en `telegram_enlaces` y devuelve un enlace
   profundo `https://t.me/<bot>?start=<token>`.
2. La persona abre el enlace y pulsa **Iniciar / Start**. Telegram llama al
   **webhook** del bot (`/api/telegram/webhook`) con `/start <token>` y el
   `chat.id` de esa persona.
3. El webhook valida el token (no usado, no vencido) con la `service_role`,
   guarda `perfiles.telegram_chat_id` + `telegram_username`, marca el token
   usado y responde «✅ Vinculado».
4. A partir de ahí, cada INSERT en `notificaciones` dispara el **Database
   Webhook** de Supabase → `POST /api/push`, que envía el web-push **y además**,
   si la persona tiene `telegram_chat_id`, llama a `sendMessage` de Telegram con
   un botón «Abrir en la app».

El envío a Telegram es **best-effort**: va dentro de un `try/catch` para que un
fallo suyo nunca rompa el push ni provoque un reintento del webhook (que
duplicaría avisos). El push es la garantía; Telegram es adicional.

**Privacidad / blindaje (NNA):** el mensaje reutiliza el **titular discreto**
(migración `0123`) — sin nombres de menores ni datos de víctimas — y el botón es
un **deep-link a la app protegida por RLS**. Telegram nunca transporta el dato
sensible: solo el titular genérico y un enlace que exige sesión. Igual que el
web-push.

## Pasos para dejarlo funcionando (una sola vez)

### 1. Crear el bot con @BotFather

En Telegram, habla con **@BotFather** → `/newbot` → elige nombre y usuario. Copia:

- el **token** del bot → `TELEGRAM_BOT_TOKEN` (solo servidor).
- el **@usuario** del bot (sin la `@`) → `NEXT_PUBLIC_TELEGRAM_BOT` (público).

### 2. Elegir un secreto de webhook

Genera una cadena aleatoria (p. ej. `openssl rand -hex 32`) → será
`TELEGRAM_WEBHOOK_SECRET`. Telegram la reenviará en cada llamada en la cabecera
`X-Telegram-Bot-Api-Secret-Token`, y el webhook la exige.

### 3. Registrar el webhook (una vez)

Con el token y el secreto, y tu dominio público (`NEXT_PUBLIC_APP_URL`):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/telegram/webhook&secret_token=<SECRET>"
```

Debe responder `{"ok":true, ...}`. Para comprobar: `.../getWebhookInfo`.

### 4. Rellenar las variables en Vercel

En Vercel → Settings → Environment Variables (entorno **Production**):

| Variable | Valor | Ámbito |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | token de BotFather | solo servidor |
| `TELEGRAM_WEBHOOK_SECRET` | el secreto del paso 2 | solo servidor |
| `NEXT_PUBLIC_TELEGRAM_BOT` | @usuario del bot, sin `@` | público |
| `NEXT_PUBLIC_APP_URL` | URL base del despliegue (sin `/` final) | público |

### 5. Aplicar la migración `0139`

En Supabase, aplica `supabase/migrations/0139_telegram_canal.sql` (columnas en
`perfiles` + índice único parcial + tabla `telegram_enlaces` con RLS). El
Database Webhook de push **ya existe**; no cambia.

## Comandos del bot

- `/start <token>` — vincula (lo envía el deep-link automáticamente).
- `/start` (sin token) — explica cómo vincular desde el perfil.
- `/stop` o `/desvincular` — corta el envío a ese chat.

Desde la app, la persona también puede **Desvincular** en su perfil.

## Fuera de alcance (por ahora)

- Comandos ricos (consultar tareas, responder desde Telegram).
- Grupos/canales de Telegram por área.
- No se toca la generación de avisos, ni la campana, ni el web-push.
