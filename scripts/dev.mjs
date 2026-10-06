import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const vercelCli = fileURLToPath(new URL('../node_modules/vercel/dist/vc.js', import.meta.url))
const child = spawn(process.execPath, [vercelCli, 'dev', '--local', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

child.on('error', error => {
  console.error('Impossible de démarrer Vercel Dev:', error.message)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1
})
