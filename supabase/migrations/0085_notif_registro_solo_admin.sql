-- ============================================================
-- 0085 — La notificación de "nueva solicitud de registro" va SOLO a admins
-- ------------------------------------------------------------
-- Antes (0018) avisaba a admin Y coordinador. Se acota a los administradores
-- (rol principal, rol adicional o superadmin), que son quienes verifican las
-- cuentas en /admin/usuarios. Así el aviso llega solo a quien corresponde.
--
-- No toca los AVISOS que envían los admins (tipo 'aviso_admin'), que se generan
-- desde la app y siguen igual. Solo redefine la función del trigger existente
-- (el trigger trg_perfiles_notificar_registro no cambia). Idempotente.
-- ============================================================

create or replace function public.notificar_registro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verificado = false then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'registro_nuevo',
           'Nueva solicitud de acceso',
           coalesce(nullif(new.nombre_completo, ''), 'Alguien') || ' espera verificación.',
           '/admin/usuarios'
    from public.perfiles p
    where p.rol = 'admin'
       or p.super_admin
       or 'admin' = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]));
  end if;
  return new;
end; $$;
