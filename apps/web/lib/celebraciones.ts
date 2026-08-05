/**
 * ============================================================================
 * MOTOR DE CELEBRACIONES — catálogo, rotación y preferencia.
 * ============================================================================
 *
 * Cuando alguien cierra una acción de verdad (entrega una solicitud, completa
 * una tarea, cubre un ítem, publica un caso…) le aparece una animación breve
 * que le reconoce el trabajo. Es gente voluntaria en una emergencia: la
 * celebración da alegría SIN banalizar la tragedia y SIN retrasar el trabajo.
 *
 * Este módulo es PURO y ISOMÓRFICO (no lleva 'use client'): puede importarse
 * desde Server Components para leer el catálogo. Todo acceso al navegador
 * (localStorage, navigator) está guardado y falla en silencio.
 *
 * Piezas del motor:
 *   - `lib/celebraciones.ts`            catálogo + rotación + preferencia  (esto)
 *   - `components/Celebracion.tsx`      el overlay que la pinta
 *   - `components/CelebracionProveedor.tsx`  lee `?celebrar=` y dispara
 *   - `components/celebraciones/*.tsx`  las animaciones SVG
 *   - `app/globals.css`                 clases `.cel-*`
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CONTRATO PARA LAS ANIMACIONES SVG (léelo entero antes de escribir una)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1) DÓNDE Y CÓMO SE LLAMA
 *    Un archivo por animación en `apps/web/components/celebraciones/`, con
 *    nombre PascalCase en español y sin sufijos («ManosUnidas.tsx»,
 *    «SemillaCrece.tsx»). `export default` obligatorio: el motor lo carga con
 *    `React.lazy`, así que el chunk NO se descarga hasta que toca esa carta.
 *
 * 2) PROPS QUE RECIBE  (tipo `PropsAnimacionCelebracion`, más abajo)
 *
 *      onFin: () => void   Llámalo cuando tu animación TERMINE. Es opcional en
 *                          la práctica: el motor cierra igual por su propio
 *                          temporizador. Lo que ocurra primero, gana — pero el
 *                          motor garantiza un MÍNIMO en pantalla (2,2 s) para
 *                          que dé tiempo a leer el mensaje, así que no te
 *                          preocupes si tu animación dura menos.
 *      reducido: boolean   true = `prefers-reduced-motion: reduce`. OBLIGATORIO:
 *                          si es true NO animes NADA — ni anime.js, ni
 *                          @keyframes, ni transiciones. Pinta el FOTOGRAMA
 *                          FINAL (lo que se vería al acabar) y no llames a
 *                          `onFin` con un temporizador; el motor cierra solo.
 *      size?: number       Lado en px del lienzo cuadrado. Por defecto 160.
 *
 * 3) EJEMPLO MÍNIMO (copia esta forma; `DestelloBase.tsx` es la de referencia)
 *
 *      'use client';
 *      import { useLayoutEffect, useRef } from 'react';
 *      import { createTimeline } from 'animejs';
 *      import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
 *
 *      export default function ManosUnidas({ onFin, reducido, size = 160 }: PropsAnimacionCelebracion) {
 *        const ref = useRef<SVGSVGElement>(null);
 *        useLayoutEffect(() => {
 *          if (reducido || !ref.current) return;            // (a) guarda primero
 *          const tl = createTimeline({ onComplete: () => onFin() });
 *          tl.add(ref.current.querySelectorAll('.mano'), { opacity: [0, 1], scale: [.7, 1], duration: 420, ease: 'outBack' });
 *          return () => { tl.revert(); };                    // (b) limpieza siempre
 *        }, [reducido, onFin]);
 *        return <svg ref={ref} width={size} height={size} viewBox="-60 -60 120 120" aria-hidden="true" >…</svg>;
 *      }
 *
 *    Reglas que el motor da por hechas:
 *      (a) `'use client'` + animar dentro de `useLayoutEffect` (nunca en render).
 *      (b) devolver limpieza con `.revert()`; el overlay desmonta a los ~3,4 s.
 *      (c) `aria-hidden="true"` en el `<svg>`: el texto lo anuncia el overlay
 *          con su propio `aria-live`. La animación es decoración, no contenido.
 *      (d) VIEWBOX CENTRADO EN EL ORIGEN: usa `viewBox="-60 -60 120 120"`. Así
 *          `translate(0,0)` es el centro y `scale` gira alrededor del centro sin
 *          pelearse con `transform-origin` en SVG. Ahorra mucho dolor.
 *      (e) PESO: SVG inline + anime.js, pocos KB. Nunca imágenes ni vídeo nuevo
 *          (PWA de emergencia, datos limitados y móviles lentos).
 *      (f) COLOR: usa los tokens (`var(--azul)`, `var(--amarillo)`, `var(--rojo)`,
 *          `var(--texto)`, `var(--sup1)`) o `currentColor`. Así el tema oscuro
 *          sale gratis. OJO: `--rojo-solido` está roto en tema claro
 *          (autorreferencia en globals.css) — no lo uses.
 *      (g) anime.js es v4: `import { animate, createTimeline, stagger, svg } from 'animejs'`,
 *          `ease:` (no `easing:`), tokens sin prefijo (`'outCubic'`, no `'easeOutCubic'`).
 *
 * 4) CÓMO SE REGISTRA (una sola entrada, sin tocar el motor)
 *    Añade al array `CATALOGO` de este archivo:
 *
 *      {
 *        id: 'manos-unidas',                   // kebab-case, único y estable
 *        aprobada: true,                       // sin esto NO entra en la rotación
 *        nombre: 'Manos unidas',               // corto, en español (lo ve la gente)
 *        descripcion: 'Dos manos que se juntan y sueltan un destello.',
 *        tipo: 'svg',
 *        eventos: ['tarea_completada', 'aporte_registrado'],  // o ['generico']
 *        tono: 'tierno',
 *        pesoKb: 3,
 *        cargar: () => import('@/components/celebraciones/ManosUnidas'),
 *      },
 *
 *    `eventos: ['generico']` = comodín, sirve para CUALQUIER evento. Si listas
 *    eventos concretos, solo sale en esos (útil si el dibujo lleva un rótulo).
 *    Nada más: la rotación y el overlay la recogen automáticamente.
 * ────────────────────────────────────────────────────────────────────────────
 */

