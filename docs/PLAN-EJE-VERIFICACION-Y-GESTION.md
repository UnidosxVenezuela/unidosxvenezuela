# Verificación y Gestión de Casos como eje — análisis y decisiones

Respuesta al encargo: *«los roles y área de Verificación y Gestión pasan a ser el eje central
del proyecto; ahora las Alianzas Estratégicas las verifican ellos; y en el panel de Logística
deben tener acceso y tomar control de "solicitado" y "en gestión" del flujo; ya luego pasa a
Logística solamente acorde a su área, "en ruta" y "entregado"».*

Base: barrido de las 240 migraciones y de la app con ocho lectores en paralelo, más dos
críticos —uno adversarial sobre las afirmaciones de permisos y otro de completitud—.
Implementado en las migraciones **0241** y **0242**.

---

## 1. Tres hallazgos que cambiaron el planteamiento

### 1.1. El molde ya existía, y es exactamente esto

`proteger_campos_oportunidad` (**0161:33-74**) es un trigger BEFORE UPDATE que ya hace, sobre
`oportunidades_donacion`, lo que aquí se pedía: separa **por columna** quién escribe qué —el
pipeline solo Logística, el veredicto solo Verificación— y **bloquea el avance** de un área
hasta que la otra ha firmado. No hubo que inventar mecanismo, sino aplicarlo a
`solicitudes_insumo`.

### 1.2. Verificación ya verificaba lo que se creía que faltaba

`verificar_oportunidad_donacion` (**0144:143**) y el semáforo campo por campo (**0194:69**)
son de Verificación desde hace tiempo: los **ofrecimientos** de donación no se
autocertifican.

Lo que **sí** se autocertificaba es la **Ficha de Prospección** del CRM de Alianzas:
`marcar_campo_verif_prospeccion` (**0199:103**) tenía gate `puede_alianzas()` — la misma
gente que crea y edita la ficha le ponía los verdes. Y ese semáforo es el que abre el candado
de «Enviar a Logística». **Ahí es donde el encargo tenía efecto real**, y es lo único que
toca 0242. Los `afiliados` (0198) no tienen mecanismo ni candado; la capacidad del proveedor
(0224) es un contador vivo, no un hecho verificable.

### 1.3. El obstáculo de Alianzas no era el permiso, era la lectura

Cambiar el gate es una línea. Pero Verificación no podía leer ni la ficha ni su semáforo, y
`/captacion/[id]` la rebotaba al panel. Se resolvió con **vista curada** (molde 0226), nunca
ampliando `oportunidades_select`.

---

## 2. Lo que no se podía tocar

**`puede_logistica()`** sostiene ~30 políticas sobre 15 relaciones (lo avisa su propia
cabecera en 0214). Restringirla habría roto acopio, proveedores, envíos, el bucket de entregas
y las vistas cruzadas de 0226 —y en silencio, devolviendo 0 filas en vez de un error—.

**La frontera va en la puerta del estado, nunca dentro del helper de área.** Lo mismo con
`puede_alianzas()`: 0216:28-33 avisa que sostiene 12 permisos.

---

## 3. La regla, en una frase

**Manda el área dueña del estado de DESTINO.**

| Estado | Área |
|---|---|
| `solicitado` · `en_gestion` · `cancelado` · `no_disponible` | Verificación y Gestión de Casos |
| `en_ruta` · `entregado` | Logística |

Así `solicitado → en_gestion` lo da el área eje, y `en_gestion → en_ruta` lo **toma**
Logística — que es como lo describió la organización («ya luego pasa a Logística»).

**El enum tiene seis estados, no cuatro**: 0050:17 crea cinco y 0149:35 añade
`no_disponible`. La organización decidió que `cancelado` y `no_disponible` son también del
área eje: cerrar una solicitud sin entregarla es una decisión de gestión del caso.

---

## 4. Decisiones tomadas por la organización

1. **En «solicitado» y «en gestión», el área eje mueve, trabaja y además crea.** No solo
   avanza el semáforo: asigna proveedor, asigna centro de acopio, escala a Alianzas y da de
   alta solicitudes. Si solo moviera el estado, tendría su columna sin poder hacer nada
   dentro de ella.
2. **En la Ficha de Alianzas, sustitución.** Alianzas deja de marcar su propio semáforo;
   pasa entero al área eje.
