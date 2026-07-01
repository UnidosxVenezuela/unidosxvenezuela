# Apoyo Psicosocial (área confidencial de salud mental)

Área dedicada al acompañamiento en salud mental de las personas afectadas y de
los propios voluntarios. Por la sensibilidad de estos datos, tiene un modelo de
privacidad **más estricto que el resto de la plataforma**.

## Principio de confidencialidad

> Cada caso y su bitácora solo los ven el **profesional asignado** y la
> **coordinación psicosocial**. **No** los ve el administrador ni la
> coordinación general.

Es una decisión de diseño deliberada: la información de salud mental no debe
circular por la jerarquía general. Quien **registra** una solicitud puede ver su
propio pedido y el **estado** (para dar seguimiento), pero **nunca** la bitácora
clínica.

Esto se hace cumplir en la base de datos con RLS (no depende de la interfaz):
- `acompanamientos` — lo ve el asignado, quien lo creó, o la coordinación psicosocial.
- `bitacora_psicosocial` — SOLO el asignado o la coordinación psicosocial.

## Roles

| Rol | Para qué |
|-----|----------|
| **Apoyo Psicosocial** (`apoyo_psicosocial`) | Profesional/voluntario que acompaña. Ve y atiende los casos asignados a él. |
| **Coordinación Psicosocial** (`coordinador_psicosocial`) | Coordina el área: ve **todos** los casos, asigna profesionales, gestiona recursos y puede eliminar casos. |

Los roles se otorgan desde **Administración → Usuarios** (los concede admin/
coordinación general). Conceder el rol **no** da acceso a los datos: solo la
coordinación psicosocial y el profesional asignado ven el contenido.

## Flujo de un caso

```
Solicitado → Asignado → En acompañamiento → Seguimiento → Cerrado
                                                         ↘ Cancelado
```

1. **Solicitado** — se registra a la persona (nombre o alias, tipo de apoyo,
   nivel de riesgo, motivo). Avisa a la coordinación psicosocial.
2. **Asignado** — la coordinación asigna un profesional (o el profesional toma
   un caso sin asignar). Avisa al profesional.
3. **En acompañamiento / Seguimiento** — el profesional registra cada contacto
   en la **bitácora confidencial** (llamada, presencial, mensaje…).
4. **Cerrado** — con una nota de cierre. (O **Cancelado** si no procede.)

El **nivel de riesgo** (Baja/Media/Alta/Crítica) es editable en cualquier momento
y ordena la atención.

## Secciones del panel

- **Tablero** — casos por estado; pestaña **«Mi carga»** para ver solo los casos
  asignados a mí.
- **Detalle del caso** — datos, bitácora confidencial, asignación, riesgo, cierre.
- **Recursos y líneas de crisis** — contactos y guías de actuación; la
  coordinación psicosocial los edita.

## Puesta en marcha

1. Un admin promueve a la primera persona a **Coordinación Psicosocial** desde
   Administración → Usuarios.
2. Esa coordinación (o el admin) asigna el rol **Apoyo Psicosocial** al resto del
   equipo.
3. La coordinación completa **Recursos y líneas de crisis** con los teléfonos
   reales de su zona (la semilla trae solo Emergencias 911 y una guía de PAP).

> Ante **riesgo vital**: activar emergencias (911), no dejar sola a la persona y
> escalar de inmediato a la coordinación psicosocial.
