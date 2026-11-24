// O banco do navegador: o mesmo PostgreSQL dos testes, montado com os
// mesmos arquivos .sql da pasta /banco.
import { PGlite } from '../vendor/pglite/index.js'
import { pg_trgm } from '../vendor/pglite/contrib/pg_trgm.js'
import { unaccent } from '../vendor/pglite/contrib/unaccent.js'
import { montarBanco, contarTabelas } from '../../nucleo/montar-banco.js'

// DATE volta como texto ("1959-03-12"); virar Date jogaria para o dia anterior em UTC-3.
const PARSERS = { 1082: (valor) => valor }

const lerSql = async (arquivo) => {
  const resposta = await fetch(new URL(`../../banco/${arquivo}`, import.meta.url))
  if (!resposta.ok) throw new Error(`Não consegui ler ${arquivo} (${resposta.status})`)
  return resposta.text()
}

export let db = null

export async function iniciarBanco({ pacientes = 2500, atendimentos = 40000, aoProgredir } = {}) {
  db = await PGlite.create({ extensions: { pg_trgm, unaccent }, parsers: PARSERS })
  const tempos = await montarBanco(db, lerSql, { pacientes, atendimentos, aoProgredir })
  return { db, tempos }
}

export async function infoDoBanco() {
  const versao = (await db.query('SELECT version() AS v')).rows[0].v.split(' on ')[0]
  const tabelas = await contarTabelas(db)
  return { versao, tabelas }
}
