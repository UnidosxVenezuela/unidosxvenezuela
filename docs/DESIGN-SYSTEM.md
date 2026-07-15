# Sistema de diseño — «Apoyo por Venezuela»

> Guía de referencia del diseño de la plataforma web (`apps/web`, Next.js 14). Es la **spec escrita** que acompaña a:
> - **`design-tokens.json`** (raíz del repo) — tokens en formato DTCG para importar en Figma / Tokens Studio.
> - **Guía visual navegable** — Artifact con paleta, tipografía y componentes en vivo (ver enlace que te compartió Claude).
>
> **Fuente de verdad del código:** `apps/web/app/globals.css` (un único CSS global, ~735 líneas, sin Tailwind ni CSS-in-JS) + los helpers de `apps/web/lib/constantes.ts`. Si cambias el diseño, cambia primero ahí y luego actualiza estos archivos.

---

## 0. Principios

1. **Marca venezolana, con calidez.** El tricolor (azul/amarillo/rojo) es identidad, no decoración. El tono trata al voluntariado con cercanía y siempre orienta la siguiente acción.
2. **Un color de acento, estado aparte.** El acento de marca es el **azul**; el amarillo puntúa. El **color de estado** (ok / aviso / crítica / info) es un sistema separado del acento.
3. **Densidad en escritorio, dedo en móvil.** 46px de alto en controles de escritorio; 44px mínimo garantizado en pantallas táctiles.
4. **La RLS es la verdad, la UI es amable.** El diseño nunca inventa permisos: refleja lo que el rol puede hacer.
5. **Movimiento discreto.** «La salida dura menos que la entrada». Todo respeta `prefers-reduced-motion`.
6. **Español en dominio y UI; inglés en identificadores** de framework.

---

## 1. Marca

| Elemento | Valor |
|---|---|
| **Nombre público** | **Apoyo por Venezuela** (en toda la UI, metadata, PWA y correos). |
| Identificador técnico | `UnidosxVenezuela` / `@unidos/*` — **no** es la marca visible. |
| themeColor PWA | `#0033A0` |
| Descripción | «Coordinación de equipos para la respuesta al terremoto de Venezuela.» |
| Firma emocional | 💛💙❤️ + microcopy tipo «Gracias por sumarte». |

**Logotipo — `.punto`**: círculo de 12×12 px con gradiente diagonal tricolor y halo.

```css
.punto {
  width: 12px; height: 12px; border-radius: 50%;
  background: linear-gradient(135deg, var(--amarillo) 0 50%, var(--rojo) 50% 100%);
  box-shadow: 0 0 0 2px rgba(255,255,255,.35);   /* sobre azul */
}
.auth-marca .punto { box-shadow: 0 0 0 2px rgba(0,51,160,.18); } /* sobre claro */
```
Siempre acompaña al texto «Apoyo por Venezuela».

**Franja tricolor — `.tricolor`**: barra de 4 px, `linear-gradient(90deg, amarillo 0–33.33%, azul 33.33–66.66%, rojo 66.66–100%)`. Va en el tope del sidebar y en el borde superior de la tarjeta de login.

---

## 2. Color

Todos los tokens viven en `:root` (globals.css). Ver valores y alias en `design-tokens.json`.

### Marca / tricolor
| Token | Hex | Uso |
|---|---|---|
| `--azul` | `#0033A0` | Primario, sidebar, themeColor |
| `--azul-osc` | `#002270` | Hover del primario, texto sobre amarillo |
| `--amarillo` | `#FFCE00` | Acento, anillo de foco, indicador de nav |
| `--amarillo-osc` | `#E6B800` | Hover del acento |
| `--rojo` | `#CF142B` | Peligro de marca, franja tricolor |

### Semánticos y superficies
| Token | Hex | Uso |
|---|---|---|
| `--primario` / `--acento` | azul / amarillo | Alias de intención |
| `--texto` | `#0f172a` | Texto principal |
| `--texto-suave` | `#556074` | Texto secundario, etiquetas |
| `--fondo` | `#f6f8fb` | Lienzo de la app |
| `--tarjeta` | `#ffffff` | Superficie de tarjetas/controles |
| `--borde` | `#e6e9f0` | Borde por defecto |

