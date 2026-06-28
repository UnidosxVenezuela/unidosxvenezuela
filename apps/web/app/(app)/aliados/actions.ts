'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { esEnlaceHttpsValido } from '@/lib/constantes';

export async function crearEndpoint(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const url = String(formData.get('url') ?? '').trim();
  if (!esEnlaceHttpsValido(url)) throw new Error('El endpoint debe ser una URL https válida.');
  const opt = (k: string) => (String(formData.get(k) ?? '').trim() || null);

  const { error } = await supabase.from('endpoints_aliados').insert({
    plataforma: String(formData.get('plataforma') ?? '').trim(),
    descripcion: opt('descripcion'),
    url,
    metodo: (String(formData.get('metodo') ?? '').trim() || 'GET'),
    formato: opt('formato'),
    datos: opt('datos'),
    auth_notas: opt('auth_notas'),
    contacto: opt('contacto'),
    creado_por: user.id,
  });
  // RLS deja insertar solo a admin o líder de plataforma aliada.
  if (error) throw new Error('No se pudo registrar el endpoint (¿permisos?): ' + error.message);
  revalidatePath('/aliados');
}

export async function eliminarEndpoint(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from('endpoints_aliados').delete()
    .eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/aliados');
}
