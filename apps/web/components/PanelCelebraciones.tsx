'use client';
import { useCallback, useEffect, useState } from 'react';
import Icono from './Icono';
import Celebracion from './Celebracion';
import {
  CATALOGO,
  ETIQUETA_EVENTO,
  ETIQUETA_TONO,
  EVENTOS_CELEBRACION,
  celebracionPorId,
  celebracionesActivas,
  conexionLimitada,
  elegiblesPara,
  fotoRotacion,
  marcarVista,
  mensajeCelebracion,
  puedeServirVideo,
  reiniciarRotacion,
  setCelebraciones,
  siguienteCelebracion,
  type Celebracion as TipoCelebracion,
  type EventoCelebracion,
  type FotoRotacion,
} from '@/lib/celebraciones';

/**
 * EL PANEL DE ANIMACIONES. La galería de todo lo que puede aparecer cuando alguien
 * cierra un hito, con su interruptor personal y —para Coordinación— el orden de la
 * baraja, que es lo que explica por qué salió lo que salió.
 *
 * Decisiones que conviene conocer:
 *
 *  · NADA SE CARGA SOLO. Cada animación viaja en su propio chunk (`React.lazy` desde
 *    el catálogo) y los vídeos pesan ~1 MB entre los cuatro. Esta es una PWA que se usa
 *    en emergencia desde móviles con datos contados, así que una vista previa solo se
 *    descarga cuando alguien pulsa «Probar». Por eso las tarjetas nacen con un hueco
 *    y no con la animación puesta: es a propósito, y el texto lo dice.
 *
 *  · TODO LO QUE TOCA EL NAVEGADOR VA EN EFECTOS. La preferencia, la baraja y el estado
 *    de la conexión viven en `localStorage`/`navigator`: leerlos en el render rompería
 *    la hidratación (el servidor no los tiene). De ahí el guardia `montado`.
 *
 *  · «Probar como aparece de verdad» CONSUME la baraja igual que una celebración real.
 *    Es deliberado: así se ve la rotación funcionando y el mazo de abajo cambia en vivo.
 *    El botón «Rebarajar» lo deshace.
 *
 *  · El catálogo se lee del propio motor (`lib/celebraciones.ts` es isomórfico), no se
 *    serializa desde el servidor: las entradas llevan funciones (`cargar`) que no
 *    cruzarían la frontera Server→Client.
 */

type Filtro = EventoCelebracion | 'todas';

/** Lado del dibujo dentro de la tarjeta. Cabe en la columna más estrecha de la rejilla. */
const LADO_VISTA = 200;

