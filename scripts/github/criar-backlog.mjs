// Cria no GitHub as etiquetas, as entregas (milestones) e as issues do backlog.
// Pode rodar de novo: o que já existe é pulado.
import { execFileSync } from 'node:child_process'
import { REPO, ETIQUETAS, ENTREGAS, HISTORIAS } from './backlog.mjs'

const gh = (args, corpo) =>
  JSON.parse(execFileSync('gh', ['api', ...args, ...(corpo ? ['--input', '-'] : [])], {
    input: corpo ? JSON.stringify(corpo) : undefined,
    encoding: 'utf8',
  }) || 'null')

const PRAZO = '2026-11-24T21:35:00Z' // 18h35 em Aracaju

// etiquetas
const etiquetasExistentes = new Set(gh(['--paginate', `repos/${REPO}/labels?per_page=100`]).map((e) => e.name))
for (const e of ETIQUETAS) {
  if (etiquetasExistentes.has(e.name)) continue
  gh(['-X', 'POST', `repos/${REPO}/labels`], e)
  console.log('etiqueta:', e.name)
}

// entregas
const marcos = gh([`repos/${REPO}/milestones?state=all&per_page=100`])
const numeroDaEntrega = []
for (const m of ENTREGAS) {
  let achado = marcos.find((x) => x.title === m.title)
  if (!achado) {
    achado = gh(['-X', 'POST', `repos/${REPO}/milestones`], { ...m, due_on: PRAZO })
    console.log('entrega:', m.title)
  }
  numeroDaEntrega.push(achado.number)
}

// issues
const issues = gh([`repos/${REPO}/issues?state=all&per_page=100`])
for (const h of HISTORIAS) {
  if (issues.find((i) => i.title === h.titulo)) continue
  const corpo = h.testes.length
    ? `${h.corpo}\n\n**Testes ligados:** ${h.testes.join(', ')}` +
      `\n\n**Definição de pronto:** só fecha quando os testes ligados passarem e o resultado estiver em \`testes/resultados/RESULTADOS.md\`.`
    : h.corpo
  const criada = gh(['-X', 'POST', `repos/${REPO}/issues`], {
    title: h.titulo,
    body: corpo,
    labels: h.etiquetas,
    milestone: numeroDaEntrega[h.entrega],
    assignees: ['AltemirFilho'],
  })
  console.log(`issue #${criada.number}: ${h.titulo}`)
}
