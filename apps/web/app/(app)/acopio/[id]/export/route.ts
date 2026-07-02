import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_INSUMO } from '@/lib/constantes';

// Descarga el inventario del centro como CSV (Excel/Sheets). Solo gestores.
function csv(v: any): string {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'no auth' }, { status: 401 });

  const { data: ok } = await supabase.rpc('puede_gestionar_acopio', { p_punto: params.id });
  if (!ok) return NextResponse.json({ error: 'sin permiso' }, { status: 403 });

  const [{ data: centro }, { data: inv }] = await Promise.all([
    supabase.from('puntos_acopio').select('nombre').eq('id', params.id).single(),
    supabase.from('inventario_acopio').select('*').eq('punto_id', params.id).order('categoria').order('producto'),
  ]);
  const inventario = (inv ?? []) as any[];

  const filas = [
    ['Producto', 'Categoria', 'Codigo', 'Cantidad', 'Unidad', 'Minimo', 'Actualizado'],
    ...inventario.map((it) => [
      it.producto,
      it.categoria ? (ETIQUETA_TIPO_INSUMO[it.categoria] ?? it.categoria) : '',
      it.codigo ?? '',
      it.cantidad ?? 0,
      it.unidad ?? '',
      Number(it.minimo) > 0 ? it.minimo : '',
      it.actualizado_en ?? '',
    ]),
  ];
  // BOM para que Excel reconozca UTF-8 (acentos).
  const cuerpo = '﻿' + filas.map((f) => f.map(csv).join(',')).join('\r\n');
  const nombre = 'inventario-' + String(centro?.nombre ?? 'centro').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}.csv"`,
    },
  });
}
