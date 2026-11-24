// Conexão para rodar no Node (terminal). O navegador tem a sua em app/js/banco.js.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { montarBanco } from '../nucleo/montar-banco.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const lerSql = (arquivo) => readFile(path.join(RAIZ, 'banco', arquivo), 'utf8')

// DATE volta como texto "2026-11-24": virar Date do JavaScript joga a data
// para meia-noite UTC, que em Aracaju (UTC-3) cai no dia anterior.
export const PARSERS = { 1082: (valor) => valor }

export async function novoBanco(opcoes = {}) {
  const db = await PGlite.create({ extensions: { pg_trgm, unaccent }, parsers: PARSERS })
  const tempos = await montarBanco(db, lerSql, opcoes)
  return { db, tempos }
}

export { RAIZ }
