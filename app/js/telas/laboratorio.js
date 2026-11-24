// =====================================================================
// Aba Laboratório: os mesmos testes do terminal, rodando ao vivo no
// banco do navegador. É a evidência que o professor pediu, na tela.
// =====================================================================
import { db, infoDoBanco } from '../banco.js'
import { CASOS, GRUPOS } from '../../../nucleo/casos-de-teste.js'
import { rodarCaso } from '../../../nucleo/executor-de-testes.js'
import { EXPERIMENTOS, rodarExperimento, provarIndiceDoCpf } from '../../../nucleo/experimentos-indices.js'
import { $, $$, esc, numero, ms } from '../util.js'

let raiz = null
let resultados = []
let grupoAtivo = null

export async function iniciar(elemento) {
  raiz = elemento
  const info = await infoDoBanco()
  const linhas = Object.fromEntries(info.tabelas.map((t) => [t.tabela, t.linhas]))

  raiz.innerHTML = `
    <div class="lab-topo">
      <div class="cartao numero verde"><div class="valor" id="n-passaram">—</div><div class="rotulo">testes passaram</div></div>
      <div class="cartao numero"><div class="valor">${numero(linhas.registro_clinico)}</div><div class="rotulo">registros clínicos no banco</div></div>
      <div class="cartao numero"><div class="valor">${numero(linhas.paciente)}</div><div class="rotulo">pacientes · ${numero(linhas.atendimento)} atendimentos</div></div>
      <div class="cartao numero"><div class="valor" style="font-size:19px;padding-top:9px">${esc(info.versao)}</div><div class="rotulo">rodando no navegador (WebAssembly)</div></div>
    </div>

    <div class="lab-acoes">
      <button class="botao" id="rodar-testes">Rodar os ${CASOS.length} testes</button>
      <span class="apagado" id="tempo-testes"></span>
      <div class="filtros" id="grupos">
        <button data-grupo="" aria-pressed="true">Todos</button>
        ${GRUPOS.map((g) => `<button data-grupo="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join('')}
      </div>
    </div>

    <div class="cartao" style="overflow:hidden">
      <table class="tabela-testes">
        <thead><tr><th>Teste</th><th>O que testamos (situação real)</th><th>Esperado</th><th>Obtido do PostgreSQL</th><th>Resultado</th></tr></thead>
        <tbody id="corpo-testes"></tbody>
      </table>
    </div>

    <h2 class="secao-titulo">Índices: a mesma consulta, sem e com o índice</h2>
    <div class="lab-acoes">
      <button class="botao" id="rodar-indices">Medir os ${EXPERIMENTOS.length} índices</button>
      <span class="apagado">Tempo informado pelo próprio PostgreSQL (EXPLAIN ANALYZE), mediana de 15 execuções. No navegador o relógio mede de 0,1 em 0,1 ms; as medidas finas estão no terminal (RESULTADOS.md).</span>
    </div>
    <div class="indices-grade" id="indices"></div>
    <div class="cartao" style="padding:16px 18px;margin-top:16px" id="prova-cpf"></div>

    <h2 class="secao-titulo">Escala: a linha do tempo conforme a clínica cresce</h2>
    <div class="cartao" style="padding:16px 18px" id="escala"></div>`

  desenharTabela()
  $('#rodar-testes', raiz).addEventListener('click', rodarTestes)
  $('#rodar-indices', raiz).addEventListener('click', rodarIndices)
  $$('#grupos button', raiz).forEach((b) => b.addEventListener('click', () => {
    grupoAtivo = b.dataset.grupo || null
    $$('#grupos button', raiz).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    desenharTabela()
  }))
  desenharIndices([])
  desenharEscala()
  rodarTestes()
}

// ---------------------------------------------------------------------
async function rodarTestes() {
  const botao = $('#rodar-testes', raiz)
  botao.disabled = true
  resultados = []
  desenharTabela()
  const inicio = performance.now()
  for (const caso of CASOS) {
    resultados.push(await rodarCaso(db, caso))
    desenharTabela()
  }
  const passaram = resultados.filter((r) => r.passou).length
  $('#n-passaram', raiz).textContent = `${passaram}/${resultados.length}`
  $('#tempo-testes', raiz).textContent = `executados agora, em ${ms(performance.now() - inicio)}`
  botao.disabled = false
}

function desenharTabela() {
  const porId = new Map(resultados.map((r) => [r.id, r]))
  const casos = CASOS.filter((c) => !grupoAtivo || c.grupo === grupoAtivo)
  $('#corpo-testes', raiz).innerHTML = casos.map((c) => {
    const r = porId.get(c.id)
    const esperado = c.espera.erro
      ? `Recusar<div class="apagado mono">${esc(c.espera.erro)}${c.espera.restricao ? ' · ' + esc(c.espera.restricao) : ''}</div>`
      : 'Aceitar e conferir'
    const status = !r ? '<span class="etiqueta">aguardando</span>'
      : r.passou ? '<span class="etiqueta ok">✓ passou</span>' : '<span class="etiqueta perigo">✗ falhou</span>'
    return `
      <tr class="linha-teste" data-id="${c.id}">
        <td class="id">${c.id}<div class="apagado" style="font-family:var(--fonte);font-weight:400;font-size:11.5px">${esc(c.grupo)}</div></td>
        <td><div class="titulo">${esc(c.titulo)}</div><div class="situacao">${esc(c.situacao)}</div></td>
        <td>${esperado}</td>
        <td class="obtido">${r ? esc(r.obtido) : ''}</td>
        <td class="status">${status}</td>
      </tr>
      <tr class="detalhe escondido" data-detalhe="${c.id}"><td></td><td colspan="4">
        <pre class="sql">${esc(Array.isArray(c.sql) ? c.sql.join(';\n\n') : c.sql)}${c.verificacao ? `\n\n-- conferência:\n${esc(c.verificacao)}` : ''}</pre>
      </td></tr>`
  }).join('')
  $$('tr.linha-teste', raiz).forEach((tr) => tr.addEventListener('click', () =>
    $(`tr[data-detalhe="${tr.dataset.id}"]`, raiz).classList.toggle('escondido')))
}

// ---------------------------------------------------------------------
async function rodarIndices() {
  const botao = $('#rodar-indices', raiz)
  botao.disabled = true
  const feitos = []
  for (const exp of EXPERIMENTOS) {
    botao.textContent = `Medindo ${exp.id}...`
    feitos.push(await rodarExperimento(db, exp, { repeticoes: 15 }))
    desenharIndices(feitos)
  }
  const cpf = await provarIndiceDoCpf(db)
  $('#prova-cpf', raiz).innerHTML = `
    <strong>${esc(cpf.id)}. ${esc(cpf.titulo)}</strong> ${cpf.usouIndice ? '<span class="etiqueta ok">✓ usou ' + esc(cpf.indice) + '</span>' : '<span class="etiqueta perigo">não usou</span>'}
    <div class="apagado" style="margin:4px 0 8px">${esc(cpf.situacao)}</div>
    <pre class="sql">${esc(cpf.plano)}</pre>`
  botao.textContent = `Medir de novo`
  botao.disabled = false
}

function desenharIndices(feitos) {
  const porId = new Map(feitos.map((f) => [f.id, f]))
  $('#indices', raiz).innerHTML = EXPERIMENTOS.map((exp) => {
    const r = porId.get(exp.id)
    if (!r) {
      return `<div class="cartao indice-cartao"><h3>${exp.id}. ${esc(exp.titulo)}</h3>
        <div class="apagado">${esc(exp.situacao)}</div><div class="mono apagado">${esc(exp.indice)}</div></div>`
    }
    // o relógio do navegador só enxerga de 0,1 em 0,1 ms (proteção contra ataques
    // de temporização); abaixo disso mostramos "< 0,1 ms" e o ganho como mínimo.
    const PISO = 0.1
    const com = Math.max(r.com.mediana, PISO)
    const abaixo = r.com.mediana < PISO
    const ganho = Math.round(r.sem.mediana / com)
    const maior = Math.max(r.sem.mediana, com)
    return `
      <div class="cartao indice-cartao">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:start">
          <div><h3>${r.id}. ${esc(r.titulo)}</h3><div class="apagado">${esc(r.situacao)}</div></div>
          <div class="ganho">${abaixo ? '&gt; ' : ''}${numero(ganho)}×</div>
        </div>
        <div class="barra-linha"><span>sem índice</span><div class="barra"><span style="width:${(r.sem.mediana / maior) * 100}%"></span></div><span class="ms">${ms(r.sem.mediana)}</span></div>
        <div class="barra-linha"><span>com índice</span><div class="barra com"><span style="width:${(com / maior) * 100}%"></span></div><span class="ms">${abaixo ? '&lt; 0,1 ms' : ms(r.com.mediana)}</span></div>
        <div class="plano-resumo">sem: ${esc(r.sem.nos.join(' → '))}<br>com: ${esc(r.com.nos.join(' → '))} <b>(${esc(r.com.indicesUsados.join(', '))})</b></div>
        <details><summary>ver a consulta e os planos completos</summary>
          <pre class="sql" style="margin-top:8px">${esc(r.criar)};\n\n${esc(r.sql)}</pre>
          <p class="apagado" style="margin:10px 0 4px">Sem o índice:</p><pre class="sql">${esc(r.sem.plano)}</pre>
          <p class="apagado" style="margin:10px 0 4px">Com o índice:</p><pre class="sql">${esc(r.com.plano)}</pre>
        </details>
      </div>`
  }).join('')
}

// ---------------------------------------------------------------------
// A escala foi medida no terminal (npm run testes), com bancos maiores
// do que cabe com folga no navegador. Aqui só mostramos o resultado.
async function desenharEscala() {
  const alvo = $('#escala', raiz)
  try {
    const dados = await (await fetch(new URL('../../../testes/resultados/escala.json', import.meta.url))).json()
    const maior = Math.max(...dados.map((d) => d.sem))
    alvo.innerHTML = `
      <p class="apagado" style="margin:0 0 12px">Medido no terminal com <span class="mono">npm run testes</span>: três clínicas de tamanhos diferentes, a mesma consulta da linha do tempo.</p>
      ${dados.map((d) => `
        <div style="margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:4px">${numero(d.registros)} registros clínicos <span class="apagado" style="font-weight:400">(${numero(d.pacientes)} pacientes)</span></div>
          <div class="barra-linha"><span>sem índice</span><div class="barra"><span style="width:${(d.sem / maior) * 100}%"></span></div><span class="ms">${ms(d.sem)}</span></div>
          <div class="barra-linha"><span>com índice</span><div class="barra com"><span style="width:${(d.com / maior) * 100}%"></span></div><span class="ms">${ms(d.com)}</span></div>
        </div>`).join('')}
      <p style="margin:6px 0 0">Sem o índice, o tempo cresce junto com a clínica. Com o índice, fica praticamente parado.</p>`
  } catch {
    alvo.innerHTML = '<span class="apagado">Rode <span class="mono">npm run testes</span> no terminal para gerar o teste de escala.</span>'
  }
}
