// =====================================================================
// Roda a bateria inteira no terminal e grava as evidências:
//   testes/resultados/RESULTADOS.md   tabela pronta para o artigo
//   testes/resultados/*.json          os mesmos dados, para gráficos
//
// Uso:  npm run testes            (testes + índices + escala)
//       npm run testes -- --rapido  (sem o experimento de escala)
// =====================================================================
import { writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { novoBanco, RAIZ } from './conexao-node.mjs'
import { CASOS } from '../nucleo/casos-de-teste.js'
import { rodarTodos } from '../nucleo/executor-de-testes.js'
import { rodarTodosExperimentos, rodarExperimento, provarIndiceDoCpf, EXPERIMENTOS } from '../nucleo/experimentos-indices.js'
import { contarTabelas } from '../nucleo/montar-banco.js'

const rapido = process.argv.includes('--rapido')
const PASTA = path.join(RAIZ, 'testes', 'resultados')
await mkdir(PASTA, { recursive: true })

const ms = (v) => (v < 1 ? v.toFixed(3) : v.toFixed(2)).replace('.', ',')
const linhaMd = (cols) => `| ${cols.map((c) => String(c).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`

// ---------------------------------------------------------------------
console.log('Montando o banco (5 mil pacientes, 80 mil atendimentos)...')
const t0 = performance.now()
const { db } = await novoBanco()
const tempoMontagem = performance.now() - t0
const tamanho = await contarTabelas(db)
const versao = (await db.query('SELECT version() AS v')).rows[0].v
const versaoPglite = JSON.parse(readFileSync(path.join(RAIZ, 'node_modules', '@electric-sql', 'pglite', 'package.json'), 'utf8')).version
const ambiente = {
  quando: new Date().toLocaleString('pt-BR', { timeZone: 'America/Maceio' }),
  postgres: versao.split(' on ')[0],
  pglite: versaoPglite,
  node: process.version,
  sistema: `${os.type()} ${os.release()}`,
  processador: os.cpus()[0]?.model?.trim(),
  memoriaGB: Math.round(os.totalmem() / 1024 ** 3),
  tempoMontagemMs: Math.round(tempoMontagem),
  tabelas: tamanho,
}
console.log(`Banco pronto em ${Math.round(tempoMontagem)} ms · ${ambiente.postgres}`)

// ---------------------------------------------------------------------
console.log('\nTestes de tipos, restrições, regras e consultas:')
const resultados = await rodarTodos(db, CASOS, (r) => {
  console.log(`  ${r.passou ? 'PASSOU' : 'FALHOU'}  ${r.id}  ${r.titulo}`)
  if (!r.passou) console.log(`          obtido: ${r.obtido}`)
})
const passaram = resultados.filter((r) => r.passou).length
console.log(`\n${passaram} de ${resultados.length} testes passaram.`)

// ---------------------------------------------------------------------
console.log('\nÍndices (sem × com, mediana de 15 execuções):')
const experimentos = await rodarTodosExperimentos(db, { repeticoes: 15 }, (r) => {
  console.log(`  ${r.id} ${r.titulo}: ${ms(r.sem.mediana)} ms → ${ms(r.com.mediana)} ms (${r.vezesMaisRapido.toFixed(1)}x) · usou ${r.com.indicesUsados.join(', ') || 'nenhum'}`)
})
const cpf = await provarIndiceDoCpf(db)
console.log(`  ${cpf.id} ${cpf.titulo}: usou o índice? ${cpf.usouIndice}`)
await db.close()

// ---------------------------------------------------------------------
let escala = []
if (!rapido) {
  console.log('\nEscala: a linha do tempo com 3 tamanhos de clínica (pacientes e atendimentos crescem juntos):')
  const tamanhos = [
    { pacientes: 1250, atendimentos: 10000 },
    { pacientes: 5000, atendimentos: 40000 },
    { pacientes: 20000, atendimentos: 160000 },
  ]
  for (const t of tamanhos) {
    const { db: dbEscala } = await novoBanco(t)
    const registros = (await dbEscala.query('SELECT count(*)::int AS n FROM registro_clinico')).rows[0].n
    const r = await rodarExperimento(dbEscala, EXPERIMENTOS[0], { repeticoes: 15 })
    escala.push({ ...t, registros, sem: r.sem.mediana, com: r.com.mediana, vezes: r.vezesMaisRapido })
    console.log(`  ${registros} registros: ${ms(r.sem.mediana)} ms → ${ms(r.com.mediana)} ms (${r.vezesMaisRapido.toFixed(1)}x)`)
    await dbEscala.close()
  }
}

// ---------------------------------------------------------------------
await writeFile(path.join(PASTA, 'ambiente.json'), JSON.stringify(ambiente, null, 2))
await writeFile(path.join(PASTA, 'testes.json'), JSON.stringify(resultados, null, 2))
await writeFile(path.join(PASTA, 'indices.json'), JSON.stringify({ experimentos, cpf }, null, 2))
if (escala.length) await writeFile(path.join(PASTA, 'escala.json'), JSON.stringify(escala, null, 2))

const md = []
md.push('# Resultados dos testes', '')
md.push(`Executado em ${ambiente.quando} · ${ambiente.postgres} (PGlite ${ambiente.pglite}) · Node ${ambiente.node}`)
md.push(`Máquina: ${ambiente.processador}, ${ambiente.memoriaGB} GB de RAM, ${ambiente.sistema}`, '')
md.push('Tamanho do banco durante os testes:', '')
md.push(linhaMd(['Tabela', 'Linhas']), linhaMd(['---', '---:']))
for (const t of tamanho) md.push(linhaMd([t.tabela, t.linhas.toLocaleString('pt-BR')]))
md.push('', `## Tipos, restrições, regras e consultas: ${passaram} de ${resultados.length} passaram`, '')
md.push(linhaMd(['Teste', 'Grupo', 'O que foi testado', 'Situação real', 'Esperado', 'Obtido', 'Resultado']))
md.push(linhaMd(['---', '---', '---', '---', '---', '---', '---']))
for (const r of resultados) {
  md.push(linhaMd([r.id, r.grupo, r.titulo, r.situacao, r.esperado, r.obtido, r.passou ? 'PASSOU' : 'FALHOU']))
}
md.push('', '## Índices: a mesma consulta sem e com o índice', '')
md.push('Tempo de execução informado pelo próprio PostgreSQL (EXPLAIN ANALYZE), mediana de 15 execuções.', '')
md.push(linhaMd(['Exp.', 'Consulta', 'Índice', 'Sem índice (ms)', 'Com índice (ms)', 'Ganho', 'Plano sem', 'Plano com']))
md.push(linhaMd(['---', '---', '---', '---:', '---:', '---:', '---', '---']))
for (const e of experimentos) {
  md.push(linhaMd([e.id, e.titulo, e.indice, ms(e.sem.mediana), ms(e.com.mediana), `${e.vezesMaisRapido.toFixed(1)}x`,
    e.sem.nos.join(' > '), e.com.nos.join(' > ')]))
}
md.push('', `${cpf.id}. ${cpf.titulo}: ${cpf.usouIndice ? 'sim, usou ' + cpf.indice : 'não usou'} (${ms(cpf.tempo)} ms).`, '')
for (const e of experimentos) {
  md.push(`### ${e.id}. ${e.titulo}`, '', e.situacao, '', '```sql', e.sql, '```', '')
  md.push('Sem o índice:', '', '```', e.sem.plano, '```', '', 'Com o índice:', '', '```', e.com.plano, '```', '')
}
md.push('### I5. CPF', '', '```', cpf.plano, '```', '')
if (escala.length) {
  md.push('## Escala: a linha do tempo conforme a clínica cresce', '')
  md.push(linhaMd(['Pacientes', 'Atendimentos', 'Registros clínicos', 'Sem índice (ms)', 'Com índice (ms)', 'Ganho']))
  md.push(linhaMd(['---:', '---:', '---:', '---:', '---:', '---:']))
  for (const e of escala) {
    md.push(linhaMd([e.pacientes.toLocaleString('pt-BR'), e.atendimentos.toLocaleString('pt-BR'),
      e.registros.toLocaleString('pt-BR'), ms(e.sem), ms(e.com), `${e.vezes.toFixed(1)}x`]))
  }
}
await writeFile(path.join(PASTA, 'RESULTADOS.md'), md.join('\n') + '\n')
console.log(`\nEvidências gravadas em ${PASTA}`)
process.exit(passaram === resultados.length ? 0 : 1)
