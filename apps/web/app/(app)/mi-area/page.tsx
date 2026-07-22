import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  areasOperablesDe, ETIQUETA_AREA_DESTINO, ETIQUETA_ESTADO_DERIVACION,
  ETIQUETA_PRIORIDAD_DERIVACION,
} from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import BotonConfirmar from '@/components/BotonConfirmar';
import Consejo from '@/components/Consejos';
import EstadoVacio from '@/components/EstadoVacio';
import { tomarDerivacion, avanzarDerivacion, cerrarDerivacion } from '../casos/actions';

const TONO_EST: Record<string, string> = { sin_tomar: 'neutra', tomada: 'info', en_proceso: 'aviso', cerrada: 'ok' };
const TONO_PRIO: Record<string, string> = { alta: 'critica', media: 'aviso', baja: 'neutra' };
const VOLVER = '/mi-area';

/**
 * Bandeja «Mi área» (0201/0202). El operador PURO de un área (logística, redes,
 * donaciones, alianzas…) puede tomar/avanzar/cerrar SUS derivaciones sin abrir el
 * detalle del caso —que está cerrado para quien no es Recopilación/Verificación/Búsqueda—.
 * Los datos vienen de la RPC curada mis_derivaciones() (SECURITY DEFINER, sólo campos
 * seguros); la escritura sigue por las RPC de derivación (0177), que revalidan el área.
 */
