import { redirect } from 'next/navigation';

// La sección «Donaciones» se integró en «Oportunidades de donación» para un flujo
// unificado (las donaciones se crean al conectar una oferta con una solicitud, y su
// seguimiento vive allí). Esta ruta se conserva solo para no romper enlaces viejos.
export default function DonacionesRedirect() {
  redirect('/insumos/oportunidades');
}
