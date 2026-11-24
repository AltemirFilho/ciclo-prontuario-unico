// Mede o custo dos índices em espaço: quanto cada tabela e cada índice ocupa
// no banco de 5 mil pacientes. Grava testes/resultados/tamanhos.json.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { novoBanco, RAIZ } from './conexao-node.mjs'

const { db } = await novoBanco()
const tabelas = (await db.query(`
  SELECT t.relname AS tabela,
         pg_relation_size(t.oid)::bigint       AS dados_bytes,
         pg_indexes_size(t.oid)::bigint        AS indices_bytes
    FROM pg_class t
   WHERE t.relnamespace = 'public'::regnamespace AND t.relkind = 'r'
   ORDER BY pg_relation_size(t.oid) DESC`)).rows
const indices = (await db.query(`
  SELECT c.relname AS indice, t.relname AS tabela, pg_relation_size(c.oid)::bigint AS bytes
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
   WHERE t.relnamespace = 'public'::regnamespace
   ORDER BY bytes DESC`)).rows
await db.close()

const mb = (b) => (Number(b) / 1024 / 1024).toFixed(2)
console.table(tabelas.map((t) => ({ tabela: t.tabela, dados_MB: mb(t.dados_bytes), indices_MB: mb(t.indices_bytes) })))
console.table(indices.map((i) => ({ indice: i.indice, tabela: i.tabela, MB: mb(i.bytes) })))
await writeFile(path.join(RAIZ, 'testes', 'resultados', 'tamanhos.json'),
  JSON.stringify({ tabelas, indices }, (_, v) => (typeof v === 'bigint' ? Number(v) : v), 2))
