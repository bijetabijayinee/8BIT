import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8080',
                // Proxied dev requests are same-origin for the browser, but fetch still
                // attaches an Origin header that the backend's env-driven CORS allowlist
                // would reject. Strip it so dev never depends on CORS_ALLOWED_ORIGINS.
                configure: function (proxy) {
                    proxy.on('proxyReq', function (proxyReq) {
                        proxyReq.removeHeader('origin');
                    });
                },
            },
        },
    },
});
