// Backlog do projeto: as histórias de usuário que viraram issues no GitHub.
// Cada história lista os testes que provam que ela está pronta.

export const REPO = 'AltemirFilho/ciclo-prontuario-unico'

export const ETIQUETAS = [
  { name: 'história de usuário', color: 'ededed', description: 'Necessidade de quem usa a clínica' },
  { name: 'restrição',           color: 'd93f0b', description: 'PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, NOT NULL' },
  { name: 'tipo de dado',        color: 'fbca04', description: 'Escolha de tipos (DATE, ENUM, JSONB, TIMESTAMPTZ...)' },
  { name: 'gatilho',             color: 'b60205', description: 'Regra de negócio feita com trigger' },
  { name: 'índice',              color: '1d76db', description: 'Desempenho medido com EXPLAIN ANALYZE' },
  { name: 'consulta',            color: '5319e7', description: 'Visões e funções de leitura' },
  { name: 'lgpd',                color: '0052cc', description: 'Dado de saúde é dado sensível' },
  { name: 'sistema',             color: '0e8a16', description: 'Telas do Ciclo Prontuário Único' },
  { name: 'documentação',        color: 'c5def5', description: 'Artigo, README, guia de estudo' },
  { name: 'apresentação',        color: 'f9d0c4', description: 'Os 10 minutos em sala' },
]

export const ENTREGAS = [
  { title: 'Entrega 1 · Modelagem e regras',        description: 'Tabelas, tipos, restrições e gatilhos. Pronto = testes T01 a T30 passando.' },
  { title: 'Entrega 2 · Consultas, índices e LGPD', description: 'Linha do tempo, busca, sigilo, auditoria e índices medidos (antes e depois).' },
  { title: 'Entrega 3 · Sistema e evidências',      description: 'Sistema web rodando o banco de verdade, laboratório de testes e capturas de tela.' },
  { title: 'Entrega 4 · Artigo e apresentação',     description: 'Artigo no modelo SBC e apresentação de 10 minutos.' },
]

