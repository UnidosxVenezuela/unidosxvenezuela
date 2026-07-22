/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@unidos/types', '@unidos/supabase-client'],
  // ESLint disponible vía `pnpm lint`, pero no bloquea los deploys.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: {
      // El alta/edición de solicitudes (y otros formularios) sube adjuntos DENTRO del
      // cuerpo del Server Action. El límite por defecto de Next (1 MB) es demasiado bajo
      // para las fotos/capturas de respaldo (el formulario admite «hasta 10 MB c/u») y su
      // rechazo era SILENCIOSO en la web («no pasa nada»). Se sube el tope para que una
      // foto normal pase. (En despliegues serverless el proveedor puede imponer su propio
      // tope de cuerpo; este ajuste cubre el caso común sin cambiar la arquitectura.)
      bodySizeLimit: '10mb',
    },
  },
};
export default nextConfig;
