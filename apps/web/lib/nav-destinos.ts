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
  if (flags.acopio) d.push({ href: '/mapa', etiqueta: 'Mapa', icono: 'mapa' });
  if (flags.acopio) {
    d.push({ href: '/acopio', etiqueta: 'Centros de acopio', icono: 'acopio' });
    d.push({ href: '/insumos', etiqueta: 'Logística', icono: 'camion' });
  }
  if (!flags.acopio && (flags.gestionCasos || flags.verificacion)) {
    d.push({ href: '/insumos/oportunidades', etiqueta: 'Donación-Ofrecimiento', icono: 'caja' });
  }
  if (flags.aliados) d.push({ href: '/aliados', etiqueta: 'Datos aliados', icono: 'whatsapp' });
  if (flags.contenido) d.push({ href: '/contenido', etiqueta: 'Contenido', icono: 'imagen' });
  // Departamento de Alianzas Estratégicas (0198-0200): su puerta de entrada (hub) más el
  // registro «Captado» (Captación + Prospección de empresas, con Ficha de Prospección) y
  // Afiliación. Captación ya NO cuelga del menú de «Logística»: vive bajo su departamento.
  if (flags.alianzas) d.push({ href: '/alianzas', etiqueta: 'Alianzas Estratégicas', icono: 'enlace', grupo: 'Alianzas Estratégicas' });
  if (flags.captacion || flags.prospeccion) d.push({ href: '/captacion', etiqueta: 'Captación y Prospección', icono: 'buscar', grupo: 'Alianzas Estratégicas' });
  if (flags.afiliacion) d.push({ href: '/afiliacion', etiqueta: 'Afiliación', icono: 'usuario', grupo: 'Alianzas Estratégicas' });
  // Reportería del departamento (0200): respaldo descargable para presentar a empresas.
  if (flags.alianzas) d.push({ href: '/reportes/alianzas', etiqueta: 'Reportería Alianzas', icono: 'tareas', grupo: 'Alianzas Estratégicas' });
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
    d.push({ href: '/admin/logs', etiqueta: 'Registro de actividad', icono: 'historial' });
    d.push({ href: '/admin/ajustes', etiqueta: 'Ajustes', icono: 'puntos' });
  }
  d.push({ href: '/ayuda', etiqueta: 'Ayuda', icono: 'ayuda' });
  // Destinos útiles que no están en el menú lateral pero sí son navegables para todos.
  d.push({ href: '/perfil', etiqueta: 'Mi perfil', icono: 'ojo' });
  d.push({ href: '/insignias', etiqueta: 'Mis insignias', icono: 'ok' });
  return d;
}
