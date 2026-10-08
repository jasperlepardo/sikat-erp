// Starts the Vite dev server, then opens it in Electron. Quitting Electron stops Vite.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];

const app = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
app.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
