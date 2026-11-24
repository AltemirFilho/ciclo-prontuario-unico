// =====================================================================
// Aba Atendimento: agenda, busca, prontuário e registro.
// Toda leitura e escrita passa pelo banco; a tela não valida campo de
// propósito, para que a regra que barra seja sempre a do PostgreSQL.
// =====================================================================
import { db } from '../banco.js'
import { estado, mudar, ouvir } from '../estado.js'
import {
  $, $$, esc, quando, hora, dataIso, mascararCpf, corDaEspecialidade,
  ROTULO_TIPO, ROTULO_STATUS, avisoErroHtml, traduzirErro, detalheTecnico, toast,
} from '../util.js'

let linhaAtual = []            // linha do tempo do paciente aberto
let filtroEspecialidade = null // null = todas
let destacarId = null          // registro recém-criado
let verTodos = false           // lista de todos os pacientes aberta
let paginaTodos = 0
const POR_PAGINA = 30

export function iniciarAtendimento() {
  let espera = null
  $('#busca').addEventListener('input', (ev) => {
    clearTimeout(espera)
    espera = setTimeout(() => buscar(ev.target.value), 160)
  })
  $('#ver-todos').addEventListener('click', () => {
    verTodos = !verTodos
    $('#ver-todos').textContent = verTodos ? 'Esconder a lista' : 'Ver todos os pacientes'
    if ($('#busca').value.trim().length < 2) {
      if (verTodos) listarTodos()
      else { $('#resultados-busca').innerHTML = ''; $('#resultados-busca').classList.remove('rolagem') }
    }
  })
  $('#novo-paciente').addEventListener('click', abrirModalPaciente)
  $('#np-cancelar').addEventListener('click', () => $('#modal-paciente').close())
  $('#form-paciente').addEventListener('submit', salvarPaciente)

  ouvir((_, mudou) => {
    if ('profissional' in mudou) {
      carregarAgenda()
      if (estado.pacienteId) abrirPaciente(estado.pacienteId)
    }
  })
  carregarAgenda()
}

// ---------------------------------------------------------------------
// Agenda e busca
// ---------------------------------------------------------------------
async function carregarAgenda() {
  const lista = $('#agenda')
  if (!estado.profissional) return
  const { rows } = await db.query(
    `SELECT atendimento_id, inicio, sala, status, paciente_id, paciente, idade, alerta_grave
       FROM vw_agenda_hoje
      WHERE profissional_id = $1
      ORDER BY inicio`,
    [estado.profissional.id],
  )
  if (!rows.length) {
    lista.innerHTML = '<li class="apagado" style="padding:8px 2px">Nenhum atendimento hoje.</li>'
    return
  }
  lista.innerHTML = rows.map((a) => `
    <li><button data-paciente="${a.paciente_id}" ${a.paciente_id === estado.pacienteId ? 'aria-current="true"' : ''}>
      <span class="hora">${hora(a.inicio)}</span>
      <span class="nome">${esc(a.paciente)}
        <span class="detalhe">${a.idade} anos · ${esc(ROTULO_STATUS[a.status])}</span></span>
      ${a.alerta_grave ? '<span class="alerta-grave" title="Alergia grave registrada">alergia</span>' : '<span></span>'}
    </button></li>`).join('')
  $$('button[data-paciente]', lista).forEach((b) =>
    b.addEventListener('click', () => abrirPaciente(Number(b.dataset.paciente))))
}

