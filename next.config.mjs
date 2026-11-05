const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    return [{ source: '/money', destination: '/finance', permanent: true }];
  },
};
export default nextConfig;
