import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: true,
        port: 5173,
        allowedHosts: true,
        proxy: {
            '/api': {
                target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
                changeOrigin: true,
            },
            // Public share-card pages (/s/:token, /s/:token/card.svg|png) are rendered
            // by the backend so link scrapers get Open Graph tags. Regex key: a plain
            // '/s' prefix would also swallow /signup and /sleep.
            '^/s/': {
                target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
                changeOrigin: true,
            }
        }
    }
});