// Sem nada digitado: a lista de todos os pacientes, quem foi atendido
// mais recentemente primeiro, de 30 em 30. Só nome e CPF: abrir o
// prontuário continua passando pela linha_do_tempo (que audita a leitura).
async function listarTodos(maisUmaPagina = false) {
  const lista = $('#resultados-busca')
  paginaTodos = maisUmaPagina ? paginaTodos + 1 : 0
  const [{ rows }, total] = await Promise.all([
    db.query(
      `SELECT p.id, p.nome, p.cpf, max(a.inicio) FILTER (WHERE a.inicio <= now()) AS ultimo
         FROM paciente p
         LEFT JOIN atendimento a ON a.paciente_id = p.id
        GROUP BY p.id
        ORDER BY ultimo DESC NULLS LAST, p.nome
        LIMIT $1 OFFSET $2`, [POR_PAGINA + 1, paginaTodos * POR_PAGINA]),
    paginaTodos ? null : db.query('SELECT count(*)::int AS n FROM paciente'),
  ])
  const temMais = rows.length > POR_PAGINA
  const itens = rows.slice(0, POR_PAGINA).map((p) => `
    <li><button data-paciente="${p.id}">
      <span></span>
      <span class="nome">${esc(p.nome)}
        <span class="detalhe">CPF ${mascararCpf(p.cpf)}${p.ultimo ? ` · último atendimento ${quando(p.ultimo)}` : ' · sem atendimento ainda'}</span></span>
      <span></span>
    </button></li>`).join('')
  const mais = temMais ? '<li><button class="link-botao" id="mais-pacientes" type="button">Mostrar mais 30</button></li>' : ''
  lista.classList.add('rolagem')
  if (paginaTodos === 0) {
    const n = total.rows[0].n.toLocaleString('pt-BR')
    lista.innerHTML = `<li class="cabeca-lista">${n} pacientes · atendidos mais recentemente primeiro</li>${itens}${mais}`
    lista.scrollTop = 0
  } else {
    $('#mais-pacientes')?.closest('li').remove()
    lista.insertAdjacentHTML('beforeend', itens + mais)
  }
  $$('button[data-paciente]:not([data-ligado])', lista).forEach((b) => {
    b.dataset.ligado = '1'
    b.addEventListener('click', () => abrirPaciente(Number(b.dataset.paciente)))
  })
  $('#mais-pacientes')?.addEventListener('click', () => listarTodos(true))
}

async function buscar(termo) {
  const lista = $('#resultados-busca')
  termo = termo.trim()
  if (termo.length < 2) {
    if (verTodos) listarTodos()
    else { lista.innerHTML = ''; lista.classList.remove('rolagem') }
    return
  }
  lista.classList.remove('rolagem')
  const { rows } = await db.query('SELECT * FROM buscar_paciente($1, 8)', [termo])
  lista.innerHTML = rows.length
    ? rows.map((p) => `
      <li><button data-paciente="${p.id}">
        <span></span>
        <span class="nome">${esc(p.nome)}
          <span class="detalhe">CPF ${mascararCpf(p.cpf)} · nasc. ${dataIso(p.data_nascimento)}</span></span>
        <span class="apagado" title="semelhança com o que foi digitado">${Math.round(p.semelhanca * 100)}%</span>
      </button></li>`).join('')
    : '<li class="apagado" style="padding:8px 2px">Ninguém encontrado. Confira o CPF antes de cadastrar.</li>'
  $$('button[data-paciente]', lista).forEach((b) =>
    b.addEventListener('click', () => abrirPaciente(Number(b.dataset.paciente))))
}

// ---------------------------------------------------------------------
// Prontuário
// ---------------------------------------------------------------------
export async function abrirPaciente(id) {
  if (estado.pacienteId !== id) {
    filtroEspecialidade = null
    estado.retificando = null
  }
  estado.pacienteId = id

  const resumo = (await db.query('SELECT * FROM vw_resumo_paciente WHERE id = $1', [id])).rows[0]
  // a leitura passa pela função que registra o acesso (LGPD)
  linhaAtual = (await db.query('SELECT * FROM linha_do_tempo($1, $2)', [id, estado.profissional.id])).rows

  desenharProntuario(resumo)
  desenharFormulario(resumo)
  carregarAuditoria(id)
  $$('#agenda button[data-paciente]').forEach((b) =>
    b.toggleAttribute('aria-current', Number(b.dataset.paciente) === id))
}

