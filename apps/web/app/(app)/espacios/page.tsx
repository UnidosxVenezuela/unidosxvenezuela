import { redirect } from 'next/navigation';
// Sección retirada en la reestructura: la membresía la gestionan admin/líderes
// y el trabajo vive dentro de cada grupo.
export default function SeccionRetirada() { redirect('/dashboard'); }
