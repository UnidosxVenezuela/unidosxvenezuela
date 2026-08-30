import type { NavFlags } from './nav-flags';
import { ETIQUETA_AREA_ADMIN } from './constantes';

export type Destino = { href: string; etiqueta: string; icono: string; grupo?: string };

/**
 * Fuente única de los destinos de navegación por función (según las banderas del
 * usuario). La usa el menú lateral (NavLateral) y la paleta de comandos (⌘K), para
 * que ambos ofrezcan exactamente las mismas rutas accesibles y no se desincronicen.
 */
export function destinosNav(flags: NavFlags): Destino[] {
  // Cada sección lleva un icono ÚNICO (no se repiten en todo el menú) para que sean
  // distinguibles de un vistazo. Al añadir una sección nueva, elige un icono libre.
  const d: Destino[] = [
    { href: '/dashboard', etiqueta: 'Panel', icono: 'panel' },
    { href: '/grupos', etiqueta: 'Grupos', icono: 'grupos' },
    // Bandeja de conversaciones (0231). Para todo el mundo: la RLS de cada hilo decide
    // qué aparece, así que quien no participa de nada la ve vacía.
    { href: '/conversaciones', etiqueta: 'Conversaciones', icono: 'conversacion' },
    // Buzón propio (0234): lo que cada quien reportó y qué respondió coordinación.
    { href: '/sugerencias', etiqueta: 'Mis reportes', icono: 'bombilla' },
  ];
  if (flags.gestionCasos || flags.verificacion) {
    d.push({ href: '/casos', etiqueta: 'Solicitudes', icono: 'documento' });
  }
  // Bandeja «Mi área» (0201/0202): las derivaciones que el operador puede trabajar
  // (tomar/avanzar/cerrar) sin abrir el detalle del caso. Para todo operador de área.
  if (flags.miArea) d.push({ href: '/mi-area', etiqueta: 'Mi área', icono: 'flecha' });
  // Seguimiento cross-área (Paso 5): recorrido de cualquier solicitud, para todas las áreas.
  if (flags.seguimiento) d.push({ href: '/seguimiento', etiqueta: 'Seguimiento', icono: 'ubicacion' });
  // Tablero de Coordinación cross-área (0195): foto agregada, solo Coordinación (admin).
  if (flags.admin) d.push({ href: '/coordinacion', etiqueta: 'Coordinación', icono: 'pizarra' });
  // SitRep (0196): reporte de situación agregado (imprimible/CSV), solo Coordinación (admin).
  if (flags.admin) d.push({ href: '/reportes/sitrep', etiqueta: 'SitRep', icono: 'descarga' });
  if (flags.envioRedaccion) d.push({ href: '/envio-redaccion', etiqueta: 'Envío a Redacción', icono: 'cohete' });
  // Analítica del pipeline de difusión (0197): por canal, plazo y cola. Redacción/Redes/admin.
  if (flags.envioRedaccion) d.push({ href: '/reportes/difusion', etiqueta: 'Analítica difusión', icono: 'filtro' });
  if (flags.psicosocial) d.push({ href: '/psicosocial', etiqueta: 'Apoyo Psicosocial', icono: 'corazon' });
  // Mapa: panorama geográfico COMPARTIDO de solo lectura (0204) para todo rol operativo
  // (heatmap de necesidades + filtro «albergues con cupo»). Logística/admin/digitalización
  // lo ven además con las capas operativas (tareas, lugares) y editable desde Centros de acopio.
  if (flags.seguimiento) d.push({ href: '/mapa', etiqueta: 'Mapa', icono: 'mapa' });
  // El área eje entra a la cola de solicitudes de Logística (0241) sin ganar el resto del
  // área: nada de acopio, mapa ni proveedores.
  if (flags.ejeInsumos && !flags.acopio) {
    d.push({ href: '/insumos', etiqueta: 'Logística · solicitudes', icono: 'camion' });
  }
  if (flags.acopio) {
    d.push({ href: '/acopio', etiqueta: 'Centros de acopio', icono: 'acopio' });
    d.push({ href: '/insumos', etiqueta: 'Logística', icono: 'camion' });
    // Reportería del área (0227): cobertura real, plazos y quién sostiene la respuesta.
    d.push({ href: '/reportes/logistica', etiqueta: 'Reportería Logística', icono: 'tareas' });
  }
  if (!flags.acopio && (flags.gestionCasos || flags.verificacion)) {
    d.push({ href: '/insumos/oportunidades', etiqueta: 'Donación-Ofrecimiento', icono: 'caja' });
  }
  if (flags.aliados) d.push({ href: '/aliados', etiqueta: 'Datos aliados', icono: 'whatsapp' });
  if (flags.contenido) d.push({ href: '/contenido', etiqueta: 'Contenido', icono: 'imagen' });
  // Departamento de Alianzas Estratégicas (0198-0200, unificado en 0216): su puerta de
  // entrada (hub) más el registro «Captado» (empresas y aliados, con Ficha de Prospección)
  // y Afiliación. Con un solo rol para el departamento, las tres secciones se abren con la
  // MISMA bandera: quien pertenece a Alianzas entra a todas.
  if (flags.alianzas) d.push({ href: '/alianzas', etiqueta: 'Alianzas Estratégicas', icono: 'enlace', grupo: 'Alianzas Estratégicas' });
  if (flags.alianzas) d.push({ href: '/captacion', etiqueta: 'Empresas y aliados', icono: 'buscar', grupo: 'Alianzas Estratégicas' });
  if (flags.alianzas) d.push({ href: '/afiliacion', etiqueta: 'Afiliación', icono: 'usuario', grupo: 'Alianzas Estratégicas' });
  // Capacidad ofertada por los aliados concretados (0224): qué puede cubrir cada uno,
  // cuánto y cada cuánto. Es lo que Logística lee como capacidad de respuesta disponible.
  if (flags.alianzas) d.push({ href: '/alianzas/proveedores', etiqueta: 'Aliados y capacidad', icono: 'caja', grupo: 'Alianzas Estratégicas' });
  // Correo institucional con plantillas y registro de envíos (0217).
  if (flags.alianzas) d.push({ href: '/alianzas/correo', etiqueta: 'Correo institucional', icono: 'documento', grupo: 'Alianzas Estratégicas' });
  // Reportería del departamento (0200/0228): respaldo descargable para presentar a empresas.
  if (flags.alianzas) d.push({ href: '/reportes/alianzas', etiqueta: 'Reportería Alianzas', icono: 'tareas', grupo: 'Alianzas Estratégicas' });
  // Consulta cruzada (0226). Cada área ve el panel de la otra en SOLO LECTURA: Alianzas
  // necesita saber en qué se está usando lo que consigue, y Logística con qué aliados
  // puede contar. Solo se ofrece a quien NO es ya del área de destino, para no duplicar
  // el mismo enlace en el menú de quien ya lo tiene arriba.
  if (flags.alianzas && !flags.acopio) {
    d.push({ href: '/insumos', etiqueta: 'Logística (consulta)', icono: 'camion', grupo: 'Alianzas Estratégicas' });
    d.push({ href: '/reportes/logistica', etiqueta: 'Reportería Logística', icono: 'tareas', grupo: 'Alianzas Estratégicas' });
  }
  if (flags.acopio && !flags.alianzas) {
    d.push({ href: '/alianzas', etiqueta: 'Alianzas (consulta)', icono: 'enlace' });
    d.push({ href: '/reportes/alianzas', etiqueta: 'Reportería Alianzas', icono: 'tareas' });
  }
  // Gestión de Casos (0239): la bandeja del gestor y los reportes de control. La ve
  // el gestor (es su trabajo) y quien reparte —el mando de Verificación y admin—.
  if (flags.gestorCasos || flags.repartirGestor) {
    d.push({ href: '/gestion-casos', etiqueta: 'Gestión de Casos', icono: 'tareas' });
  }
  if (flags.admin) d.push({ href: '/tablon', etiqueta: 'Tablón', icono: 'tablon' });
  d.push({ href: '/horas', etiqueta: 'Mis horas', icono: 'reloj' });
  d.push({ href: '/notificaciones', etiqueta: 'Avisos', icono: 'avisos' });
  d.push({ href: '/verificacion', etiqueta: 'Verificación', icono: 'llave' });
  if (flags.panelAdmin) {
    d.push({
      href: '/admin/usuarios', icono: 'admin',
      etiqueta: flags.areaAdmin ? 'Admin · ' + ETIQUETA_AREA_ADMIN[flags.areaAdmin] : 'Administración',
    });
  }
  if (flags.admin) {
    d.push({ href: '/admin/verificaciones', etiqueta: 'Verificaciones', icono: 'video' });
    d.push({ href: '/admin/certificados', etiqueta: 'Certificados', icono: 'ok' });
    // Buzón de problemas e ideas del equipo (0234): la retroalimentación que antes se
    // perdía en WhatsApp.
    d.push({ href: '/admin/sugerencias', etiqueta: 'Buzón del equipo', icono: 'buzon' });
    // Avisos generales (0238). El envío existía desde hace tiempo, pero vivía plegado
    // dentro de /notificaciones y sin entrada en ningún menú: no se encontraba.
    d.push({ href: '/admin/avisos', etiqueta: 'Enviar aviso', icono: 'avisos' });
    d.push({ href: '/admin/logs', etiqueta: 'Registro de actividad', icono: 'historial' });
    d.push({ href: '/admin/ajustes', etiqueta: 'Ajustes', icono: 'puntos' });
  }
  d.push({ href: '/ayuda', etiqueta: 'Ayuda', icono: 'ayuda' });
  // Destinos útiles que no están en el menú lateral pero sí son navegables para todos.
  d.push({ href: '/perfil', etiqueta: 'Mi perfil', icono: 'ojo' });
  d.push({ href: '/insignias', etiqueta: 'Mis insignias', icono: 'ok' });
  return d;
}
