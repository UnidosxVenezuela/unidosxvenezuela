'use client';
// Lista de mensajes en vivo + redactor (migración 0231).
//
// EXCEPCIÓN CONSCIENTE AL PATRÓN DE LA CASA: aquí NO sirve <RealtimeRefrescar>. Su
// contrato es ignorar el payload y disparar router.refresh() con 1500 ms de espera, lo
// que en una conversación significa un viaje completo al servidor por cada mensaje y
// segundo y medio de retraso. Este componente lee `payload.new` y añade el mensaje en el
// cliente, como ya hace PizarraGrupo.tsx — el otro sitio del repo que aplica el cambio
// de forma incremental.
//
// El redactor SÍ es un <form action={serverAction}>: funciona sin JavaScript y el
// mensaje propio llega por revalidación. Los de los demás llegan por el canal. Se
// deduplica por id, así que da igual cuál llegue antes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { avisoPii, type MensajeHilo } from '@/lib/hilos';
import { fechaHora } from '@/lib/fechas';
import Icono from './Icono';
import { escribirEnHilo, editarMensajeHilo, marcarHiloLeido } from '@/app/(app)/conversaciones/actions';

type Participante = { id: string; nombre: string };

/**
 * Espejo en el cliente de public.detectar_datos_sensibles() (0231). Existe para poder
 * avisar ANTES de enviar; la marca que queda registrada la pone siempre la base, así que
 * si los dos se desincronizan gana la base y aquí solo se pierde un aviso.
 */
function detectarPii(t: string): string[] {
  const r: string[] = [];
  if (/(^|[^0-9a-záéíóúñ])[ve][-. ]?\d{1,2}\.?\d{3}\.?\d{3}([^0-9a-záéíóúñ]|$)/i.test(t)) r.push('cedula_ve');
  if (/(^|[^0-9])0?4(12|14|16|24|26)[-. ]?\d{3}[-. ]?\d{4}([^0-9]|$)/.test(t)) r.push('movil_ve');
  if (/(^|[^0-9])(\+?57[-. ]?)?3\d{2}[-. ]?\d{3}[-. ]?\d{4}([^0-9]|$)/.test(t)) r.push('movil_co');
  if (/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i.test(t)) r.push('correo');
  if (/-?\d{1,2}\.\d{4,}[, ]+-?\d{1,3}\.\d{4,}/.test(t)) r.push('coordenadas');
  return r;
}

