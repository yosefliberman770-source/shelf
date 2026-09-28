// Runs the AI proxy server and the Vite dev server together.
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['--env-file-if-exists=.env', '--watch', 'server/index.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) { stop(); process.exit(code); } });
