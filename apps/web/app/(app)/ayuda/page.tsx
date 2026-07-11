import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { flagsDeNavegacion } from '@/lib/nav-flags';
import RevelarScroll from '@/components/RevelarScroll';
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
    <RevelarScroll>
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
        <S icono="documento" titulo="Gestión de solicitudes (tu función)">
          <li>Con <strong>«Reportar una solicitud»</strong> registras la información que llega: título, categoría (<em>Desaparecidos</em> u <em>Otras informaciones</em>), fuente, fecha y <strong>archivos de respaldo</strong>.</li>
          <li>En <strong>Gestión de solicitudes</strong> ves <strong>solo tus solicitudes</strong> y su estado. El equipo de Verificación decide si se confirman.</li>
          <li>Sé prudente con los datos sensibles: escribe solo lo necesario.</li>
        </S>
      )}

      {f.verificacion && (
        <S icono="ok" titulo="Verificación (tu función)">
          <li>Tu misión: revisar que la información sea <strong>real, vigente y completa</strong> antes de que avance. La pregunta clave de cada caso es: <strong>¿es real? ¿es vigente? ¿está completa?</strong> Si alguna respuesta es <strong>no</strong>, no continúa.</li>
          <li><strong>Toma una solicitud a la vez.</strong> Ábrela y usa el <strong>checklist de verificación</strong> del detalle (datos mínimos: descripción, fuente, fecha, contacto y —si es solicitud de ayuda— ubicación y tipo de necesidad).</li>
          <li>Tienes <strong>tres resultados</strong>:
            <ul>
              <li>🟢 <strong>Confirmar</strong> (validada): es verídica, vigente y completa. Pasa al equipo de <strong>Envío a Redacción</strong> (tú no la envías).</li>
              <li>🟡 <strong>Requiere información adicional</strong>: le falta un dato o hay contradicciones. <strong>No la descartes</strong>: escribe qué falta y se <strong>devuelve a Recopilación</strong> (se avisa a quien la reportó). Cuando completen los datos, el aviso se retira solo.</li>
              <li>🔴 <strong>Descartar</strong> (falso / no verificable / vencida): indica el motivo; queda registrado y sale del flujo.</li>
            </ul>
          </li>
          <li><strong>Rutina:</strong> lee completa la solicitud, revisa la <strong>fecha</strong>, identifica la <strong>fuente</strong>, revisa el <strong>contacto</strong> y la <strong>ubicación</strong>, confirma que la necesidad <strong>siga vigente</strong> y busca <strong>evidencia</strong> (publicación reciente, confirmación, red oficial).</li>
          <li><strong>Contacto formal:</strong> si necesitas contactar a una persona u organización, <strong>no lo hagas desde tu perfil personal</strong>: avísale a la coordinación, que define el canal oficial; redacta el texto y compártelo con ella.</li>
          <li><strong>Ante dudas, no decidas sola:</strong> el circuito es <strong>Verificadora → Coordinadora → líder</strong>. Consulta siempre que haya datos <strong>sensibles</strong>, información <strong>contradictoria</strong>, posible <strong>duplicado</strong>, algo <strong>urgente</strong> o cualquier caso fuera del procedimiento.</li>
          <li><strong>Qué NO hacer:</strong> no publiques información, no compartas datos ni capturas fuera del equipo, no prometas ayuda, no marques como validada una solicitud incompleta y no cierres casos dudosos sin consultar.</li>
          <li>Recuerda: verificas <strong>«Otras informaciones»</strong>; los <em>desaparecidos</em> los atiende el Grupo de Búsqueda.</li>
        </S>
      )}

      {f.busqueda && (
        <S icono="usuario" titulo="Grupo de Búsqueda · Desaparecidos (tu función)">
          <li>En <strong>Desaparecidos</strong> registras y trabajas los casos de personas desaparecidas con un <strong>intake estructurado</strong> (edad, sexo, última ubicación, quién reporta) y marca de <strong>NNA</strong> si es menor. Cada caso tiene un código <strong>A-00X</strong> (adulto) / <strong>N-00X</strong> (NNA).</li>
          <li><strong>Toma</strong> el caso y muévelo entre <strong>Activo → En revisión → Coincidencia pendiente</strong>. Verifícalo contra <strong>al menos 3 fuentes</strong> (checklist en el detalle) y registra cada gestión en la <strong>bitácora</strong> (confidencial: solo tú y el mando).</li>
          <li>Cuando halles una coincidencia sólida, márcala <strong>pendiente</strong> y <strong>no contactes a la familia</strong>: el <strong>mando</strong> (líder/coordinador) la aprueba y luego el <strong>Enlace de contacto</strong> hace la llamada. Con <strong>menores</strong>, el caso se <strong>deriva a la autoridad</strong>.</li>
          <li>En <strong>Coincidencias</strong> ves personas halladas (hospitales/albergues) que cruzan con un desaparecido; puedes <strong>proponer o descartar</strong> — la <strong>confirmación la hace el mando</strong>.</li>
          <li>Atiende los <strong>recordatorios de seguimiento</strong> (cada 12–24 h) para no perder ningún caso. Necesitas tu <strong>segunda verificación</strong> (identidad) aprobada.</li>
        </S>
      )}

      {f.enlace && (
        <S icono="whatsapp" titulo="Enlace de contacto (tu función)">
          <li>En <strong>«Enlace de contacto»</strong> tienes la <strong>cola</strong> de casos que el mando ya <strong>aprobó</strong> (solo adultos).</li>
          <li>Realiza la <strong>llamada de confirmación</strong> con la familia (usa los guiones de <strong>Recursos</strong>) y <strong>registra el resultado</strong>: el caso queda <strong>reunificado</strong>.</li>
          <li>Los casos de <strong>menores (NNA)</strong> no llegan aquí: los gestiona el mando con la autoridad. Necesitas tu <strong>segunda verificación</strong> aprobada.</li>
        </S>
      )}

      {f.digitalizacion && (
        <S icono="imagen" titulo="Digitalización de listados (tu función)">
          <li>Sube o <strong>fotografía</strong> una lista de personas (hospital, albergue o centro de acopio). El texto se reconoce <strong>en tu propio dispositivo</strong> — la imagen no se envía a terceros.</li>
          <li><strong>Confirma línea por línea</strong>: corrige nombre, cédula, edad y condición; las líneas de baja confianza aparecen resaltadas. Desmarca lo que no sean personas.</li>
          <li>Al guardar, el listado queda <strong>«Por verificar»</strong>: el cruce con desaparecidos <strong>aún no corre</strong>.</li>
          <li><strong>Verificación de Digitalización</strong> revisa el listado <strong>contra la foto</strong>, corrige lo que el OCR leyó mal y lo marca <strong>verificado</strong> (ahí se activa el cruce) u <strong>observado</strong> (vuelve con una nota). Nadie verifica su propio listado.</li>
          <li><strong>Lugares del mapa:</strong> en <strong>«Moderar lugares»</strong> se completan los datos y las <strong>coordenadas</strong>; al verificar un lugar aparece en <strong>«Centros y lugares»</strong> para gestionarlo (capacidad, inventario, necesidades). Moderan el verificador y el admin de Digitalización; el admin además puede borrarlos.</li>
        </S>
      )}

      {f.envioRedaccion && (
        <S icono="cohete" titulo="Redacción · Envío a Redacción (tu función)">
          <li>Tu grupo <strong>Redacción</strong> maneja la sección <strong>Envío a Redacción</strong>: ahí ves las solicitudes <strong>confirmadas</strong> por Verificación.</li>
          <li>Revisa y toca <strong>«Enviar a Redacción»</strong>: la solicitud queda marcada y el flujo de verificación termina.</li>
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
          <li><strong>Donaciones e Insumos:</strong> gestiona las solicitudes (Solicitado → En gestión → En ruta → Entregado), las oportunidades de donación (ofertas que se emparejan con las solicitudes), proveedores, envíos y donaciones.</li>
        </S>
      )}

      {f.admin && (
        <S icono="admin" titulo="Administración">
          <li><strong>Administración → Usuarios:</strong> aprueba cuentas y, con <strong>«Gestionar rol»</strong>, abres una ventana para el rol principal, el grupo a cargo, los roles adicionales y agregar a un grupo. Al asignar <strong>líder o coordinador</strong> se te pide el grupo (un grupo tiene <strong>un líder</strong> y puede tener <strong>varios coordinadores</strong>).</li>
          <li>Los <strong>líderes y coordinadores</strong> pueden <strong>dar de alta usuarios</strong> del rol de su grupo desde la página del grupo: el líder los crea directo; si lo hace un <strong>coordinador, lo confirma el líder</strong>. Si el rol requiere <strong>segunda verificación</strong>, la persona deberá completarla antes de operar.</li>
          <li>Supervisas todas las secciones; en Apoyo Psicosocial ves solo indicadores (los casos son confidenciales).</li>
        </S>
      )}

      <div className="tarjeta" style={{ borderColor: 'var(--azul)' }}>
        <p className="muted" style={{ margin: 0 }}>
          ¿Necesitas algo que no ves aquí? Escríbele al líder de tu grupo o a la administración. 💛💙❤️
        </p>
      </div>
    </RevelarScroll>
  );
}