// Import SOLO de tipo: se borra al compilar, el módulo sigue sin React en runtime.
import type { ComponentType } from 'react';

/* ══════════════════════════ Eventos ══════════════════════════ */

/**
 * Los momentos que se celebran. Salen de los puntos de finalización reales de
 * las Server Actions (ver `lib/flash.ts` → `redirigirOk(ruta, mensaje, evento)`).
 *
 * `'generico'` tiene doble papel:
 *   - como ETIQUETA en una celebración: comodín, elegible para todos los eventos.
 *   - como EVENTO pedido: solo entran las celebraciones marcadas como comodín.
 */
export type EventoCelebracion =
  | 'solicitud_creada'
  | 'solicitud_verificada'
  | 'tarea_completada'
  | 'item_cumplido'
  | 'entrega_completada'
  | 'caso_publicado'
  | 'aporte_registrado'
  | 'correo_enviado'
  | 'generico';

export const EVENTOS_CELEBRACION: EventoCelebracion[] = [
  'solicitud_creada',
  'solicitud_verificada',
  'tarea_completada',
  'item_cumplido',
  'entrega_completada',
  'caso_publicado',
  'aporte_registrado',
  'correo_enviado',
  'generico',
];

export const ETIQUETA_EVENTO: Record<EventoCelebracion, string> = {
  solicitud_creada: 'Solicitud creada',
  solicitud_verificada: 'Solicitud verificada',
  tarea_completada: 'Tarea completada',
  item_cumplido: 'Ítem cubierto',
  entrega_completada: 'Entrega completada',
  caso_publicado: 'Solicitud publicada',
  aporte_registrado: 'Aporte registrado',
  correo_enviado: 'Correo enviado',
  generico: 'Cualquier logro',
};