function desenharProntuario(p) {
  const alergias = p.alergias.map((a) => `
    <div class="alergia ${esc(a.gravidade)}">
      <strong>Alergia ${esc(a.gravidade)}</strong>
      <span><b>${esc(a.substancia)}</b>${a.reacao ? ` · ${esc(a.reacao)}` : ''}</span>
    </div>`).join('')

  const condicoes = p.condicoes.map((c) =>
    `<span class="etiqueta" title="CID-10 ${esc(c.cid10)}"><span class="mono">${esc(c.cid10)}</span> ${esc(c.descricao)}</span>`).join('')

  const especialidades = p.especialidades.map((e) =>
    `<span class="etiqueta esp" style="--cor:${corDaEspecialidade(e)}">${esc(e)}</span>`).join('')

  const atualizado = p.ultimo_registro_em
    ? `<div class="atualizado"><span class="bolinha" style="--cor:${corDaEspecialidade(p.ultimo_registro_especialidade)}"></span>
         Atualizado <b>${quando(p.ultimo_registro_em)}</b> por <b>${esc(p.ultimo_registro_por)}</b>
         (${esc(p.ultimo_registro_especialidade)}, ${esc(p.ultimo_registro_sala)})</div>`
    : '<div class="atualizado">Ainda sem registros.</div>'

  const contagem = {}
  for (const r of linhaAtual) contagem[r.especialidade] = (contagem[r.especialidade] ?? 0) + 1
  const filtros = [`<button data-esp="" aria-pressed="${filtroEspecialidade === null}">Todas · ${linhaAtual.length}</button>`]
    .concat(Object.entries(contagem).map(([e, n]) =>
      `<button data-esp="${esc(e)}" style="--cor:${corDaEspecialidade(e)}" aria-pressed="${filtroEspecialidade === e}">${esc(e)} · ${n}</button>`))
    .join('')

  $('#prontuario').innerHTML = `
    <div class="cartao paciente-topo">
      <div class="paciente-nome">
        <h2>${esc(p.nome)}</h2>
        <span class="suave">${p.idade} anos</span>
      </div>
      <div class="paciente-dados">
        <span>CPF <b class="mono">${mascararCpf(p.cpf)}</b></span>
        ${p.cns ? `<span>Cartão SUS <b class="mono">${esc(p.cns)}</b></span>` : ''}
        <span>Nascimento <b>${dataIso(p.data_nascimento)}</b></span>
        <span>${p.total_atendimentos} atendimentos concluídos</span>
      </div>
      ${alergias ? `<div class="alergias">${alergias}</div>` : '<div class="apagado">Nenhuma alergia registrada.</div>'}
      <div class="linha-chips"><span>Condições</span>${condicoes || '<span class="apagado">nenhuma registrada</span>'}</div>
      <div class="linha-chips"><span>Acompanhado por</span>${especialidades || '<span class="apagado">ninguém ainda</span>'}</div>
      <div>
        <button class="link-botao" id="abrir-alergia">+ registrar alergia</button>
        <form id="form-alergia" class="escondido" style="margin-top:10px">
          <div class="campo-linha">
            <div class="campo"><label for="al-subst">Substância</label><input id="al-subst" placeholder="ex.: dipirona"></div>
            <div class="campo"><label for="al-grav">Gravidade</label>
              <select id="al-grav"><option value="leve">leve</option><option value="moderada">moderada</option><option value="grave">grave</option></select></div>
          </div>
          <div class="campo"><label for="al-reacao">Reação (opcional)</label><input id="al-reacao" placeholder="ex.: placas vermelhas na pele"></div>
          <div id="aviso-alergia"></div>
          <button class="botao pequeno" type="submit">Salvar alergia</button>
        </form>
      </div>
      ${atualizado}
    </div>
    <div class="filtros" id="filtros">${filtros}</div>
    <ol class="tempo" id="linha-do-tempo"></ol>`

  $$('#filtros button').forEach((b) => b.addEventListener('click', () => {
    filtroEspecialidade = b.dataset.esp || null
    $$('#filtros button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
    desenharLinha()
  }))
  $('#abrir-alergia').addEventListener('click', () => $('#form-alergia').classList.toggle('escondido'))
  $('#form-alergia').addEventListener('submit', salvarAlergia)
  desenharLinha()
}

const br = (v) => String(v).replace('.', ',')
const ROTULOS = {
  dor: (v) => `Dor ${v}/10`, sessao: (v) => `Sessão ${v}`, forca_grau: (v) => `Força grau ${v}/5`,
  adm_graus: (v) => `Amplitude ${v}°`, sentar_levantar_30s: (v) => `Sentar e levantar: ${v} em 30 s`,
  marcha: (v) => `Marcha: ${v}`,
  pa: (v) => `PA ${v}`, fc: (v) => `FC ${v} bpm`, fr: (v) => `FR ${v} irpm`, temp_c: (v) => `Temp. ${br(v)} °C`,
  spo2: (v) => `SpO₂ ${v}%`, conduta: (v) => `Conduta: ${v}`, retorno_dias: (v) => `Retorno em ${v} dias`,
  glicemia: (v) => `Glicemia ${v} mg/dL`, procedimento: (v) => `Procedimento: ${v}`,
  peso_kg: (v) => `Peso ${br(v)} kg`, altura_cm: (v) => `Altura ${v} cm`, imc: (v) => `IMC ${br(v)}`,
  circ_abdominal_cm: (v) => `Cintura ${br(v)} cm`, agua_l: (v) => `Água ${br(v)} L/dia`, plano: (v) => `Plano: ${v}`,
  humor: (v) => `Humor ${v}/10`, ansiedade: (v) => `Ansiedade ${v}/10`, frequencia: (v) => `Sessões: ${v}`,
}
const ORDEM_ROTULOS = Object.keys(ROTULOS)

function rotuloMedida(chave, valor) {
  return (ROTULOS[chave] ?? ((v) => `${chave}: ${v}`))(valor)
}

function ordenarMedidas(medidas) {
  const pos = (k) => { const i = ORDEM_ROTULOS.indexOf(k); return i < 0 ? 999 : i }
  return Object.entries(medidas ?? {}).sort(([a], [b]) => pos(a) - pos(b))
}

function desenharLinha() {
  const porId = new Map(linhaAtual.map((r) => [String(r.registro_id), r]))
  const itens = linhaAtual.filter((r) => !filtroEspecialidade || r.especialidade === filtroEspecialidade)
  if (!itens.length) {
    $('#linha-do-tempo').innerHTML = '<li class="cartao vazio">Sem registros nesta especialidade.</li>'
    return
  }
  $('#linha-do-tempo').innerHTML = itens.map((r) => {
    const meu = r.profissional_id === estado.profissional.id
    const original = r.retifica_id ? porId.get(String(r.retifica_id)) : null
    const medidas = ordenarMedidas(r.medidas)
      .map(([k, v]) => `<span class="etiqueta">${esc(rotuloMedida(k, v))}</span>`).join('')
    const selos = [
      r.retificado_por ? '<span class="etiqueta alerta">corrigido por retificação</span>' : '',
      r.retifica_id ? `<span class="etiqueta alerta">retificação${original ? ` do registro de ${quando(original.criado_em)}` : ''}</span>` : '',
      r.oculto ? '<span class="etiqueta">sigiloso · conteúdo restrito</span>' : '',
      r.sigiloso && !r.oculto ? '<span class="etiqueta">sigiloso · sua especialidade lê</span>' : '',
    ].join('')
    const classes = ['item', r.retificado_por ? 'retificado' : '', r.oculto ? 'oculto' : '',
      String(r.registro_id) === String(destacarId) ? 'novo' : ''].join(' ')
    return `
      <li class="${classes}" style="--cor:${corDaEspecialidade(r.especialidade)}" id="reg-${r.registro_id}">
        <div class="cartao">
          <div class="item-topo">
            <span class="etiqueta esp" style="--cor:${corDaEspecialidade(r.especialidade)}">${esc(r.especialidade)}</span>
            <span class="quem-escreveu">${esc(r.profissional)}</span>
            <span class="onde">${esc(r.sala)}</span>
            <span class="quando" title="${esc(new Date(r.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Maceio' }))}">${quando(r.criado_em)}</span>
          </div>
          <div class="item-tipo">${esc(ROTULO_TIPO[r.tipo] ?? r.tipo)}</div>
          <div class="item-texto">${r.oculto ? '🔒 ' : ''}${esc(r.texto)}</div>
          ${medidas ? `<div class="item-medidas">${medidas}</div>` : ''}
          <div class="item-rodape">
            ${selos}
            <span class="acoes">
              ${meu && !r.retificado_por && !r.oculto ? `<button class="link-botao" data-retificar="${r.registro_id}">Retificar</button>` : ''}
              <button class="link-botao" data-apagar="${r.registro_id}" title="Mostra a regra do banco em ação">Tentar apagar</button>
            </span>
          </div>
        </div>
      </li>`
  }).join('')

  $$('[data-retificar]').forEach((b) => b.addEventListener('click', () => {
    estado.retificando = porId.get(b.dataset.retificar)
    desenharFormulario()
    $('#reg-texto')?.focus()
  }))
  $$('[data-apagar]').forEach((b) => b.addEventListener('click', () => tentarApagar(b.dataset.apagar)))

  if (destacarId) {
    document.getElementById(`reg-${destacarId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    destacarId = null
  }
}

async function tentarApagar(id) {
  try {
    await db.query('DELETE FROM registro_clinico WHERE id = $1', [id])
    toast('O banco deixou apagar. Isso não deveria acontecer!', { tipo: 'erro' })
  } catch (erro) {
    toast(`O banco recusou o DELETE: ${traduzirErro(erro)}`, { tipo: 'erro', tecnico: detalheTecnico(erro) })
  }
}

async function carregarAuditoria(id) {
  const { rows } = await db.query(
    `SELECT momento, acao, profissional, especialidade
       FROM vw_auditoria WHERE paciente_id = $1
      ORDER BY momento DESC, id DESC LIMIT 8`, [id])
  $('#auditoria').innerHTML = rows.map((a) => `
    <li><span class="acao ${a.acao}">${a.acao === 'leitura' ? 'abriu' : a.acao === 'escrita' ? 'escreveu' : 'retificou'}</span>
      <span>${esc(a.profissional)} <span class="apagado">· ${esc(a.especialidade)}</span></span>
      <span class="apagado mono">${quando(a.momento)}</span></li>`).join('')
}

// ---------------------------------------------------------------------
// Formulário de registro
// ---------------------------------------------------------------------
// Cada especialidade tem os seus campos. Tudo vai para a mesma coluna
// medidas (JSONB) do registro: área nova ou campo novo não muda a tabela.
// A dor (0 a 10) tem CHECK no banco, com teste (T16); o peso tem CHECK, sem teste próprio.
const campoNum = (id, rotulo, extra = '') =>
  `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" type="number" ${extra}></div>`
const campoTxt = (id, rotulo, exemplo) =>
  `<div class="campo"><label for="${id}">${rotulo}</label><input id="${id}" placeholder="${exemplo}"></div>`
const campoSel = (id, rotulo, opcoes) =>
  `<div class="campo"><label for="${id}">${rotulo}</label><select id="${id}"><option value="">selecione</option>${opcoes.map((o) => `<option>${o}</option>`).join('')}</select></div>`
const linha = (...campos) => `<div class="campo-linha">${campos.join('')}</div>`
const grupo = (titulo, corpo) => `<fieldset class="grupo-medidas"><legend>${titulo}</legend>${corpo}</fieldset>`

const CAMPOS_POR_ESPECIALIDADE = {
  Fisioterapia: grupo('Avaliação da Fisioterapia',
    linha(campoNum('m-dor', 'Dor (escala de 0 a 10)', 'step="1" placeholder="ex.: 4"'), campoNum('m-sessao', 'Sessão nº', 'step="1"')) +
    linha(campoSel('m-forca', 'Força muscular (grau 0 a 5)', ['0', '1', '2', '3', '4', '5']), campoNum('m-adm', 'Amplitude de movimento (°)', 'placeholder="ex.: 110"')) +
    linha(campoNum('m-sl30', 'Sentar e levantar em 30 s', 'step="1" placeholder="repetições"'),
      campoSel('m-marcha', 'Marcha', ['Independente', 'Com bengala', 'Com andador', 'Cadeira de rodas']))),
  Enfermagem: grupo('Triagem da Enfermagem',
    linha(campoTxt('m-pa', 'Pressão (PA)', '120x80'), campoNum('m-temp', 'Temperatura (°C)', 'step="0.1"')) +
    linha(campoNum('m-spo2', 'Saturação SpO₂ (%)'), campoNum('m-glicemia', 'Glicemia capilar (mg/dL)')) +
    linha(campoNum('m-dor', 'Dor (escala de 0 a 10)', 'step="1"'),
      campoSel('m-proc', 'Procedimento', ['Sinais vitais', 'Curativo', 'Medicação', 'Vacina', 'Coleta de exame', 'Orientação']))),
  Medicina: grupo('Exame da Medicina',
    linha(campoTxt('m-pa', 'Pressão (PA)', '120x80'), campoNum('m-fc', 'Freq. cardíaca (bpm)')) +
    linha(campoNum('m-fr', 'Freq. respiratória (irpm)'), campoNum('m-temp', 'Temperatura (°C)', 'step="0.1"')) +
    linha(campoNum('m-spo2', 'Saturação SpO₂ (%)'), campoNum('m-retorno', 'Retorno em (dias)', 'step="1"')) +
    campoSel('m-conduta', 'Conduta', ['Orientação', 'Prescrição', 'Pedido de exames', 'Encaminhamento', 'Alta'])),
  'Nutrição': grupo('Avaliação da Nutrição',
    linha(campoNum('m-peso', 'Peso (kg)', 'step="0.1"'), campoNum('m-altura', 'Altura (cm)')) +
    '<p class="imc-vivo" id="imc-vivo">O IMC é calculado sozinho com peso e altura.</p>' +
    linha(campoNum('m-cintura', 'Circunferência abdominal (cm)', 'step="0.1"'), campoNum('m-agua', 'Água por dia (litros)', 'step="0.1"')) +
    campoSel('m-plano', 'Plano alimentar', ['Manutenção', 'Redução de peso', 'Controle glicêmico', 'Ganho de massa', 'Reeducação alimentar'])),
  Psicologia: grupo('Sessão da Psicologia (em sigilo)',
    linha(campoNum('m-sessao', 'Sessão nº', 'step="1"'), campoSel('m-freq', 'Frequência', ['Semanal', 'Quinzenal', 'Mensal'])) +
    linha(campoNum('m-humor', 'Humor (0 a 10)', 'step="1"'), campoNum('m-ansiedade', 'Ansiedade (0 a 10)', 'step="1"'))),
}

// [chave no JSONB, id do campo, tipo]
const MEDIDAS = [
  ['dor', 'm-dor', 'n'], ['sessao', 'm-sessao', 'n'], ['forca_grau', 'm-forca', 'n'], ['adm_graus', 'm-adm', 'n'],
  ['sentar_levantar_30s', 'm-sl30', 'n'], ['marcha', 'm-marcha', 't'],
  ['pa', 'm-pa', 't'], ['fc', 'm-fc', 'n'], ['fr', 'm-fr', 'n'], ['temp_c', 'm-temp', 'n'], ['spo2', 'm-spo2', 'n'],
  ['retorno_dias', 'm-retorno', 'n'], ['conduta', 'm-conduta', 't'],
  ['glicemia', 'm-glicemia', 'n'], ['procedimento', 'm-proc', 't'],
  ['peso_kg', 'm-peso', 'n'], ['altura_cm', 'm-altura', 'n'], ['circ_abdominal_cm', 'm-cintura', 'n'],
  ['agua_l', 'm-agua', 'n'], ['plano', 'm-plano', 't'],
  ['humor', 'm-humor', 'n'], ['ansiedade', 'm-ansiedade', 'n'], ['frequencia', 'm-freq', 't'],
]

function calcularImc(peso, alturaCm) {
  if (!(peso > 0) || !(alturaCm > 0)) return undefined
  return Math.round((peso / (alturaCm / 100) ** 2) * 10) / 10
}

function desenharFormulario() {
  const caixa = $('#forma-registro')
  if (!estado.pacienteId) return
  const prof = estado.profissional
  const ret = estado.retificando
  caixa.innerHTML = `
    <p class="forma-titulo">Registrar no prontuário</p>
    <p class="forma-sub">Como ${esc(prof.nome)} (${esc(prof.especialidade)}) em ${esc(estado.sala)}. Quem confere as regras é o banco.</p>
    ${ret ? `<div class="retificando"><span>Retificando o registro de ${quando(ret.criado_em)}</span>
              <button class="link-botao" id="cancelar-ret">cancelar</button></div>` : ''}
    <form id="form-registro">
      <div id="aviso-registro"></div>
      <div class="campo"><label for="reg-tipo">Tipo</label>
        <select id="reg-tipo">${Object.entries(ROTULO_TIPO).map(([v, r]) =>
          `<option value="${v}" ${(ret ? ret.tipo : 'evolucao') === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="campo"><label for="reg-texto">${ret ? 'Texto da retificação' : 'O que aconteceu neste atendimento'}</label>
        <textarea id="reg-texto" placeholder="${ret ? 'Retificação: ...' : 'Escreva para quem vai atender depois de você.'}"></textarea></div>
      ${CAMPOS_POR_ESPECIALIDADE[prof.especialidade] ?? ''}
      <label class="marcar"><input type="checkbox" id="reg-sigiloso" ${prof.especialidade === 'Psicologia' ? 'checked' : ''}>
        Sigiloso (só ${esc(prof.especialidade)} lê o conteúdo)</label>
      <button class="botao" type="submit" style="width:100%">${ret ? 'Salvar retificação' : 'Salvar no prontuário'}</button>
    </form>`
  $('#cancelar-ret')?.addEventListener('click', () => { estado.retificando = null; desenharFormulario() })
  $('#form-registro').addEventListener('submit', salvarRegistro)

  // Nutrição: o IMC aparece enquanto digita
  const peso = $('#m-peso'), altura = $('#m-altura'), imc = $('#imc-vivo')
  if (peso && altura && imc) {
    const atualizar = () => {
      const v = calcularImc(Number(peso.value), Number(altura.value))
      imc.innerHTML = v ? `IMC calculado: <b>${br(v)}</b>` : 'O IMC é calculado sozinho com peso e altura.'
    }
    peso.addEventListener('input', atualizar)
    altura.addEventListener('input', atualizar)
  }
}

function lerMedidas() {
  const medidas = {}
  for (const [chave, id, tipo] of MEDIDAS) {
    const el = document.getElementById(id)
    if (!el || el.value.trim() === '') continue
    if (tipo === 't') { medidas[chave] = el.value.trim(); continue }
    const v = Number(el.value)
    if (!Number.isNaN(v)) medidas[chave] = v
  }
  const imc = calcularImc(medidas.peso_kg, medidas.altura_cm)
  if (imc !== undefined) medidas.imc = imc
  return medidas
}

async function salvarRegistro(ev) {
  ev.preventDefault()
  const botao = ev.submitter
  botao.disabled = true
  const pac = estado.pacienteId
  const prof = estado.profissional.id
  try {
    const novo = await db.transaction(async (tx) => {
      // o atendimento de hoje com este paciente; se não houver, abre um agora
      let at = (await tx.query(
        `SELECT id, status FROM atendimento
          WHERE paciente_id = $1 AND profissional_id = $2
            AND inicio >= date_trunc('day', now())
            AND status IN ('agendado', 'em_atendimento', 'concluido')
          ORDER BY (status = 'em_atendimento') DESC, inicio
          LIMIT 1`, [pac, prof])).rows[0]
      if (!at) {
        at = (await tx.query(
          `INSERT INTO atendimento (paciente_id, profissional_id, sala, inicio, status)
           VALUES ($1, $2, $3, now(), 'em_atendimento') RETURNING id, status`,
          [pac, prof, estado.sala])).rows[0]
      } else if (at.status === 'agendado') {
        await tx.query(`UPDATE atendimento SET status = 'em_atendimento', inicio = now(), sala = $2 WHERE id = $1`, [at.id, estado.sala])
      }
      return (await tx.query(
        `INSERT INTO registro_clinico
           (atendimento_id, paciente_id, profissional_id, tipo, texto, medidas, sigiloso, retifica_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, criado_em`,
        [at.id, pac, prof, $('#reg-tipo').value, $('#reg-texto').value,
          JSON.stringify(lerMedidas()), $('#reg-sigiloso').checked, estado.retificando?.registro_id ?? null],
      )).rows[0]
    })
    const eraRetificacao = Boolean(estado.retificando)
    estado.retificando = null
    destacarId = novo.id
    toast(`${eraRetificacao ? 'Retificação gravada' : 'Registro gravado'} às ${hora(novo.criado_em)}. A auditoria anotou a escrita.`)
    await abrirPaciente(pac)
    carregarAgenda()
  } catch (erro) {
    $('#aviso-registro').innerHTML = avisoErroHtml(erro)
    botao.disabled = false
  }
}

async function salvarAlergia(ev) {
  ev.preventDefault()
  try {
    await db.query(
      `INSERT INTO alergia (paciente_id, substancia, gravidade, reacao, registrada_por)
       VALUES ($1, $2, $3, NULLIF($4, ''), $5)`,
      [estado.pacienteId, $('#al-subst').value.trim(), $('#al-grav').value, $('#al-reacao').value.trim(), estado.profissional.id])
    toast('Alergia registrada. Agora toda a equipe vê o alerta.')
    abrirPaciente(estado.pacienteId)
  } catch (erro) {
    $('#aviso-alergia').innerHTML = avisoErroHtml(erro)
  }
}

// ---------------------------------------------------------------------
// Novo paciente, com aviso de ficha parecida
// ---------------------------------------------------------------------
let confirmouDiferente = false

function abrirModalPaciente() {
  confirmouDiferente = false
  $('#form-paciente').reset()
  $('#aviso-paciente').innerHTML = ''
  $('#modal-paciente').showModal()
  $('#np-nome').focus()
}

async function salvarPaciente(ev) {
  ev.preventDefault()
  const nome = $('#np-nome').value.trim()
  const nascimento = $('#np-nasc').value
  const cpf = $('#np-cpf').value.replace(/\D/g, '')
  const telefone = $('#np-tel').value.replace(/\D/g, '')
  const aviso = $('#aviso-paciente')

  try {
    if (!confirmouDiferente && nascimento) {
      const { rows } = await db.query('SELECT * FROM possiveis_duplicados($1, $2)', [nome, nascimento])
      if (rows.length) {
        aviso.innerHTML = `<div class="parecidos"><p>Parece que já existe ficha para esta pessoa:</p>
          ${rows.map((p) => `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:4px 0">
            <span>${esc(p.nome)} <span class="apagado">· CPF ${mascararCpf(p.cpf)} · ${Math.round(p.semelhanca * 100)}% parecido</span></span>
            <button type="button" class="botao pequeno" data-abrir="${p.id}">Abrir esta ficha</button></div>`).join('')}
          <button type="button" class="link-botao" id="nao-e-ninguem">Não é nenhuma dessas pessoas, cadastrar mesmo assim</button></div>`
        $$('[data-abrir]', aviso).forEach((b) => b.addEventListener('click', () => {
          $('#modal-paciente').close()
          abrirPaciente(Number(b.dataset.abrir))
        }))
        $('#nao-e-ninguem').addEventListener('click', () => { confirmouDiferente = true; $('#form-paciente').requestSubmit() })
        return
      }
    }
    const { rows } = await db.query(
      `INSERT INTO paciente (nome, cpf, data_nascimento, telefone)
       VALUES ($1, $2, $3, NULLIF($4, '')) RETURNING id`,
      [nome, cpf, nascimento || null, telefone])
    $('#modal-paciente').close()
    toast('Paciente cadastrado. Esta é a única ficha dele na clínica.')
    abrirPaciente(rows[0].id)
  } catch (erro) {
    aviso.innerHTML = avisoErroHtml(erro)
  }
}
