import { requireUsuario, esAdministrador, esSuperadmin } from '@/lib/auth';
import PanelCelebraciones from '@/components/PanelCelebraciones';
import Icono from '@/components/Icono';

export const metadata = { title: 'Animaciones' };

/**
 * PANEL DE ANIMACIONES — la galería de las celebraciones.
 *
 * Cuando alguien cierra un hito de verdad (completa una tarea, entrega una solicitud,
 * cubre un ítem, publica…) aparece una animación breve que le reconoce el trabajo, y
 * ROTAN para que no salga siempre la misma. Aquí se ven todas, se pueden probar y se
 * pueden apagar.
 *
 * No es de un área: es de toda la organización, así que la página NO lleva gate más
 * allá de la sesión (`requireUsuario`) y su destino va sin bandera en `nav-destinos`.
 * Lo único acotado es el mazo de la rotación, que solo ve Coordinación.
 *
 * El grueso vive en `components/PanelCelebraciones.tsx` (cliente): el catálogo lleva
 * funciones de carga diferida y la preferencia, la baraja y el estado de la conexión
 * están en el navegador, así que nada de eso puede leerse desde el servidor.
 */
export default async function CelebracionesPage() {
  const { perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil) || esSuperadmin(perfil);

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1>Animaciones</h1>
          <p className="muted sub">
            Cuando cierras algo de verdad —una tarea, una entrega, un ítem cubierto— aparece
            una animación breve para reconocer el trabajo. <strong>Van rotando</strong>, así que
            no sale siempre la misma. Duran unos segundos, se quitan solas y nunca impiden
            seguir trabajando: toca en cualquier sitio y desaparecen. 💛💙❤️
          </p>
        </div>
      </div>

      <p className="pcel-nota">
        <Icono nombre="corazon" size={16} />
        <span>
          Esto es una emergencia y el trabajo es duro. Las animaciones están para acompañar a
          quien lo sostiene, sin quitarle ni un segundo. Si prefieres no verlas, apágalas aquí
          abajo: nadie se entera y el resto de la plataforma funciona igual.
        </span>
      </p>

      <PanelCelebraciones esAdmin={esAdmin} />
    </div>
  );
}