/**
 * El parámetro de URL por el que viaja la señal «esto terminó bien, celebra».
 *
 * POR QUÉ LA URL: en este repo las 198 llamadas a `redirigirOk` son `never` —
 * hacen `redirect()` de Next—, así que NINGUNA Server Action devuelve un valor
 * al cliente. El único canal servidor→cliente que ya existe es la query string
 * (`?ok=` / `?err=` que consume el <Toast/>). Reutilizarlo no cuesta nada: un
 * tercer argumento opcional en `redirigirOk` y las 198 llamadas siguen igual.
 *
 * QUIÉN LO LIMPIA (para no pisarse): si hay `ok`/`err`, lo borra el <Toast/> en
 * su único `router.replace` —un solo escritor, sin carrera—. Si viene suelto, lo
 * borra `CelebracionProveedor` con `history.replaceState` (como
 * `ClaveTemporalModal`), que no invalida el router y no compite con nadie.
 */
export const PARAM_CELEBRACION = 'celebrar';

/** ¿Este texto (que viene de la URL, o sea, de fuera) es un evento válido? */
export function esEventoCelebracion(valor: unknown): valor is EventoCelebracion {
  return typeof valor === 'string' && (EVENTOS_CELEBRACION as string[]).includes(valor);
}

/* ══════════════════════════ Tonos ══════════════════════════ */

/** El «humor» de la animación. Sirve para equilibrar el catálogo y filtrar en el panel. */
export type TonoCelebracion = 'epico' | 'gracioso' | 'tierno' | 'sobrio';

export const ETIQUETA_TONO: Record<TonoCelebracion, string> = {
  epico: 'Épica',
  gracioso: 'Graciosa',
  tierno: 'Tierna',
  sobrio: 'Sobria',
};

/* ══════════════════════════ La celebración ══════════════════════════ */

/** Props que recibe TODA animación SVG del catálogo (ver el contrato de cabecera). */
export type PropsAnimacionCelebracion = {
  /** Llámalo al terminar la animación. El motor cierra igual por temporizador. */
  onFin: () => void;
  /** `prefers-reduced-motion: reduce` activo → pinta el fotograma final, no animes. */
  reducido: boolean;
  /** Lado del lienzo cuadrado en px (por defecto 160). */
  size?: number;
};

/** Lo que devuelve un `import()` de una animación SVG. */
export type ModuloAnimacion = { default: ComponentType<PropsAnimacionCelebracion> };

type CelebracionBase = {
  /** kebab-case, único y ESTABLE: se guarda en localStorage (la baraja). */
  id: string;
  /** Nombre corto en español; se ve en el panel. */
  nombre: string;
  /** Una línea: qué se ve. */
  descripcion: string;
  /** Comodín (`['generico']`) o la lista de eventos concretos donde encaja. */
  eventos: EventoCelebracion[];
  tono: TonoCelebracion;
  /**
   * Peso de TRANSFERENCIA aproximado en KB (no es un peso de probabilidad: la
   * rotación es una baraja sin repetición, todas salen lo mismo). Sirve para
   * decidir qué NO servir con datos limitados y para vigilar el catálogo.
   */
  pesoKb?: number;
  /** Cuánto se queda en pantalla. Por defecto: SVG 3400 ms, vídeo 4200 ms. */
  duracionMs?: number;
  /**
   * ¿Está APROBADO su diseño? Solo las aprobadas entran en la rotación.
   *
   * Una celebración sin aprobar sigue en el catálogo y se puede ver y probar en
   * /celebraciones, pero NUNCA le sale a nadie trabajando. Así el diseño se
   * revisa con calma sin sacar el código de la rama ni perder el trabajo hecho:
   * aprobar es cambiar este campo a `true`.
   *
   * Ausente = NO aprobada. El valor por defecto tiene que ser el conservador:
   * que algo salga en producción debe ser una decisión explícita.
   */
  aprobada?: boolean;
};

