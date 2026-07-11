-- ============================================================
-- 0144 — Verificación de oportunidades de donación (por el equipo de Verificación)
-- ------------------------------------------------------------
-- La misión del equipo de Verificación es revisar que la información que entra sea
-- real, vigente y completa. Las «oportunidades de donación» (ofertas de empresas,
-- organizaciones o personas) también son información a verificar (existencia,
-- contacto, canales oficiales, responsable), tal como lo pide el procedimiento del
-- equipo. Antes solo Logística podía tocar la oportunidad; Verificación podía verla
-- pero no dejar constancia de su revisión.
--
-- Se añade un RESULTADO DE VERIFICACIÓN —pendiente / verificada / observada— que fija
-- SOLO el equipo de Verificación (vía RPC, para no abrir toda la fila: el pipeline de
-- contacto sigue siendo de Logística por oportdon_update). Y al registrarse una
-- oferta se avisa TAMBIÉN a Verificación (además de a Logística) para que la revise.
-- Enum-safe (text check; 'verificador' y 'logistica' son valores PRE-existentes).
-- Idempotente. Ejecutar tras 0143.
-- ============================================================

alter table public.oportunidades_donacion
  add column if not exists estado_verificacion text not null default 'pendiente'
    check (estado_verificacion in ('pendiente','verificada','observada')),
  add column if not exists verificada_por     uuid references public.perfiles (id) on delete set null,
  add column if not exists verificada_en      timestamptz,
  add column if not exists nota_verificacion  text;

-- Solo Verificación (o el admin de Verificaciones) fija el resultado. La RPC limita
-- la escritura a las columnas de verificación; el resto de la fila lo gobierna la RLS.
create or replace function public.verificar_oportunidad_donacion(p_id uuid, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.puede_verificar() or public.opera_verificacion()) then
    raise exception 'Solo el equipo de Verificación puede verificar oportunidades de donación.' using errcode = '42501';
  end if;
  if p_estado not in ('pendiente','verificada','observada') then
    raise exception 'Estado de verificación no válido.' using errcode = '22023';
  end if;
  update public.oportunidades_donacion
     set estado_verificacion = p_estado,
         nota_verificacion   = nullif(btrim(coalesce(p_nota, '')), ''),
         verificada_por      = auth.uid(),
         verificada_en       = now(),
         actualizado_en      = now()
   where id = p_id;
end $$;
grant execute on function public.verificar_oportunidad_donacion(uuid, text, text) to authenticated;

-- Al registrar una oferta, avisar TAMBIÉN al equipo de Verificación (para verificarla),
-- además de a Logística. Rebase de la función de 0141 (el trigger no cambia). Los
-- valores 'logistica'/'verificador' son enum PRE-existentes → cast eager seguro.
create or replace function public.notificar_oportunidad_donacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'oportunidad_donacion', 'Nueva oportunidad de donación',
         coalesce(new.organizacion, 'Alguien') || ' ofrece ayudar. 💛',
         '/insumos/oportunidades/' || new.id
  from public.perfiles p
  where p.verificado
    and p.id is distinct from new.creado_por
    and (p.rol in ('logistica'::public.rol_usuario, 'verificador'::public.rol_usuario)
         or 'logistica'::public.rol_usuario  = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
         or 'verificador'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])));
  return new;
end $$;
