---
name: anime-js
description: Referencia de anime.js v4 (juliangarnier/anime) para animar UI en este proyecto (Next.js 14 App Router + PWA). Úsala al animar componentes, transiciones, listas, SVG, arrastre (draggable), scroll o timelines. Cubre la API modular v4, las diferencias con v3, el patrón obligatorio de `'use client'` + limpieza, y el blindaje de accesibilidad (`prefers-reduced-motion`) que sigue esta plataforma.
---

# anime.js v4 en Apoyo por Venezuela

Instalado en `apps/web`: **`animejs@^4` (v4.5.0)**. Es **un solo paquete** que ya trae
**todos los módulos** (animate, timer, timeline, draggable, scope, svg, text, scroll,
utils, easings, waapi, adapter three) — no hay librerías extra que instalar.

> anime.js v4 es una **reescritura modular** de la v3. Este repo migró de v3 a v4; si
> ves código viejo (`import anime from 'animejs'; anime({ targets, easing })`), es v3:
> hay que portarlo (ver «Migrar de v3»). Precedente ya migrado: `components/AnimarEntrada.tsx`.

## Reglas de oro en este proyecto (no negociables)

1. **Solo en cliente.** anime.js toca el DOM. El componente/archivo debe empezar con
   `'use client'` y animar dentro de `useEffect`/`useLayoutEffect` (nunca en render ni
   en Server Components). Usa `useLayoutEffect` si necesitas fijar el estado inicial
   antes del primer pintado (evita parpadeo).
2. **Respeta `prefers-reduced-motion`.** SIEMPRE. Si el usuario pide menos movimiento,
   NO animes: deja el contenido en su estado final visible. Molde:
   ```ts
   const sinMovimiento = typeof window !== 'undefined'
     && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   if (sinMovimiento) { /* poner estado final, no animar */ return; }
   ```
3. **Nunca dejes contenido invisible por una animación.** Si fijas `opacity:0` como
   estado inicial, garantiza el `opacity:1` final aunque la animación falle (try/catch o
   callback `onComplete`). La accesibilidad y la legibilidad ganan al efecto.
4. **Limpia al desmontar.** Devuelve una función de limpieza que revierta:
   `return () => { animation.revert(); }` (o `scope.revert()` / `draggable.revert()`).
   Evita fugas y estados a medias en navegación cliente.
5. **Discreción.** Es una plataforma de respuesta a emergencia: animación sutil y rápida
   (150–500 ms), sin rebotes llamativos en datos sensibles o de NNA. Nada de distraer del
   contenido crítico.

## API v4 esencial

```ts
'use client';
import { animate, stagger } from 'animejs';

// Animar (targets primero, luego params). `ease` (no `easing`); tokens sin prefijo `ease`.
const a = animate(targets, {
  opacity: [0, 1],          // [desde, hasta]
  translateY: [14, 0],      // transformes por nombre; también `x`, `y`, `rotate`, `scale`
  delay: stagger(55),       // escalonado entre elementos
  duration: 480,
  ease: 'outCubic',         // v4: 'outCubic' (v3 era 'easeOutCubic')
  loop: false,
  onComplete: () => {},
});
a.pause(); a.play(); a.restart(); a.revert();
```

`targets` acepta selector CSS, `HTMLElement`, `NodeList` o un array de ellos.

## Módulos disponibles («todas sus librerías»)

Todo se importa por nombre desde `'animejs'`:

| Import | Para qué |
|---|---|
| `animate(targets, params)` | Animación puntual (lo más común). |
| `createTimer({...})` | Cronómetro/loop con `onUpdate`/`onComplete` sin targets. |
| `createTimeline()` | Secuencias encadenadas: `.add(targets, params, position)`. |
| `stagger(v, params?)` | Retardo/escalonado por índice, rejilla o desde un origen. |
| `createAnimatable(t, {...})` | Setters animados en vivo (p. ej. seguir el cursor). |
| `createDraggable(t, {...})` | Arrastre con inercia, ejes, snapping, contenedores. |
| `createScope({...})` | Agrupa animaciones (media queries, cleanup en bloque). |
| `onScroll({...})` | Disparar/ligar animaciones al scroll (scroll-linked). |
| `svg.createDrawable` · `svg.morphTo` · `svg.createMotionPath` | Trazado («line drawing»), morphing y movimiento por path SVG. |
| `text.split` / `text.splitText` / `text.scrambleText` | Animación por letras/palabras/líneas. |
| `utils` | Helpers: `utils.random`, `utils.clamp`, `utils.$` (selector), `utils.set`, etc. |
| `easings` + `createSpring` | Curvas y resortes físicos (`ease: createSpring({ stiffness })`). |
| `waapi.animate` | Variante que compila a Web Animations API (main-thread-light). |
| `animejs/adapters/three` | Adaptador para three.js (solo si algún día se usa 3D). |

## Migrar de v3 → v4 (checklist)

- `import anime from 'animejs'` → `import { animate, stagger } from 'animejs'`.
- `anime({ targets: X, ...p })` → `animate(X, p)` (targets sale del objeto).
- `easing: 'easeOutCubic'` → `ease: 'outCubic'` (quita el prefijo `ease`).
- `anime.stagger(n)` → `stagger(n)` (import con nombre).
- `anime.timeline()` → `createTimeline()`; `.add({...})` → `.add(targets, params, pos)`.
- Ya **no** hace falta `@types/animejs`: v4 trae sus propios tipos.

## Patrón React recomendado (con limpieza y a11y)

```tsx
'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

export function Revelar({ children, selector = '.tarjeta' }:
  { children: React.ReactNode; selector?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const cont = ref.current; if (!cont) return;
    const targets = Array.from(cont.querySelectorAll<HTMLElement>(selector));
    if (!targets.length) return;
    const menos = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (menos) { targets.forEach((t) => (t.style.opacity = '1')); return; }
    targets.forEach((t) => (t.style.opacity = '0'));
    const a = animate(targets, { opacity: [0,1], translateY: [14,0], delay: stagger(55), duration: 480, ease: 'outCubic' });
    return () => { a.revert(); };   // limpieza al desmontar
  }, [selector]);
  return <div ref={ref}>{children}</div>;
}
```

## Rendimiento

- Prefiere animar `opacity` y `transform` (translate/scale/rotate): son baratos (GPU).
  Evita animar `width`/`height`/`top`/`left`/`box-shadow` en listas grandes.
- Para muchísimos elementos o animaciones puramente declarativas, considera `waapi.animate`.
- `createTimeline` en vez de encadenar `setTimeout` para secuencias sincronizadas.