export type CelebracionSvg = CelebracionBase & {
  tipo: 'svg';
  /** Carga diferida del componente (React.lazy). Su chunk no viaja hasta usarse. */
  cargar: () => Promise<ModuloAnimacion>;
};

export type CelebracionVideo = CelebracionBase & {
  tipo: 'video';
  /** Ruta pública del .webm. */
  fuente: string;
  /** Ruta pública del .jpg de respaldo (poster). */
  poster: string;
  /**
   * true = el vídeo tiene CANAL ALFA real: se superpone sin caja ni fondo,
   * como una pegatina. false = ilustración con fondo sólido → va en tarjeta.
   */
  alfa?: boolean;
};

export type Celebracion = CelebracionSvg | CelebracionVideo;
export type TipoCelebracion = Celebracion['tipo'];

/* ══════════════════════════ El catálogo ══════════════════════════ */

/**
 * Para añadir una animación: una entrada aquí y ya (ver el contrato de cabecera).
 * Mantén el equilibrio de tonos y no dejes ningún evento sin comodín que lo cubra.
 */
export const CATALOGO: Celebracion[] = [
  // ── SVG ──────────────────────────────────────────────────────────────────
  {
    // Referencia del contrato + red de seguridad del motor: si un vídeo falla,
    // no carga o la conexión va justa, SIEMPRE queda esta. No la quites.
    id: 'destello-base',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Destello',
    descripcion: 'Un visto que se dibuja y suelta chispas tricolor.',
    tipo: 'svg',
    eventos: ['generico'],
    tono: 'sobrio',
    pesoKb: 2,
    cargar: () => import('@/components/celebraciones/DestelloBase'),
  },
  {
    id: 'sello-aprobado',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Sello de aprobado',
    descripcion: 'Un sello cae sobre el documento, rebota y deja la marca «VERIFICADO».',
    tipo: 'svg',
    eventos: ['solicitud_verificada'],
    tono: 'sobrio',
    pesoKb: 2,
    cargar: () => import('@/components/celebraciones/SelloAprobado'),
  },
  {
    id: 'caja-entregada',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Caja que llega',
    descripcion: 'Una caja de ayuda baja, se abre y suelta confeti; sale un corazón.',
    tipo: 'svg',
    eventos: ['entrega_completada', 'item_cumplido'],
    tono: 'tierno',
    pesoKb: 2,
    cargar: () => import('@/components/celebraciones/CajaEntregada'),
  },
  {
    id: 'cohete-difusion',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Cohete',
    descripcion: 'Un cohete despega dejando estela y suelta ondas de difusión.',
    tipo: 'svg',
    eventos: ['caso_publicado'],
    tono: 'epico',
    pesoKb: 2,
    cargar: () => import('@/components/celebraciones/CoheteDifusion'),
  },
  {
    id: 'barra-100',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Barra al 100 %',
    descripcion: 'Una barra corre hasta el 100 %, se pone verde y estalla en partículas.',
    tipo: 'svg',
    eventos: ['item_cumplido', 'generico'],
    tono: 'epico',
    pesoKb: 2,
    cargar: () => import('@/components/celebraciones/Barra100'),
  },
  {
    id: 'lo-logre',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: '¡Lo logréee!',
    descripcion: 'Alguien llega arrastrándose a la meta, se levanta y ondea su letrero.',
    tipo: 'svg',
    eventos: ['solicitud_creada', 'solicitud_verificada', 'generico'],
    tono: 'gracioso',
    pesoKb: 5,
    cargar: () => import('@/components/celebraciones/LoLogre'),
  },
  {
    id: 'cafe-al-100',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Café al 100 %',
    descripcion: 'Se rellena la taza, sube el vapor y el medidor de energía llega al 100 %.',
    tipo: 'svg',
    eventos: ['tarea_completada', 'generico'],
    tono: 'tierno',
    pesoKb: 5,
    cargar: () => import('@/components/celebraciones/CafeAl100'),
  },
  {
    id: 'cara-meme',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Cara de satisfacción',
    descripcion: 'Una cara dibujada con ojos enormes y sonrisa de suficiencia, con rótulo.',
    tipo: 'svg',
    eventos: ['generico'],
    tono: 'gracioso',
    pesoKb: 4,
    cargar: () => import('@/components/celebraciones/CaraMeme'),
  },

  {
    id: 'choque-manos',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Choque de manos',
    descripcion: 'Dos manos chocan los cinco con onda de impacto, chispas y un «¡ESO!».',
    tipo: 'svg',
    eventos: ['generico', 'aporte_registrado'],
    tono: 'tierno',
    pesoKb: 4,
    cargar: () => import('@/components/celebraciones/ChoqueManos'),
  },
  {
    id: 'corazon-lleno',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Corazón que se llena',
    descripcion: 'Un corazón late, se va llenando y al rebosar suelta gotas y ondas.',
    tipo: 'svg',
    eventos: ['entrega_completada', 'generico'],
    tono: 'tierno',
    pesoKb: 4,
    cargar: () => import('@/components/celebraciones/CorazonLleno'),
  },
  {
    id: 'gato-teclista',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Gato teclista',
    descripcion: 'Un gato teclea con las patas borrosas: «procesando…» pasa a «¡listo!».',
    tipo: 'svg',
    eventos: ['generico', 'correo_enviado'],
    tono: 'gracioso',
    pesoKb: 6,
    cargar: () => import('@/components/celebraciones/GatoTeclista'),
  },
  {
    id: 'trofeo',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Trofeo',
    descripcion: 'Un trofeo sube con rayos de luz girando y se graba «GRACIAS» en la placa.',
    tipo: 'svg',
    eventos: ['generico'],
    tono: 'epico',
    pesoKb: 5,
    cargar: () => import('@/components/celebraciones/Trofeo'),
  },
  {
    id: 'planta-crece',
    aprobada: false,   // diseño pendiente de aprobación
    nombre: 'Planta que crece',
    descripcion: 'Un brote sale de la tierra, echa hojas, florece y saca un segundo brote.',
    tipo: 'svg',
    eventos: ['generico'],
    tono: 'sobrio',
    pesoKb: 5,
    cargar: () => import('@/components/celebraciones/PlantaCrece'),
  },

  // ── Vídeo ────────────────────────────────────────────────────────────────
  {
    id: 'unicornio',
    aprobada: true,
    nombre: 'Unicornio',
    descripcion: 'Un unicornio que aparece y celebra. Se superpone sin caja.',
    tipo: 'video',
    eventos: ['generico'],
    tono: 'gracioso',
    pesoKb: 595,
    fuente: '/celebraciones/unicornio.webm',
    poster: '/celebraciones/unicornio.jpg',
    alfa: true,
  },
  {
    id: 'guacamayo',
    aprobada: true,
    nombre: 'Guacamayo',
    descripcion: 'Un guacamayo tricolor que alza el vuelo. Se superpone sin caja.',
    tipo: 'video',
    eventos: ['generico'],
    tono: 'tierno',
    pesoKb: 594,
    fuente: '/celebraciones/guacamayo.webm',
    poster: '/celebraciones/guacamayo.jpg',
    alfa: true,
  },
  {
    // Lleva el rótulo QUEMADO en la imagen → solo puede salir en su evento.
    id: 'solicitud-publicada',
    aprobada: true,
    nombre: 'Solicitud publicada',
    descripcion: 'Ilustración azul con el rótulo «Solicitud publicada».',
    tipo: 'video',
    eventos: ['caso_publicado', 'solicitud_creada'],
    tono: 'sobrio',
    pesoKb: 199,
    fuente: '/celebraciones/solicitud-publicada.webm',
    poster: '/celebraciones/solicitud-publicada.jpg',
  },
  {
    // Rótulo quemado: atada a su evento.
    id: 'tarea-completada',
    aprobada: true,
    nombre: 'Tarea completada',
    descripcion: 'Ilustración azul con el rótulo «Tarea completada».',
    tipo: 'video',
    eventos: ['tarea_completada'],
    tono: 'sobrio',
    pesoKb: 172,
    fuente: '/celebraciones/tarea-completada.webm',
    poster: '/celebraciones/tarea-completada.jpg',
  },
];

