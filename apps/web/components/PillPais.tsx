import Pill from './Pill';
import { paisAtendido, banderaPais } from '@/lib/constantes';

/** País de una solicitud (0230), con el MISMO aspecto en todos los tableros: el panel de
 *  solicitudes, Redacción y Logística. Estaba escrito a mano en `/casos` y repetirlo en
 *  cada tablero es garantizar que en tres meses uno de ellos diga otra cosa.
 *
 *  Se marca SIEMPRE, también Venezuela: con dos respuestas a la vez, señalar solo una
 *  deja la otra ambigua —¿es de aquí o es una solicitud vieja sin país?—.
 *
 *  `paisAtendido` nunca devuelve null: toda solicitud anterior a 0230 es venezolana
 *  porque la plataforma solo atendía Venezuela, así que el DEFAULT no es una suposición.
 *
 *  La bandera va en emoji, igual que en el resto de la interfaz de país. Donde no hay
 *  tipografía de banderas (Windows) se degrada a «VE» / «CO», y el nombre del país está
 *  escrito al lado de todas formas: el dato nunca depende del dibujo. */
export default function PillPais({ pais }: { pais?: string | null }) {
  const p = paisAtendido(pais);
  return (
    <Pill tono={p.codigo === 'CO' ? 'aviso' : 'info'} punto={false}>
      {banderaPais(p.codigo)} {p.nombre}
    </Pill>
  );
}
