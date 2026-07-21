import type { NavFlags } from './nav-flags';
import { ETIQUETA_AREA_ADMIN } from './constantes';

export type Destino = { href: string; etiqueta: string; icono: string; grupo?: string };

/**
 * Fuente única de los destinos de navegación por función (según las banderas del
 * usuario). La usa el menú lateral (NavLateral) y la paleta de comandos (⌘K), para
 * que ambos ofrezcan exactamente las mismas rutas accesibles y no se desincronicen.
 */
export function destinosNav(flags: NavFlags): Destino[] {
  const d: Destino[] = [
    { href: '/dashboard', etiqueta: 'Panel', icono: 'panel' },
    { href: '/grupos', etiqueta: 'Grupos', icono: 'grupos' },
  ];
  if (flags.gestionCasos || flags.verificacion) {
    d.push({ href: '/casos', etiqueta: 'Solicitudes', icono: flags.verificacion ? 'ok' : 'documento' });
  }
  // Seguimiento cross-área (Paso 5): recorrido de cualquier solicitud, para todas las áreas.
  if (flags.seguimiento) d.push({ href: '/seguimiento', etiqueta: 'Seguimiento', icono: 'buscar' });
  // Tablero de Coordinación cross-área (0195): foto agregada, solo Coordinación (admin).
  if (flags.admin) d.push({ href: '/coordinacion', etiqueta: 'Coordinación', icono: 'panel' });
  // SitRep (0196): reporte de situación agregado (imprimible/CSV), solo Coordinación (admin).
  if (flags.admin) d.push({ href: '/reportes/sitrep', etiqueta: 'SitRep', icono: 'documento' });
  if (flags.envioRedaccion) d.push({ href: '/envio-redaccion', etiqueta: 'Envío a Redacción', icono: 'cohete' });
  // Analítica del pipeline de difusión (0197): por canal, plazo y cola. Redacción/Redes/admin.
  if (flags.envioRedaccion) d.push({ href: '/reportes/difusion', etiqueta: 'Analítica difusión', icono: 'tablon' });
  if (flags.psicosocial) d.push({ href: '/psicosocial', etiqueta: 'Apoyo Psicosocial', icono: 'corazon' });
  if (flags.acopio) d.push({ href: '/mapa', etiqueta: 'Mapa', icono: 'mapa' });
  if (flags.acopio) {
    d.push({ href: '/acopio', etiqueta: 'Centros de acopio', icono: 'acopio' });
    d.push({ href: '/insumos', etiqueta: 'Logística', icono: 'camion' });
  }
  if (!flags.acopio && (flags.gestionCasos || flags.verificacion)) {
    d.push({ href: '/insumos/oportunidades', etiqueta: 'Donación-Ofrecimiento', icono: 'corazon' });
  }
  if (flags.aliados) d.push({ href: '/aliados', etiqueta: 'Datos aliados', icono: 'enlace' });
  if (flags.contenido) d.push({ href: '/contenido', etiqueta: 'Contenido', icono: 'imagen' });
  // Departamento de Alianzas Estratégicas (0198/0199): el registro «Captado» (Captación +
  // Prospección de empresas, con Ficha de Prospección) y Afiliación. Captación ya NO cuelga
  // del menú de «Logística»: vive bajo su departamento.
  if (flags.captacion || flags.prospeccion) d.push({ href: '/captacion', etiqueta: 'Captación y Prospección', icono: 'enlace', grupo: 'Alianzas Estratégicas' });
  if (flags.afiliacion) d.push({ href: '/afiliacion', etiqueta: 'Afiliación', icono: 'usuario', grupo: 'Alianzas Estratégicas' });
  // Reportería del departamento (0200): respaldo descargable para presentar a empresas.
  if (flags.alianzas) d.push({ href: '/reportes/alianzas', etiqueta: 'Reportería Alianzas', icono: 'documento', grupo: 'Alianzas Estratégicas' });
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
    d.push({ href: '/admin/verificaciones', etiqueta: 'Verificaciones', icono: 'llave' });
    d.push({ href: '/admin/logs', etiqueta: 'Registro de actividad', icono: 'historial' });
    d.push({ href: '/admin/ajustes', etiqueta: 'Ajustes', icono: 'admin' });
  }
  d.push({ href: '/ayuda', etiqueta: 'Ayuda', icono: 'ayuda' });
  // Destinos útiles que no están en el menú lateral pero sí son navegables para todos.
  d.push({ href: '/perfil', etiqueta: 'Mi perfil', icono: 'usuario' });
  d.push({ href: '/insignias', etiqueta: 'Mis insignias', icono: 'ok' });
  return d;
}
