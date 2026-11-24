// Copia do node_modules para app/vendor só o que o navegador precisa do PGlite:
// os módulos JS, o PostgreSQL compilado (.wasm + .data) e as duas extensões.
// Assim o sistema roda sem internet (sala de aula) e no GitHub Pages.
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEM = path.join(RAIZ, 'node_modules', '@electric-sql', 'pglite', 'dist')
const DESTINO = path.join(RAIZ, 'app', 'vendor', 'pglite')

await rm(DESTINO, { recursive: true, force: true })
await mkdir(path.join(DESTINO, 'contrib'), { recursive: true })
await mkdir(path.join(DESTINO, 'fs'), { recursive: true })

const raiz = await readdir(ORIGEM)
for (const arq of raiz) {
  const util = arq.endsWith('.js') || arq.endsWith('.wasm') || arq.endsWith('.data') ||
               arq === 'pg_trgm.tar.gz' || arq === 'unaccent.tar.gz'
  if (util) await cp(path.join(ORIGEM, arq), path.join(DESTINO, arq))
}
for (const arq of ['pg_trgm.js', 'unaccent.js']) {
  await cp(path.join(ORIGEM, 'contrib', arq), path.join(DESTINO, 'contrib', arq))
}
for (const arq of await readdir(path.join(ORIGEM, 'fs'))) {
  if (arq.endsWith('.js')) await cp(path.join(ORIGEM, 'fs', arq), path.join(DESTINO, 'fs', arq))
}
console.log('PGlite copiado para', DESTINO)