export default function PanelCelebraciones({ esAdmin = false }: { esAdmin?: boolean }) {
  // `montado` guarda todo lo que depende del navegador (ver cabecera).
  const [montado, setMontado] = useState(false);
  const [activas, setActivas] = useState(true);
  const [videoOk, setVideoOk] = useState(true);
  const [ahorro, setAhorro] = useState(false);
  const [reducido, setReducido] = useState(false);

  // Sube cada vez que se toca la baraja, para releerla y recalcular «la siguiente».
  const [version, setVersion] = useState(0);
  const [foto, setFoto] = useState<FotoRotacion | null>(null);
  const [siguienteId, setSiguienteId] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<Filtro>('todas');
  /** id → cuántas veces se ha probado. Su presencia es lo que monta la vista previa. */
  const [rondas, setRondas] = useState<Record<string, number>>({});
  const [overlay, setOverlay] = useState<{ celebracion: TipoCelebracion; mensaje: string; ronda: number } | null>(null);

  useEffect(() => {
    setMontado(true);
    setActivas(celebracionesActivas());
    setVideoOk(puedeServirVideo());
    setAhorro(conexionLimitada());
    setReducido(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  }, []);

  useEffect(() => {
    if (!montado) return;
    setFoto(fotoRotacion());
  }, [montado, version]);

  // Cuál saldría AHORA para el evento elegido. Se calcula en un efecto y no en el
  // render porque `siguienteCelebracion` puede rebarajar (y eso escribe en localStorage).
  useEffect(() => {
    if (!montado || filtro === 'todas') { setSiguienteId(null); return; }
    setSiguienteId(siguienteCelebracion(filtro, { permitirVideo: videoOk })?.id ?? null);
  }, [montado, filtro, videoOk, version]);

  const alternarPreferencia = useCallback(() => {
    setActivas((v) => { setCelebraciones(!v); return !v; });
  }, []);

  const probar = useCallback((id: string) => {
    setRondas((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 }));
  }, []);

  /** La experiencia completa: capa por encima de la app, con su mensaje y su cierre. */
  const probarDeVerdad = useCallback(() => {
    const evento: EventoCelebracion = filtro === 'todas' ? 'generico' : filtro;
    const elegida = siguienteCelebracion(evento, { permitirVideo: videoOk });
    if (!elegida) return;
    marcarVista(elegida.id);           // consume la carta, como una celebración real
    setVersion((v) => v + 1);
    setOverlay((o) => ({ celebracion: elegida, mensaje: mensajeCelebracion(evento), ronda: (o?.ronda ?? 0) + 1 }));
  }, [filtro, videoOk]);

  const rebarajar = useCallback(() => {
    reiniciarRotacion();
    setVersion((v) => v + 1);
  }, []);

  const visibles = filtro === 'todas' ? CATALOGO : elegiblesPara(filtro);
  const nVideo = visibles.filter((c) => c.tipo === 'video').length;
  // Las que están EN USO y las que esperan visto bueno. `elegiblesPara` ya filtra
  // las no aprobadas, así que al filtrar por evento la segunda lista queda vacía.
  const enUso = visibles.filter((c) => c.aprobada);
  const pendientes = visibles.filter((c) => !c.aprobada);

  return (
    <>
      {/* ── Interruptor personal + estado del dispositivo ───────────────────── */}
      <section className="tarjeta">
        <div className="fila" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>Mis celebraciones</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '.9rem' }}>
              Se guarda en este dispositivo. No cambia nada para el resto del equipo.
            </p>
          </div>
          <button
            type="button"
            className={'btn' + (activas ? ' btn-acento' : '')}
            onClick={alternarPreferencia}
            aria-pressed={activas}
            disabled={!montado}
          >
            <Icono nombre={activas ? 'ok' : 'cerrar'} size={16} />
            {activas ? 'Activadas' : 'Desactivadas'}
          </button>
        </div>

        {montado && !activas && (
          <p className="pcel-nota" style={{ marginTop: 12 }}>
            <Icono nombre="avisos" size={16} />
            <span>
              Están apagadas: al cerrar una tarea o una entrega no aparecerá nada. El aviso de
              confirmación (el mensaje verde) sigue saliendo igual. Aquí abajo puedes probarlas
              de todas formas antes de decidir.
            </span>
          </p>
        )}

        {montado && reducido && (
          <p className="pcel-nota" style={{ marginTop: 12 }}>
            <Icono nombre="ojo" size={16} />
            <span>
              Tu sistema pide <strong>reducir el movimiento</strong>, así que aquí verás cada
              dibujo terminado y quieto, sin animación. Es a propósito: la celebración nunca
              desaparece, solo deja de moverse.
            </span>
          </p>
        )}

        {montado && ahorro && (
          <p className="pcel-nota" style={{ marginTop: 12 }}>
            <Icono nombre="avisos" size={16} />
            <span>
              Tu conexión está en <strong>ahorro de datos</strong>. Ahora mismo no se servirían
              los vídeos (pesan cerca de 1 MB entre los cuatro): solo saldrían las dibujadas,
              que ocupan unos pocos KB.
            </span>
          </p>
        )}
      </section>

      {/* ── Filtro por evento ───────────────────────────────────────────────── */}
      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>¿Qué sale en cada momento?</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: '.9rem' }}>
          Elige un momento y verás exactamente las animaciones que pueden salir ahí, con la
          que tocaría ahora marcada como <strong>Siguiente</strong>.
        </p>
        <div className="pcel-filtros" role="group" aria-label="Filtrar por momento">
          <button
            type="button"
            className="pcel-chip"
            aria-pressed={filtro === 'todas'}
            onClick={() => setFiltro('todas')}
          >
            Todas ({CATALOGO.length})
          </button>
          {EVENTOS_CELEBRACION.map((ev) => (
            <button
              key={ev}
              type="button"
              className="pcel-chip"
              aria-pressed={filtro === ev}
              onClick={() => setFiltro(ev)}
            >
              {ETIQUETA_EVENTO[ev]}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '.85rem' }}>
          Las de «{ETIQUETA_EVENTO.generico}» son <strong>comodín</strong>: sirven para todos
          los momentos, así que también aparecen en la lista de cualquier otro.
        </p>

        <div className="fila" style={{ marginTop: 12, gap: 10 }}>
          <button type="button" className="btn btn-primario" onClick={probarDeVerdad} disabled={!montado}>
            <Icono nombre="cohete" size={16} /> Probar como aparece de verdad
          </button>
          <span className="muted" style={{ fontSize: '.85rem' }}>
            Usa tu baraja real: la próxima vez te tocará otra distinta.
          </span>
        </div>

        {filtro !== 'todas' && (
          <p className="muted" style={{ margin: '10px 0 0', fontSize: '.88rem' }}>
            <strong>{visibles.length}</strong>{' '}
            {visibles.length === 1 ? 'animación puede salir' : 'animaciones pueden salir'} en
            «{ETIQUETA_EVENTO[filtro]}»
            {nVideo > 0 && !videoOk && montado && <> · {nVideo} son vídeo y ahora no se servirían</>}.
          </p>
        )}
      </section>

      {/* ── La galería ──────────────────────────────────────────────────────── */}
      <div className="pcel-rejilla">
        {enUso.map((c) => (
          <Tarjeta
            key={c.id}
            celebracion={c}
            ronda={rondas[c.id] ?? 0}
            esSiguiente={c.id === siguienteId}
            servible={montado ? c.tipo !== 'video' || videoOk : true}
            onProbar={() => probar(c.id)}
          />
        ))}
      </div>

      {/* ── Pendientes de aprobación ────────────────────────────────────────
          Siguen en el catálogo y se pueden probar aquí, pero NO le salen a nadie
          trabajando hasta que su diseño se apruebe. Se enseñan porque esconderlas
          haría que se olvidaran: están esperando una decisión, no descartadas. */}
      {pendientes.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <div className="fila" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>Pendientes de aprobación</h2>
            <span className="pill pill-neutra">{pendientes.length}</span>
          </div>
          <p className="muted" style={{ marginTop: 4, marginBottom: 14, maxWidth: '68ch' }}>
            Están hechas y se pueden probar, pero <strong>no salen en la aplicación</strong>: nadie
            las verá al terminar una tarea. Cuando su diseño se dé por bueno, pasan a la rotación.
          </p>
          <div className="pcel-rejilla" style={{ opacity: 0.72 }}>
            {pendientes.map((c) => (
              <Tarjeta
                key={c.id}
                celebracion={c}
                ronda={rondas[c.id] ?? 0}
                esSiguiente={false}
                servible={montado ? c.tipo !== 'video' || videoOk : true}
                onProbar={() => probar(c.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── La baraja (solo Coordinación) ───────────────────────────────────── */}
      {esAdmin && <Baraja foto={foto} montado={montado} onRebarajar={rebarajar} />}

      {/* La experiencia real, por encima de la app. Se cierra sola, al tocar o con Escape.
          El cierre se compara por RONDA: si alguien vuelve a pulsar mientras la anterior
          se está yendo, el aviso de cierre de la vieja no puede tumbar a la nueva. */}
      {overlay && (
        <Celebracion
          key={overlay.ronda}
          celebracion={overlay.celebracion}
          mensaje={overlay.mensaje}
          alCerrar={() => setOverlay((o) => (o && o.ronda === overlay.ronda ? null : o))}
        />
      )}
    </>
  );
}

/* ══════════════════════════ Una tarjeta del catálogo ══════════════════════════ */

function Tarjeta({ celebracion: c, ronda, esSiguiente, servible, onProbar }: {
  celebracion: TipoCelebracion;
  ronda: number;
  esSiguiente: boolean;
  servible: boolean;
  onProbar: () => void;
}) {
  // `generico` es COMODÍN: si está en la lista, la animación entra en todos los
  // momentos y los demás eventos que lleve son intención del dibujo, no un filtro.
  // Se dice así de claro para que el panel no prometa algo que el motor no hace.
  const comodin = c.eventos.includes('generico');
  const concretos = c.eventos.filter((e) => e !== 'generico');

  return (
    <article className="tarjeta pcel-tarjeta">
      <div className="fila" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{c.nombre}</h3>
        {esSiguiente && <span className="insignia ok">Siguiente</span>}
      </div>

      <div className="pcel-vista">
        {ronda > 0 ? (
          <Celebracion
            key={c.id + ':' + ronda}
            celebracion={c}
            mensaje={c.nombre}
            alCerrar={() => { /* la vista previa no se cierra sola */ }}
            incrustada
            size={LADO_VISTA}
          />
        ) : (
          <div className="pcel-vista-vacia">
            <Icono nombre={c.tipo === 'video' ? 'video' : 'imagen'} size={26} />
            <span>Toca «Probar» para verla</span>
          </div>
        )}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>{c.descripcion}</p>

      <div className="fila" style={{ gap: 6 }}>
        <span className={'pill ' + (c.tipo === 'video' ? 'pill-aviso' : 'pill-ok')}>
          {c.tipo === 'video' ? 'Vídeo' : 'Dibujada'}
        </span>
        <span className="pcel-tono" data-tono={c.tono}>{ETIQUETA_TONO[c.tono]}</span>
        {c.pesoKb != null && (
          <span className="pill pill-neutra" title="Lo que ocupa descargarla">
            {c.pesoKb >= 1024 ? (c.pesoKb / 1024).toFixed(1) + ' MB' : c.pesoKb + ' KB'}
          </span>
        )}
      </div>

      <div className="pcel-momentos">
        {comodin ? (
          <>
            <span className="pill pill-info">Cualquier momento</span>
            {concretos.length > 0 && (
              <span className="muted" style={{ fontSize: '.8rem' }}>
                pensada para {concretos.map((e) => ETIQUETA_EVENTO[e].toLowerCase()).join(' y ')}
              </span>
            )}
          </>
        ) : (
          concretos.map((e) => <span key={e} className="pill pill-neutra">{ETIQUETA_EVENTO[e]}</span>)
        )}
      </div>

      {!servible && (
        <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
          Con tu conexión actual esta no se serviría; en su lugar saldría una dibujada.
        </p>
      )}

      <div className="pcel-pie">
        <button type="button" className="btn" onClick={onProbar} style={{ minHeight: 38, width: '100%' }}>
          <Icono nombre={ronda > 0 ? 'refrescar' : 'ojo'} size={15} />
          {ronda > 0 ? 'Repetir' : 'Probar'}
        </button>
      </div>
    </article>
  );
}

/* ══════════════════════════ La baraja (Coordinación) ══════════════════════════ */

/**
 * El orden REAL del mazo de este dispositivo. Explica la rotación mejor que cualquier
 * texto: se barajan las elegibles de cada momento y se van sacando cartas sin repetir
 * hasta agotar el mazo; al rebarajar, la primera nunca puede ser la última que se vio.
 */
function Baraja({ foto, montado, onRebarajar }: {
  foto: FotoRotacion | null;
  montado: boolean;
  onRebarajar: () => void;
}) {
  const nombre = (id: string) => celebracionPorId(id)?.nombre ?? id;
  const mazos = foto
    ? EVENTOS_CELEBRACION
      .map((ev) => ({ ev, mazo: foto.barajas[ev] ?? [] }))
      .filter((m) => m.mazo.length > 0)
    : [];

  return (
    <section className="tarjeta">
      <div className="fila" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>Baraja actual</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '.9rem' }}>
            Solo Coordinación. Es el mazo de <strong>este dispositivo</strong>: una animación no
            se repite hasta que se agotan las demás de ese momento.
          </p>
        </div>
        <button type="button" className="btn" onClick={onRebarajar} disabled={!montado}>
          <Icono nombre="refrescar" size={16} /> Rebarajar
        </button>
      </div>

      {!montado ? (
        <p className="muted" style={{ marginBottom: 0 }}>Leyendo la baraja…</p>
      ) : mazos.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
          Todavía no hay ningún mazo repartido. Se crea solo la primera vez que sale una
          celebración de ese momento (o al pulsar «Probar como aparece de verdad»).
        </p>
      ) : (
        <>
          {foto?.ultima && (
            <p className="muted" style={{ fontSize: '.88rem', marginTop: 12, marginBottom: 0 }}>
              Última vista: <strong>{nombre(foto.ultima)}</strong>. Ninguna baraja puede
              empezar por ella.
            </p>
          )}
          <div className="pcel-mazos">
            {mazos.map(({ ev, mazo }) => (
              <div key={ev} className="pcel-mazo">
                <h3 className="pcel-mazo-tit">{ETIQUETA_EVENTO[ev]}</h3>
                <ol className="pcel-mazo-lista">
                  {mazo.map((id, i) => (
                    <li key={id} className={i === 0 ? 'pcel-mazo-prox' : undefined}>
                      <span className="pcel-mazo-num">{i + 1}</span>
                      {nombre(id)}
                      {i === 0 && <span className="insignia ok" style={{ marginLeft: 6 }}>Siguiente</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
