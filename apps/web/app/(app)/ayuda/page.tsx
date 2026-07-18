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
        <li><strong>Mis horas:</strong> tu tiempo se cuenta <strong>automáticamente</strong> mientras usas la plataforma y suma al total de la comunidad (ya no se registran horas a mano).</li>
        <li><strong>Avisos:</strong> la campana te avisa de asignaciones y novedades.</li>
        <li><strong>Mi perfil:</strong> tu foto, WhatsApp y habilidades (menú de arriba a la derecha).</li>
      </S>

      {f.gestionCasos && !f.verificacion && (
        <S icono="documento" titulo="Gestión de solicitudes (tu función)">
          <li>Con <strong>«Reportar una solicitud»</strong> registras la información que llega. El formulario está <strong>organizado por bloques</strong> (datos generales · contacto · qué se necesita · fuente y fecha) para que no se te escape nada.</li>
          <li><strong>Contacto obligatorio:</strong> toda solicitud necesita un <strong>referente</strong> y <strong>dos vías de contacto</strong> (<strong>WhatsApp</strong> con código de país e <strong>Instagram</strong>), además de la <strong>ubicación</strong> en el mapa. Escríbelos completos: de eso depende que el área que la atienda pueda actuar.</li>
          <li>En <strong>Gestión de solicitudes</strong> ves <strong>solo tus solicitudes</strong> y su estado. El equipo de Verificación decide si se confirman; tú <strong>no</strong> las validas ni las mueves.</li>
          <li><strong>Nada se pierde:</strong> si corriges un dato, queda registrado el <strong>valor original y el corregido</strong> (los contactos, sin mostrar el número, por privacidad). Puedes editar tu solicitud mientras esté <strong>pendiente</strong> o <strong>en proceso</strong>.</li>
          <li>Cuando Verificación <strong>valida</strong> tu solicitud, esta se <strong>deriva al área</strong> que corresponda (Logística, Redes, Donaciones…). Sigue su recorrido en la sección <strong>«Seguimiento»</strong>.</li>
          <li>Sé prudente con los datos sensibles: escribe solo lo necesario.</li>
        </S>
      )}

      {f.verificacion && (
        <S icono="ok" titulo="Verificación (tu función)">
          <li>Tu misión: revisar que la información sea <strong>real, vigente y completa</strong> antes de que avance. La pregunta clave de cada caso es: <strong>¿es real? ¿es vigente? ¿está completa?</strong> Si alguna respuesta es <strong>no</strong>, no continúa.</li>
          <li><strong>Toma una solicitud a la vez.</strong> Ábrela y revísala con el <strong>checklist</strong> del detalle: descripción, fuente, fecha, <strong>referente y doble contacto</strong> (WhatsApp e Instagram) y —si es solicitud de ayuda— ubicación y tipo de necesidad.</li>
          <li><strong>Semáforo por campo 🟢🟡🔴:</strong> ya no se valida de un golpe. Marca <strong>cada dato por separado</strong> (🟢 verificado · 🟡 dudoso · 🔴 incorrecto). El <strong>candado</strong> impide validar la solicitud hasta que los datos mínimos estén en <strong>verde</strong>: la app lo exige, no es opcional.</li>
          <li>Tienes <strong>tres resultados</strong>:
            <ul>
              <li>🟢 <strong>Validar</strong>: es verídica, vigente y completa. Al validarla, la <strong>derivas a las áreas</strong> que la atenderán (ver abajo).</li>
              <li>🟡 <strong>Requiere información adicional</strong>: le falta un dato o hay contradicciones. <strong>No la descartes</strong>: escribe qué falta y se <strong>devuelve a Recopilación</strong>. Cuando completen los datos, el aviso se retira solo.</li>
              <li>🔴 <strong>Descartar</strong> (falso / no verificable / vencida): indica el motivo; queda registrado y sale del flujo.</li>
            </ul>
          </li>
          <li><strong>Derivar a áreas (al validar):</strong> eliges <strong>una o varias áreas</strong> —Logística, Redes Sociales, Donaciones, Alianzas Estratégicas, Coordinación u Otra— con <strong>responsable, prioridad y observaciones</strong>. Cada derivación lleva su propio estado (<em>sin tomar → tomada → en proceso → cerrada</em>). <strong>Regla de oro:</strong> ningún área recibe una derivación si el caso <strong>no está validado</strong> — el sistema lo impide.</li>
          <li><strong>Blindaje del contacto:</strong> lo que verificas queda protegido — <strong>Redes/Redacción nunca ven el contacto interno</strong> de la persona; a difusión solo llega el contacto <strong>autorizado</strong>. Marca bien qué es interno y qué es difundible.</li>
          <li><strong>Nada se borra:</strong> el detalle muestra una <strong>línea de tiempo</strong> (Gestión → Verificación → Derivación → Cierre) y un <strong>historial de correcciones</strong> (valor original → corregido). Consulta el recorrido de cualquier solicitud en <strong>«Seguimiento»</strong>.</li>
          <li><strong>Contacto formal:</strong> si necesitas contactar a una persona u organización, <strong>no lo hagas desde tu perfil personal</strong>: avísale a la coordinación, que define el canal oficial.</li>
          <li><strong>Ante dudas, avisa a Coordinación:</strong> el circuito es <strong>Verificadora → Coordinadora → líder</strong>. Consulta ante datos <strong>sensibles</strong>, información <strong>contradictoria</strong>, posible <strong>duplicado</strong> o algo <strong>urgente</strong>. El sistema además lanza <strong>alertas por tiempo</strong> cuando una solicitud lleva mucho sin moverse.</li>
          <li><strong>Qué NO hacer:</strong> no publiques información, no compartas datos ni capturas fuera del equipo, no prometas ayuda, no valides una solicitud incompleta y no cierres casos dudosos sin consultar.</li>
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
          <li>Tu grupo <strong>Redacción</strong> maneja <strong>Envío a Redacción</strong>: ves <strong>todas las solicitudes confirmadas</strong>. Por <strong>rapidez ante la emergencia</strong> se difunden <strong>en paralelo</strong> a Logística (no se espera a que Logística termine).</li>
          <li><strong>Privacidad garantizada:</strong> <strong>nunca ves el contacto interno</strong> de la persona (ni «por detrás»). Trabajas con una <strong>fuente curada</strong> que solo muestra lo <strong>difundible</strong>: el contacto <strong>autorizado</strong> y los datos de estado/publicación.</li>
          <li>La bandeja se <strong>actualiza sola</strong> cuando entran o cambian solicitudes (sin exponer nada sensible); igual tienes el botón <strong>«Actualizar»</strong>.</li>
          <li><strong>Tómala</strong> para redactarla (queda a tu nombre), <strong>publícala</strong> y <strong>márcala publicada</strong> indicando en qué <strong>canales</strong> se difundió.</li>
          <li>Las marcadas <strong>«prioriza»</strong> son las que Logística no pudo cubrir: difúndelas primero. Verificación también puede <strong>derivarte</strong> una solicitud al área de <strong>Redes</strong>.</li>
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
        <S icono="camion" titulo="Logística (tu función)">
          <li><strong>Recibes derivaciones por área:</strong> cuando Verificación valida una solicitud, te la <strong>deriva</strong> con responsable, acción y prioridad. Trabájala con sus estados: <strong>sin tomar → tómala → en proceso → ciérrala</strong>.</li>
          <li><strong>Ves la información completa:</strong> a diferencia de Redacción, Logística <strong>sí</strong> ve el <strong>contacto y las coordenadas del solicitante</strong> y los <strong>archivos adjuntos</strong> —los necesitas para gestionar y entregar—. Cuídalos: son datos sensibles.</li>
          <li><strong>Recepción y categorización:</strong> clasifica el <strong>tipo de material</strong> (salud y medicinas, materiales/EPP, alimentos y agua, maquinaria/rescate) y su prioridad.</li>
          <li><strong>Difusión en paralelo:</strong> toda solicitud confirmada ya está en <strong>Redacción</strong> difundiéndose. Si <strong>NO puedes cubrirla</strong>, márcala <strong>«No se pudo cubrir»</strong>: en Redacción se resalta como <strong>prioridad de difusión</strong>.</li>
          <li><strong>Entrega:</strong> avanza los estados (Solicitado → En gestión → En ruta → Entregado) y adjunta la <strong>evidencia (foto/nota)</strong>. El caso se cierra como <em>resuelto</em>.</li>
          <li><strong>Centros y puntos del mapa:</strong> cuando se valida una solicitud marcada como <strong>albergue, hospital o centro de acopio</strong>, aparece un <strong>punto en el mapa</strong> (fijo o temporal) para que lo gestiones. Mantén al día los centros y empareja los <strong>ofrecimientos (Donación-Ofrecimiento)</strong> con las solicitudes en el <strong>Mapa</strong>.</li>
          <li>Consulta el recorrido de cualquier solicitud —y coordínate con otras áreas— en la sección <strong>«Seguimiento»</strong>.</li>
        </S>
      )}

      {f.captacion && (
        <S icono="enlace" titulo="Captación de Oportunidades (tu función)">
          <li>Buscas y registras <strong>aliados</strong> —fundaciones, organizaciones, empresas, proyectos y alianzas— como <strong>tarjetas</strong> con contacto, enlace, ubicación, descripción y archivo. Cada tarjeta avanza por <strong>Investigación → Verificado → Enviado</strong>.</li>
          <li>Cuando una tarjeta queda <strong>«Enviada»</strong>, <strong>Logística</strong> la ve como <strong>referencia</strong> (solo lectura) y puede dejar <strong>notas en su bitácora</strong>.</li>
          <li><strong>Donación-Ofrecimiento:</strong> también captas <strong>ofertas</strong> de donación (insumos, dinero, servicios, transporte). Tú las registras; <strong>Verificación</strong> las valida; <strong>Logística</strong> contacta, empareja con una solicitud y concreta. No avanzan sin verificación.</li>
          <li>Verificación puede <strong>derivarte</strong> solicitudes validadas al área de <strong>Alianzas Estratégicas</strong> o <strong>Donaciones</strong> (con responsable y prioridad). Sigue el recorrido en <strong>«Seguimiento»</strong>.</li>
          <li>Cuida el <strong>contacto de los aliados</strong>; los datos sensibles de las personas afectadas no son de este equipo.</li>
        </S>
      )}

      {f.admin && (
        <S icono="admin" titulo="Administración">
          <li><strong>Administración → Usuarios:</strong> aprueba cuentas y, con <strong>«Gestionar rol»</strong>, abres una ventana para el rol principal, el grupo a cargo, los roles adicionales y agregar a un grupo. Al asignar <strong>líder o coordinador</strong> se te pide el grupo (un grupo tiene <strong>un líder</strong> y puede tener <strong>varios coordinadores</strong>).</li>
          <li>Los <strong>líderes y coordinadores</strong> pueden <strong>dar de alta usuarios</strong> del rol de su grupo desde la página del grupo: el líder los crea directo; si lo hace un <strong>coordinador, lo confirma el líder</strong>. Si el rol requiere <strong>segunda verificación</strong>, la persona deberá completarla antes de operar.</li>
          <li>Supervisas todas las secciones; en Apoyo Psicosocial ves solo indicadores (los casos son confidenciales).</li>
        </S>
      )}

      {f.seguimiento && (
        <S icono="buscar" titulo="Seguimiento (recorrido cross-área)">
          <li>En <strong>«Seguimiento»</strong> consultas el <strong>recorrido de cualquier solicitud</strong> —en qué etapa va y a qué áreas se derivó— para que <strong>ninguna área trabaje a ciegas</strong>.</li>
          <li>Muestra la <strong>línea de tiempo</strong> (Gestión → Verificación → Derivación → Cierre) con datos <strong>no sensibles</strong>: <strong>no</strong> expone el contacto interno.</li>
          <li>Puedes buscar por <strong>número</strong> (#00012) o título. Es de solo consulta: cada área opera desde su propia sección.</li>
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
