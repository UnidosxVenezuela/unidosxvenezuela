'use client';
// Panel flotante de conversaciones (0231/0233).
//
// POR QUÉ EXISTE: entrar a una conversación no debería costar salir de donde estás. Si
// estás verificando una solicitud y alguien pregunta algo en tu grupo, navegar a
// /conversaciones te tira del trabajo y volver cuesta. El panel resuelve eso: se abre
// encima, se lee, se responde y se cierra — sin perder la pantalla de debajo.
//
// LEE CON LA SESIÓN DE QUIEN MIRA (cliente de navegador), así que la RLS se aplica igual
// que en la página completa: `hilos_bandeja` corre con security_invoker y `hilo_mensajes`
// tiene su policy. Aquí no hay ni un filtro de permisos escrito a mano — y no debe
// haberlo: si algún día hiciera falta uno, sería señal de que la RLS está mal.
//
// La página /conversaciones NO desaparece: sigue siendo la vista completa, y el panel
// enlaza a ella. Un panel es para atender; una página, para revisar.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AMBITOS_HILO, esAmbitoHilo, type MensajeHilo } from '@/lib/hilos';
import { fechaHora } from '@/lib/fechas';
import Icono from './Icono';
import HiloEnVivo from './HiloEnVivo';

type FilaBandeja = {
  id: string; ambito: string; ancla_id: string;
  ultimo_mensaje_en: string | null; sin_leer: number | null;
  ultimo_autor: string | null; ultimo_cuerpo: string | null;
  titulo: string;
};

type Abierto = {
  hiloId: string; ambito: string; anclaId: string; titulo: string;
  mensajes: MensajeHilo[]; participantes: { id: string; nombre: string }[];
};

/** Resuelve el título humano de cada fila. Una consulta por tabla, no una por hilo. */
async function conTitulos(supabase: any, filas: any[]): Promise<FilaBandeja[]> {
  const ids = (a: string) => filas.filter((f) => f.ambito === a).map((f) => f.ancla_id);
  const [casos, insumos, tareas, grupos] = await Promise.all([
    ids('caso').length ? supabase.from('casos').select('id, numero, titulo').in('id', ids('caso')) : { data: [] },
    ids('insumo').length ? supabase.from('solicitudes_insumo').select('id, titulo').in('id', ids('insumo')) : { data: [] },
    ids('tarea').length ? supabase.from('tareas').select('id, titulo').in('id', ids('tarea')) : { data: [] },
    ids('grupo').length ? supabase.from('grupos').select('id, nombre').in('id', ids('grupo')) : { data: [] },
  ]);
  const mapa = new Map<string, string>();
  for (const x of (casos.data ?? [])) mapa.set('caso:' + x.id, '#' + (x.numero ?? '—') + ' · ' + x.titulo);
  for (const x of (insumos.data ?? [])) mapa.set('insumo:' + x.id, 'Entrega · ' + x.titulo);
  for (const x of (tareas.data ?? [])) mapa.set('tarea:' + x.id, x.titulo);
  for (const x of (grupos.data ?? [])) mapa.set('grupo:' + x.id, x.nombre);
  return filas.map((f) => ({ ...f, titulo: mapa.get(f.ambito + ':' + f.ancla_id) ?? 'Conversación' }));
}

