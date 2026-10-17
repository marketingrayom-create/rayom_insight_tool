import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],

    server: {
        port: 5174,
        strictPort: true,

        proxy: {
            "/vendor-api": {
                target: "http://127.0.0.1:5002",
                changeOrigin: true,
                rewrite: path => path.replace(/^\/vendor-api/, "/api/amazon-vendor"),
            },
            "/seller-api": {
                target: "http://127.0.0.1:5002",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/seller-api/, ""),
            },
            "/meta-api": {
                target: "http://127.0.0.1:5002",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/meta-api/, "/api/meta"),
            },
            "/shopify-api": {
                target: "http://127.0.0.1:5002",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/shopify-api/, "/api/shopify"),
            },
            "/flipkart-api": {
                target: "http://127.0.0.1:5002",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/flipkart-api/, "/api/flipkart"),
            },
            // Beacon API
            "/api": {
                target: "http://127.0.0.1:5015",
                changeOrigin: true,
                secure: false,
            },

            "/uniware-api": {
                target: "http://127.0.0.1:5015",
                changeOrigin: true,
                rewrite: (path) =>
                    path.replace(/^\/uniware-api/, "/api"),
            },

            // Starts the automation process through the main Uniware service.
            "/amazon-control": {
                target: "http://127.0.0.1:5015",
                changeOrigin: true,
                rewrite: (path) =>
                    path.replace(
                        /^\/amazon-control/,
                        "/api/amazon"
                    ),
            },

            // Calls the Selenium/Vendor Central service.
            "/amazon-api": {
                target: "http://127.0.0.1:5014",
                changeOrigin: true,
                rewrite: (path) =>
                    path.replace(
                        /^\/amazon-api/,
                        "/api/amazon"
                    ),
            },
        },

        watch: {
            ignored: [
                '**/backend/amazon_chrome_profile/**',
            ],
        },
    },
});
