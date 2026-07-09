import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = mode === 'production';

  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'REACT_APP_'],
    define: {
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': env.VITE_DEV_API_PROXY || env.REACT_APP_DEV_API_PROXY || 'http://localhost:8000',
      },
      warmup: {
        clientFiles: ['./src/index.tsx', './src/theme.ts', './src/App.tsx'],
      },
    },
    optimizeDeps: {
      force: true,
      include: [
        '@emotion/react',
        '@emotion/styled',
        '@emotion/cache',
        '@mui/material',
        '@mui/material/styles',
        '@mui/system',
        '@mui/icons-material',
      ],
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': env.VITE_DEV_API_PROXY || env.REACT_APP_DEV_API_PROXY || 'http://localhost:8000',
      },
    },
    build: {
      outDir: 'build',
    },
  };
});