### Estado sólido (texto/énfasis de prioridad)
`--critica #b91c1c` · `--alta #c2410c` · `--media #a16207` · `--baja #374151` · `--ok #047857`

### Estado con relleno suave — **sistema canónico (`Pill`)**
Cada tono es un par **fondo + texto**. Es el sistema que se debe usar para estado nuevo.

| Tono | Fondo | Texto |
|---|---|---|
| `ok` | `#d1fae5` | `#065f46` |
| `aviso` | `#fef9c3` | `#854d0e` |
| `alta` | `#ffedd5` | `#c2410c` |
| `info` | `#dbeafe` | `#1e40af` |
| `critica` | `#fee2e2` | `#b91c1c` |
| `neutra` | `#eef2f7` | `#334155` |

### Acento de tarea (borde izquierdo + fondo tenue)
`ok #16a34a / #f0fdf4` · `aviso #d97706 / #fffbeb` · `critica #dc2626 / #fef2f2` · `neutra #cbd5e1`

### Presencia (tiempo real, con halo a .18)
`conectado #0A7D2C` · `ocupado #E6A100` · `desconectado #94a3b8`

### Neutros de UI
`#f1f5f9` (hover de botón/menú) · `#f8fafc` (hover de fila/chip) · `#eef2f7` (superficie neutra) · `#eef2ff` (tinte azul de KPI/chip) · `#d4dbe6` (scrollbars).

> **Categorías** (`BadgeCategoria`) usan color **determinístico por hash del texto** entre 8 pares suaves — no es un token semántico, es identidad visual por categoría.

---

## 3. Tipografía

- **Familia única (system stack):** `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`. No se carga ninguna fuente web (rendimiento y consistencia). Para **datos/valores** la referencia usa `ui-monospace`.
- **Base:** 16px, `line-height: 1.5`, color `--texto`.

### Escala (por rol de uso)
| Rol | Tamaño | Peso |
|---|---|---|
| Número de KPI | `1.9rem` | 800 |
| `h1` | `1.55rem` (→ `1.32rem` ≤600px) | — |
| Número de flujo | `1.35rem` | 800 |
| Marca (sidebar) | `1.25rem` | 800 |
| `h2` | `1.15rem` | — |
| `h3` de tarjeta | `1.05rem` | — |
| Cuerpo / inputs / botones | `1rem` | 600 (botón) |
| Etiqueta de KPI | `.88rem` | 600 |
| Sub / chips | `.82rem` | — |
| Insignia / pie | `.8rem` | 700 |
| `thead`, labels en MAYÚSCULAS, rol | `.72rem` | 700 |
| Micro (badge de conteo) | `.62rem` | 700 |

**Pesos:** `500` (tooltip), `600` (etiquetas/nav/botones), `700` (nombres, pills, `th`, badges), `800` (marca, KPI, avatar). No se usa `400` explícito salvo el base.

**Tracking:** marca `.2px`; `thead` y labels en mayúsculas `.04em` / `.03em`.

---

## 4. Espaciado, radios y layout

**Radios** — `--r-tarjeta 16px` · `--r-tile 12px` · `--r-input 10px` · `--r-pill 999px`. Literales frecuentes: 14 (paso de flujo, consejo, columnas), 13 (toast), 10 (botones/inputs/nav), 8 (chips). `50%` para avatar y puntos.

**Ritmo de espaciado** — múltiplos de 2/4px: gaps de 6/8/10/12/14; grid gap 14; padding de tarjeta 18; padding de contenedor `24 24 48`; botón `11×18`; input `10×12`; pill `4×10`.

**Anchos clave** — sidebar `256px`; contenedor máx `1200px`; drawer `600px`; modal `480px`; confirm `380px`; auth `420px`; legal `780px`; topbar mín `60px`.

**Breakpoints (max-width)** — `980 / 920 / 820 / 680 / 640 / 600 / 560 / 480`. El corte estructural mayor es **820px**: el sidebar pasa a **cajón off-canvas** con backdrop y aparece la marca en la topbar.

