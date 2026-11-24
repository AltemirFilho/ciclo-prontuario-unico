// Estado da tela: quem está usando, em qual sala e qual paciente está aberto.
// Quando algo muda, quem estiver ouvindo é avisado.

const ouvintes = new Set()

export const estado = {
  profissionais: [],      // [{ id, nome, especialidade, especialidade_id }]
  profissional: null,     // o profissional escolhido em "Você é"
  sala: null,
  pacienteId: null,
  retificando: null,      // registro que está sendo retificado
}

export function mudar(parcial) {
  Object.assign(estado, parcial)
  for (const f of ouvintes) f(estado, parcial)
}

export function ouvir(funcao) {
  ouvintes.add(funcao)
  return () => ouvintes.delete(funcao)
}

export const SALAS = [
  'Consultório 1',
  'Consultório 2',
  'Sala de Enfermagem',
  'Ginásio de Fisioterapia',
  'Consultório de Nutrição',
  'Sala de Psicologia',
]

export const SALA_PADRAO = {
  Medicina: 'Consultório 1',
  Enfermagem: 'Sala de Enfermagem',
  Fisioterapia: 'Ginásio de Fisioterapia',
  'Nutrição': 'Consultório de Nutrição',
  Psicologia: 'Sala de Psicologia',
}
