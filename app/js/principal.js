// Ponto de partida: sobe o banco, preenche "Você é" e liga as abas.
//
// Atalhos pela URL (usados na apresentação e nas capturas de tela):
//   ?quem=camila            entra como a profissional cujo nome contém "camila"
//   &paciente=18398029609   já abre o prontuário deste CPF
//   &aba=laboratorio        abre outra aba (laboratorio, console, como)
//   &tema=projetor          tema claro
import { iniciarBanco } from './banco.js'
import { estado, mudar, SALAS, SALA_PADRAO } from './estado.js'
import { $, $$, esc, corDaEspecialidade, ms } from './util.js'
import { ARQUIVOS_DO_BANCO } from '../../nucleo/montar-banco.js'
import { iniciarAtendimento, abrirPaciente } from './telas/atendimento.js'

const parametros = new URLSearchParams(location.search)

// tema (fica guardado neste navegador)
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema
  $('#botao-tema').textContent = tema === 'projetor' ? 'Modo escuro' : 'Modo projetor'
  try { localStorage.setItem('ciclo-tema', tema) } catch { /* navegador sem armazenamento */ }
}
let temaSalvo = 'escuro'
try { temaSalvo = localStorage.getItem('ciclo-tema') || 'escuro' } catch { /* idem */ }
aplicarTema(parametros.get('tema') || temaSalvo)
$('#botao-tema').addEventListener('click', () =>
  aplicarTema(document.documentElement.dataset.tema === 'projetor' ? 'escuro' : 'projetor'))

// ---------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------
const etapas = $('#etapas')
etapas.innerHTML = ARQUIVOS_DO_BANCO.map((a, i) =>
  `<li data-i="${i}"><span>${esc(a.etapa)}</span><span class="mono"></span></li>`).join('')

function progresso({ indice, ms: tempo }) {
  const li = etapas.querySelector(`[data-i="${indice}"]`)
  if (!li) return
  if (tempo === null) { li.className = 'atual'; return }
  li.className = 'feita'
  li.lastElementChild.textContent = ms(tempo).replace(',00', '')
}

try {
  const inicio = performance.now()
  await iniciarBanco({ aoProgredir: progresso })
  const segundos = ((performance.now() - inicio) / 1000).toFixed(1).replace('.', ',')
  $('#carregando-rodape').textContent = `Banco pronto em ${segundos} s`
  window.__cicloTempoMontagem = segundos
} catch (erro) {
  $('#carregando-rodape').innerHTML = `<span style="color:var(--perigo)">Não foi possível montar o banco: ${esc(erro.message)}</span>`
  throw erro
}

// ---------------------------------------------------------------------
// Quem está usando
// ---------------------------------------------------------------------
const { db } = await import('./banco.js')
estado.profissionais = (await db.query(
  `SELECT p.id, p.nome, p.ativo, e.nome AS especialidade
     FROM profissional p JOIN especialidade e ON e.id = p.especialidade_id
    ORDER BY e.id, p.nome`)).rows

const seletor = $('#quem')
seletor.innerHTML = estado.profissionais.map((p) =>
  `<option value="${p.id}">${esc(p.nome)} · ${esc(p.especialidade)}${p.ativo ? '' : ' (desligado)'}</option>`).join('')
$('#sala').innerHTML = SALAS.map((s) => `<option>${esc(s)}</option>`).join('')

function escolherProfissional(id) {
  const prof = estado.profissionais.find((p) => p.id === Number(id))
  seletor.value = String(prof.id)
  $('#quem-cor').style.setProperty('--cor', corDaEspecialidade(prof.especialidade))
  const sala = SALA_PADRAO[prof.especialidade] ?? SALAS[0]
  $('#sala').value = sala
  mudar({ profissional: prof, sala, retificando: null })
}
seletor.addEventListener('change', () => escolherProfissional(seletor.value))
$('#sala').addEventListener('change', () => mudar({ sala: $('#sala').value }))

const quem = (parametros.get('quem') || 'camila').toLowerCase()
const inicial = estado.profissionais.find((p) => p.nome.toLowerCase().includes(quem)) ?? estado.profissionais[0]
estado.profissional = inicial
escolherProfissional(inicial.id)

iniciarAtendimento()

// ---------------------------------------------------------------------
// Abas (as outras telas só carregam quando abertas)
// ---------------------------------------------------------------------
const iniciadas = new Set(['atendimento'])
async function abrirAba(nome) {
  $$('.abas button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === nome)))
  $$('main > section').forEach((s) => s.classList.toggle('escondido', s.id !== `aba-${nome}`))
  if (!iniciadas.has(nome)) {
    iniciadas.add(nome)
    const modulos = {
      laboratorio: () => import('./telas/laboratorio.js'),
      console: () => import('./telas/console.js'),
      como: () => import('./telas/como-funciona.js'),
    }
    const m = await modulos[nome]()
    await m.iniciar($(`#aba-${nome}`))
  }
}
$$('.abas button').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)))

// pronto: some a tela de carregamento
$('#carregando').remove()

const cpf = parametros.get('paciente')
if (cpf) {
  const achado = (await db.query('SELECT id FROM paciente WHERE cpf = $1', [cpf])).rows[0]
  if (achado) await abrirPaciente(achado.id)
}
if (parametros.get('aba')) await abrirAba(parametros.get('aba'))
window.__cicloPronto = true
