/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@unidos/types', '@unidos/supabase-client'],
  // ESLint disponible vía `pnpm lint`, pero no bloquea los deploys.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
