const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // bank statements for a whole year are sent to a server action in one go
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  async redirects() {
    return [{ source: '/money', destination: '/finance', permanent: true }];
  },
};
export default nextConfig;