/** Busca por id (para el panel y para los enlaces directos). */
export function celebracionPorId(id: string, catalogo: Celebracion[] = CATALOGO): Celebracion | null {
  return catalogo.find((c) => c.id === id) ?? null;
}

/* ══════════════════════════ Mensajes ══════════════════════════ */

/**
 * El texto corto del overlay. NO repite el mensaje del toast (que dice el hecho,
 * «Solicitud entregada.»): esto es el reconocimiento a la persona. Varias frases
 * por evento para que tampoco canse el texto.
 */
export const MENSAJES_EVENTO: Record<EventoCelebracion, string[]> = {
  solicitud_creada: ['¡Solicitud en marcha!', 'Ya está en el sistema. Gracias.', 'Registrada. Buen trabajo.'],
  solicitud_verificada: ['¡Verificada!', 'Un dato menos en duda. Gracias.', 'Verificación al día.'],
  tarea_completada: ['¡Tarea completada!', 'Una menos. Gracias por el empuje.', '¡Cerrada! Buen trabajo.'],
  item_cumplido: ['¡Ítem cubierto!', 'Eso ya está resuelto. Gracias.', '¡Cubierto al 100 %!'],
  entrega_completada: ['¡Entrega completada!', 'Llegó a su destino. Gracias.', '¡Entregado! Gran trabajo.'],
  caso_publicado: ['¡Publicada!', 'Ya está donde tiene que estar.', 'Difundida. Gracias.'],
  aporte_registrado: ['¡Aporte registrado!', 'Suma y sigue. Gracias.', 'Un poco más cerca.'],
  correo_enviado: ['¡Correo enviado!', 'Mensaje en camino. Gracias.', 'Enviado y registrado.'],
  generico: ['¡Buen trabajo!', 'Gracias por estar. 💛💙❤️', '¡Bien hecho!'],
};