export default function HiloEnVivo({
  hiloId,
  ambito,
  anclaId,
  mensajesIniciales,
  miId,
  puedeEscribir,
  participantes,
  vacio,
}: {
  hiloId: string | null;
  ambito: string;
  anclaId: string;
  mensajesIniciales: MensajeHilo[];
  miId: string;
  puedeEscribir: boolean;
  participantes: Participante[];
  vacio: string;
}) {
  const [llegados, setLlegados] = useState<MensajeHilo[]>([]);
  const [borrador, setBorrador] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [mencionados, setMencionados] = useState<string[]>([]);
  const listaRef = useRef<HTMLDivElement | null>(null);

  // Los que ya vinieron por revalidación dejan de necesitar la copia local.
  const mensajes = useMemo(() => {
    const ids = new Set(mensajesIniciales.map((m) => m.id));
    const extra = llegados.filter((m) => !ids.has(m.id));
    return [...mensajesIniciales, ...extra].sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  }, [mensajesIniciales, llegados]);

  // Canal acotado a este hilo. Sin hilo todavía (nadie ha escrito) no hay a qué suscribirse.
  useEffect(() => {
    if (!hiloId) return;
    const supabase = createClient();
    const canal = supabase
      .channel('hilo-' + hiloId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hilo_mensajes', filter: 'hilo_id=eq.' + hiloId },
        (payload: any) => {
          const fila = payload.new as MensajeHilo | undefined;
          if (!fila || !fila.id) return;
          setLlegados((prev) => {
            const i = prev.findIndex((m) => m.id === fila.id);
            if (i === -1) return [...prev, fila];
            const copia = [...prev];          // una edición: se sustituye en su sitio
            copia[i] = fila;
            return copia;
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [hiloId]);

  // Marcar leído al entrar y cada vez que llega algo nuevo estando a la vista.
  useEffect(() => {
    if (!hiloId) return;
    void marcarHiloLeido(hiloId);
  }, [hiloId, mensajes.length]);

  // Al enviar, el servidor revalida y el mensaje propio vuelve por props. React resetea
  // solo el <textarea> (es NO controlado, ver abajo); esto limpia el estado que lo
  // acompaña: el aviso de datos sensibles y las casillas de menciones.
  const nMensajes = mensajes.length;
  const nPrevio = useRef(nMensajes);
  useEffect(() => {
    if (nMensajes > nPrevio.current) { setBorrador(''); setMencionados([]); }
    nPrevio.current = nMensajes;
  }, [nMensajes]);

  // Bajar al último mensaje CUANDO LLEGA UNO, moviendo solo el scroll de la lista.
  // Tres cuidados, y los tres importan:
  //  · Nada en el primer render: el hilo va al final de una ficha larga, así que un
  //    scrollIntoView al montar arrastraría la página entera y se saltaría el contenido
  //    que la persona vino a leer.
  //  · Solo si ya estaba abajo: a quien está releyendo hacia arriba no se le mueve el
  //    suelo por un mensaje nuevo.
  //  · Sin animación si pidió reducir el movimiento.
  const montado = useRef(false);
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    if (!montado.current) { montado.current = true; return; }
    const cerca = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 120;
    if (!cerca) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    lista.scrollTo({ top: lista.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [mensajes.length]);

  const piiBorrador = detectarPii(borrador);
  const aviso = avisoPii(piiBorrador);

  return (
    <div className="hilo">
      <div ref={listaRef} className="hilo-lista" role="log" aria-live="polite" aria-label="Mensajes de la conversación">
        {mensajes.length === 0 && <p className="muted" style={{ margin: 0 }}>{vacio}</p>}

        {mensajes.map((m) => {
          const mio = m.autor_id != null && m.autor_id === miId;
          const avisoMsg = avisoPii(m.pii_alerta);
          return (
            <article key={m.id} className={'hilo-msg' + (mio ? ' hilo-msg-mio' : '')}>
              <div className="hilo-meta">
                <strong>{m.autor_sello}</strong>
                <span className="muted"> · {fechaHora(m.creado_en)}</span>
                {m.editado_en && <span className="muted" title={'Editado el ' + fechaHora(m.editado_en)}> · editado</span>}
              </div>

              {editando === m.id ? (
                <form action={editarMensajeHilo} className="hilo-editor">
                  <input type="hidden" name="mensaje" value={m.id} />
                  <input type="hidden" name="ambito" value={ambito} />
                  <input type="hidden" name="ancla" value={anclaId} />
                  <textarea name="cuerpo" className="input" defaultValue={m.cuerpo} rows={3} required
                            aria-label="Editar el mensaje" />
                  <div className="fila" style={{ gap: 8, marginTop: 6 }}>
                    <button className="btn btn-primario" type="submit">Guardar</button>
                    <button className="btn" type="button" onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                  <p className="muted" style={{ fontSize: '.82rem', marginTop: 6 }}>
                    Se guarda lo que decía antes: el registro no se pierde al corregir.
                  </p>
                </form>
              ) : (
                <>
                  <div className="hilo-cuerpo">{m.cuerpo}</div>
                  {avisoMsg && (
                    <p className="hilo-pii">
                      <Icono nombre="avisos" size={14} /> {avisoMsg}
                    </p>
                  )}
                  {mio && puedeEscribir && (
                    <button className="hilo-editar" type="button" onClick={() => setEditando(m.id)}>
                      Editar
                    </button>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>

      {/* La Server Action va DIRECTA en `action`, sin envolverla en una función de
          cliente: así el redactor sigue funcionando sin JavaScript, que en un teléfono
          justo o con la red a medias es exactamente cuando hace falta. El <textarea> es
          NO controlado por lo mismo — se le lee el valor con onChange solo para poder
          avisar de datos sensibles antes de enviar. */}
      {puedeEscribir ? (
        <form action={escribirEnHilo} className="hilo-redactor">
          <input type="hidden" name="ambito" value={ambito} />
          <input type="hidden" name="ancla" value={anclaId} />
          <input type="hidden" name="menciones" value={mencionados.join(',')} />

          <textarea
            name="cuerpo"
            className="input"
            rows={3}
            maxLength={4000}
            placeholder="Escribe aquí lo que haya que dejar por escrito…"
            onChange={(e) => setBorrador(e.target.value)}
            aria-label="Escribir un mensaje"
          />

          {aviso && (
            <p className="hilo-pii" role="status">
              <Icono nombre="avisos" size={14} /> {aviso}
            </p>
          )}

          {participantes.length > 0 && (
            <details className="hilo-mencionar">
              <summary>Avisar a alguien ({mencionados.length})</summary>
              <p className="muted" style={{ fontSize: '.82rem', margin: '6px 0' }}>
                Solo aparece quien ya entró a esta conversación: es a quien el aviso le llegaría de verdad.
              </p>
              <div className="fila" style={{ flexWrap: 'wrap', gap: 8 }}>
                {participantes.map((p) => (
                  <label key={p.id} className={'chip-hab' + (mencionados.includes(p.id) ? ' chip-hab-on' : '')}>
                    <input
                      type="checkbox"
                      checked={mencionados.includes(p.id)}
                      onChange={(e) =>
                        setMencionados((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                        )
                      }
                      style={{ marginRight: 6 }}
                    />
                    {p.nombre}
                  </label>
                ))}
              </div>
            </details>
          )}

          <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span className="muted" style={{ fontSize: '.8rem' }}>
              {borrador.length > 3500 ? borrador.length + ' / 4000' : 'Queda registrado. No se borra.'}
            </span>
            {/* Sin `disabled`: sin JavaScript `borrador` sería siempre '' y el botón
                nacería inutilizable. Un envío vacío no es un error — la acción no hace
                nada y ya está. */}
            <button className="btn btn-primario" type="submit">Enviar</button>
          </div>
        </form>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Puedes leer esta conversación, pero no escribir en ella.</p>
      )}
    </div>
  );
}
