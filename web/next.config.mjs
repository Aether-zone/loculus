import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    /*
     * The repository root, stated rather than inferred.
     *
     * It has to be *above* this directory: pnpm links dependencies into
     * `web/node_modules` as symlinks pointing at the virtual store under the
     * repository root, and Turbopack does not resolve outside its root — so a
     * root of `web/` cannot see the real files behind its own `node_modules`,
     * `next` included. akouo points its root here too, for the neighbouring
     * reason that its app transpiles workspace packages.
     */
    root: path.join(here, '..'),
  },
};

export default nextConfig;
