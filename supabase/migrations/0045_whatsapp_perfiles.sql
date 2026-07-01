-- ============================================================
-- 0045 — WhatsApp en el perfil (login sin correo + contacto)
-- ============================================================
-- * perfiles.whatsapp: dígitos normalizados (con código de país). Sirve para
--   (a) crear cuentas SIN correo — la persona entra con su número + contraseña
--   (el correo interno se deriva del número en la app), y (b) que cada quien
--   registre su WhatsApp de contacto (editable por el propio usuario).
-- * Índice único parcial: dos cuentas no comparten el mismo número.
-- Idempotente. La RLS ya permite que cada quien edite su propio perfil
-- (perfiles_actualiza_propio) y que coordinación edite cualquiera.
-- ============================================================

alter table public.perfiles add column if not exists whatsapp text;

-- Solo dígitos (se normaliza en la app). 7 a 15 (rango E.164).
alter table public.perfiles drop constraint if exists perfiles_whatsapp_digitos;
alter table public.perfiles add constraint perfiles_whatsapp_digitos
  check (whatsapp is null or whatsapp ~ '^[0-9]{7,15}$');

-- Único cuando no es null (permite muchos perfiles sin WhatsApp).
create unique index if not exists idx_perfiles_whatsapp
  on public.perfiles (whatsapp) where whatsapp is not null;
