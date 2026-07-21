import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAfiliacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CARGOS_AFILIACION, TIPOS_AFILIADO, ETIQUETA_TIPO_AFILIADO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';

export const metadata = { title: 'Afiliación' };
export const dynamic = 'force-dynamic';

type Tipo = (typeof TIPOS_AFILIADO)[number];
const SIN_CARGO = 'Sin cargo';

/** Afiliación (0198): profesionales y voluntarios del departamento de Alianzas
 *  Estratégicas, clasificados por tipo y organizados por cargo como tarjetas. */
export default async function AfiliacionPage({ searchParams }: { searchParams: { tipo?: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeAfiliacion(perfil)) redirect('/dashboard');
  const tipo: Tipo = searchParams?.tipo === 'profesional' ? 'profesional' : 'voluntario';

  const supabase = await createClient();
  const { data } = await supabase.from('afiliados')
    .select('id, tipo, cargo, nombre, contacto, habilidades, estado')
    .eq('tipo', tipo).order('creado_en', { ascending: false });
  const afiliados = (data ?? []) as any[];

  // Agrupar por cargo (columnas del catálogo con datos + «Sin cargo» para el resto).
  const columnas = [...CARGOS_AFILIACION, SIN_CARGO];
  const porCargo = new Map<string, any[]>();
  columnas.forEach((c) => porCargo.set(c, []));
  afiliados.forEach((a) => {
    const c = a.cargo && CARGOS_AFILIACION.includes(a.cargo) ? a.cargo : SIN_CARGO;
    porCargo.get(c)!.push(a);
  });
  const conDatos = columnas.filter((c) => porCargo.get(c)!.length > 0);

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="usuario" size={24} /> Afiliación</h1>
          <p className="muted sub">Profesionales y voluntarios de Alianzas Estratégicas, organizados por cargo.</p>
        </div>
        <Link href="/afiliacion/nuevo" className="btn btn-primario"><Icono nombre="mas" size={16} /> Nuevo afiliado</Link>
      </div>

      {/* Segmentador Profesionales / Voluntarios */}
      <div className="seg" aria-label="Clasificación" style={{ marginBottom: 14 }}>
        {TIPOS_AFILIADO.map((t) => (
          <Link key={t} href={'/afiliacion?tipo=' + t} aria-current={t === tipo ? 'page' : undefined} className={t === tipo ? 'activo' : undefined}>
            {ETIQUETA_TIPO_AFILIADO[t]}es
          </Link>
        ))}
      </div>

      {afiliados.length === 0 ? (
        <EstadoVacio icono="usuario" titulo={'Aún no hay ' + ETIQUETA_TIPO_AFILIADO[tipo].toLowerCase() + 'es'}
          texto="Registra al primero con «Nuevo afiliado». Se organizan por cargo, como tarjetas." />
      ) : (
        <div className="tablero-insumos">
          {conDatos.map((cargo) => (
            <div key={cargo} className="tablero-col">
              <h3 className="fila" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span>{cargo}</span><span className="insignia">{porCargo.get(cargo)!.length}</span>
              </h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {porCargo.get(cargo)!.map((a) => (
                  <Link key={a.id} href={'/afiliacion/' + a.id} className="tarjeta" style={{ padding: 12, opacity: a.estado === 'inactivo' ? 0.55 : 1 }}>
                    <div style={{ fontWeight: 600 }}>{a.nombre}</div>
                    {a.contacto && <div className="muted" style={{ fontSize: '.82rem' }}>{a.contacto}</div>}
                    {a.habilidades && <div className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>{a.habilidades}</div>}
                    {a.estado === 'inactivo' && <span className="pill" style={{ marginTop: 6, display: 'inline-block' }}>Inactivo</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AnimarEntrada>
  );
}