---

## 5. Sombras y elevación

Patrón: **reposo `--sombra` → hover `translateY(-2px)` + sombra `.10` → overlays con sombras mayores según z-index.**

| Token / uso | Valor |
|---|---|
| `--sombra` (tarjetas) | `0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.08)` |
| `--sombra-flot` | `0 12px 34px rgba(16,24,40,.14)` |
| Hover de tarjeta-enlace | `0 8px 22px rgba(16,24,40,.10)` |
| Toast | `0 14px 36px rgba(16,24,40,.18)` |
| Menú de usuario | `0 14px 40px rgba(16,24,40,.18)` |
| Modal / confirm | `0 20px 60px rgba(16,24,40,.30)` |
| Drawer lateral | `-16px 0 50px rgba(16,24,40,.22)` |
| Foco de input | `0 0 0 3px rgba(0,51,160,.15)` |

**Capas (z-index):** contenido `0` → topbar `50` / sidebar `60` → menú-fila `70` → user-menu `80` → drawer backdrop `85` / drawer `90` → toast `1000` → confirm `1100`.

---

## 6. Movimiento

| Momento | Duración | Curva |
|---|---|---|
| Hundido de botón (`:active`) | `.02s` | — |
| Fondo de botón / fila | `.12s` | ease |
| Hover de tarjeta-enlace | `.15s` | ease |
| Sidebar / `toastIn` | `.22s` | `cubic-bezier(.22,.61,.36,1)` |
| Drawer (`drawerSlide`) | `.24s` | `cubic-bezier(.22,.61,.36,1)` |
| Consejo (`consejo-in`) | `.3s` | `cubic-bezier(.2,.8,.2,1)` |
| Pop de estado (`EstadoCaso`) | `.46s` | `scale 0.8→1.12→1` |
| Salida de toast | `.18s` (`.14s` con reduce) | `inQuad` |

**`@keyframes`:** `toastIn`, `drawerFade`, `drawerSlide`, `consejo-in`.
**Animación JS:** `anime.js` v4; siempre bajo el guard `sinMovimiento()` (`@/lib/anime`). El indicador amarillo del nav se desliza con `translateY` (`320ms`, `outCubic`).
**Reduced-motion:** `prefers-reduced-motion: reduce` fuerza `animation/transition-duration: .001ms`, `scroll-behavior: auto` y desactiva la burbuja de consejo.

---

## 7. Componentes

> Clases definidas en `globals.css`; lógica en `apps/web/components/*.tsx`.

### Botones — `.btn`
Base 46px de alto, padding `11×18`, radio 10, borde `--borde`, fondo `#fff`, peso 600.
`:hover #f1f5f9` · `:active translateY(1px)` · `:focus-visible` anillo **amarillo** (offset 2px).

| Variante | Fondo | Texto | Hover |
|---|---|---|---|
| `.btn-primario` | `--primario` | `#fff` | `--primario-osc` |
| `.btn-acento` | `--amarillo` | `--azul-osc` | `--amarillo-osc` |
| `.btn-peligro` | `--critica` | `#fff` | `#991b1b` |

Compactos (Modal/MenuFila): `min-height 34px`, padding `4×8–10`. `.icono-btn`: cuadrado 40×40, radio 10, color `--texto-suave`, hover `#eef2f7`. `.btn-consejos`: chip pill `.82rem`, `[aria-pressed="false"]{opacity:.6}`.

### Tarjeta — `.tarjeta`
Fondo `--tarjeta`, borde `--borde`, radio 16, padding 18, `margin-bottom 14`, sombra `--sombra`.
`a.tarjeta` (clicable): hover `translateY(-2px)` + sombra `.10` + borde `#cdd5e3`; foco anillo azul.
Rejillas: `.grid`, `.grid-2` (minmax 240), `.grid-3` (minmax 260). Modificadores: `.vacio`, `.tarea-card`, `.accion-rapida`, `.anuncio` (borde-izq amarillo).

