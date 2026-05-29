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
    },
    build: {
      outDir: 'build',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor';
            }
            if (id.includes('@mui/icons-material')) {
              return 'mui-icons-vendor';
            }
            if (id.includes('@emotion')) {
              return 'emotion-vendor';
            }
            if (
              id.includes('@mui/system') ||
              id.includes('@mui/utils') ||
              id.includes('@mui/private-theming') ||
              id.includes('@mui/styled-engine')
            ) {
              return 'mui-system-vendor';
            }
            if (id.includes('@mui/material')) {
              return 'mui-core-vendor';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor';
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'charts-vendor';
            }
            if (id.includes('date-fns') || id.includes('dayjs')) {
              return 'date-vendor';
            }
            return 'vendor';
          },
        },
      },
    },
  };
});
