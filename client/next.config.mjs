import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX({
  // customise the config file path
  configPath: "source.config.ts",
  reactStrictMode: true,
  experimental: {
    mdxRs: true, // Optional: Faster MDX compilation
  }
});
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'vercel.com',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      // Add any other domains you might use
    ],
  },
};

export default withMDX(config);