export const HISTORIAS = [
  {
    titulo: 'Paciente com uma ficha só: CPF único e válido',
    entrega: 0, etiquetas: ['história de usuário', 'restrição', 'tipo de dado'],
    testes: ['T01', 'T03', 'T06', 'T07', 'T08', 'T09', 'T10'],
    corpo: `**Como** recepcionista, **quero** cadastrar cada paciente uma única vez, **para** que ninguém abra uma segunda ficha da mesma pessoa.

**Situação real:** a Dona Maria chega, ninguém acha a ficha dela (o CPF foi anotado com um dígito trocado) e a recepção abre outra. A partir daí a história dela fica dividida em duas pastas.

**Critérios de aceite**
- [ ] CPF com 11 dígitos e dígito verificador conferido pelo banco (CHECK com \`cpf_valido\`)
- [ ] O mesmo CPF não entra duas vezes (UNIQUE)
- [ ] Nome com nome e sobrenome; data de nascimento possível
- [ ] O id é gerado pelo banco (IDENTITY), ninguém escolhe`,
  },
  {
    titulo: 'Registro clínico único para todas as especialidades',
    entrega: 0, etiquetas: ['história de usuário', 'restrição', 'tipo de dado'],
    testes: ['T02', 'T04', 'T05', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16'],
    corpo: `**Como** profissional de qualquer especialidade, **quero** escrever no mesmo prontuário que os colegas, **para** que quem atender depois de mim saiba o que eu fiz.

**Situação real:** cada setor tinha a sua planilha. A fisio anotava a dor, a nutrição o peso, a médica a pressão, e ninguém via o todo.

**Critérios de aceite**
- [ ] Uma tabela \`registro_clinico\` para todas as áreas; o específico de cada área vai em \`medidas\` (JSONB)
- [ ] Tipo do registro em ENUM (acabou o "evol.", "Evolução", "EV")
- [ ] Registro sempre ligado a um atendimento do mesmo paciente (FK composta)
- [ ] Dor de 0 a 10 e texto mínimo garantidos por CHECK`,
  },
  {
    titulo: 'Alergias e condições visíveis para toda a equipe',
    entrega: 0, etiquetas: ['história de usuário', 'restrição', 'consulta'],
    testes: ['T17', 'T18', 'T38'],
    corpo: `**Como** médica, **quero** que a alergia que eu registrei apareça para todos, **para** que ninguém prescreva o que pode matar o paciente.

**Situação real:** a alergia grave a dipirona da Dona Maria estava anotada na ficha do consultório 1. A fisioterapia, em outro andar, não sabia.

**Critérios de aceite**
- [ ] Uma alergia ativa por substância (índice único parcial, ignora maiúscula e acento)
- [ ] Alergia desativada pode ser registrada de novo
- [ ] Resumo do paciente mostra alergias, condições (CID-10) e quem escreveu por último`,
  },
  {
    titulo: 'Prontuário não se apaga nem se reescreve',
    entrega: 0, etiquetas: ['história de usuário', 'gatilho'],
    testes: ['T20', 'T21', 'T22', 'T28'],
    corpo: `**Como** clínica, **quero** que nada escrito no prontuário possa ser apagado ou alterado, **para** cumprir a guarda legal e não perder a história do paciente.

**Situação real:** no papel, corretivo e folha arrancada somem com a informação. No banco, um UPDATE faz o mesmo sem deixar marca.

**Critérios de aceite**
- [ ] UPDATE, DELETE e TRUNCATE em \`registro_clinico\` bloqueados por gatilho
- [ ] A hora do registro é a do servidor (não dá para lançar "ontem")`,
  },
  {
    titulo: 'Corrigir sem apagar: retificação',
    entrega: 0, etiquetas: ['história de usuário', 'gatilho', 'restrição'],
    testes: ['T23', 'T24', 'T25'],
    corpo: `**Como** profissional, **quero** corrigir um erro meu sem apagar o que estava escrito, **para** que fique claro o que mudou e quando.

**Situação real:** a médica prescreveu metformina 3 vezes ao dia por engano. A correção precisa aparecer junto do erro, não no lugar dele.

**Critérios de aceite**
- [ ] Retificação é um registro novo com \`retifica_id\` apontando para o original
- [ ] Só o autor retifica o próprio registro
- [ ] Cada registro só pode ser retificado uma vez (a versão que vale é a única sem retificação)`,
  },
  {
    titulo: 'Sem registro em atendimento com falta ou por profissional desligado',
    entrega: 0, etiquetas: ['história de usuário', 'gatilho'],
    testes: ['T26', 'T27'],
    corpo: `**Como** coordenação da clínica, **quero** impedir registros que não deveriam existir, **para** que o prontuário só tenha o que aconteceu de verdade.

**Critérios de aceite**
- [ ] Atendimento com status "faltou" ou "cancelado" não recebe evolução
- [ ] Profissional inativo não escreve no prontuário`,
  },
  {
    titulo: 'Quem viu minha ficha? Auditoria de acessos',
    entrega: 1, etiquetas: ['história de usuário', 'lgpd', 'gatilho', 'índice'],
    testes: ['T29', 'T30', 'T32', 'I3'],
    corpo: `**Como** paciente, **quero** saber quem abriu o meu prontuário, **para** confiar que meus dados de saúde não estão circulando.

**Situação real:** dado de saúde é dado pessoal sensível (LGPD, art. 5º, II). Na ficha de papel, qualquer um que passasse pela sala podia ler.

**Critérios de aceite**
- [ ] Toda escrita gera linha de auditoria (gatilho, sem depender da tela)
- [ ] Toda leitura pela função \`linha_do_tempo\` gera linha de auditoria
- [ ] A auditoria não pode ser apagada
- [ ] Consulta "quem acessou" usa índice (medido antes e depois)`,
  },
  {
    titulo: 'Sigilo da psicologia dentro do prontuário compartilhado',
    entrega: 1, etiquetas: ['história de usuário', 'lgpd', 'consulta'],
    testes: ['T33', 'T34'],
    corpo: `**Como** psicóloga, **quero** registrar no mesmo prontuário sem expor o conteúdo das sessões, **para** que a equipe saiba que o paciente está em acompanhamento sem ler o que foi dito.

**Critérios de aceite**
- [ ] Registro marcado como sigiloso aparece na linha do tempo de todos
- [ ] O conteúdo só abre para a especialidade autora`,
  },
  {
    titulo: 'Achar o paciente mesmo digitando sem acento ou com erro',
    entrega: 1, etiquetas: ['história de usuário', 'consulta', 'índice'],
    testes: ['T35', 'T36', 'T37', 'I2', 'I5'],
    corpo: `**Como** recepcionista, **quero** encontrar a ficha mesmo digitando "joao pedro conseicao", **para** não abrir uma ficha nova de quem já é paciente.

**Critérios de aceite**
- [ ] Busca sem acento e tolerante a erro (pg_trgm + unaccent, índice GIN)
- [ ] Busca por CPF com ou sem máscara (usa o índice do UNIQUE)
- [ ] Antes de cadastrar, aviso de possível ficha duplicada (mesma data de nascimento e nome parecido)`,
  },
  {
    titulo: 'Linha do tempo rápida mesmo com anos de histórico',
    entrega: 1, etiquetas: ['história de usuário', 'índice', 'consulta'],
    testes: ['T31', 'I1', 'I4'],
    corpo: `**Como** profissional, **quero** abrir o prontuário inteiro na hora, **para** não perder tempo de consulta esperando a tela.

**Critérios de aceite**
- [ ] Linha do tempo única, todas as especialidades, do mais novo para o mais antigo
- [ ] Índice composto (paciente_id, criado_em DESC) medido com EXPLAIN ANALYZE, sem e com
- [ ] Teste de escala: o tempo com índice não cresce junto com a clínica
- [ ] Agenda do dia do profissional com índice próprio`,
  },
  {
    titulo: 'Sistema web: o prontuário único funcionando',
    entrega: 2, etiquetas: ['sistema'], testes: [],
    corpo: `Telas do Ciclo Prontuário Único rodando o PostgreSQL de verdade no navegador (PGlite).

- [ ] Escolher quem está atendendo (profissional e sala)
- [ ] Buscar paciente e ver a agenda do dia
- [ ] Cabeçalho com alergias, condições e última atualização
- [ ] Linha do tempo de todas as especialidades, com sigilo e retificação
- [ ] Registrar evolução e mostrar o erro do banco quando a regra barra`,
  },
  {
    titulo: 'Laboratório de testes dentro do sistema',
    entrega: 2, etiquetas: ['sistema', 'documentação'], testes: [],
    corpo: `Aba que roda os 38 testes e os experimentos de índice ao vivo, para mostrar em sala.

- [ ] Tabela com teste, situação real, esperado, obtido e resultado
- [ ] Índices: tempo sem e com, e o plano de execução
- [ ] Console SQL para perguntas na hora`,
  },
  {
    titulo: 'Publicar o sistema no GitHub Pages',
    entrega: 2, etiquetas: ['sistema'], testes: [],
    corpo: `O professor abre o sistema pelo link, sem instalar nada. Também é o plano B se o notebook falhar na hora.`,
  },
  {
    titulo: 'Capturas de tela e tabelas de evidência',
    entrega: 2, etiquetas: ['documentação'], testes: [],
    corpo: `Cada afirmação do artigo sobre tipos, restrições, índices e consultas precisa de um teste executado com captura ou tabela.

- [ ] Capturas do sistema e do laboratório de testes
- [ ] Tabela de resultados gerada pelos testes (RESULTADOS.md)`,
  },
  {
    titulo: 'Artigo no modelo SBC da UNIT',
    entrega: 3, etiquetas: ['documentação'], testes: [],
    corpo: `Problema, decisões, testes e resultados, com as evidências. Declaração de uso de IA preenchida.`,
  },
  {
    titulo: 'Apresentação de 10 minutos e roteiro da dupla',
    entrega: 3, etiquetas: ['apresentação'], testes: [],
    corpo: `Slides, demonstração ao vivo e divisão da fala entre Altemir e Juscelino. Perguntas prováveis do professor com resposta.`,
  },
]