/** Elige una frase para el evento. `aleatorio` inyectable para poder probarlo. */
export function mensajeCelebracion(evento: EventoCelebracion, aleatorio: () => number = Math.random): string {
  const frases = MENSAJES_EVENTO[evento] ?? MENSAJES_EVENTO.generico;
  const i = Math.min(frases.length - 1, Math.floor(aleatorio() * frases.length));
  return frases[i] ?? MENSAJES_EVENTO.generico[0] ?? '¡Buen trabajo!';
}

/* ══════════════════════════ Preferencia de la persona ══════════════════════════ */

/**
 * Quien no quiera animaciones las apaga y punto. Mismo patrón que `lib/sonido.ts`
 * (`ux-sonido`): localStorage, por defecto ACTIVADO, falla en silencio (en modo
 * privado de Safari `localStorage` puede lanzar). No hay tabla de preferencias
 * por perfil en la base de datos y no hace falta crearla para esto.
 *
 * OJO: son DOS EJES DISTINTOS y se componen, no se sustituyen:
 *   - `prefers-reduced-motion` → la celebración DEGRADA a un aviso estático.
 *   - esta preferencia         → la celebración NO aparece en absoluto.
 */
export const CLAVE_PREFERENCIA = 'ux-celebracion';

export function celebracionesActivas(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(CLAVE_PREFERENCIA) !== 'off';
  } catch {
    return true;
  }
}

