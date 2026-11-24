// =====================================================================
// Experimentos de índice: a mesma consulta, sem o índice e com ele.
//
// Como medimos: EXPLAIN ANALYZE roda a consulta de verdade e o próprio
// PostgreSQL informa o plano escolhido e o tempo de execução. Repetimos
// várias vezes e usamos a MEDIANA (o valor do meio), que não se deixa
// levar por uma execução que demorou por acaso.
// =====================================================================

export const EXPERIMENTOS = [
  {
    id: 'I1',
    titulo: 'Abrir a linha do tempo do paciente',
    situacao: 'Cada paciente chamado em qualquer sala abre o prontuário: é a consulta mais repetida do dia.',
    indice: 'ix_registro_paciente_data',
    tabela: 'registro_clinico',
    criar: 'CREATE INDEX ix_registro_paciente_data ON registro_clinico (paciente_id, criado_em DESC)',
    parametro: `SELECT paciente_id AS v FROM registro_clinico GROUP BY paciente_id ORDER BY count(*) DESC LIMIT 1`,
    consulta: (v) => `SELECT id, criado_em, tipo
  FROM registro_clinico
 WHERE paciente_id = ${v}
 ORDER BY criado_em DESC
 LIMIT 50`,
  },
  {
    id: 'I2',
    titulo: 'Buscar paciente pelo nome, sem acento',
    situacao: 'A recepção digita "maria souza" para achar a ficha antes de abrir outra.',
    indice: 'ix_paciente_nome_busca',
    tabela: 'paciente',
    criar: 'CREATE INDEX ix_paciente_nome_busca ON paciente USING gin (normalizar(nome) gin_trgm_ops)',
    parametro: `SELECT 'maria souza' AS v`,
    consulta: (v) => `SELECT id, nome
  FROM paciente
 WHERE normalizar('${v}') <% normalizar(nome)`,
  },
  {
    id: 'I3',
    titulo: 'Auditoria: quem abriu este prontuário',
    situacao: 'O paciente pergunta, com base na LGPD, quem viu a ficha dele.',
    indice: 'ix_acesso_paciente_momento',
    tabela: 'acesso_prontuario',
    criar: 'CREATE INDEX ix_acesso_paciente_momento ON acesso_prontuario (paciente_id, momento DESC)',
    parametro: `SELECT paciente_id AS v FROM acesso_prontuario GROUP BY paciente_id ORDER BY count(*) DESC LIMIT 1`,
    consulta: (v) => `SELECT momento, acao, profissional_id
  FROM acesso_prontuario
 WHERE paciente_id = ${v}
 ORDER BY momento DESC
 LIMIT 20`,
  },
  {
    id: 'I4',
    titulo: 'Agenda do dia do profissional',
    situacao: 'Cada profissional abre "meus atendimentos de hoje" várias vezes por turno.',
    indice: 'ix_atendimento_profissional_inicio',
    tabela: 'atendimento',
    criar: 'CREATE INDEX ix_atendimento_profissional_inicio ON atendimento (profissional_id, inicio)',
    parametro: `SELECT id AS v FROM profissional WHERE nome = 'Camila Rocha'`,
    consulta: (v) => `SELECT id, inicio, sala, status
  FROM atendimento
 WHERE profissional_id = ${v}
   AND inicio >= date_trunc('day', now())
   AND inicio <  date_trunc('day', now()) + interval '1 day'
 ORDER BY inicio`,
  },
]

// A busca por CPF não precisa de índice novo: o UNIQUE já criou um.
export const PROVA_CPF = {
  id: 'I5',
  titulo: 'Buscar pelo CPF usa o índice que o UNIQUE criou',
  situacao: 'A recepção digita o CPF. Nenhum índice extra foi criado para isso.',
  indice: 'uq_paciente_cpf',
  consulta: `SELECT id, nome FROM paciente WHERE cpf = '18398029609'`,
}

/** Lista os nós do plano e os índices usados, lendo o EXPLAIN em JSON. */
function lerPlano(plano, saida = { nos: [], indices: [] }) {
  if (!plano) return saida
  saida.nos.push(plano['Node Type'])
  if (plano['Index Name']) saida.indices.push(plano['Index Name'])
  for (const filho of plano.Plans ?? []) lerPlano(filho, saida)
  return saida
}

async function explicar(db, sql) {
  const { rows } = await db.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`)
  let valor = rows[0]['QUERY PLAN']
  if (typeof valor === 'string') valor = JSON.parse(valor)
  return valor[0]
}

async function medir(db, sql, repeticoes) {
  const tempos = []
  let estrutura = null
  for (let i = 0; i < repeticoes; i++) {
    const r = await explicar(db, sql)
    tempos.push(r['Execution Time'])
    if (!estrutura) estrutura = lerPlano(r.Plan)
  }
  const { rows } = await db.query(`EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF) ${sql}`)
  const plano = rows.map((l) => l['QUERY PLAN']).join('\n')
  const ordenados = [...tempos].sort((a, b) => a - b)
  return {
    mediana: ordenados[Math.floor(ordenados.length / 2)],
    minimo: ordenados[0],
    maximo: ordenados[ordenados.length - 1],
    repeticoes,
    plano,
    nos: estrutura.nos,
    indicesUsados: [...new Set(estrutura.indices)],
  }
}

/** Mede um experimento: remove o índice, mede, recria, mede de novo. */
export async function rodarExperimento(db, exp, { repeticoes = 15 } = {}) {
  const v = (await db.query(exp.parametro)).rows[0]?.v
  const sql = exp.consulta(v)

  await db.exec(`DROP INDEX IF EXISTS ${exp.indice}`)
  await db.exec(`ANALYZE ${exp.tabela}`)
  const sem = await medir(db, sql, repeticoes)

  await db.exec(exp.criar)
  await db.exec(`ANALYZE ${exp.tabela}`)
  const com = await medir(db, sql, repeticoes)

  return {
    id: exp.id,
    titulo: exp.titulo,
    situacao: exp.situacao,
    indice: exp.indice,
    criar: exp.criar,
    sql,
    sem,
    com,
    vezesMaisRapido: sem.mediana / com.mediana,
    usouIndice: com.indicesUsados.includes(exp.indice) && !sem.indicesUsados.includes(exp.indice),
  }
}

export async function provarIndiceDoCpf(db) {
  const r = await explicar(db, PROVA_CPF.consulta)
  const estrutura = lerPlano(r.Plan)
  const { rows } = await db.query(`EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF) ${PROVA_CPF.consulta}`)
  return {
    ...PROVA_CPF,
    tempo: r['Execution Time'],
    plano: rows.map((l) => l['QUERY PLAN']).join('\n'),
    usouIndice: estrutura.indices.includes(PROVA_CPF.indice),
  }
}

export async function rodarTodosExperimentos(db, opcoes = {}, aoTerminar = () => {}) {
  const saida = []
  for (const exp of EXPERIMENTOS) {
    const r = await rodarExperimento(db, exp, opcoes)
    saida.push(r)
    aoTerminar(r)
  }
  return saida
}
