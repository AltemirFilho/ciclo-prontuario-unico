// Definição de pronto na prática: lê os resultados dos testes e só fecha
// a história se TODOS os testes ligados a ela passaram. Ao fechar, deixa
// um comentário com a evidência (esperado × obtido) e marca os critérios.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO, HISTORIAS } from './backlog.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ler = (arq) => JSON.parse(readFileSync(path.join(RAIZ, 'testes', 'resultados', arq), 'utf8'))
const testes = ler('testes.json')
const { experimentos, cpf } = ler('indices.json')
const ambiente = ler('ambiente.json')

const gh = (args, corpo) =>
  JSON.parse(execFileSync('gh', ['api', ...args, ...(corpo ? ['--input', '-'] : [])], {
    input: corpo ? JSON.stringify(corpo) : undefined,
    encoding: 'utf8',
  }) || 'null')

const fmt = (v) => (v < 1 ? v.toFixed(3) : v.toFixed(2)).replace('.', ',')
const celula = (t) => String(t).replace(/\|/g, '\\|').replace(/\n/g, ' ')

function evidencia(id) {
  const t = testes.find((x) => x.id === id)
  if (t) return { passou: t.passou, linha: `| ${t.id} | ${celula(t.titulo)} | ${celula(t.esperado)} | ${celula(t.obtido)} | ${t.passou ? 'passou' : 'FALHOU'} |` }
  if (id === 'I5') return { passou: cpf.usouIndice, linha: `| I5 | ${celula(cpf.titulo)} | usar ${cpf.indice} | ${cpf.usouIndice ? 'usou' : 'não usou'} (${fmt(cpf.tempo)} ms) | ${cpf.usouIndice ? 'passou' : 'FALHOU'} |` }
  const e = experimentos.find((x) => x.id === id)
  if (e) {
    return {
      passou: e.usouIndice,
      linha: `| ${e.id} | ${celula(e.titulo)} | usar ${e.indice} | sem índice ${fmt(e.sem.mediana)} ms, com índice ${fmt(e.com.mediana)} ms (${e.vezesMaisRapido.toFixed(0)}x) | ${e.usouIndice ? 'passou' : 'FALHOU'} |`,
    }
  }
  return { passou: false, linha: `| ${id} | resultado não encontrado | | | FALHOU |` }
}

const issues = gh([`repos/${REPO}/issues?state=all&per_page=100`])

for (const h of HISTORIAS.filter((x) => x.testes.length)) {
  const issue = issues.find((i) => i.title === h.titulo)
  if (!issue) { console.log('sem issue:', h.titulo); continue }
  if (issue.state === 'closed') { console.log(`#${issue.number} já fechada`); continue }

  const linhas = h.testes.map(evidencia)
  if (!linhas.every((l) => l.passou)) {
    console.log(`#${issue.number} continua aberta: há teste falhando`)
    continue
  }

  const comentario = [
    `Pronto. Todos os testes ligados passaram (${ambiente.postgres}, PGlite ${ambiente.pglite}, execução de ${ambiente.quando}).`,
    '',
    '| Teste | O que foi testado | Esperado | Obtido | Resultado |',
    '| --- | --- | --- | --- | --- |',
    ...linhas.map((l) => l.linha),
    '',
    'Evidência completa em `testes/resultados/RESULTADOS.md`.',
  ].join('\n')

  gh(['-X', 'POST', `repos/${REPO}/issues/${issue.number}/comments`], { body: comentario })
  gh(['-X', 'PATCH', `repos/${REPO}/issues/${issue.number}`], {
    body: issue.body.replaceAll('- [ ]', '- [x]'),
    state: 'closed',
    state_reason: 'completed',
  })
  console.log(`#${issue.number} fechada com evidência: ${h.titulo}`)
}
