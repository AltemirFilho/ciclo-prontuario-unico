// Pequenas ferramentas usadas por todas as telas.

const FUSO = 'America/Maceio'

/** Escapa texto antes de pôr em HTML (texto clínico vem de gente digitando). */
export function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor)
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)]

/** Cor de cada especialidade (variável CSS). */
export function corDaEspecialidade(nome) {
  const mapa = {
    'Medicina': 'var(--esp-medicina)',
    'Enfermagem': 'var(--esp-enfermagem)',
    'Fisioterapia': 'var(--esp-fisioterapia)',
    'Nutrição': 'var(--esp-nutricao)',
    'Psicologia': 'var(--esp-psicologia)',
  }
  return mapa[nome] ?? 'var(--primary)'
}

export const ROTULO_TIPO = {
  anamnese: 'Anamnese',
  evolucao: 'Evolução',
  prescricao: 'Prescrição',
  exame: 'Exame',
  encaminhamento: 'Encaminhamento',
  orientacao: 'Orientação',
}

export const ROTULO_STATUS = {
  agendado: 'agendado',
  em_atendimento: 'em atendimento',
  concluido: 'concluído',
  faltou: 'faltou',
  cancelado: 'cancelado',
}

export function mascararCpf(cpf) {
  const d = String(cpf ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

export const hora = (d) => fmtHora.format(new Date(d))
export const data = (d) => fmtData.format(new Date(d))

/** "hoje, 10:42", "ontem, 15:10", "há 3 dias", "12/08/2026" */
export function quando(d) {
  const instante = new Date(d)
  const agora = new Date()
  const diaDe = (x) => fmtDia.format(x)
  const minutos = Math.round((agora - instante) / 60000)
  if (minutos >= 0 && minutos < 1) return 'agora'
  if (minutos > 0 && minutos < 60) return `há ${minutos} min`
  if (diaDe(instante) === diaDe(agora)) return `hoje, ${hora(instante)}`
  const ontem = new Date(agora.getTime() - 86400000)
  if (diaDe(instante) === diaDe(ontem)) return `ontem, ${hora(instante)}`
  return `${data(instante)} ${hora(instante)}`
}

/** Data "2026-11-24" (texto do banco) para "24/11/2026", sem passar por fuso. */
export function dataIso(iso) {
  const [a, m, d] = String(iso).split('-')
  return `${d}/${m}/${a}`
}

export function numero(n) {
  return Number(n).toLocaleString('pt-BR')
}

export function ms(v) {
  return `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: v < 1 ? 3 : 2, minimumFractionDigits: v < 1 ? 3 : 2 })} ms`
}

// ---------------------------------------------------------------------
// Erros do banco em português de gente, sem esconder o código técnico
// ---------------------------------------------------------------------
const MENSAGENS = {
  uq_paciente_cpf: 'Já existe uma ficha com este CPF. Busque o paciente em vez de abrir outra.',
  ck_paciente_cpf: 'CPF inválido: os dígitos verificadores não conferem.',
  ck_paciente_nome: 'Informe nome e sobrenome.',
  ck_paciente_nascimento: 'Data de nascimento impossível (no futuro ou antes de 1900).',
  ck_paciente_telefone: 'Telefone com DDD, só números (10 ou 11 dígitos).',
  ck_registro_texto: 'Escreva pelo menos 15 caracteres. "ok" não conta a história para quem vem depois.',
  ck_registro_dor: 'A escala de dor vai de 0 a 10.',
  ck_registro_peso: 'Peso fora do possível.',
  ck_registro_medidas: 'As medidas precisam ser um objeto JSON.',
  ck_alergia_substancia: 'Informe a substância (pelo menos 3 letras).',
  uq_alergia_ativa: 'Esta alergia já está registrada e ativa para o paciente.',
  uq_registro_retifica: 'Este registro já foi retificado. Retifique a versão mais recente.',
  regra_registro_clinico_imutavel: 'O prontuário não se apaga nem se reescreve. Para corrigir, use "Retificar".',
  regra_acesso_prontuario_imutavel: 'A trilha de auditoria não pode ser alterada.',
  regra_retificacao_autor: 'Só quem escreveu o registro pode retificá-lo.',
  regra_retificacao_mesmo_paciente: 'A retificação precisa ser do mesmo paciente.',
  regra_atendimento_valido: 'Este atendimento foi marcado como falta ou cancelado.',
  regra_profissional_ativo: 'Profissional inativo não pode registrar no prontuário.',
  fk_registro_atendimento: 'O registro precisa pertencer a um atendimento deste mesmo paciente.',
}
const POR_CODIGO = {
  '23502': 'Campo obrigatório em branco.',
  '22P02': 'Valor em formato inválido para o tipo da coluna.',
  '22008': 'Data ou hora que não existe.',
  '22001': 'Valor maior do que a coluna aceita.',
}

export function traduzirErro(erro) {
  return MENSAGENS[erro?.constraint] ?? POR_CODIGO[erro?.code] ?? erro?.message ?? String(erro)
}

export function detalheTecnico(erro) {
  const partes = [`SQLSTATE ${erro?.code ?? '?'}`]
  if (erro?.constraint) partes.push(erro.constraint)
  return `${partes.join(' · ')} · ${erro?.message ?? ''}`
}

export function avisoErroHtml(erro, titulo = 'O banco recusou') {
  return `<div class="aviso-banco erro"><strong>${esc(titulo)}:</strong> ${esc(traduzirErro(erro))}
    <div class="tecnico">${esc(detalheTecnico(erro))}</div></div>`
}

export function toast(texto, { tipo = 'ok', tecnico = '' } = {}) {
  const caixa = document.createElement('div')
  caixa.className = `toast ${tipo}`
  caixa.innerHTML = `${esc(texto)}${tecnico ? `<div class="tecnico">${esc(tecnico)}</div>` : ''}`
  document.getElementById('toasts').append(caixa)
  setTimeout(() => caixa.remove(), tipo === 'erro' ? 7000 : 4000)
}
