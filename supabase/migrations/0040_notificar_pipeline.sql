-- 0040: Notificaciones de traspaso del pipeline de contenido.
-- Cuando una pieza entra a una etapa (al crearse o al avanzar), se notifica a
-- las personas del rol responsable de esa etapa. Aplicar DESPUÉS de 0037.

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

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'contenido', 'Nueva pieza en ' || etapa_txt, new.titulo, '/contenido?pieza=' || new.id
  from public.perfiles p
  where p.rol = rol_destino and p.verificado;

  return new;
end $$;

drop trigger if exists trg_notif_pieza on public.piezas_contenido;
create trigger trg_notif_pieza after insert or update on public.piezas_contenido
  for each row execute function public.notificar_pieza_etapa();
