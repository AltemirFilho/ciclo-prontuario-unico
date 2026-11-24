// =====================================================================
// Aba Console SQL: para responder pergunta do professor na hora.
// Roda qualquer SQL no banco do navegador (recarregar a página volta
// tudo ao estado inicial).
// =====================================================================
import { db } from '../banco.js'
import { $, $$, esc, ms } from '../util.js'

const MARIA = `(SELECT id FROM paciente WHERE cpf = '18398029609')`
const CAMILA = `(SELECT id FROM profissional WHERE nome = 'Camila Rocha')`

const PRONTAS = [
  {
    titulo: 'Linha do tempo da Dona Maria, aberta pela fisio',
    sql: `SELECT to_char(criado_em, 'DD/MM/YYYY HH24:MI') AS quando, especialidade, profissional, sala, tipo, texto
  FROM linha_do_tempo(${MARIA}, ${CAMILA});`,
  },
  {
    titulo: 'Resumo do paciente (o cabeçalho)',
    sql: `SELECT nome, idade, alergias, condicoes, especialidades, ultimo_registro_por, ultimo_registro_em
  FROM vw_resumo_paciente
 WHERE cpf = '18398029609';`,
  },
  {
    titulo: 'Quem abriu o prontuário da Dona Maria',
    sql: `SELECT to_char(momento, 'DD/MM HH24:MI') AS quando, acao, profissional, especialidade
  FROM vw_auditoria
 WHERE paciente_id = ${MARIA}
 ORDER BY momento DESC
 LIMIT 15;`,
  },
  {
    titulo: 'Todas as restrições do banco',
    sql: `SELECT conrelid::regclass AS tabela, conname AS restricao,
       CASE contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
                    WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' END AS tipo,
       pg_get_constraintdef(oid) AS definicao
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace
 ORDER BY 1, 3, 2;`,
  },
  {
    titulo: 'Todos os índices do banco',
    sql: `SELECT tablename AS tabela, indexname AS indice, indexdef AS definicao
  FROM pg_indexes
 WHERE schemaname = 'public'
 ORDER BY 1, 2;`,
  },
  {
    titulo: 'Gatilhos (regras) ligados',
    sql: `SELECT event_object_table AS tabela, trigger_name AS gatilho,
       action_timing AS quando, string_agg(event_manipulation, ', ') AS eventos
  FROM information_schema.triggers
 GROUP BY 1, 2, 3
 ORDER BY 1, 2;`,
  },
  {
    titulo: 'Plano da busca por nome (EXPLAIN ANALYZE)',
    sql: `EXPLAIN ANALYZE
SELECT id, nome FROM paciente
 WHERE normalizar('joao pedro conseicao') <% normalizar(nome);`,
  },
  {
    titulo: 'Plano da linha do tempo (EXPLAIN ANALYZE)',
    sql: `EXPLAIN ANALYZE
SELECT id, criado_em, tipo FROM registro_clinico
 WHERE paciente_id = ${MARIA}
 ORDER BY criado_em DESC
 LIMIT 50;`,
  },
  {
    titulo: 'Tentar apagar o prontuário (vai falhar)',
    sql: `DELETE FROM registro_clinico WHERE paciente_id = ${MARIA};`,
  },
  {
    titulo: 'Tentar cadastrar a Dona Maria de novo (vai falhar)',
    sql: `INSERT INTO paciente (nome, cpf, data_nascimento)
VALUES ('Maria das Gracas Sousa', '18398029609', '1959-03-12');`,
  },
  {
    titulo: 'Tamanho de cada tabela',
    sql: `SELECT relname AS tabela, n_live_tup AS linhas,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamanho_com_indices
  FROM pg_stat_user_tables
 ORDER BY pg_total_relation_size(relid) DESC;`,
  },
]

let raiz = null

export async function iniciar(elemento) {
  raiz = elemento
  raiz.innerHTML = `
    <div class="grade-console">
      <div class="cartao">
        <div class="cartao-titulo">Consultas prontas</div>
        <div class="cartao-corpo prontas">
          ${PRONTAS.map((p, i) => `<button data-i="${i}">${esc(p.titulo)}</button>`).join('')}
        </div>
      </div>
      <div style="display:grid;gap:12px;min-width:0">
        <textarea class="editor" id="editor" spellcheck="false">${esc(PRONTAS[0].sql)}</textarea>
        <div style="display:flex;align-items:center;gap:12px">
          <button class="botao" id="executar">Executar</button>
          <span class="apagado">Ctrl + Enter também executa</span>
          <span class="apagado" id="info-execucao" style="margin-left:auto"></span>
        </div>
        <div id="saida"></div>
      </div>
    </div>`

  const editor = $('#editor', raiz)
  $$('.prontas button', raiz).forEach((b) => b.addEventListener('click', () => {
    editor.value = PRONTAS[Number(b.dataset.i)].sql
    executar()
  }))
  $('#executar', raiz).addEventListener('click', executar)
  editor.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); executar() }
  })
}

function celula(valor) {
  if (valor === null || valor === undefined) return '<span class="apagado">null</span>'
  if (valor instanceof Date) return esc(valor.toLocaleString('pt-BR', { timeZone: 'America/Maceio' }))
  if (typeof valor === 'object') return esc(JSON.stringify(valor))
  return esc(valor)
}

async function executar() {
  const sql = $('#editor', raiz).value
  const saida = $('#saida', raiz)
  const inicio = performance.now()
  try {
    const resultados = await db.exec(sql)
    const ultimo = resultados[resultados.length - 1] ?? { rows: [], fields: [] }
    const tempo = ms(performance.now() - inicio)
    const campos = ultimo.fields?.map((f) => f.name) ?? []

    if (campos.length === 1 && campos[0] === 'QUERY PLAN') {
      saida.innerHTML = `<div class="resultado-sql"><pre>${esc(ultimo.rows.map((r) => r['QUERY PLAN']).join('\n'))}</pre></div>`
    } else if (campos.length) {
      const linhas = ultimo.rows.slice(0, 300)
      saida.innerHTML = `<div class="resultado-sql"><table>
        <thead><tr>${campos.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map((l) => `<tr>${campos.map((c) => `<td title="${esc(typeof l[c] === 'object' ? JSON.stringify(l[c]) : l[c])}">${celula(l[c])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`
    } else {
      saida.innerHTML = `<div class="aviso-banco sucesso">Comando executado. Linhas afetadas: ${ultimo.affectedRows ?? 0}.</div>`
    }
    $('#info-execucao', raiz).textContent = `${ultimo.rows?.length ?? 0} linha(s) · ${tempo}`
  } catch (erro) {
    $('#info-execucao', raiz).textContent = ''
    saida.innerHTML = `<div class="aviso-banco erro"><strong>O PostgreSQL recusou:</strong> ${esc(erro.message)}
      <div class="tecnico">SQLSTATE ${esc(erro.code ?? '?')}${erro.constraint ? ' · regra ' + esc(erro.constraint) : ''}${erro.hint ? ' · dica: ' + esc(erro.hint) : ''}</div></div>`
  }
}
