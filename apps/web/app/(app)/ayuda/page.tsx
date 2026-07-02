import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { flagsDeNavegacion } from '@/lib/nav-flags';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';

/**
 * Ayuda PERSONALIZADA: cada quien ve solo la guía de sus funciones (según su
 * grupo/rol), para no revelar cómo trabajan otras áreas.
 */
export default async function AyudaPage() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const f = await flagsDeNavegacion(supabase, user!.id, perfil);

  const S = ({ icono, titulo, children }: { icono: string; titulo: string; children: React.ReactNode }) => (
    <div className="tarjeta">
      <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre={icono} size={20} /> {titulo}</h2>
      <ul className="ayuda-lista">{children}</ul>
    </div>
  );

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Ayuda</h1>
          <p className="muted sub">Guía rápida de <strong>tus</strong> funciones en Apoyo por Venezuela.</p>
        </div>
      </div>

      <S icono="panel" titulo="Lo básico (para todos)">
        <li><strong>Panel:</strong> tu inicio, con accesos a tus funciones y tu resumen.</li>
        <li><strong>Grupos:</strong> tu equipo. Ahí están las <strong>tareas</strong>, los <strong>anuncios fijados</strong>, las reuniones y la pizarra de tu grupo. A los grupos te agrega la administración o el líder.</li>
        <li><strong>Mis horas:</strong> registra tu tiempo de voluntariado; suma al total de la comunidad.</li>
        <li><strong>Avisos:</strong> la campana te avisa de asignaciones y novedades.</li>
        <li><strong>Mi perfil:</strong> tu foto, WhatsApp y habilidades (menú de arriba a la derecha).</li>
      </S>

      {f.gestionCasos && !f.verificacion && (
        <S icono="documento" titulo="Gestión de casos (tu función)">
          <li>Con <strong>«Reportar un caso»</strong> registras la información que llega: título, categoría (<em>Desaparecidos</em> u <em>Otras informaciones</em>), fuente, fecha y <strong>archivos de respaldo</strong>.</li>
          <li>En <strong>Gestión de casos</strong> ves <strong>solo tus casos</strong> y su estado. El equipo de Verificación decide si se confirman.</li>
          <li>Sé prudente con los datos sensibles: escribe solo lo necesario.</li>
        </S>
      )}

      {f.verificacion && (
        <S icono="ok" titulo="Verificación (tu función)">
          <li>En <strong>Verificación de casos</strong> revisas lo que llega y decides: <strong>Confirmado y activo</strong> si es verídico, o <strong>Falso / resuelto</strong> si no procede.</li>
          <li>Abre cada caso para ver su descripción, fuente, adjuntos y dejar <strong>notas</strong>.</li>
          <li>Los confirmados pasan al equipo de <strong>Envío a Redacción</strong> (tú no los envías).</li>
        </S>
      )}

      {f.envioRedaccion && (
        <S icono="cohete" titulo="Envío a Redacción (tu función)">
          <li>En <strong>Envío a Redacción</strong> ves los casos <strong>confirmados</strong> por Verificación.</li>
          <li>Revisa y toca <strong>«Enviar a Redacción»</strong>: el caso queda marcado y el flujo de verificación termina.</li>
        </S>
      )}

      {f.psicosocial && !f.admin && (
        <S icono="corazon" titulo="Apoyo Psicosocial (tu función)">
          <li>En <strong>Apoyo Psicosocial</strong> está el tablero de acompañamientos y tu pestaña <strong>«Mi carga»</strong>.</li>
          <li>Cada caso es <strong>confidencial</strong>: solo lo ven el profesional asignado y la coordinación psicosocial.</li>
          <li>Registra cada contacto en la <strong>bitácora</strong>; ante riesgo vital activa emergencias (911) y avisa a tu coordinación.</li>
        </S>
      )}

      {f.acopio && (
        <S icono="camion" titulo="Gestión de Acopio (tu función)">
          <li><strong>Centros de acopio:</strong> mantén al día los puntos, sus necesidades y su urgencia; ubícalos en el <strong>Mapa</strong>.</li>
          <li><strong>Insumos:</strong> gestiona las solicitudes (Solicitado → En gestión → En ruta → Entregado), proveedores, envíos y donaciones.</li>
        </S>
      )}

      {f.admin && (
        <S icono="admin" titulo="Administración">
          <li><strong>Administración → Usuarios:</strong> aprueba cuentas, asigna roles y <strong>agrega personas a los grupos</strong> (al sumarlas a un grupo de trabajo, reciben su función automáticamente).</li>
          <li>Los <strong>líderes</strong> gestionan los miembros de su grupo (nunca a admins u otros líderes); los <strong>coordinadores</strong> pertenecen a su grupo sin gestionar miembros.</li>
          <li>Supervisas todas las secciones; en Apoyo Psicosocial ves solo indicadores (los casos son confidenciales).</li>
        </S>
      )}

      <div className="tarjeta" style={{ borderColor: 'var(--azul)' }}>
        <p className="muted" style={{ margin: 0 }}>
          ¿Necesitas algo que no ves aquí? Escríbele al líder de tu grupo o a la administración. 💛💙❤️
        </p>
      </div>
    </AnimarEntrada>
  );
}
