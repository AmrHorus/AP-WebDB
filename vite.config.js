// Vite build configuration for AP-WebDB.
// Multi-page static build — output is fully relative so it deploys to any
// GitHub Pages subpath (https://amrhorus.github.io/AP-WebDB/) without a server.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    publicDir: 'assets',
    build: {
        outDir: 'dist',
        target: 'es2020',
        sourcemap: false,
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                dbCenter: resolve(__dirname, 'dbCenter.html')
            },
            output: {
                entryFileNames: 'js/[name].js',
                chunkFileNames: 'js/[name].js',
                assetFileNames: (info) => {
                    const name = info.name || '';
                    if (name.endsWith('.css')) return 'css/style.css';
                    return 'assets/[name][extname]';
                }
            }
        }
    }
});
