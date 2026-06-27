/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@unidos/types', '@unidos/supabase-client'],
};
export default nextConfig;