export function setCelebraciones(activas: boolean): void {
  try {
    localStorage.setItem(CLAVE_PREFERENCIA, activas ? 'on' : 'off');
  } catch {
    /* sin localStorage: no pasa nada */
  }
}

/* ══════════════════════════ Rotación: la baraja ══════════════════════════ */

/**
 * Que no salga siempre la misma. Modelo de BARAJA: se barajan las elegibles del
 * evento y se van sacando cartas; ninguna se repite hasta agotar el mazo.
 *
 *   - Un mazo POR EVENTO (los elegibles cambian según el evento).
 *   - `ultima` es GLOBAL: la última carta vista, sea del evento que sea. Al
 *     rebarajar, la primera del mazo nuevo NUNCA puede ser `ultima` — si no, se
 *     vería dos veces seguidas justo en el corte.
 *   - `marcarVista(id)` saca esa carta de TODOS los mazos: una comodín vista en
 *     «tarea completada» tampoco reaparece de inmediato en «entrega».
 */
export const CLAVE_ROTACION = 'ux-celebracion-baraja';
const VERSION_ROTACION = 1;

type EstadoRotacion = {
  v: number;
  /** id de la última celebración vista (global). */
  ultima: string | null;
  /** evento → ids que quedan por salir, en orden. */
  barajas: Record<string, string[]>;
};

function rotacionVacia(): EstadoRotacion {
  return { v: VERSION_ROTACION, ultima: null, barajas: {} };
}

function leerRotacion(): EstadoRotacion {
  try {
    if (typeof localStorage === 'undefined') return rotacionVacia();
    const crudo = localStorage.getItem(CLAVE_ROTACION);
    if (!crudo) return rotacionVacia();
    const d = JSON.parse(crudo) as Partial<EstadoRotacion> | null;
    // Versión distinta o forma rara → se empieza de cero (nunca se rompe).
    if (!d || typeof d !== 'object' || d.v !== VERSION_ROTACION) return rotacionVacia();
    const barajas: Record<string, string[]> = {};
    for (const [ev, mazo] of Object.entries(d.barajas ?? {})) {
      if (Array.isArray(mazo)) barajas[ev] = mazo.filter((x): x is string => typeof x === 'string');
    }
    return { v: VERSION_ROTACION, ultima: typeof d.ultima === 'string' ? d.ultima : null, barajas };
  } catch {
    return rotacionVacia();
  }
}

function guardarRotacion(estado: EstadoRotacion): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CLAVE_ROTACION, JSON.stringify(estado));
  } catch {
    /* modo privado / cuota llena: la rotación degrada a aleatoria, no pasa nada */
  }
}

/** Fisher-Yates con azar inyectable (para poder probarlo sin sorpresas). */
export function barajar<T>(items: readonly T[], aleatorio: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(aleatorio() * (i + 1)));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export type OpcionesSeleccion = {
  /** Fuente de azar inyectable. Por defecto `Math.random` (nunca en el módulo). */
  aleatorio?: () => number;
  /** false = fuera los vídeos (datos limitados, sin soporte WebM, o falló uno). */
  permitirVideo?: boolean;
  /** ids que no deben salir (p. ej. el vídeo que acaba de fallar). */
  excluir?: string[];
  /** Catálogo alternativo (pruebas y vista previa del panel). */
  catalogo?: Celebracion[];
};

