// Servidor estático mínimo para rodar o sistema no notebook (sem dependências).
// Uso: npm run servidor   → http://localhost:4517/app/
import { createServer } from 'node:http'
import { exec } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = Number(process.env.PORT || 4517)

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.gz': 'application/gzip',      // sem Content-Encoding: o PGlite descompacta sozinho
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
}

createServer(async (req, res) => {
  try {
    let rota = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (rota === '/') rota = '/index.html'
    let arquivo = path.join(RAIZ, rota)
    if (!arquivo.startsWith(RAIZ)) { res.writeHead(403).end(); return }
    const info = await stat(arquivo).catch(() => null)
    if (info?.isDirectory()) arquivo = path.join(arquivo, 'index.html')
    const corpo = await readFile(arquivo)
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(corpo)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado')
  }
}).listen(PORTA, () => {
  console.log(`Ciclo Prontuário Único em http://localhost:${PORTA}/app/`)
  console.log(`Apresentação em http://localhost:${PORTA}/docs/apresentacao/`)
  console.log('Deixe esta janela aberta durante a apresentação. Para fechar: Ctrl + C.')
  // --abrir: abre a apresentação no navegador padrão (atalho INICIAR.bat)
  if (process.argv.includes('--abrir') && process.platform === 'win32') {
    exec(`start "" "http://localhost:${PORTA}/docs/apresentacao/"`)
  }
})