export default async function MiAreaPage() {
  const { perfil } = await requireUsuario();
  const roles = rolesDe(perfil);
  const areas = areasOperablesDe(roles);
  // Gate: sólo quien opera al menos un área de derivación (espejo de puede_operar_area_derivacion).
  if (areas.length === 0) redirect('/dashboard');
  const miId = (perfil as any)?.id as string | undefined;
  const esAdmin = esAdministrador(perfil);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mis_derivaciones');
  const lista = (data ?? []) as any[];

  // Conteo por estado para la cabecera (trabajo pendiente vs. en curso).
  const cuenta = { sin_tomar: 0, tomada: 0, en_proceso: 0 } as Record<string, number>;
  for (const d of lista) if (d.estado in cuenta) cuenta[d.estado] = (cuenta[d.estado] ?? 0) + 1;

  const etiquetaAreas = areas.map((a) => ETIQUETA_AREA_DESTINO[a]).join(' · ');

  return (
    <AnimarEntrada>
      <Consejo id="mi-area" titulo="Tu bandeja de área">
        Aquí están las <strong>derivaciones</strong> que tu área ({esAdmin ? 'todas las áreas' : etiquetaAreas}) tiene que atender.
        Puedes <strong>tomarlas</strong>, marcarlas <strong>en proceso</strong> y <strong>cerrarlas</strong> desde aquí, sin abrir la solicitud completa.
        Cada cambio queda en el <strong>historial del caso</strong> para que Verificación lo vea.
      </Consejo>

      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="flecha" size={22} /> Mi área</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Derivaciones abiertas de {esAdmin ? 'todas las áreas' : <strong>{etiquetaAreas}</strong>}. Trabájalas sin salir de esta bandeja.
          </p>
        </div>
        {lista.length > 0 && (
          <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Pill tono="neutra" punto>Sin tomar {cuenta.sin_tomar}</Pill>
            <Pill tono="info" punto>Tomadas {cuenta.tomada}</Pill>
            <Pill tono="aviso" punto>En proceso {cuenta.en_proceso}</Pill>
          </div>
        )}
      </div>

      {error ? (
        <div className="tarjeta" style={{ borderColor: 'var(--ambar-solido)' }}>
          <p className="fila muted" style={{ gap: 6, margin: 0 }}>
            <Icono nombre="avisos" size={16} /> La bandeja «Mi área» todavía no está disponible: falta aplicar la migración <strong>0202</strong> (<code>pnpm db:reset</code>).
          </p>
        </div>
      ) : lista.length === 0 ? (
        <EstadoVacio
          icono="ok"
          titulo="Nada pendiente por ahora"
          texto="No tienes derivaciones abiertas en tus áreas. Cuando Verificación derive una solicitud a tu área, aparecerá aquí."
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {lista.map((d) => {
            const tuya = miId && d.tomado_por === miId;
            return (
              <div key={d.id} className="tarjeta">
                <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ fontSize: '.95rem' }}>{ETIQUETA_AREA_DESTINO[d.area as keyof typeof ETIQUETA_AREA_DESTINO] ?? d.area}</strong>
                  <Pill tono={(TONO_EST[d.estado] ?? 'neutra') as any} punto>{ETIQUETA_ESTADO_DERIVACION[d.estado as keyof typeof ETIQUETA_ESTADO_DERIVACION] ?? d.estado}</Pill>
                  {d.prioridad && <Pill tono={(TONO_PRIO[d.prioridad] ?? 'neutra') as any} punto={false}>Prioridad {ETIQUETA_PRIORIDAD_DERIVACION[d.prioridad as keyof typeof ETIQUETA_PRIORIDAD_DERIVACION] ?? d.prioridad}</Pill>}
                  {tuya && <Pill tono="ok" punto={false}>La tienes tú</Pill>}
                </div>

                <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                  <span className="muted" style={{ fontSize: '.82rem' }}>Solicitud</span>
                  <strong>#{String(d.caso_numero).padStart(5, '0')}</strong>
                  <span style={{ fontWeight: 600 }}>{d.caso_titulo}</span>
                  {d.caso_categoria && <BadgeCategoria>{d.caso_categoria}</BadgeCategoria>}
                  {d.personas_afectadas != null && <span className="muted" style={{ fontSize: '.8rem' }}><Icono nombre="grupos" size={13} /> {d.personas_afectadas} afectadas</span>}
                </div>

                {d.accion && <p style={{ margin: '8px 0 0', fontSize: '.9rem' }}><strong>Acción requerida:</strong> {d.accion}</p>}
                {d.observaciones && <p className="muted" style={{ margin: '4px 0 0', fontSize: '.82rem', fontStyle: 'italic' }}>Obs.: {d.observaciones}</p>}
                <div className="muted" style={{ fontSize: '.76rem', marginTop: 6 }}>Derivado {fechaHora(d.derivado_en)}{d.tomado_en ? ` · Tomada ${fechaHora(d.tomado_en)}` : ''}</div>

                {/* Acciones del operador: mismas RPC que el detalle del caso (0177). */}
                <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {d.estado === 'sin_tomar' && (
                    <form action={tomarDerivacion}>
                      <input type="hidden" name="derivacion_id" value={d.id} />
                      <input type="hidden" name="volver" value={VOLVER} />
                      <button className="btn btn-primario" style={{ minHeight: 34, padding: '4px 12px', fontSize: '.85rem' }}><Icono nombre="ok" size={14} /> Tomar</button>
                    </form>
                  )}
                  {d.estado === 'tomada' && (
                    <form action={avanzarDerivacion}>
                      <input type="hidden" name="derivacion_id" value={d.id} />
                      <input type="hidden" name="volver" value={VOLVER} />
                      <button className="btn" style={{ minHeight: 34, padding: '4px 12px', fontSize: '.85rem' }}><Icono nombre="reloj" size={14} /> Marcar en proceso</button>
                    </form>
                  )}
                  {(d.estado === 'tomada' || d.estado === 'en_proceso') && (
                    <form action={cerrarDerivacion} className="fila" style={{ gap: 4, flexWrap: 'wrap' }}>
                      <input type="hidden" name="derivacion_id" value={d.id} />
                      <input type="hidden" name="volver" value={VOLVER} />
                      <input name="motivo" className="input" placeholder="Motivo de cierre (opcional)" style={{ minHeight: 34, maxWidth: 220, flex: '1 1 180px', fontSize: '.85rem' }} />
                      <BotonConfirmar mensaje="¿Cerrar esta derivación? Marca el trabajo de tu área como finalizado." className="btn" style={{ minHeight: 34, padding: '4px 12px', fontSize: '.85rem' }}>
                        <Icono nombre="ok" size={14} /> Cerrar
                      </BotonConfirmar>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AnimarEntrada>
  );
}
