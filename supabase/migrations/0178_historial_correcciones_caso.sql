-- ============================================================
-- 0178 — Historial de correcciones de la solicitud (Requerimiento Paso 12)
-- ------------------------------------------------------------
-- «Nada se borra»: cuando Verificación corrige un dato de la solicitud, el sistema
-- guarda el valor ORIGINAL y el CORREGIDO, quién lo cambió y cuándo. El valor
-- original nunca se sobreescribe: cada corrección es una fila nueva (append-only).
--
-- Privacidad (Paso 10): los campos de CONTACTO son sensibles. Se registra QUE
-- cambiaron (campo + quién + cuándo) pero NO se guardan los valores, para que el
-- historial pueda mostrarse al equipo sin exponer el contacto interno.
--
-- Lectura: el equipo que trabaja la solicitud (admin / Verificación / quien la
-- creó). La escritura va SOLO por el trigger (SECURITY DEFINER); la tabla no
-- expone políticas de INSERT/UPDATE/DELETE.
--
-- Esto alimenta el «historial» del caso; la línea de tiempo (Paso 5) se arma en la
-- app a partir del estado + la validación + las derivaciones (0177). Idempotente.
-- Ejecutar tras 0177.
-- ============================================================

create table if not exists public.casos_historial_cambios (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos(id) on delete cascade,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  sensible       boolean not null default false,
  actor_id       uuid references public.perfiles(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_hist_cambios_caso on public.casos_historial_cambios(caso_id, creado_en);

alter table public.casos_historial_cambios enable row level security;
drop policy if exists hist_cambios_select on public.casos_historial_cambios;
create policy hist_cambios_select on public.casos_historial_cambios
  for select to authenticated using (
    public.es_admin()
    or public.puede_verificar()
    or exists (select 1 from public.casos c where c.id = caso_id and c.creado_por = auth.uid())
  );

-- ── Trigger: registra las correcciones de datos de la solicitud ──
-- Diffea un conjunto fijo de campos vía to_jsonb(new/old). Los campos sensibles de
-- contacto se registran sin valores (Paso 10). Solo escribe si el campo cambió, así
-- que los cambios de estado (que no tocan estos campos) no generan ruido.
create or replace function public.auditar_correccion_caso()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old   jsonb := to_jsonb(old);
  v_new   jsonb := to_jsonb(new);
  v_actor uuid  := auth.uid();
  -- {columna, etiqueta, sensible('t'/'f')}
  v_campos constant text[] := array[
    'titulo|Título|f',
    'descripcion|Descripción|f',
    'categoria|Categoría|f',
    'fuente|Fuente|f',
    'fuente_url|Enlace de la fuente|f',
    'fuente_tipo|Tipo de fuente|f',
    'fecha_publicacion|Fecha de publicación|f',
    'referente|Referente|f',
    'referente_rol|Rol del referente|f',
    'ubicacion_estado|Estado|f',
    'ubicacion_municipio|Municipio|f',
    'ubicacion_parroquia|Parroquia|f',
    'ubicacion_sector|Sector/comunidad|f',
    'ubicacion_direccion|Dirección|f',
    'req_tipo|Tipo de necesidad|f',
    'req_cantidad|Cantidad|f',
    'req_urgencia|Urgencia|f',
    'sigue_vigente|¿Sigue vigente?|f',
    'contacto|Contacto|t',
    'contacto_whatsapp|WhatsApp de contacto|t',
    'contacto_instagram|Instagram de contacto|t'
  ];
  v_item text; v_parts text[]; v_col text; v_lbl text; v_sens boolean;
  v_ant text; v_nue text;
begin
  foreach v_item in array v_campos loop
    v_parts := string_to_array(v_item, '|');
    v_col := v_parts[1]; v_lbl := v_parts[2]; v_sens := v_parts[3] = 't';
    v_ant := v_old ->> v_col;
    v_nue := v_new ->> v_col;
    if v_ant is distinct from v_nue then
      if v_sens then
        insert into public.casos_historial_cambios (caso_id, campo, sensible, actor_id)
        values (new.id, v_lbl, true, v_actor);
      else
        insert into public.casos_historial_cambios (caso_id, campo, valor_anterior, valor_nuevo, actor_id)
        values (new.id, v_lbl, v_ant, v_nue, v_actor);
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_auditar_correccion_caso on public.casos;
create trigger trg_auditar_correccion_caso
  after update on public.casos
  for each row execute function public.auditar_correccion_caso();

comment on table public.casos_historial_cambios is
  'Paso 12: historial append-only de correcciones de datos de una solicitud (valor original → corregido, quién, cuándo). Los campos de contacto se registran sin valores (Paso 10). Lo escribe solo el trigger.';
