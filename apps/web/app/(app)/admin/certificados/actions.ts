'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireCoordinacion } from '@/lib/auth';
import { redirigirOk, redirigirError } from '@/lib/flash';

const txt = (v: FormDataEntryValue | null) => String(v ?? '').trim();
const opt = (v: FormDataEntryValue | null) => { const s = txt(v); return s ? s : null; };
// La coma decimal es la de la interfaz («12,5»); la base espera punto.
const num = (v: FormDataEntryValue | null) => {
  const s = txt(v).replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const faltaMigracion = (m: string) =>
  /could not find the function|does not exist|no existe la (función|relación)|schema cache/i.test(m);

/** Ajuste manual de horas (0215): suma o resta horas con un MOTIVO. No toca el conteo
 *  automático de `registro_horas`, que sigue siendo la evidencia (0164). */
export async function ajustarHoras(formData: FormData) {
  await requireCoordinacion();
  const supabase = await createClient();
  const perfil = txt(formData.get('perfil_id'));
  const volver = '/admin/certificados/persona/' + perfil;
  const horas = num(formData.get('horas'));
  const motivo = txt(formData.get('motivo')).slice(0, 300);
  const fecha = opt(formData.get('fecha'));

  if (horas === null || horas === 0) return redirigirError(volver, 'Indica cuántas horas sumar o restar (por ejemplo 12, o -3 para descontar).');
  if (motivo.length < 3) return redirigirError(volver, 'Escribe el motivo del ajuste; queda registrado con tu nombre.');

  const { error } = await supabase.rpc('ajustar_horas', {
    p_perfil: perfil, p_horas: horas, p_motivo: motivo, p_fecha: fecha,
  });
  if (error) {
    return redirigirError(volver, faltaMigracion(error.message)
      ? 'Aún no disponible (falta aplicar la migración 0215).'
      : 'No se pudo ajustar las horas: ' + error.message);
  }
  revalidatePath(volver); revalidatePath('/admin/certificados');
  redirigirOk(volver, (horas > 0 ? 'Se sumaron ' : 'Se restaron ') + Math.abs(horas).toString().replace('.', ',') + ' h. Queda registrado el motivo.');
}

export async function eliminarAjuste(formData: FormData) {
  await requireCoordinacion();
  const supabase = await createClient();
  const perfil = txt(formData.get('perfil_id'));
  const volver = '/admin/certificados/persona/' + perfil;
  const { error } = await supabase.from('horas_ajustes').delete().eq('id', txt(formData.get('ajuste_id')));
  if (error) return redirigirError(volver, 'No se pudo quitar el ajuste: ' + error.message);
  revalidatePath(volver); revalidatePath('/admin/certificados');
  redirigirOk(volver, 'Ajuste eliminado. El total vuelve a su valor anterior.');
}

/** Emite el certificado: CONGELA nombre y horas, y genera el folio. */
export async function emitirCertificado(formData: FormData) {
  await requireCoordinacion();
  const supabase = await createClient();
  const perfil = txt(formData.get('perfil_id'));
  const volver = '/admin/certificados/persona/' + perfil;

  const { data, error } = await supabase.rpc('emitir_certificado', {
    p_perfil: perfil,
    p_horas: num(formData.get('horas')),
    p_inicio: opt(formData.get('inicio')),
    p_fin: opt(formData.get('fin')),
  });
  if (error) {
    return redirigirError(volver, faltaMigracion(error.message)
      ? 'Aún no disponible (falta aplicar la migración 0215).'
      : 'No se pudo emitir el certificado: ' + error.message);
  }
  revalidatePath('/admin/certificados'); revalidatePath(volver);
  // Al emitir se abre directamente el certificado, listo para imprimir o guardar en PDF.
  redirect('/admin/certificados/' + String(data) + '/imprimir');
}

export async function anularCertificado(formData: FormData) {
  await requireCoordinacion();
  const supabase = await createClient();
  const id = txt(formData.get('certificado_id'));
  const volver = opt(formData.get('volver')) || '/admin/certificados';
  const motivo = txt(formData.get('motivo')).slice(0, 300);
  if (!motivo) return redirigirError(volver, 'Indica el motivo de la anulación.');

  const { error } = await supabase.rpc('anular_certificado', { p_certificado: id, p_motivo: motivo });
  if (error) return redirigirError(volver, 'No se pudo anular: ' + error.message);
  revalidatePath('/admin/certificados');
  redirigirOk(volver, 'Certificado anulado. Queda el registro con su motivo.');
}
