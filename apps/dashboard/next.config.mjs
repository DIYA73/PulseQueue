/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/* to the backend so the browser never hits a different origin
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
