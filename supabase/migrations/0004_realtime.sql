-- ============================================================
-- Plataforma Unidos — Habilitar Realtime
-- ============================================================
-- Añade las tablas a la publicación supabase_realtime para recibir
-- cambios (INSERT/UPDATE/DELETE) por WebSocket. RLS sigue aplicando:
-- cada cliente solo recibe filas que su rol puede leer.

alter publication supabase_realtime add table public.tareas;
alter publication supabase_realtime add table public.comentarios_tarea;
alter publication supabase_realtime add table public.publicaciones;
alter publication supabase_realtime add table public.notificaciones;
