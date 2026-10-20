/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Use the installed TypeScript compiler API during Next builds. The CLI
    // cannot capture --showConfig output in the current local Node runtime.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
