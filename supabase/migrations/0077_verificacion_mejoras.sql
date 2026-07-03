-- ============================================================
-- 0077 — Mejoras de la verificación de identidad
-- ------------------------------------------------------------
-- · S5: consentimiento con VERSIÓN + FECHA (además del booleano existente),
--       atado a la versión legal vigente.
-- · R2: el dueño ya no puede tocar una fila APROBADA (evita que se auto-baje de
--       'aprobada' a 'pendiente').
-- · N1: al aprobar/rechazar, se avisa a la persona con una notificación in-app.
-- Idempotente. (Las imágenes se CONSERVAN a propósito — decisión operativa — para
-- poder detectar reutilización de una misma identidad en otra cuenta.)
-- ============================================================

-- ---- S5: versión + fecha del consentimiento ----
alter table public.verificaciones_identidad add column if not exists consent_version text;
alter table public.verificaciones_identidad add column if not exists consent_en timestamptz;

-- ---- R2: bloquear que el dueño modifique una fila ya aprobada ----
drop policy if exists vi_update_propia on public.verificaciones_identidad;
create policy vi_update_propia on public.verificaciones_identidad for update to authenticated
  using (perfil_id = auth.uid() and estado <> 'aprobada')
  with check (perfil_id = auth.uid() and estado = 'pendiente');

-- ---- N1: avisar a la persona cuando se resuelve su verificación ----
create or replace function public.notificar_verificacion_identidad()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado and new.estado in ('aprobada', 'rechazada') then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (
      new.perfil_id,
      'verificacion',
      case when new.estado = 'aprobada'
           then 'Identidad verificada'
           else 'Verificación de identidad rechazada' end,
      case when new.estado = 'aprobada'
           then '¡Gracias! Tu verificación de identidad quedó aprobada.'
           else coalesce('Motivo: ' || nullif(new.nota_revision, '') || '. ', '')
                || 'Puedes volver a enviarla desde Verificación.' end,
      '/verificacion'
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_verif_notificar on public.verificaciones_identidad;
create trigger trg_verif_notificar
  after update on public.verificaciones_identidad
  for each row execute function public.notificar_verificacion_identidad();
