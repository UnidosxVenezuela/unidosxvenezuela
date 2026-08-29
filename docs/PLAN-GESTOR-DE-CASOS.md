# Gestor Integral de Casos Humanitarios — análisis e implementación

Respuesta técnica a la *Propuesta organizacional: incorporación del Gestor Integral de
Casos* (19 ago 2026), contrastada contra lo que la plataforma ya hace hoy.

**Conclusión corta:** la mitad del requerimiento ya está construido y no se ve, y la otra
mitad es pequeña pero está en el sitio más delicado del sistema. Lo que falta de verdad no
es «coordinar áreas» —eso existe desde `0177`— sino **qué toca ahora, quién responde y para
cuándo**, que hoy no se guarda en ninguna parte.

---

## 1. Lo que la propuesta pide, y dónde está hoy

| Lo que pide el documento | Qué hay ya en la plataforma |
|---|---|
| «Activar y coordinar a Gestión, Verificación, Logística, Alianzas, Redes Sociales» | `casos_derivaciones` (`0177`): área, responsable, estado, acción, observaciones y motivo de cierre. Desde `0222`, derivación **selectiva por ítem** — se puede mandar solo las medicinas a Alianzas y el agua a Logística. |
| «Registrar avances, comunicaciones, compromisos, bloqueos y evidencias» | `casos_adjuntos`, la **conversación por caso** (`0231`) que no se puede borrar, y las bitácoras por área. |
| «No elimina evidencias ni modifica el registro sin trazabilidad» | `registro_auditoria` + triggers `auditar_cambio`. Los mensajes del hilo **no se borran**, se editan dejando versión (`hilo_versiones`). |
| «Consultar el expediente completo y su historial de cambios» | `/casos/[id]`, `/seguimiento` (cross-área, sin PII) y el registro de actividad. |
| «Solicitar información específica al recopilador» | `casos.info_requerida` (`0142`), que además avisa a quien reportó. **Pero es una sola, en texto libre, y solo al recopilador.** |
| «Cerrar o reabrir casos» | Cerrar sí: `resuelto` (`0114`) y `desestimado` (`0210`). **Reabrir no existe.** |
| «Reportes de avance» | `/reportes/sitrep`, `/reportes/logistica`, `/reportes/alianzas`, `/reportes/difusion`. |
| «Fecha de seguimiento con recordatorio» | Existe, **pero solo para Búsqueda**: `busqueda_casos.proxima_revision` + recordatorio automático (`0091`). El molde está probado; falta generalizarlo. |

**Lo que esto significa:** el punto 5 de las responsabilidades («activar y coordinar áreas»)
y el 6 («registrar avances y evidencias») no hay que construirlos. Se usan poco porque
nadie es dueño de usarlos — que es precisamente el problema que la propuesta resuelve.

---

## 2. Lo que falta de verdad

### 2.1. No hay dueño del caso

`casos.asignado_a` **no sirve** para esto, y conviene decirlo antes de que alguien lo
reutilice: significa *«quién está verificando esto ahora»*, y el propio código lo pone a
`null` al devolver el caso por falta de información. El gestor tiene que seguir siendo
dueño mientras el caso está en Logística, en Alianzas o esperando una respuesta.

→ **Columna nueva `gestor_id`**, independiente de `asignado_a` y de `redactor_id`.

### 2.2. No se guarda «qué toca ahora y para cuándo»

Es el corazón del principio de control de la propuesta —*un responsable, una próxima acción
y una fecha vigente*— y hoy no existe ningún campo donde escribirlo. Sin esto, los reportes
de «casos detenidos» que pide la sección 7 son imposibles: no hay contra qué comparar.

→ `proxima_accion`, `proxima_revision`, `area_siguiente` en `casos`.

### 2.3. Las solicitudes de información no tienen forma

La propuesta pide cinco campos por solicitud (dato requerido, responsable, motivo, fecha
límite, resultado esperado). `info_requerida` es **una columna de texto**: no admite dos
solicitudes a la vez, no tiene responsable ni fecha, y solo puede dirigirse a quien creó
el caso — no a Logística ni a Alianzas, que es justo lo que la propuesta necesita.

→ Tabla `casos_solicitudes_info`.

### 2.4. No existe el rol

`rol_usuario` es un **enum**, así que `gestor_casos` entra con `alter type … add value` en
migración propia y sin usarse en ella (regla del repositorio desde `0216`; añadir un valor
y usarlo en la misma migración ya ha costado caro aquí).

### 2.5. Cerrar es cambiar un estado

No hay criterios de cierre ni evidencia obligatoria, y **no se puede reabrir** — que la
propuesta pide explícitamente cuando la evidencia resulte insuficiente.

### 2.6. Faltan los cuatro reportes de control

Sin responsable · vencidos · bloqueados · próximos a cierre. Dependen de 2.1 y 2.2.

### 2.7. Renombrar el área

«Verificación» → «Verificación y Gestión de Casos». Una línea en `ETIQUETA_AREA`, más el
seed del área.

---

## 3. Orden de entrega propuesto

**Fase 1 — el dueño y el reloj.** Rol `gestor_casos`, `gestor_id`, próxima acción y fecha,
panel «Mis casos» y los cuatro reportes de control. Es lo que hace realidad el *un
responsable por caso*, y sin ello lo demás no se puede medir.

**Fase 2 — solicitudes de información estructuradas**, a cualquier área, con fecha y
responsable. Absorbe `info_requerida` sin romperlo.

**Fase 3 — cierre con criterios y reapertura.**

**Fase 4 — recordatorios automáticos** (molde `0091`, ya probado) y renombrado del área.

Fase 1 es la que cambia el trabajo del día a día; las demás se apoyan en ella.

---

## 4. Decisiones que necesita tomar la organización

No son técnicas: cambian qué se construye.

1. **¿Los casos de Desaparecidos entran en este circuito?** Búsqueda tiene flujo propio y
   ya tiene su `proxima_revision`. Meterlos duplicaría el seguimiento; dejarlos fuera
   significa que «cada caso tiene gestor» tendrá una excepción escrita.

2. **¿Cómo se asigna el gestor?** La propuesta admite tres vías a la vez (la plataforma, el
   líder, o que el voluntario lo tome). Automático reparte carga pero asigna a quien no
   está disponible; «tomar» deja huérfanos los casos que nadie quiere — que suelen ser los
   difíciles.

3. **¿Los casos abiertos hoy se migran o solo aplica a los nuevos?** Migrar exige decidir
   quién queda de gestor de cada uno; no migrar deja dos mundos conviviendo un tiempo.

4. **¿Cerrar sin evidencia se bloquea o solo se avisa?** Bloquear cumple la propuesta al
   pie; en una emergencia también deja casos abiertos porque falta un papel.

5. **¿Qué plazo por defecto** tiene la fecha de seguimiento — fijo (48 h) o según urgencia?

---

## 5. Riesgo principal

El gestor necesita ver el expediente completo, y eso incluye contacto, dirección y
coordenadas de familias. Es un rol nuevo con **la lectura más amplia de la plataforma**.
Conviene que su alta sea deliberada y poca —como la de administración—, y no un rol que se
reparta por comodidad: la RLS filtra filas, no columnas, y aquí no hay vista curada que
valga porque el trabajo del cargo es, literalmente, ver el caso entero.
