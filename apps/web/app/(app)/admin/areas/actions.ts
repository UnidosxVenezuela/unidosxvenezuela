'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

export async function crearArea(formData: FormData) {
  const supabase = await createClient();
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio.');
  const claveRaw = String(formData.get('clave') ?? '').trim();
  const clave = slug(claveRaw || nombre);
  if (!clave) throw new Error('Clave inválida.');

  const { error } = await supabase.from('areas').insert({
    clave, nombre, descripcion: (String(formData.get('descripcion') ?? '').trim() || null),
  });
  // RLS (areas_admin) solo deja insertar a un admin.
  if (error) throw new Error('No se pudo crear el área (¿clave repetida o sin permisos de admin?): ' + error.message);
  revalidatePath('/admin/areas');
  revalidatePath('/grupos/nuevo');
}
