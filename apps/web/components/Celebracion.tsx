'use client';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  celebracionPorId,
  type Celebracion as TipoCelebracion,
  type CelebracionSvg,
  type PropsAnimacionCelebracion,
} from '@/lib/celebraciones';

/**
 * OVERLAY de celebración: pinta la animación elegida por encima del contenido
 * con un mensaje corto, y se quita sola. NUNCA bloquea el trabajo.
 *
 * Reglas que cumple (y por qué):
 *  - `.cel-capa` es `pointer-events: none` y va POR DEBAJO del toast (z-index
 *    900 < 1000): se puede seguir tocando la app por debajo mientras se ve.
 *    Solo el dibujo captura el puntero, para poder cerrarla tocándola.
 *  - Se cierra sola (~3,4 s SVG / ~4,2 s vídeo), al pulsar en cualquier sitio,
 *    al hacer scroll, con Escape, o cuando la animación avisa por `onFin`.
 *    Siempre respetando un MÍNIMO en pantalla (que dé tiempo a leer el mensaje).
 *  - `prefers-reduced-motion`: NADA se mueve. Degrada a un aviso estático
 *    discreto con el mismo texto, que se cierra igual. Se escucha el cambio de
 *    la media query en vivo.
 *  - No roba el foco ni mete nada en el orden de tabulación. El texto se anuncia
 *    con `aria-live="polite"`; el dibujo es decoración (`aria-hidden`).
 *  - El sonido ya lo pone el <Toast/> (`exito()`): aquí no suena nada, para no
 *    duplicar. La celebración COMPLEMENTA al toast, no lo repite.
 *  - No toca `document.body.style.overflow` (a diferencia de la vieja
 *    `CelebracionInsignias`): el scroll de la página nunca se bloquea.
 */

/** Mínimo en pantalla: aunque la animación acabe antes, el mensaje se lee. */
const MINIMO_MS = 2200;
const DURACION_SVG_MS = 3400;
const DURACION_VIDEO_MS = 4200;
const DURACION_REDUCIDA_MS = 3000;
/** Si el vídeo no está listo para pintar en este tiempo, se cae a SVG. */
const ESPERA_VIDEO_MS = 1500;
/** Gracia antes de escuchar scroll/pulsaciones (evita cerrarla en el mismo gesto). */
const GRACIA_MS = 450;
/** Duración de la salida (debe coincidir con `@keyframes cel-salida` en globals.css). */
const SALIDA_MS = 200;

/** React.lazy por id, memorizado: el chunk de cada animación viaja solo cuando toca. */
const CACHE_ANIMACIONES = new Map<string, ComponentType<PropsAnimacionCelebracion>>();
function componenteDe(c: CelebracionSvg): ComponentType<PropsAnimacionCelebracion> {
  let comp = CACHE_ANIMACIONES.get(c.id);
  if (!comp) {
    comp = lazy(c.cargar);
    CACHE_ANIMACIONES.set(c.id, comp);
  }
  return comp;
}

/** ¿El sistema pide reducir el movimiento? (con escucha en vivo del cambio). */
function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReducido(mq.matches);
    const alCambiar = (e: MediaQueryListEvent) => setReducido(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', alCambiar);
      return () => mq.removeEventListener('change', alCambiar);
    }
    // Safari viejo solo tiene addListener/removeListener.
    mq.addListener(alCambiar);
    return () => mq.removeListener(alCambiar);
  }, []);
  return reducido;
}

export type PropsCelebracion = {
  celebracion: TipoCelebracion;
  /** Texto corto en español. Complementa al toast, no lo repite. */
  mensaje: string;
  /** El motor la retira: quien la montó debe dejar de renderizarla aquí. */
  alCerrar: () => void;
  /** Vista previa del panel: sin capa fija, sin temporizadores, sin escuchas. */
  incrustada?: boolean;
  /** Lado del dibujo en px. */
  size?: number;
};

