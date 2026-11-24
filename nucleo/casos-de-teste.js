// =====================================================================
// Casos de teste do banco
//
// Cada caso parte de uma situação real da clínica e diz o que o banco
// TEM que fazer: recusar (com o código de erro e o nome da regra) ou
// aceitar (e uma consulta confere o resultado).
//
// Todo caso roda dentro de BEGIN ... ROLLBACK: o teste nunca suja o
// banco, e a ordem dos testes não muda o resultado.
//
// Códigos do PostgreSQL que aparecem aqui:
//   22001 valor maior que o tipo       22008 data/hora fora do intervalo
//   22P02 texto inválido para o tipo   23502 NOT NULL violado
//   23503 chave estrangeira violada    23505 UNIQUE violado
//   23514 CHECK violado                428C9 id gerado pelo banco
//   P0001 erro levantado por gatilho (RAISE EXCEPTION)
// =====================================================================

// Atalhos para achar as pessoas da demonstração pela chave natural
const MARIA     = `(SELECT id FROM paciente WHERE cpf = '18398029609')`
const JOSE      = `(SELECT id FROM paciente WHERE cpf = '14041343526')`
const FRANCISCA = `(SELECT id FROM paciente WHERE cpf = '83113838398')`
const HELENA    = `(SELECT id FROM profissional WHERE nome = 'Helena Prado')`
const CAMILA    = `(SELECT id FROM profissional WHERE nome = 'Camila Rocha')`
const BRUNO     = `(SELECT id FROM profissional WHERE nome = 'Bruno Tavares')`
const LUCAS     = `(SELECT id FROM profissional WHERE nome = 'Lucas Barreto')`
const RENATA    = `(SELECT id FROM profissional WHERE nome = 'Renata Vasconcelos')`
const FERNANDO  = `(SELECT id FROM profissional WHERE nome = 'Fernando Costa')`

// Atendimento em andamento da Dona Maria (ela está na fisio agora)
const AT_MARIA_FISIO = `(SELECT id FROM atendimento WHERE paciente_id = ${MARIA} AND status = 'em_atendimento' LIMIT 1)`

// A prescrição da Dra. Helena que já foi retificada uma vez
const PRESCRICAO_RETIFICADA = `(SELECT retifica_id FROM registro_clinico WHERE paciente_id = ${MARIA} AND retifica_id IS NOT NULL LIMIT 1)`

export const GRUPOS = ['Tipo de dado', 'Restrição', 'Regra (gatilho)', 'Consulta']

