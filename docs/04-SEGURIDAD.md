# Seguridad y protección de datos

La plataforma maneja información delicada en un contexto de emergencia: ubicación de víctimas, datos de contacto, personas vulnerables, decisiones operativas. La seguridad es un requisito de diseño, no un añadido.

## 1. Principios

1. **Denegar por defecto.** Nadie ve nada salvo lo que su rol y pertenencia permiten explícitamente.
2. **Defensa en la base de datos.** Las reglas se aplican con RLS en Postgres, no solo en la interfaz; el cliente no es de confianza.
3. **Mínimo privilegio.** Cada rol tiene solo los permisos que necesita.
4. **Trazabilidad.** Las acciones sobre datos sensibles quedan en `registro_auditoria`.
5. **Minimización de datos.** Recoger solo lo necesario; clasificar por sensibilidad.

## 2. Identidad y acceso

- **Autenticación**: Supabase Auth (correo o teléfono). En producción, confirmación obligatoria y, para coordinación, **2FA** recomendado.
- **Verificación de identidad**: el campo `perfiles.verificado` distingue a quien la coordinación ha validado. El acceso operativo pleno requiere verificación.
- **RBAC**: cinco roles (ver `01-PLAN.md`). El cambio de rol solo lo realiza la coordinación; un usuario **no puede auto-promocionarse** (las políticas de `perfiles` lo impiden).

## 3. Seguridad a nivel de fila (RLS)

Todas las tablas tienen RLS activado (`0002_rls_policies.sql`). Puntos destacados:

- **perfiles**: cada quien edita el suyo; la coordinación gestiona todos.
- **tareas**: se ven si eres coordinación, estás asignado, las creaste, o eres miembro del grupo.
- **publicaciones**: la visibilidad depende de `sensibilidad`:
  - `publica` / `interna`: usuarios autenticados.
  - `restringida`: miembros del grupo.
  - `confidencial`: coordinación (y el autor).
- **notificaciones**: estrictamente privadas del destinatario.
- **registro_auditoria**: solo lectura para coordinación; se escribe por triggers / `service_role`.

Las funciones auxiliares (`es_admin`, `es_coordinacion`, `es_miembro_de`) son `SECURITY DEFINER` para evaluar permisos sin caer en recursión de políticas.

## 4. Gestión de secretos

- La `anon key` es pública por diseño (va en el cliente); la seguridad real la da RLS.
- La **`service_role` key bypassa RLS** y **solo** se usa en el servidor (Edge Functions, Server Actions, cron). Nunca en el cliente ni en el repo.
- Variables sensibles en `.env.local` (ignorado por git). Ver `.env.example`.

## 5. Clasificación de la información

| Nivel | Ejemplos | Quién accede |
|-------|----------|--------------|
| Pública | Anuncios generales | Cualquier usuario |
| Interna | Coordinación operativa diaria | Usuarios verificados |
| Restringida | Detalles de un grupo/zona | Miembros del grupo |
| Confidencial | Datos de víctimas, personas vulnerables | Coordinación |

## 6. Auditoría

`registro_auditoria` guarda actor, acción, entidad y metadata. Recomendado registrar: cambios de rol, acceso a datos confidenciales, borrados. Se puede automatizar con triggers adicionales por tabla.

## 7. Buenas prácticas operativas

- Revisión y rotación periódica de roles y accesos (especialmente al terminar la fase aguda).
- Copias de seguridad automáticas de la BD (Supabase) y plan de restauración probado.
- Limitar exportaciones de datos personales y registrarlas.
- Política de retención: anonimizar o eliminar datos personales cuando dejan de ser necesarios.

## 8. Pendientes de seguridad (roadmap)

- 2FA obligatorio para `admin`/`coordinador`.
- Cifrado a nivel de campo para los datos más sensibles (p. ej. datos médicos).
- Rate limiting y protección anti-abuso en endpoints públicos (registro).
- Revisión de cumplimiento con la normativa venezolana de protección de datos y estándares humanitarios de manejo de datos (p. ej. principios de protección de datos de OCHA).
