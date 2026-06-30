import type { ReactNode } from 'react';
import Link from 'next/link';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';

/** Guía de uso dentro de la app (misma guía que docs/GUIA-DE-USO.md). */
export default function AyudaPage() {
  const roles: [string, string][] = [
    ['Voluntario', 'Toma tareas abiertas y se une a los grupos abiertos (a los privados, solo por invitación). Registra sus horas.'],
    ['Observador', 'Solo mira (no toma tareas ni publica). Útil para acompañantes o prensa.'],
    ['Líder de grupo', 'Gestiona su grupo: crea/asigna tareas, lidera la pizarra y los anuncios.'],
    ['Coordinador', 'Coordina equipos: tareas, grupos, verifica usuarios y ve todo el flujo.'],
    ['Administración (admin)', 'Acceso total: aprueba usuarios, asigna roles, gestiona todo.'],
    ['Recopilación', 'Reporta información (casos) para que se verifique.'],
    ['Verificación', 'Revisa los casos reportados y los confirma o descarta.'],
    ['Redacción', 'Escribe el contenido de los casos confirmados.'],
    ['Diseño Gráfico', 'Crea las piezas gráficas.'],
    ['Edición de Videos', 'Edita los videos / reels.'],
    ['Redes Sociales', 'Publica el contenido final en las redes.'],
    ['Líder de plataforma aliada', 'Accede a la base de datos compartida de aliados.'],
  ];
  const flujo = ['Recopilación', 'Verificación', 'Confirmado', 'Redacción', 'Diseño / Video', 'Redes', 'Publicado'];
  const secciones: [string, string, ReactNode][] = [
    ['panel', 'Panel', <>Tu inicio. Toca una <strong>acción rápida</strong> para ir a lo más común de tu rol, o una etapa de la <strong>tira de flujo</strong> para abrirla.</>],
    ['tareas', 'Tareas', <>Toma <strong>tareas abiertas</strong> (algunas con cupo para varias personas), sigue <strong>las tuyas</strong> en tarjetas con prioridad y vencimiento, sube <strong>entregables</strong>. Coordinación y líderes pueden crear y asignar.</>],
    ['grupos', 'Grupos', <>Los <strong>abiertos</strong> los ve y se une cualquiera; los <strong>privados</strong>, solo sus miembros. Dentro: tareas del grupo, videollamadas, miembros, <strong>pizarra</strong>, anuncios y enlace de WhatsApp.</>],
    ['pizarra', 'Espacios de trabajo', <>Tu sección propia para <strong>tu parte del flujo</strong>: tu <strong>cola</strong> de piezas en tu etapa (ábrelas para trabajarlas y avanzarlas) y tu <strong>equipo</strong> (grupo, pizarra, chat) a la mano. Quedas en el espacio de tu rol automáticamente.</>],
    ['ok', 'Verificación de casos', <>Reporta un <strong>nuevo caso</strong> (avisa de posibles duplicados al escribir), asígnalo y cambia su estado: <em>en proceso</em>, <em>confirmado</em> (listo para Redacción) o <em>falso/resuelto</em>. Un caso confirmado se manda con <strong>Enviar a Redacción</strong>.</>],
    ['documento', 'Producción de contenido', <>Tablero por etapas (Redacción → Diseño/Video → Redes → Publicado). Abre una pieza para escribir/cargar el entregable, <strong>asignarla</strong> y <strong>avanzarla</strong>. Para el día a día usa tu <strong>Espacio de trabajo</strong>.</>],
    ['acopio', 'Centros de acopio', <>Registra puntos: qué necesitan, capacidad, horario, contacto y <strong>ubicación en el mapa</strong>. La urgencia los pinta de color. Un <strong>admin</strong> puede asignar coordinadores responsables.</>],
    ['mapa', 'Mapa', <>Muestra los centros de acopio coloreados por urgencia y las tareas con ubicación.</>],
    ['tablon', 'Tablón', <>Mensajes y anuncios para el equipo, con niveles de sensibilidad. Cuida los datos sensibles.</>],
    ['reloj', 'Mis horas', <>Registra tus horas de voluntariado; suman al total de la comunidad. 💛💙❤️</>],
    ['avisos', 'Avisos', <>La <strong>campana 🔔</strong> te avisa cuando te asignan algo o una pieza llega a tu etapa. Tócala para verlas.</>],
    ['admin', 'Administración', <>Coordinación/admin: <strong>aprueba</strong> registros, asigna el <strong>rol</strong> y <strong>roles adicionales</strong>, ve las <strong>habilidades</strong> de cada quien, y el registro de actividad.</>],
  ];
  const pasoApaso: [string, string, string[]][] = [
    ['mas', 'Reportar un caso (Recopilación)', [
      'Menú → "Verificación de casos" (o tu espacio de Recopilación) → "Nuevo caso".',
      'Escribe el título. Si aparece el aviso de "posibles duplicados", revisa que no exista ya.',
      'Elige la categoría, escribe la descripción y pega la fuente (enlace o de dónde salió).',
      'Guarda: el caso queda "en proceso" para que verificación lo revise.',
    ]],
    ['ok', 'Verificar un caso (Verificación)', [
      'Menú → "Verificación de casos". Verás los casos y la tira del flujo.',
      'Abre un caso (clic en su título): se abre el panel a la derecha.',
      'Asígnalo a un verificador y revisa la fuente.',
      'Cambia el estado: "Confirmado y activo" si es real, o "Falso / resuelto" si no.',
      'Si quedó confirmado, toca "Enviar a Redacción" para pasarlo a producción.',
    ]],
    ['documento', 'Trabajar tu pieza (Redacción / Diseño / Video / Redes)', [
      'Menú → "Espacios de trabajo" → abre tu espacio: verás "Tu cola en tu etapa".',
      'Abre una pieza. Si no tiene responsable, asígnatela.',
      'Haz tu parte: Redacción escribe y elige destino (Diseño o Video); Diseño/Video sube el archivo o pega el enlace; Redes publica.',
      'Toca "Enviar a la siguiente etapa" (o "Marcar como publicado" en Redes). El equipo siguiente recibe un aviso.',
    ]],
    ['tareas', 'Tomar una tarea (todos)', [
      'Menú → "Tareas" → sección "Tareas abiertas".',
      'Toca "Tomar tarea" (o "Unirme" si tiene cupo) y confirma.',
      'Hazla y, si aplica, sube el entregable. Coordinación o el líder la dan por completada.',
    ]],
    ['admin', 'Aprobar usuarios y asignar roles (Coordinación / Admin)', [
      'Menú → "Administración".',
      'En "Solicitudes de registro", toca "Aprobar" para dar acceso.',
      'En la lista, cambia el "Rol" principal. Para varios roles, abre "Roles adicionales", marca los que correspondan y "Guardar roles".',
    ]],
  ];

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Ayuda · Guía de uso</h1>
          <p className="muted sub">Cómo usar la plataforma según tu rol. Si sabes usar WhatsApp, puedes usar esto.</p>
        </div>
      </div>

      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>1. Primeros pasos</h2>
        <ol className="ayuda-lista">
          <li><strong>Entrar:</strong> tu correo y contraseña. La primera vez, usa la temporal que te dieron y cámbiala en <em>Mi perfil</em>.</li>
          <li><strong>Aprobación:</strong> las cuentas nuevas quedan pendientes hasta que un admin las verifica (te avisamos por correo).</li>
          <li><strong>Completa tu perfil:</strong> foto, teléfono y tus <strong>habilidades</strong> (tus fortalezas, para saber en qué ayudas más).</li>
          <li><strong>Sonidos:</strong> puedes silenciarlos en el menú de tu nombre → <em>Sonidos</em>.</li>
        </ol>
      </div>

      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>2. Cómo moverte</h2>
        <ul className="ayuda-lista">
          <li><strong>Barra lateral:</strong> el menú; solo ves las secciones de tu rol.</li>
          <li><strong>Barra superior:</strong> ☰ abre/cierra el menú · 🔔 tus avisos · tu nombre abre perfil, sonidos y salir.</li>
          <li><strong>Panel:</strong> saludo, acciones rápidas, tira del flujo y tu resumen.</li>
        </ul>
      </div>

      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>3. Los roles</h2>
        <p className="muted" style={{ marginTop: 0 }}>Un usuario <strong>puede tener más de un rol</strong>. La coordinación los asigna. El admin tiene acceso a todo.</p>
        <div className="tabla-scroll"><table>
          <thead><tr><th>Rol</th><th>Para qué sirve</th></tr></thead>
          <tbody>
            {roles.map(([r, d]) => (
              <tr key={r}><td><strong>{r}</strong></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>3.1 ¿A qué grupos puedes entrar?</h2>
        <ul className="ayuda-lista">
          <li><strong>Grupos abiertos:</strong> cualquier persona <strong>verificada</strong> los ve y se une sola con el botón <em>Unirme</em>.</li>
          <li><strong>Grupos privados:</strong> solo los ven sus miembros. Entras <strong>por invitación</strong>: un líder o la coordinación te agregan.</li>
          <li><strong>Voluntario:</strong> se une a los abiertos y participa en los privados a los que lo inviten. Toma tareas abiertas y registra horas; no crea tareas ni verifica casos.</li>
          <li><strong>Observador:</strong> ve los grupos abiertos pero <strong>no se une ni toma tareas</strong> (solo acompaña; útil para prensa o aliados que solo miran).</li>
          <li><strong>Líder de grupo:</strong> gestiona <strong>su</strong> grupo (miembros, tareas, anuncios, pizarra) además de lo de un voluntario.</li>
          <li><strong>Coordinación / Admin:</strong> ven y gestionan <strong>todos</strong> los grupos —también los privados— para <strong>supervisar</strong> cómo va cada uno.</li>
        </ul>
      </div>

      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>4. El flujo completo</h2>
        <p className="muted" style={{ marginTop: 0 }}>Así viaja una información hasta publicarse:</p>
        <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
          {flujo.map((f, i) => (
            <span key={f} className="fila" style={{ gap: 6 }}>
              <Pill tono="neutra" punto={false}>{f}</Pill>
              {i < flujo.length - 1 && <Icono nombre="flecha" size={14} />}
            </span>
          ))}
        </div>
      </div>

      <h2>5. Cómo usar cada sección</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
        {secciones.map(([ico, titulo, texto]) => (
          <div key={titulo} className="tarjeta" style={{ marginBottom: 0 }}>
            <h3 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre={ico} size={18} /> {titulo}</h3>
            <p className="muted" style={{ margin: 0 }}>{texto}</p>
          </div>
        ))}
      </div>

      <h2>6. Paso a paso (lo más común)</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))' }}>
        {pasoApaso.map(([ico, titulo, pasos]) => (
          <div key={titulo} className="tarjeta" style={{ marginBottom: 0 }}>
            <h3 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre={ico} size={18} /> {titulo}</h3>
            <ol className="ayuda-lista">
              {pasos.map((p, i) => <li key={i}>{p}</li>)}
            </ol>
          </div>
        ))}
      </div>

      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>7. Consejos rápidos</h2>
        <ul className="ayuda-lista">
          <li><strong>No ves una sección:</strong> tu rol no la usa. Pídele a coordinación el rol que necesitas.</li>
          <li><strong>El primer sonido no suena:</strong> el navegador activa el audio con tu primer clic.</li>
          <li><strong>En el teléfono:</strong> todo funciona; el menú se abre con ☰ y las tablas se deslizan de lado.</li>
          <li><strong>Datos sensibles:</strong> respeta los niveles del Tablón y no compartas datos de personas fuera del equipo.</li>
        </ul>
        <p className="muted" style={{ marginBottom: 0 }}>
          ¿Algo no se entiende? Avísale a tu coordinación. <Link href="/dashboard">Volver al panel</Link>.
        </p>
      </div>
    </AnimarEntrada>
  );
}
