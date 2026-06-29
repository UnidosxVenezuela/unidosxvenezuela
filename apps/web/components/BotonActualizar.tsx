'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icono from '@/components/Icono';

/** Re-ejecuta el render del Server Component para traer datos nuevos. */
export default function BotonActualizar({ label = 'Actualizar' }: { label?: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <button className="btn" type="button" disabled={pendiente}
      onClick={() => iniciar(() => router.refresh())}>
      <Icono nombre="refrescar" size={16} /> {pendiente ? 'Actualizando…' : label}
    </button>
  );
}
