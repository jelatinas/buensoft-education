import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleAuth, handleData } from './server/http.ts';

function eduApi(env: Record<string, string>): Plugin {
  return {
    name: 'edu-api',
    configureServer(server) {
      for (const [key, value] of Object.entries(env)) {
        if (!process.env[key]) process.env[key] = value;
      }
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url !== '/api/auth' && url !== '/api/data') return next();
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          (req as any).body = raw ? JSON.parse(raw) : {};
        } catch {
          (req as any).body = {};
        }
        if (url === '/api/auth') return handleAuth(req, res);
        return handleData(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss(), eduApi(env)],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY),
        'process.env.CEREBRAS_API_KEY': JSON.stringify(env.CEREBRAS_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