export const CASOS = [
  // -------------------------------------------------------------------
  // TIPOS DE DADO
  // -------------------------------------------------------------------
  {
    id: 'T01', grupo: 'Tipo de dado',
    titulo: 'DATE recusa data que não existe',
    situacao: 'Na ficha de papel alguém escreveu 30/02 como data de nascimento.',
    sql: `INSERT INTO paciente (nome, cpf, data_nascimento)
          VALUES ('Teste Data Impossível', gerar_cpf('100000001'), '2026-02-30')`,
    espera: { erro: '22008' },
  },
  {
    id: 'T02', grupo: 'Tipo de dado',
    titulo: 'ENUM recusa tipo de registro fora da lista',
    situacao: 'Cada setor chamava a evolução de um jeito: "evol.", "Evolução", "EV".',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evol.', 'Paciente evoluindo bem com os exercícios.'
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    espera: { erro: '22P02' },
  },
  {
    id: 'T03', grupo: 'Tipo de dado',
    titulo: 'CHAR(11) não aceita CPF com dígito a mais',
    situacao: 'O CPF foi digitado com um zero a mais no fim.',
    sql: `INSERT INTO paciente (nome, cpf, data_nascimento)
          VALUES ('Teste Cpf Comprido', '183980296090', '1990-01-01')`,
    espera: { erro: '22001' },
  },
  {
    id: 'T04', grupo: 'Tipo de dado',
    titulo: 'JSONB recusa medida mal escrita',
    situacao: 'A medida da dor chegou como texto quebrado: {"dor": 5',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto, medidas)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', 'Sessão de fortalecimento sem intercorrências.', '{"dor": 5'
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    espera: { erro: '22P02' },
  },
  {
    id: 'T05', grupo: 'Tipo de dado',
    titulo: 'TIMESTAMPTZ guarda o instante certo, em qualquer fuso',
    situacao: 'Um sistema externo manda o horário em UTC (13h); em Aracaju são 10h.',
    sql: `INSERT INTO atendimento (paciente_id, profissional_id, sala, inicio, status)
          VALUES (${MARIA}, ${LUCAS}, 'Consultório de Nutrição', '2026-12-01 13:00:00+00', 'agendado')`,
    verificacao: `SELECT to_char(inicio AT TIME ZONE 'America/Maceio', 'HH24:MI') = '10:00' AS ok,
                         'gravado ' || to_char(inicio AT TIME ZONE 'UTC', 'HH24:MI') || ' UTC = '
                         || to_char(inicio AT TIME ZONE 'America/Maceio', 'HH24:MI') || ' em Aracaju' AS obtido
                    FROM atendimento ORDER BY id DESC LIMIT 1`,
    espera: { ok: true },
  },
  {
    id: 'T06', grupo: 'Tipo de dado',
    titulo: 'IDENTITY: quem numera a ficha é o banco',
    situacao: 'Dois setores criando fichas com o mesmo número de controle.',
    sql: `INSERT INTO paciente (id, nome, cpf, data_nascimento)
          VALUES (1, 'Teste Id Manual', gerar_cpf('100000002'), '1990-01-01')`,
    espera: { erro: '428C9' },
  },

  // -------------------------------------------------------------------
  // RESTRIÇÕES
  // -------------------------------------------------------------------
  {
    id: 'T07', grupo: 'Restrição',
    titulo: 'UNIQUE: o mesmo CPF não ganha segunda ficha',
    situacao: 'A recepção abre uma ficha nova para a Dona Maria, que já tem ficha.',
    sql: `INSERT INTO paciente (nome, cpf, data_nascimento)
          VALUES ('Maria das Gracas Sousa', '18398029609', '1959-03-12')`,
    espera: { erro: '23505', restricao: 'uq_paciente_cpf' },
  },
  {
    id: 'T08', grupo: 'Restrição',
    titulo: 'CHECK: CPF com dígito verificador errado',
    situacao: 'Um dígito trocado no CPF (…-08 no lugar de …-09) criaria outra pessoa.',
    sql: `INSERT INTO paciente (nome, cpf, data_nascimento)
          VALUES ('Maria das Graças Souza', '18398029608', '1959-03-12')`,
    espera: { erro: '23514', restricao: 'ck_paciente_cpf' },
  },
  {
    id: 'T09', grupo: 'Restrição',
    titulo: 'CHECK: nome completo obrigatório',
    situacao: 'Cadastro feito só com "Maria", o começo de uma ficha duplicada.',
    sql: `INSERT INTO paciente (nome, cpf, data_nascimento)
          VALUES ('Maria', gerar_cpf('100000003'), '1959-03-12')`,
    espera: { erro: '23514', restricao: 'ck_paciente_nome' },
  },
  {
    id: 'T10', grupo: 'Restrição',
    titulo: 'CHECK: nascimento no futuro',
    situacao: 'O ano foi digitado como 2062 no lugar de 1962.',
    sql: `INSERT INTO paciente (nome, cpf, data_nascimento)
          VALUES ('Teste Ano Errado', gerar_cpf('100000004'), '2062-05-10')`,
    espera: { erro: '23514', restricao: 'ck_paciente_nascimento' },
  },
  {
    id: 'T11', grupo: 'Restrição',
    titulo: 'NOT NULL: evolução sem texto',
    situacao: 'O botão de salvar foi apertado com o campo em branco.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', NULL
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    espera: { erro: '23502' },
  },
  {
    id: 'T12', grupo: 'Restrição',
    titulo: 'CHECK: texto curto demais ("ok")',
    situacao: 'Evolução registrada só com "ok", que não conta nada a quem vem depois.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', 'ok'
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    espera: { erro: '23514', restricao: 'ck_registro_texto' },
  },
  {
    id: 'T13', grupo: 'Restrição',
    titulo: 'FK: registro em atendimento que não existe',
    situacao: 'Uma evolução aponta para o atendimento 999999, que nunca aconteceu.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
          VALUES (999999, ${MARIA}, ${CAMILA}, 'evolucao', 'Sessão de fortalecimento sem intercorrências.')`,
    espera: { erro: '23503', restricao: 'fk_registro_atendimento' },
  },
  {
    id: 'T14', grupo: 'Restrição',
    titulo: 'FK composta: evolução do José na ficha da Maria',
    situacao: 'A folha do José foi parar na pasta da Maria (atendimento de um, paciente de outro).',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
          SELECT a.id, ${MARIA}, a.profissional_id, 'evolucao', 'Paciente relata melhora da dor lombar.'
            FROM atendimento a WHERE a.paciente_id = ${JOSE} AND a.status = 'concluido' LIMIT 1`,
    espera: { erro: '23503', restricao: 'fk_registro_atendimento' },
  },
  {
    id: 'T15', grupo: 'Restrição',
    titulo: 'CHECK: atendimento termina antes de começar',
    situacao: 'Hora de saída digitada antes da hora de entrada.',
    sql: `INSERT INTO atendimento (paciente_id, profissional_id, sala, inicio, fim, status)
          VALUES (${MARIA}, ${CAMILA}, 'Ginásio de Fisioterapia', now(), now() - interval '30 minutes', 'concluido')`,
    espera: { erro: '23514', restricao: 'ck_atendimento_periodo' },
  },
  {
    id: 'T16', grupo: 'Restrição',
    titulo: 'CHECK no JSONB: dor fora da escala 0 a 10',
    situacao: 'A dor foi anotada como 15.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto, medidas)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', 'Dor forte ao subir escadas hoje.', '{"dor": 15}'
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    espera: { erro: '23514', restricao: 'ck_registro_dor' },
  },
  {
    id: 'T17', grupo: 'Restrição',
    titulo: 'UNIQUE parcial: alergia ativa repetida',
    situacao: 'A fisio registra "dipirona" sem saber que a médica já registrou "Dipirona".',
    sql: `INSERT INTO alergia (paciente_id, substancia, gravidade, registrada_por)
          VALUES (${MARIA}, 'dipirona', 'moderada', ${CAMILA})`,
    espera: { erro: '23505', restricao: 'uq_alergia_ativa' },
  },
  {
    id: 'T18', grupo: 'Restrição',
    titulo: 'UNIQUE parcial: alergia desativada pode voltar',
    situacao: 'A alergia foi descartada por engano e precisa ser registrada de novo.',
    sql: [
      `UPDATE alergia SET ativa = false WHERE paciente_id = ${MARIA} AND substancia = 'Dipirona'`,
      `INSERT INTO alergia (paciente_id, substancia, gravidade, registrada_por)
       VALUES (${MARIA}, 'Dipirona', 'grave', ${HELENA})`,
    ],
    verificacao: `SELECT count(*) FILTER (WHERE ativa) = 1 AND count(*) FILTER (WHERE NOT ativa) >= 1 AS ok,
                         count(*) FILTER (WHERE ativa) || ' ativa, ' || count(*) FILTER (WHERE NOT ativa) || ' desativada' AS obtido
                    FROM alergia WHERE paciente_id = ${MARIA} AND normalizar(substancia) = 'dipirona'`,
    espera: { ok: true },
  },
  {
    id: 'T19', grupo: 'Restrição',
    titulo: 'UNIQUE: o mesmo registro de conselho duas vezes',
    situacao: 'Cadastro de um segundo médico com o CRM 4821/SE, que é da Dra. Helena.',
    sql: `INSERT INTO profissional (nome, especialidade_id, registro_conselho, uf_conselho)
          VALUES ('Helena P. Prado', (SELECT id FROM especialidade WHERE nome = 'Medicina'), '4821', 'SE')`,
    espera: { erro: '23505', restricao: 'uq_profissional_registro' },
  },

  // -------------------------------------------------------------------
  // REGRAS DE NEGÓCIO (GATILHOS)
  // -------------------------------------------------------------------
  {
    id: 'T20', grupo: 'Regra (gatilho)',
    titulo: 'UPDATE em registro clínico é bloqueado',
    situacao: 'Alguém tenta "corrigir" a evolução escrevendo por cima do texto antigo.',
    sql: `UPDATE registro_clinico SET texto = 'Texto alterado depois do atendimento.'
           WHERE paciente_id = ${MARIA}`,
    espera: { erro: 'P0001', restricao: 'regra_registro_clinico_imutavel' },
  },
  {
    id: 'T21', grupo: 'Regra (gatilho)',
    titulo: 'DELETE em registro clínico é bloqueado',
    situacao: 'Alguém tenta sumir com um registro, como arrancar a folha da pasta.',
    sql: `DELETE FROM registro_clinico WHERE paciente_id = ${MARIA}`,
    espera: { erro: 'P0001', restricao: 'regra_registro_clinico_imutavel' },
  },
  {
    id: 'T22', grupo: 'Regra (gatilho)',
    titulo: 'TRUNCATE no prontuário é bloqueado',
    situacao: 'Um comando de limpeza geral rodado no banco errado.',
    sql: `TRUNCATE registro_clinico`,
    espera: { erro: 'P0001', restricao: 'regra_registro_clinico_imutavel' },
  },
  {
    id: 'T23', grupo: 'Regra (gatilho)',
    titulo: 'Retificação feita pelo autor é aceita',
    situacao: 'A fisio Camila corrige a própria evolução; a original continua lá.',
    sql: [
      `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
       SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', 'Sessão com exercícios isométricos, sem carga.'
         FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
      `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto, retifica_id)
       SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao',
              'Retificação: exercícios isométricos de quadríceps, 3 séries de 10, sem carga.',
              (SELECT max(id) FROM registro_clinico WHERE paciente_id = ${MARIA})
         FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    ],
    // só olha o que este teste gravou (criado_em = now() é a hora desta transação)
    verificacao: `SELECT count(*) = 2 AND count(retifica_id) = 1
                         AND bool_or(retifica_id = (SELECT min(id) FROM registro_clinico
                                                     WHERE atendimento_id = ${AT_MARIA_FISIO} AND criado_em = now())) AS ok,
                         count(*) || ' registros: o original e a retificação que aponta para ele' AS obtido
                    FROM registro_clinico
                   WHERE atendimento_id = ${AT_MARIA_FISIO}
                     AND criado_em = now()`,
    espera: { ok: true },
  },
  {
    id: 'T24', grupo: 'Regra (gatilho)',
    titulo: 'Retificação feita por outro profissional é bloqueada',
    situacao: 'A fisio tenta corrigir a prescrição da médica.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto, retifica_id)
          SELECT a.id, a.paciente_id, a.profissional_id, 'prescricao',
                 'Retificação: trocar paracetamol por outro analgésico.',
                 (SELECT id FROM registro_clinico WHERE paciente_id = ${MARIA} AND profissional_id = ${HELENA}
                   ORDER BY criado_em DESC LIMIT 1)
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    espera: { erro: 'P0001', restricao: 'regra_retificacao_autor' },
  },
  {
    id: 'T25', grupo: 'Regra (gatilho)',
    titulo: 'O mesmo registro não é retificado duas vezes',
    situacao: 'A prescrição já foi corrigida; corrigir de novo o original deixaria duas versões valendo.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto, retifica_id)
          SELECT r.atendimento_id, r.paciente_id, r.profissional_id, 'prescricao',
                 'Retificação: metformina 850 mg 1 vez ao dia.', r.id
            FROM registro_clinico r WHERE r.id = ${PRESCRICAO_RETIFICADA}`,
    espera: { erro: '23505', restricao: 'uq_registro_retifica' },
  },
  {
    id: 'T26', grupo: 'Regra (gatilho)',
    titulo: 'Atendimento com falta não recebe evolução',
    situacao: 'Dona Francisca faltou à fisio; alguém tenta lançar uma sessão nesse dia.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', 'Treino de equilíbrio e marcha realizado.'
            FROM atendimento a WHERE a.paciente_id = ${FRANCISCA} AND a.status = 'faltou' LIMIT 1`,
    espera: { erro: 'P0001', restricao: 'regra_atendimento_valido' },
  },
  {
    id: 'T27', grupo: 'Regra (gatilho)',
    titulo: 'Profissional desligado não escreve',
    situacao: 'O Dr. Fernando saiu da clínica, mas o login dele ainda existe.',
    sql: [
      `INSERT INTO atendimento (paciente_id, profissional_id, sala, inicio, status)
       VALUES (${MARIA}, ${FERNANDO}, 'Consultório 2', now(), 'em_atendimento')`,
      `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
       SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', 'Paciente estável, sem queixas novas.'
         FROM atendimento a WHERE a.profissional_id = ${FERNANDO} ORDER BY a.id DESC LIMIT 1`,
    ],
    espera: { erro: 'P0001', restricao: 'regra_profissional_ativo' },
  },
  {
    id: 'T28', grupo: 'Regra (gatilho)',
    titulo: 'A hora do registro é a do servidor',
    situacao: 'Tentativa de lançar uma evolução com data de ontem para cobrir esquecimento.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto, criado_em)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao',
                 'Sessão de fortalecimento sem intercorrências.', now() - interval '1 day'
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    verificacao: `SELECT criado_em = now() AS ok,
                         'pedido: ' || to_char(now() - interval '1 day', 'DD/MM HH24:MI') ||
                         ' · gravado: ' || to_char(criado_em, 'DD/MM HH24:MI') AS obtido
                    FROM registro_clinico ORDER BY id DESC LIMIT 1`,
    espera: { ok: true },
  },
  {
    id: 'T29', grupo: 'Regra (gatilho)',
    titulo: 'Toda escrita deixa rastro na auditoria',
    situacao: 'A fisio grava uma evolução; o banco anota quem, o quê e quando.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', 'Sessão de isometria de quadríceps, dor 3.'
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    verificacao: `SELECT count(*) = 1 AS ok,
                         count(*) || ' linha de auditoria: ' || string_agg(acao::text || ' por ' || profissional, ', ') AS obtido
                    FROM vw_auditoria
                   WHERE paciente_id = ${MARIA} AND momento = now()`,
    espera: { ok: true },
  },
  {
    id: 'T30', grupo: 'Regra (gatilho)',
    titulo: 'A auditoria não pode ser apagada',
    situacao: 'Alguém tenta apagar o rastro de quem abriu a ficha.',
    sql: `DELETE FROM acesso_prontuario WHERE paciente_id = ${MARIA}`,
    espera: { erro: 'P0001', restricao: 'regra_acesso_prontuario_imutavel' },
  },

  // -------------------------------------------------------------------
  // CONSULTAS
  // -------------------------------------------------------------------
  {
    id: 'T31', grupo: 'Consulta',
    titulo: 'Linha do tempo única, de todas as especialidades',
    situacao: 'A fisio abre o prontuário da Dona Maria e enxerga o que médica, enfermagem e nutrição escreveram.',
    sql: `SELECT 1`,
    verificacao: `WITH l AS (SELECT * FROM linha_do_tempo(${MARIA}, ${CAMILA}))
                  SELECT count(DISTINCT especialidade) >= 4
                         AND (SELECT criado_em FROM l LIMIT 1) = (SELECT max(criado_em) FROM l) AS ok,
                         count(*) || ' registros de ' || count(DISTINCT especialidade) || ' especialidades; o mais recente é de '
                         || (SELECT especialidade || ' (' || profissional || ')' FROM l LIMIT 1) AS obtido
                    FROM l`,
    espera: { ok: true },
  },
  {
    id: 'T32', grupo: 'Consulta',
    titulo: 'Abrir o prontuário também deixa rastro',
    situacao: 'Só de abrir a ficha, a leitura fica registrada (LGPD).',
    sql: `SELECT count(*) FROM linha_do_tempo(${MARIA}, ${CAMILA})`,
    verificacao: `SELECT count(*) = 1 AS ok,
                         count(*) || ' leitura registrada: ' || string_agg(profissional || ' às ' || to_char(momento, 'HH24:MI'), ', ') AS obtido
                    FROM vw_auditoria
                   WHERE paciente_id = ${MARIA} AND acao = 'leitura' AND momento = now()`,
    espera: { ok: true },
  },
  {
    id: 'T33', grupo: 'Consulta',
    titulo: 'Sigilo: a fisio sabe que houve psicologia, mas não lê o conteúdo',
    situacao: 'José faz psicologia e fisioterapia no mesmo prontuário.',
    sql: `SELECT 1`,
    verificacao: `SELECT count(*) > 0 AND bool_and(oculto) AS ok,
                         count(*) || ' registros sigilosos aparecem; conteúdo oculto em todos: ' || bool_and(oculto) AS obtido
                    FROM linha_do_tempo(${JOSE}, ${BRUNO}) WHERE sigiloso`,
    espera: { ok: true },
  },
  {
    id: 'T34', grupo: 'Consulta',
    titulo: 'Sigilo: a psicóloga lê o próprio registro',
    situacao: 'A mesma linha do tempo, aberta pela psicóloga Renata.',
    sql: `SELECT 1`,
    verificacao: `SELECT count(*) > 0 AND NOT bool_or(oculto) AS ok,
                         count(*) || ' registros sigilosos, todos legíveis para a Psicologia' AS obtido
                    FROM linha_do_tempo(${JOSE}, ${RENATA}) WHERE sigiloso`,
    espera: { ok: true },
  },
  {
    id: 'T35', grupo: 'Consulta',
    titulo: 'Busca acha o paciente sem acento e com erro de digitação',
    situacao: 'A recepção digita "joao pedro conseicao".',
    sql: `SELECT 1`,
    verificacao: `SELECT (SELECT nome FROM buscar_paciente('joao pedro conseicao') LIMIT 1) = 'João Pedro da Conceição' AS ok,
                         'primeiro resultado: ' || (SELECT nome || ' (semelhança ' || round(semelhanca::numeric, 2) || ')'
                                                     FROM buscar_paciente('joao pedro conseicao') LIMIT 1) AS obtido`,
    espera: { ok: true },
  },
  {
    id: 'T36', grupo: 'Consulta',
    titulo: 'Busca pelo CPF digitado com máscara',
    situacao: 'A recepção digita o CPF com pontos e traço: 183.980.296-09.',
    sql: `SELECT 1`,
    verificacao: `SELECT (SELECT nome FROM buscar_paciente('183.980.296-09') LIMIT 1) = 'Maria das Graças Souza' AS ok,
                         'encontrado: ' || coalesce((SELECT nome FROM buscar_paciente('183.980.296-09') LIMIT 1), 'ninguém') AS obtido`,
    espera: { ok: true },
  },
  {
    id: 'T37', grupo: 'Consulta',
    titulo: 'Aviso de possível ficha duplicada antes de cadastrar',
    situacao: 'Tentam cadastrar "Maria das Gracas Sousa", nascida em 12/03/1959, sem CPF em mãos.',
    sql: `SELECT 1`,
    verificacao: `SELECT (SELECT nome FROM possiveis_duplicados('Maria das Gracas Sousa', DATE '1959-03-12') LIMIT 1) = 'Maria das Graças Souza' AS ok,
                         'parecido com: ' || coalesce((SELECT nome || ' (semelhança ' || round(semelhanca::numeric, 2) || ')'
                                                         FROM possiveis_duplicados('Maria das Gracas Sousa', DATE '1959-03-12') LIMIT 1), 'ninguém') AS obtido`,
    espera: { ok: true },
  },
  {
    id: 'T38', grupo: 'Consulta',
    titulo: 'Resumo mostra alergia, condições e quem escreveu por último',
    situacao: 'A fisio acabou de escrever; quem abre a ficha da Dona Maria já vê a fisio como última atualização.',
    sql: `INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto)
          SELECT a.id, a.paciente_id, a.profissional_id, 'evolucao', 'Isometria de quadríceps, joelho direito sem carga.'
            FROM atendimento a WHERE a.id = ${AT_MARIA_FISIO}`,
    verificacao: `SELECT alergias @> '[{"substancia": "Dipirona", "gravidade": "grave"}]'
                         AND cardinality(especialidades) >= 4
                         AND ultimo_registro_por = 'Camila Rocha'
                         AND ultimo_registro_em = now() AS ok,
                         'alergia: ' || (alergias -> 0 ->> 'substancia') || ' (' || (alergias -> 0 ->> 'gravidade') || '); '
                         || jsonb_array_length(condicoes) || ' condições; '
                         || array_to_string(especialidades, ', ') || '; último registro: ' || ultimo_registro_por AS obtido
                    FROM vw_resumo_paciente WHERE id = ${MARIA}`,
    espera: { ok: true },
  },
]