3. **La vista de verificación SÍ incluye los contactos.** `alianzas_panel` (0226) excluye a
   propósito `responsable_telefono`, `contactos_operativos` y `contactos_alternos`, pero el
   campo «responsable» del semáforo es literalmente «el responsable y su contacto»: sin ellos
   se firmaría en blanco. La vista nueva los trae y **solo** la ve el área eje;
   `alianzas_panel` se queda intacta para Logística.
4. **`cancelado` y `no_disponible`, del área eje.**

Y dos que se dieron por decididas: **Desaparecidos sigue fuera** (escrito en once gates, no
en la interfaz), y **el tablero sigue viviendo en `/insumos`** — partirlo fragmentaría una
cola que es una sola.

---

## 5. Cómo se implementó

### 0241 — la frontera del flujo

- **`puede_gestion_casos()`**: el área al completo — admin, rol verificador, `gestor_casos`
  (0239), el mando del grupo (0147) y el admin de área (0106). No existía ningún helper que
  la agrupara: `puede_verificar()` es admin + verificador y dejaba fuera a tres de los cinco.
  Es el mismo agujero que 0214 tuvo que tapar para Logística.
- **`area_de_estado_insumo()`** y **`puede_mover_solicitud_a()`**, con espejo en la app
  (`apps/web/lib/flujo-insumos.ts`).
- **Las policies se abren a las dos áreas y la frontera la pone un trigger.** Si viviera solo
  en `solins_update`, un intento del área equivocada **no daría error: daría cero filas**, y
  la app diría «Estado actualizado» tan tranquila (`insumos/actions.ts:179` hace un UPDATE
  crudo). Con la policy abierta y el trigger levantando 42501, quien se equivoca lee de quién
  es ese paso.
- **Tres funciones reemitidas, con el cuerpo copiado a máquina** —no a mano— desde su
  migración original, cambiando solo una línea cada una:
  `crear_solicitud_logistica_base` (0223, el gate del alta), `desestimar_caso` (0214, una
  compuerta de sesión) y `avanzar_item` (0220, el gate). Se dice explícitamente porque 0230
  evitó copiar esos cuerpos precisamente para no arriesgar erratas; aquí la copia la hizo un
  script sobre el fichero original.
- **La galería de entrega y su bucket** se abren al área eje: un `gestor_casos` puro no
  entraba en ninguno de los tres gates de `insadj_select` y habría coordinado la entrega sin
  poder abrir la foto que la prueba.
- **Dos avisos nuevos**: al área eje cuando entra una solicitud a su cola, y al gestor del
  caso cuando Logística sale con la entrega. Era el único punto del flujo donde el trabajo
  cambia de área y no avisaba a nadie.

### 0242 — la ficha de Alianzas

- **Vista curada `ficha_alianza_verificacion`** con los contactos (decisión 3), solo para el
  área eje.
- **Policy de lectura añadida** sobre el semáforo — añadida, no reescrita: las de SELECT se
  suman, así que Alianzas conserva exactamente lo que tenía.
- **Gate del semáforo cambiado** a `puede_gestion_casos()`.
- **Validado rancio** (molde 0183): editar el dato tumba el verde del campo que lo
  verificaba. No existía para la ficha; con la firma en manos de otra área, eso pasaba de ser
  un descuido a ser un agujero.
- **Avisos**: la ficha no tenía ninguno. El ofrecimiento sí (0144:162, 0193:118).

---

## 6. Lo que queda fuera, y por qué se dice

- **`solicitar_cobertura_parcial`** (0211) sigue siendo de Logística: se pide cuando ya se
  intentó cubrir, que es trabajo de campo.
- **`resumen_logistica()`** (0227) mantiene su gate `puede_logistica() or puede_alianzas()`,
  así que el área eje aún no puede abrir el informe de la cola que ahora es suya. Es una
  ampliación mecánica de gate, pendiente.
- **Las guías en PDF** (`docs/GUIA-LOGISTICA*`, `docs/FLUJO-SOLICITUDES-Y-DONACIONES*`)
  describen el flujo anterior y son binarios versionados sin script de reconstrucción. La
  ayuda dentro del producto sí se actualiza con el código; los PDF no.
- **`docs/ROLES.md`** ya estaba desactualizado antes de este cambio (no menciona
  `gestor_casos`, `admin_logistica` ni el mando de grupo). Con el área como eje, es la hoja
  que más se va a leer.