### Estado: `Pill` (canónico), `.insignia` (legado), `BadgeCategoria`
- **`Pill`** — `inline-flex`, gap 6, padding `4×10`, radio 999, `.78rem`/700. Props: `tono` (`ok|aviso|alta|info|critica|neutra`), `punto` (dibuja punto de 8px en currentColor), `icono`. **Úsalo para todo estado nuevo.**
- **`.insignia`** — legado (`.8rem`/700, base `#e5e7eb/#111827` + variantes). Migrando hacia `Pill`.
- **`BadgeCategoria`** — `.badge-cat`, color determinístico por texto (8 pares), `.76rem`/700.
- **`EstadoCaso`** — envuelve `Pill` con mapa fijo de tono (pendiente→neutra, en_proceso→aviso, confirmado/resuelto→ok, falso→critica, enviado_redaccion→info) + pop al cambiar.

### KPI — `Kpi`
Tile tintado `.kpi-ico` (44×44, radio 12; props `color`/`tinte`, default `#eef2ff`) + etiqueta (`.88rem`/600) + número (`1.9rem`/800, anima si es número) + sub (`.78rem` muted). Clicable si tiene `href`.

### Estado vacío — `EstadoVacio`
`.tarjeta.vacio`, centrado, padding `40×20`, ícono 42px azul opacity .65, título + texto (máx 440px) + acción opcional. Reemplaza los «no hay nada» por un mensaje que dice **qué hacer**.

### Navegación
- **Sidebar** — 256px, fondo `--azul`, sticky full-height. `.marca` (800/1.25rem) → `.nav-lateral`. Enlaces: ícono+etiqueta, `#dbe4ff`, padding `10×12`, `border-left 3px transparent`; hover `rgba(255,255,255,.10)`; `.activo` fondo `.14` + `aria-current="page"`. **`.nav-indicador`**: barra amarilla de 3px que se desliza por JS. Colapsable en escritorio (persistida en `localStorage`), off-canvas en móvil (≤820px).
- **Topbar** — sticky, z50, mín 60px, `rgba(255,255,255,.85)` + `backdrop-filter: saturate(1.4) blur(8px)`, borde inferior. Contiene: hamburguesa, consejos, Telegram, presencia, campana, `UserChip`.
- **UserChip / user-menu** — pill con avatar+nombre+rol+chevron (máx 240px; en ≤600px solo avatar). Popover z80, radio 12, sombra `.18`.

### Overlays
- **Modal** — `.modal-caja`, portal, fondo `--fondo`, radio 16, máx 480 / `88vh` scroll, sombra `.3`, `drawerFade`. Escape/X/click-fuera. `role="dialog" aria-modal`.
- **DrawerModal** — panel derecho 600px, z90 + backdrop z85, `drawerSlide`. Focus-trap + restauración de foco; Escape navega a `cerrarHref`.
- **BotonConfirmar** — reemplaza `window.confirm`: `.confirm-caja` (380px, `role="alertdialog"`), Cancelar (autoFocus) + confirmar.
- **Toast** — abajo-derecha, z1000, borde-izq 4px, `toastIn`. `.toast-ok` (`#16a34a`, `role="status"`, autocierre 3500ms con barra) / `.toast-err` (`--rojo`, `role="alert"`, sin autocierre). Lee `?ok=`/`?err=` de la URL.

### Formularios
`.campo` (grid gap 6, label 600/`--texto-suave`). `.input, select, textarea`: 100% ancho, mín 46px, padding `10×12`, borde `--borde`, radio 10, `1rem`; foco `border-color --azul` + anillo `rgba(0,51,160,.15)`. `.buscador` (lupa + padding-left 38). `.campo-filtro` (label en mayúsculas, auto-submit). Chips: `.chip-hab` / `.chip-hab-on`.

### Tablas
`th,td` padding `12×10`, borde inferior `--borde`. `thead th`: MAYÚSCULAS `.72rem`/700, tracking `.04em`, `--texto-suave`. `tbody tr:hover #f8fafc`. `.tabla-scroll` (overflow-x, min-width 560, scrollbar 8px). Filas por estado `tr.tarea-est-*` con `inset 4px 0 0 <color>` en la 1ª celda.