export default function Celebracion({ celebracion, mensaje, alCerrar, incrustada = false, size }: PropsCelebracion) {
  const reducido = useMovimientoReducido();
  const [saliendo, setSaliendo] = useState(false);
  const [videoFallo, setVideoFallo] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const nacida = useRef(Date.now());
  const cerrada = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Si el vídeo se cae (sin soporte, error de red, no arranca), se sustituye por
  // la SVG de respaldo del catálogo. La celebración nunca se queda en blanco.
  const respaldo = celebracionPorId('destello-base');
  const activa: TipoCelebracion = videoFallo && respaldo ? respaldo : celebracion;

  /** Cierre suave: respeta el mínimo en pantalla y anima la salida. */
  const cerrar = useCallback((inmediato = false) => {
    if (cerrada.current || incrustada) return;
    const falta = inmediato ? 0 : Math.max(0, MINIMO_MS - (Date.now() - nacida.current));
    if (falta > 0) {
      window.setTimeout(() => cerrar(true), falta);
      return;
    }
    cerrada.current = true;
    if (reducido) { alCerrar(); return; }
    setSaliendo(true);
    window.setTimeout(alCerrar, SALIDA_MS);
  }, [alCerrar, incrustada, reducido]);

  // Región viva: se rellena un instante después de montar para que el lector de
  // pantalla lo lea como un CAMBIO (si nace con texto, muchos lo ignoran).
  useEffect(() => {
    const t = window.setTimeout(() => setAnuncio(mensaje), 60);
    return () => window.clearTimeout(t);
  }, [mensaje]);

  // Cierre automático + Escape + pulsación + scroll. Nada de esto bloquea la app:
  // las escuchas son pasivas y no cancelan ningún evento.
  useEffect(() => {
    if (incrustada) return;
    const vida = reducido
      ? DURACION_REDUCIDA_MS
      : activa.duracionMs ?? (activa.tipo === 'video' ? DURACION_VIDEO_MS : DURACION_SVG_MS);
    const tFin = window.setTimeout(() => cerrar(true), vida);

    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(true); };
    document.addEventListener('keydown', alTeclear);

    // Tras la gracia: cualquier toque o scroll la retira (la persona sigue trabajando).
    const alGesto = () => cerrar(true);
    const tGracia = window.setTimeout(() => {
      document.addEventListener('pointerdown', alGesto, { capture: true, passive: true });
      window.addEventListener('scroll', alGesto, { passive: true });
    }, GRACIA_MS);

    return () => {
      window.clearTimeout(tFin);
      window.clearTimeout(tGracia);
      document.removeEventListener('keydown', alTeclear);
      document.removeEventListener('pointerdown', alGesto, { capture: true });
      window.removeEventListener('scroll', alGesto);
    };
  }, [activa, cerrar, incrustada, reducido]);

  // Vídeo: se pide reproducir a mano (con `preload="none"` algunos navegadores no
  // arrancan solos) y se vigila que llegue a pintar algo; si no, se cae a SVG.
  useEffect(() => {
    if (activa.tipo !== 'video' || reducido || videoFallo) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => { /* lo resuelve la vigilancia */ });
    const t = window.setTimeout(() => {
      if (videoRef.current && videoRef.current.readyState < 2) setVideoFallo(true);
    }, ESPERA_VIDEO_MS);
    return () => window.clearTimeout(t);
  }, [activa, reducido, videoFallo]);

  // Movimiento reducido: aviso estático. Nada se mueve y nada desaparece.
  // En la celebración de verdad se muestra SOLO el aviso (uniforme, y sin
  // descargar nada). En la VISTA PREVIA del panel (`incrustada`) sí se pinta el
  // fotograma final —que por contrato es estático cuando `reducido`— para que se
  // pueda ver qué es cada animación.
  if (reducido) {
    const cuerpo = (
      <div className={'cel-aviso' + (incrustada ? ' cel-aviso-vertical' : '')} role="status" aria-live="polite" aria-atomic="true">
        <span className={incrustada ? 'cel-aviso-arte' : 'cel-aviso-ico'} aria-hidden="true">
          {incrustada ? (
            activa.tipo === 'svg'
              ? <AnimacionSvg celebracion={activa} reducido size={size} onFin={() => { /* no cierra en vista previa */ }} />
              /* eslint-disable-next-line @next/next/no-img-element */
              : <img className="cel-poster" src={activa.poster} alt="" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false">
              <path d="M20 6 L9 17 L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="cel-aviso-txt">{anuncio || ' '}</span>
      </div>
    );
    if (incrustada) return <div className="cel-incrustada">{cuerpo}</div>;
    return <div className="cel-capa cel-capa-quieta">{cuerpo}</div>;
  }

  const arte = activa.tipo === 'video'
    ? (
      <video
        ref={videoRef}
        className={'cel-video' + (activa.alfa ? ' cel-video-alfa' : '')}
        src={activa.fuente}
        poster={activa.poster}
        preload="none"
        autoPlay
        muted
        playsInline
        aria-hidden="true"
        onError={() => setVideoFallo(true)}
        onEnded={() => cerrar()}
      />
    )
    : <AnimacionSvg celebracion={activa} reducido={false} size={size} onFin={() => cerrar()} />;

  const figura = (
    <div
      className={'cel-figura' + (saliendo ? ' cel-saliendo' : '')}
      onClick={() => cerrar(true)}
      title="Toca para cerrar"
    >
      <div className={'cel-arte' + (activa.tipo === 'video' && !activa.alfa ? ' cel-arte-caja' : '')}>
        {arte}
      </div>
      <div className="cel-mensaje" role="status" aria-live="polite" aria-atomic="true">
        {anuncio || ' '}
      </div>
    </div>
  );

  if (incrustada) return <div className="cel-incrustada">{figura}</div>;
  return <div className="cel-capa">{figura}</div>;
}

/** Carga diferida de la animación SVG; mientras llega su chunk no se pinta nada. */
function AnimacionSvg({ celebracion, reducido, size, onFin }: {
  celebracion: CelebracionSvg; reducido: boolean; size?: number; onFin: () => void;
}) {
  const Comp = componenteDe(celebracion);
  return (
    <Suspense fallback={null}>
      <Comp onFin={onFin} reducido={reducido} size={size} />
    </Suspense>
  );
}
