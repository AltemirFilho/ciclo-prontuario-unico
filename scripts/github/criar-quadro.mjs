// Monta o quadro Kanban (GitHub Projects) com as 16 histórias.
// Precisa do escopo "project" no gh:  gh auth refresh -h github.com -s project
import { execFileSync } from 'node:child_process'
import { REPO } from './backlog.mjs'

const DONO = REPO.split('/')[0]
const TITULO = 'Ciclo Prontuário Único · Kanban'
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' })
const json = (...args) => JSON.parse(gh(...args, '--format', 'json'))

let projeto = json('project', 'list', '--owner', DONO).projects.find((p) => p.title === TITULO)
if (!projeto) {
  projeto = json('project', 'create', '--owner', DONO, '--title', TITULO)
  console.log('quadro criado:', projeto.url)
}
gh('project', 'link', String(projeto.number), '--owner', DONO, '--repo', REPO)

// coluna "Status": Backlog, A fazer, Fazendo, Revisão, Pronto
const campos = json('project', 'field-list', String(projeto.number), '--owner', DONO).fields
const status = campos.find((c) => c.name === 'Status')
const query = `mutation($id: ID!, $opcoes: [ProjectV2SingleSelectFieldOptionInput!]) {
  updateProjectV2Field(input: { fieldId: $id, singleSelectOptions: $opcoes }) {
    projectV2Field { ... on ProjectV2SingleSelectField { options { id name } } }
  }
}`
const opcoes = [
  { name: 'Backlog', color: 'GRAY', description: 'Ideia registrada' },
  { name: 'A fazer', color: 'BLUE', description: 'Entrou na entrega da vez' },
  { name: 'Fazendo', color: 'YELLOW', description: 'SQL e teste sendo escritos' },
  { name: 'Revisão', color: 'ORANGE', description: 'Bateria de testes rodando' },
  { name: 'Pronto', color: 'GREEN', description: 'Testes ligados passaram' },
]
const r = JSON.parse(execFileSync('gh', ['api', 'graphql', '--input', '-'], {
  input: JSON.stringify({ query, variables: { id: status.id, opcoes } }), encoding: 'utf8',
}))
const novas = r.data.updateProjectV2Field.projectV2Field.options
const opcao = (nome) => novas.find((o) => o.name === nome).id

// cada issue entra no quadro: fechada vai para Pronto, aberta para Fazendo
const issues = JSON.parse(gh('issue', 'list', '--repo', REPO, '--state', 'all', '--limit', '100', '--json', 'number,url,state'))
for (const i of issues.sort((a, b) => a.number - b.number)) {
  const item = json('project', 'item-add', String(projeto.number), '--owner', DONO, '--url', i.url)
  gh('project', 'item-edit', '--id', item.id, '--project-id', projeto.id,
     '--field-id', status.id, '--single-select-option-id', opcao(i.state === 'CLOSED' ? 'Pronto' : 'Fazendo'))
  console.log(`#${i.number} → ${i.state === 'CLOSED' ? 'Pronto' : 'Fazendo'}`)
}
console.log('quadro:', projeto.url)