export default function PanelConversaciones({
  miId, alCerrar,
}: { miId: string; alCerrar: () => void }) {
  const [filas, setFilas] = useState<FilaBandeja[] | null>(null);
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [fallo, setFallo] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Cierre por Escape y por clic fuera. Estando dentro de una conversación, Escape
  // vuelve a la lista en vez de cerrar: es lo que espera quien acaba de entrar por error.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (abierto) setAbierto(null); else alCerrar();
    };
    const alClic = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t)) return;
      if (t.closest?.('.fab-chat')) return;      // el propio botón ya alterna
      alCerrar();
    };
    document.addEventListener('keydown', alTecla);
    const id = setTimeout(() => document.addEventListener('mousedown', alClic), 0);
    return () => {
      document.removeEventListener('keydown', alTecla);
      document.removeEventListener('mousedown', alClic);
      clearTimeout(id);
    };
  }, [abierto, alCerrar]);

  const cargarLista = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('hilos_bandeja')
      .select('id, ambito, ancla_id, ultimo_mensaje_en, sin_leer, ultimo_autor, ultimo_cuerpo')
      .order('ultimo_mensaje_en', { ascending: false })
      .limit(40);
    if (error) { setFallo(true); setFilas([]); return; }
    setFilas(await conTitulos(supabase, (data ?? []) as any[]));
  }, []);

  useEffect(() => { void cargarLista(); }, [cargarLista]);

  // La lista se refresca cuando entra un mensaje en cualquier hilo legible: la RLS ya
  // decide cuáles llegan, así que no hace falta filtro.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel('panel-conversaciones')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hilo_mensajes' }, () => {
        if (!abierto) void cargarLista();   // dentro de un hilo no se mueve la lista bajo los pies
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [abierto, cargarLista]);

  const abrirHilo = useCallback(async (f: FilaBandeja) => {
    const supabase = createClient();
    const [{ data: msgs }, { data: parts }] = await Promise.all([
      supabase.from('hilo_mensajes')
        .select('id, hilo_id, autor_id, autor_sello, cuerpo, pii_alerta, editado_en, creado_en')
        .eq('hilo_id', f.id).order('creado_en', { ascending: true }).limit(200),
      supabase.from('hilo_participantes')
        .select('perfil_id, perfiles ( nombre_completo )').eq('hilo_id', f.id),
    ]);
    setAbierto({
      hiloId: f.id, ambito: f.ambito, anclaId: f.ancla_id, titulo: f.titulo,
      mensajes: (msgs ?? []) as MensajeHilo[],
      participantes: ((parts ?? []) as any[])
        .filter((p) => p.perfil_id !== miId)
        .map((p) => ({ id: p.perfil_id as string, nombre: (p.perfiles?.nombre_completo as string) || 'Alguien' }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    });
  }, [miId]);

  const rutaAncla = abierto && esAmbitoHilo(abierto.ambito)
    ? AMBITOS_HILO[abierto.ambito].ruta(abierto.anclaId) : null;

  return (
    <div ref={panelRef} className="panel-conv" role="dialog" aria-label="Conversaciones">
      <header className="panel-conv-cab">
        {abierto ? (
          <>
            <button type="button" className="panel-conv-atras" onClick={() => setAbierto(null)}
              aria-label="Volver a la lista">
              <Icono nombre="chevron" size={18} />
            </button>
            <strong className="panel-conv-titulo" title={abierto.titulo}>{abierto.titulo}</strong>
            {rutaAncla && (
              <Link href={rutaAncla as any} className="panel-conv-ir" title="Abrir la ficha completa">
                Abrir
              </Link>
            )}
          </>
        ) : (
          <>
            <Icono nombre="conversacion" size={18} />
            <strong className="panel-conv-titulo">Conversaciones</strong>
            <Link href="/conversaciones" className="panel-conv-ir">Ver todas</Link>
          </>
        )}
        <button type="button" className="panel-conv-x" onClick={alCerrar} aria-label="Cerrar">
          <Icono nombre="cerrar" size={16} />
        </button>
      </header>

      <div className="panel-conv-cuerpo">
        {abierto ? (
          <HiloEnVivo
            key={abierto.hiloId}
            hiloId={abierto.hiloId}
            ambito={abierto.ambito}
            anclaId={abierto.anclaId}
            mensajesIniciales={abierto.mensajes}
            miId={miId}
            puedeEscribir
            participantes={abierto.participantes}
            vacio="Todavía no hay nada escrito aquí."
          />
        ) : filas === null ? (
          <p className="muted" style={{ margin: 0 }}>Cargando…</p>
        ) : fallo ? (
          <p className="muted" style={{ margin: 0 }}>
            Las conversaciones no están disponibles: falta aplicar la migración <code>0231</code>.
          </p>
        ) : filas.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Todavía no hay conversaciones. Entra a una solicitud, una tarea o tu grupo y
            escribe el primer mensaje.
          </p>
        ) : (
          <ul className="panel-conv-lista">
            {filas.map((f) => {
              const n = Number(f.sin_leer ?? 0);
              return (
                <li key={f.id}>
                  <button type="button" className="panel-conv-fila" onClick={() => void abrirHilo(f)}>
                    <span className="panel-conv-txt">
                      <span className="fila" style={{ gap: 6 }}>
                        <strong>{f.titulo}</strong>
                        {n > 0 && <span className="pill pill-info">{n}</span>}
                      </span>
                      <span className="muted panel-conv-ultimo">
                        {f.ultimo_autor ? f.ultimo_autor + ': ' : ''}{f.ultimo_cuerpo ?? ''}
                      </span>
                    </span>
                    <span className="muted panel-conv-fecha">
                      {f.ultimo_mensaje_en ? fechaHora(f.ultimo_mensaje_en) : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
