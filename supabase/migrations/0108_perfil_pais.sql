-- ============================================================
-- 0108 — País del voluntario (para conocer su zona horaria y planificar)
-- ------------------------------------------------------------
-- Agrega `perfiles.pais` (código ISO 3166-1 alfa-2, p. ej. 'VE', 'CO', 'ES').
-- Se captura en el registro, se puede editar en el perfil y se puede indicar al
-- importar por lote. Es un dato NO sensible y de auto-edición (como nombre u
-- organización): no lo protege `proteger_campos_perfil`, así que el dueño lo
-- edita con las políticas existentes de `perfiles`. No requiere cambios de RLS.
--
-- `handle_new_user` se reescribe SOBRE LA BASE VIGENTE (0103) — mismo cuerpo,
-- solo se añade la columna `pais` desde el metadato del registro. Idempotente.
-- Ejecutar tras 0107.
-- ============================================================

alter table public.perfiles add column if not exists pais text;

-- handle_new_user: crea el perfil al registrarse; ahora también guarda el país.
-- (Copia exacta de 0103 + columna `pais`; no revierte nada de 0103.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo, telefono, organizacion, motivo, area_registro, pais)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'telefono', new.phone),
    new.raw_user_meta_data ->> 'organizacion',
    new.raw_user_meta_data ->> 'motivo',
    case when (new.raw_user_meta_data ->> 'area_registro') in ('verificacion','redes','general')
         then new.raw_user_meta_data ->> 'area_registro' else null end,
    nullif(btrim(new.raw_user_meta_data ->> 'pais'), '')
  );
  return new;
end; $$;