### Flujo de trabajo — `FlujoTrabajo`
Tira horizontal de pasos (`.flujo-ico` 38px + `.flujo-num` 1.35rem/800 + `.flujo-et`) unidos por `.flujo-flecha`. Pasos enlazables se elevan en hover. Relacionados: `AccionRapida`, kanban `.tablero`/`.tablero-col`.

### Medalla / Insignia — `MedallaInsignia`
SVG 120×120 sin dependencias (apto para Server Components). Dos estilos:
- **E** (hito único): alas, aureola de rayos, aro dorado, cristal facetado.
- **D** (escalable por `nivel`): **bronce** = escudo simple + 1 estrella; **plata** = doble marco + 3 estrellas + cinta; **oro** = rayos + laurel + alas + corona + 5 estrellas. Se distinguen por **silueta**, no solo por color.

Props: `estilo`, `nivel` (`bronce|plata|oro`), `icono` (emoji), `texto` (cifra), `size` (44), `apagada` (grayscale). `role="img"` + `aria-label`.

---

## 8. Iconografía — `Icono`

SVG inline estilo Lucide: `viewBox 0 0 24 24`, `fill none`, `stroke currentColor`, `stroke-width 2`, `linecap/linejoin round`, `aria-hidden`, size 20. Glifo de reserva para nombres no definidos.

**41 nombres:** `panel · tareas · grupos · tablon · avisos · admin · mapa · imagen · documento · enlace · basura · whatsapp · video · acopio · ubicacion · mas · salir · salida · usuario · filtro · reloj · ok · ojo · refrescar · pizarra · historial · ojo_off · puntos · menu · chevron · buscar · cerrar · flecha · sonido · sonido_off · cohete · ayuda · llave · camion · caja · corazon`.

---

## 9. Accesibilidad

- **Foco visible en dos colores según fondo:** anillo **azul** (`3px solid --azul`, offset 2px) sobre superficies claras; anillo **amarillo** (`3px solid --amarillo`) en botones, nav e íconos (sobre azul).
- **Objetivos táctiles:** `@media (pointer: coarse)` sube a **44px** mínimo botones, íconos, chips, ítems de menú, filtros y buscador.
- **`color-scheme: light`** forzado (aún sin tema oscuro completo — ver §11).
- **ARIA:** `html lang="es"`; skip-link a `#contenido-principal`; diálogos `role="dialog"/"alertdialog"` con focus-trap; menús con `aria-haspopup/expanded`; nav con `aria-current`; toasts `role="status"/"alert"` + `aria-live`; sidebar oculto `inert`; toggles `aria-pressed`; íconos decorativos `aria-hidden`, medallas `role="img"`.

---

## 10. Voz y microcopy

- **Bilingüe:** dominio y UI en español (clases, componentes y variables incluidas); identificadores de framework en inglés.
- **Cálido y orientado a la acción.** Ejemplos: «Cuenta pendiente de aprobación… Te avisaremos por correo. Gracias por sumarte 💛💙❤️»; urgencias en positivo (`alta → "Urgente"`, `media → "Necesita"`, `baja → "Cubierto"`); un control dice exactamente qué hace y el toast lo confirma.
- **Fuente de verdad de etiquetas:** `apps/web/lib/constantes.ts` (`ETIQUETA_*`, helpers `clase*`/`tono*`).

---

## 11. Estado y próximos pasos de diseño

- **Solo tema claro** hoy (`color-scheme: light`). El tema oscuro es la principal deuda: si se aborda, definir los tokens de superficie/borde/estado en dark manteniendo el contraste del acento.
- **Tres sistemas de badge coexisten**; `Pill` es el canónico. Deuda: migrar `.insignia` legado a `Pill`.
- Al trabajar en Figma/Claude Design, **importa `design-tokens.json`** como estilos/variables y construye los componentes de §7 a partir de esos tokens, respetando estados y foco.

---

*Generado a partir del código real de `apps/web`. Mantener sincronizado con `globals.css` y `constantes.ts`.*
