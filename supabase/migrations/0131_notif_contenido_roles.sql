-- ============================================================
-- 0131 — Notificaciones del pipeline de contenido: rol principal O secundario
-- ------------------------------------------------------------
-- `notificar_pieza_etapa` (0040) avisaba «nueva pieza en tu etapa» solo a quienes
-- tuvieran el rol de destino como rol PRINCIPAL (`p.rol = rol_destino`). Pero los
-- roles de contenido (redacción, diseño, edición de video, community manager) se
-- otorgan casi siempre como roles ADICIONALES (roles_extra), y el resto del pipeline
-- ya es consciente de roles_extra. Efecto: la mayoría del equipo de contenido y
-- TODOS los influencers nunca recibían el aviso.
--
-- Se corrige para notificar a quien tenga el rol de destino en su rol principal O en
-- roles_extra, incluir a los INFLUENCERS (actúan en cualquier etapa) y excluir a quien
-- hizo el cambio. Solo redefine la función (el trigger 0040 sigue igual). Enum-safe
-- (usa valores existentes). Idempotente. Tras 0130.
-- ============================================================

create or replace function public.notificar_pieza_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rol_destino public.rol_usuario;
  etapa_txt   text;
  cambio      boolean;
begin
  cambio := (tg_op = 'INSERT') or (tg_op = 'UPDATE' and new.etapa is distinct from old.etapa);
  if not cambio then return new; end if;

  rol_destino := case new.etapa
    when 'redaccion' then 'redaccion'
    when 'diseno'    then 'diseno_grafico'
    when 'video'     then 'edicion_video'
    when 'redes'     then 'redes_sociales'
    else null
  end::public.rol_usuario;
  if rol_destino is null then return new; end if;  -- 'publicado' no notifica

  etapa_txt := case new.etapa
    when 'redaccion' then 'Redacción'
    when 'diseno'    then 'Diseño Gráfico'
    when 'video'     then 'Edición de Videos'
    when 'redes'     then 'Redes Sociales'
    else new.etapa::text
  end;

  -- Notifica por rol PRINCIPAL o roles_extra, más los influencers (cualquier etapa),
  -- verificados y excluyendo a quien movió la pieza.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'contenido', 'Nueva pieza en ' || etapa_txt, new.titulo, '/contenido?pieza=' || new.id
  from public.perfiles p
  where p.verificado
    and p.id is distinct from auth.uid()
    and (
      p.rol = rol_destino
      or rol_destino = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
      or p.rol = 'influencers'::public.rol_usuario
      or 'influencers'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
    );

  return new;
end $$;