/** Las celebraciones que pueden salir para este evento, con los filtros aplicados. */
export function elegiblesPara(evento: EventoCelebracion, opciones: OpcionesSeleccion = {}): Celebracion[] {
  const catalogo = opciones.catalogo ?? CATALOGO;
  const permitirVideo = opciones.permitirVideo ?? true;
  const excluir = new Set(opciones.excluir ?? []);
  return catalogo.filter((c) => {
    // Sin aprobar = no sale nunca en producción, aunque siga en el catálogo.
    if (!c.aprobada) return false;
    if (excluir.has(c.id)) return false;
    if (!permitirVideo && c.tipo === 'video') return false;
    // Comodín (`generico`) o listada explícitamente para este evento.
    return c.eventos.includes('generico') || c.eventos.includes(evento);
  });
}

/**
 * La siguiente carta del mazo de este evento. NO la consume: para eso está
 * `marcarVista(id)` (así el llamador puede descartarla si el vídeo falla y pedir
 * otra sin gastar la baraja). Devuelve `null` si no hay ninguna elegible.
 *
 * No comprueba la preferencia de la persona a propósito: eso lo decide quien
 * llama (`CelebracionProveedor`), para que el panel pueda previsualizar aunque
 * las tenga apagadas.
 */
export function siguienteCelebracion(
  evento: EventoCelebracion,
  opciones: OpcionesSeleccion = {},
): Celebracion | null {
  const aleatorio = opciones.aleatorio ?? Math.random;
  const elegibles = elegiblesPara(evento, opciones);
  if (elegibles.length === 0) return null;
  // Con una sola elegible no hay rotación posible: se repetirá, y está bien.
  if (elegibles.length === 1) return elegibles[0] ?? null;

  const ids = elegibles.map((c) => c.id);
  const validos = new Set(ids);
  const estado = leerRotacion();

  // Se descartan del mazo guardado los ids que ya no existen o no aplican ahora
  // (el catálogo crece, y `permitirVideo` puede cambiar entre una vez y otra).
  let mazo = (estado.barajas[evento] ?? []).filter((id) => validos.has(id));

  if (mazo.length === 0) {
    mazo = barajar(ids, aleatorio);
    // CLAVE: al rebarajar, la primera no puede ser la última que se vio.
    if (estado.ultima && mazo[0] === estado.ultima && mazo.length > 1) {
      const j = Math.min(mazo.length - 1, 1 + Math.floor(aleatorio() * (mazo.length - 1)));
      const tmp = mazo[0]!;
      mazo[0] = mazo[j]!;
      mazo[j] = tmp;
    }
    guardarRotacion({ ...estado, barajas: { ...estado.barajas, [evento]: mazo } });
  }

  return elegibles.find((c) => c.id === mazo[0]) ?? elegibles[0] ?? null;
}

/** Consume la carta: la saca de TODOS los mazos y la deja como «la última vista». */
export function marcarVista(id: string): void {
  const estado = leerRotacion();
  const barajas: Record<string, string[]> = {};
  for (const [ev, mazo] of Object.entries(estado.barajas)) {
    barajas[ev] = mazo.filter((x) => x !== id);
  }
  guardarRotacion({ v: VERSION_ROTACION, ultima: id, barajas });
}

/* ══════════════════════════ Guardas del navegador ══════════════════════════ */

/**
 * ¿La conexión pide ahorrar datos? Los vídeos pesan ~1 MB en total y esto es una
 * PWA que se usa en emergencia desde móviles con datos contados: con conexión
 * justa o «ahorro de datos» se cae a las animaciones SVG (2-3 KB).
 */
export function conexionLimitada(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g';
}

/** ¿El navegador sabe reproducir WebM? (Safari viejo: no, y menos con alfa). */
export function soportaWebm(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const v = document.createElement('video');
    return !!v.canPlayType && v.canPlayType('video/webm; codecs="vp9"') !== '';
  } catch {
    return false;
  }
}

/** ¿Se pueden servir vídeos ahora mismo? (soporte + datos). */
export function puedeServirVideo(): boolean {
  return soportaWebm() && !conexionLimitada();
}
