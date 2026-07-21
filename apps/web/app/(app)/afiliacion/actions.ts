'use server';
// Afiliación (0198): base de profesionales y voluntarios del departamento de Alianzas
// Estratégicas. La gestiona el admin general y el rol 'afiliacion'. La autorización
// real la impone la RLS (puede_alianzas); aquí se valida para dar buen error.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';
import type { Rol } from '@unidos/types';

const TIPOS = ['profesional', 'voluntario'];
const ESTADOS = ['activo', 'inactivo'];

function txt(v: FormDataEntryValue | null | undefined) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null | undefined) { const s = txt(v); return s ? s : null; }

async function exigirAfiliacion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin') && !roles.includes('afiliacion')) throw new Error('No tienes permiso para gestionar afiliados.');
  return { supabase, user };
}

export async function crearAfiliado(formData: FormData) {
  const { supabase, user } = await exigirAfiliacion();
  const tipo = txt(formData.get('tipo'));
  const nombre = txt(formData.get('nombre')).slice(0, 160);
  if (!TIPOS.includes(tipo)) throw new Error('Elige profesional o voluntario.');
  if (!nombre) throw new Error('Ponle un nombre al afiliado.');
  const { error } = await supabase.from('afiliados').insert({
    tipo,
    cargo: opt(formData.get('cargo')),
    nombre,
    contacto: opt(formData.get('contacto')),
    habilidades: opt(formData.get('habilidades')),
    notas: opt(formData.get('notas')),
    estado: 'activo',
    creado_por: user.id,
  });
  if (error) throw new Error('No se pudo registrar: ' + error.message);
  revalidatePath('/afiliacion');
  redirigirOk('/afiliacion?tipo=' + tipo, 'Afiliado registrado.');
}

export async function editarAfiliado(formData: FormData) {
  const { supabase } = await exigirAfiliacion();
  const id = txt(formData.get('id'));
  const tipo = txt(formData.get('tipo'));
  const nombre = txt(formData.get('nombre')).slice(0, 160);
  if (!id) throw new Error('Falta el afiliado.');
  if (!TIPOS.includes(tipo)) throw new Error('Tipo no válido.');
  if (!nombre) throw new Error('El nombre no puede quedar vacío.');
  const { error } = await supabase.from('afiliados').update({
    tipo,
    cargo: opt(formData.get('cargo')),
    nombre,
    contacto: opt(formData.get('contacto')),
    habilidades: opt(formData.get('habilidades')),
    notas: opt(formData.get('notas')),
    actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo guardar: ' + error.message);
  revalidatePath('/afiliacion'); revalidatePath('/afiliacion/' + id);
  redirigirOk('/afiliacion/' + id, 'Afiliado actualizado');
}

export async function cambiarEstadoAfiliado(formData: FormData) {
  const { supabase } = await exigirAfiliacion();
  const id = txt(formData.get('id'));
  const estado = txt(formData.get('estado'));
  if (!id || !ESTADOS.includes(estado)) throw new Error('Datos no válidos.');
  const { error } = await supabase.from('afiliados').update({ estado, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo cambiar el estado: ' + error.message);
  revalidatePath('/afiliacion'); revalidatePath('/afiliacion/' + id);
  redirigirOk('/afiliacion/' + id, 'Estado actualizado.');
}

export async function eliminarAfiliado(formData: FormData) {
  const { supabase } = await exigirAfiliacion();
  const id = txt(formData.get('id'));
  if (!id) throw new Error('Falta el afiliado.');
  const { error } = await supabase.from('afiliados').delete().eq('id', id);
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/afiliacion');
  redirigirOk('/afiliacion', 'Afiliado eliminado');
}
