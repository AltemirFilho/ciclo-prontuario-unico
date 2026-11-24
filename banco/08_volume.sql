-- =====================================================================
-- 08_volume.sql · três anos de clínica, para medir os índices
--
-- Com 6 pacientes qualquer consulta é instantânea, com ou sem índice.
-- Para o teste de antes e depois fazer sentido, geramos milhares de
-- pacientes e centenas de milhares de registros, com textos típicos
-- de cada especialidade. É tudo sintético e reproduzível (setseed).
--
-- Quantidades (podem ser trocadas antes de rodar):
--   ciclo.vol_pacientes     padrão 5000
--   ciclo.vol_atendimentos  padrão 80000  (gera perto de 180 mil registros)
-- =====================================================================

SET TIME ZONE 'America/Maceio';
SET ciclo.carga_historica = 'on';
SELECT setseed(0.2026);


-- ---------------------------------------------------------------------
-- Pacientes
-- ---------------------------------------------------------------------
INSERT INTO paciente (nome, cpf, data_nascimento, telefone, criado_em)
SELECT nome, cpf, nascimento, telefone, criado_em
  FROM (
    SELECT (ARRAY['Maria','Ana','Francisca','Antônia','Adriana','Juliana','Márcia','Fernanda',
                  'Patrícia','Aline','Sandra','Camila','Amanda','Bruna','Jéssica','Letícia',
                  'Júlia','Luciana','Vanessa','Mariana','José','João','Antônio','Francisco',
                  'Carlos','Paulo','Pedro','Lucas','Luiz','Marcos','Gabriel','Rafael',
                  'Daniel','Marcelo','Bruno','Eduardo','Felipe','Raimundo','Rodrigo','Thiago'])
                  [1 + floor(random() * 40)::int]
           || ' ' ||
           (ARRAY['Silva','Santos','Oliveira','Souza','Lima','Pereira','Ferreira','Costa',
                  'Rodrigues','Almeida','Nascimento','Alves','Carvalho','Araújo','Ribeiro',
                  'Gomes','Barbosa','Rocha','Menezes','Andrade','Cardoso','Teixeira','Moura',
                  'Batista','Freitas','Conceição','Vieira','Monteiro','Mendes','Dantas'])
                  [1 + floor(random() * 30)::int]
           || ' ' ||
           (ARRAY['Silva','Santos','Oliveira','Souza','Lima','Pereira','Ferreira','Costa',
                  'Rodrigues','Almeida','Nascimento','Alves','Carvalho','Araújo','Ribeiro',
                  'Gomes','Barbosa','Rocha','Menezes','Andrade','Cardoso','Teixeira','Moura',
                  'Batista','Freitas','Conceição','Vieira','Monteiro','Mendes','Dantas'])
                  [1 + floor(random() * 30)::int]                         AS nome,
           gerar_cpf(lpad(((g * 104729::bigint) % 1000000000)::text, 9, '0')) AS cpf,
           DATE '1940-01-01' + floor(random() * 29000)::int                AS nascimento,
           '799' || lpad(floor(random() * 100000000)::bigint::text, 8, '0') AS telefone,
           now() - make_interval(days => floor(random() * 1500)::int)       AS criado_em
      FROM generate_series(1, coalesce(current_setting('ciclo.vol_pacientes', true), '5000')::int) g
  ) gerados
 WHERE cpf_valido(cpf)
ON CONFLICT (cpf) DO NOTHING;


-- ---------------------------------------------------------------------
-- Alergias (cerca de 12% dos pacientes) e condições (cerca de 35%)
-- ---------------------------------------------------------------------
INSERT INTO alergia (paciente_id, substancia, gravidade, registrada_por, registrada_em)
SELECT p.id,
       (ARRAY['Dipirona','Penicilina','Amoxicilina','Ibuprofeno','Sulfa','Látex',
              'Frutos do mar','Lactose','Iodo','AAS'])[1 + floor(random() * 10)::int],
       (ARRAY['leve','moderada','grave'])[1 + floor(random() * 3)::int]::gravidade_alergia,
       (SELECT id FROM profissional WHERE nome = 'Rafael Menezes'),
       p.criado_em
  FROM paciente p
 WHERE p.cpf NOT IN ('18398029609','14041343526','43729576020','75770780770','83113838398','36639664534')
   AND random() < 0.12
ON CONFLICT DO NOTHING;

INSERT INTO condicao (paciente_id, cid10, descricao, desde, registrada_por)
SELECT x.id, c.cids[x.i], c.descricoes[x.i], x.criado_em::date,
       (SELECT id FROM profissional WHERE nome = 'Helena Prado')
  FROM (SELECT p.id, p.criado_em, 1 + floor(random() * 8)::int AS i
          FROM paciente p
         WHERE p.cpf NOT IN ('18398029609','14041343526','43729576020','75770780770','83113838398','36639664534')
           AND random() < 0.35) x
  CROSS JOIN (SELECT ARRAY['E11','I10','M54.5','J45.9','F41.1','E66.9','M17.1','K21.9'] AS cids,
                     ARRAY['Diabetes mellitus tipo 2','Hipertensão essencial','Dor lombar baixa','Asma',
                           'Ansiedade generalizada','Obesidade','Artrose primária do joelho',
                           'Refluxo gastroesofágico'] AS descricoes) c;


-- ---------------------------------------------------------------------
-- Atendimentos dos últimos 3 anos (dias úteis, 7h às 18h)
-- ---------------------------------------------------------------------
CREATE TEMP TABLE equipe AS
SELECT row_number() OVER (ORDER BY pr.id) AS n,
       pr.id,
       CASE e.nome
            WHEN 'Medicina'     THEN CASE WHEN pr.id % 2 = 0 THEN 'Consultório 2' ELSE 'Consultório 1' END
            WHEN 'Enfermagem'   THEN 'Sala de Enfermagem'
            WHEN 'Fisioterapia' THEN 'Ginásio de Fisioterapia'
            WHEN 'Nutrição'     THEN 'Consultório de Nutrição'
            ELSE 'Sala de Psicologia'
       END AS sala
  FROM profissional pr
  JOIN especialidade e ON e.id = pr.especialidade_id
 WHERE pr.ativo;

CREATE TEMP TABLE fila_pacientes AS
SELECT row_number() OVER (ORDER BY id) AS n, id
  FROM paciente
 WHERE cpf NOT IN ('18398029609','14041343526','43729576020','75770780770','83113838398','36639664534');

INSERT INTO atendimento (paciente_id, profissional_id, sala, inicio, fim, status)
SELECT fp.id, eq.id, eq.sala, x.inicio,
       CASE WHEN x.status = 'concluido' THEN x.inicio + interval '40 minutes' END,
       x.status
  FROM (
    SELECT 1 + floor(random() * (SELECT count(*) FROM fila_pacientes))::int AS pac_n,
           1 + floor(random() * (SELECT count(*) FROM equipe))::int         AS prof_n,
           date_trunc('day', now())
             - make_interval(days => 1 + floor(random() * 1095)::int)
             + make_interval(hours => 7 + floor(random() * 11)::int,
                             mins  => (ARRAY[0, 20, 40])[1 + floor(random() * 3)::int]) AS inicio,
           CASE WHEN random() < 0.90 THEN 'concluido'
                WHEN random() < 0.60 THEN 'faltou'
                ELSE 'cancelado'
           END::status_atendimento AS status
      FROM generate_series(1, coalesce(current_setting('ciclo.vol_atendimentos', true), '80000')::int)
  ) x
  JOIN fila_pacientes fp ON fp.n = x.pac_n
  JOIN equipe         eq ON eq.n = x.prof_n;


-- ---------------------------------------------------------------------
-- Registros clínicos: de 1 a 4 por atendimento concluído
-- ---------------------------------------------------------------------
INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto, medidas, sigiloso, criado_em)
SELECT a.id, a.paciente_id, a.profissional_id,
       CASE WHEN k = 1 THEN 'evolucao'
            ELSE (ARRAY['prescricao','orientacao','exame','encaminhamento'])[1 + floor(random() * 4)::int]
       END::tipo_registro,
       CASE e.nome
         WHEN 'Medicina' THEN (ARRAY[
            'Retorno para controle da pressão. Mantida a medicação, orientado a reduzir o sal.',
            'Queixa de cansaço há duas semanas. Pedido de hemograma e TSH.',
            'Glicemia de jejum dentro da meta. Mantido o tratamento atual.',
            'Dor de garganta há 3 dias, sem febre. Orientado repouso e hidratação.',
            'Revisão de exames: colesterol LDL acima da meta, iniciada estatina.'])[1 + floor(random() * 5)::int]
         WHEN 'Enfermagem' THEN (ARRAY[
            'Sinais vitais aferidos antes da consulta, paciente sem queixas.',
            'Curativo realizado em lesão de pé, sem sinais de infecção.',
            'Vacina aplicada no braço esquerdo, orientado sobre dor local.',
            'Glicemia capilar aferida e anotada, paciente em jejum desde as 22h.',
            'Orientação sobre uso correto da medicação em casa.'])[1 + floor(random() * 5)::int]
         WHEN 'Fisioterapia' THEN (ARRAY[
            'Exercícios de fortalecimento de quadríceps e glúteos, boa tolerância.',
            'Treino de equilíbrio e marcha, sem episódios de tontura.',
            'Alongamento de cadeia posterior e mobilidade lombar.',
            'Relata melhora da dor ao acordar, progressão de carga.',
            'Liberação miofascial e exercícios de controle motor.'])[1 + floor(random() * 5)::int]
         WHEN 'Nutrição' THEN (ARRAY[
            'Revisado o recordatório alimentar, boa adesão ao plano no café da manhã.',
            'Dificuldade com o jantar, ajustado o horário da última refeição.',
            'Orientado aumento da ingestão de água e fibras.',
            'Perda de peso dentro do esperado para o mês.',
            'Substituições sugeridas para o lanche da tarde.'])[1 + floor(random() * 5)::int]
         ELSE (ARRAY[
            'Sessão de acompanhamento, trabalhadas estratégias para lidar com a ansiedade.',
            'Relata semana difícil no trabalho, trabalhamos a organização da rotina.',
            'Boa evolução, menos episódios de insônia.',
            'Retomado o tema da família, paciente mais aberto para falar.',
            'Combinado registro diário de emoções até a próxima sessão.'])[1 + floor(random() * 5)::int]
       END,
       CASE e.nome
         WHEN 'Fisioterapia' THEN jsonb_build_object('dor', floor(random() * 11)::int)
         WHEN 'Nutrição'     THEN jsonb_build_object('peso_kg', round((50 + random() * 60)::numeric, 1))
         WHEN 'Enfermagem'   THEN jsonb_build_object('pa', (100 + floor(random() * 60))::int || 'x' || (60 + floor(random() * 35))::int,
                                                    'glicemia', (70 + floor(random() * 150))::int)
         WHEN 'Medicina'     THEN jsonb_build_object('pa', (100 + floor(random() * 60))::int || 'x' || (60 + floor(random() * 35))::int,
                                                    'fc', (55 + floor(random() * 50))::int)
         ELSE '{}'::jsonb
       END,
       (e.nome = 'Psicologia' AND k = 1),
       a.inicio + make_interval(mins => 5 + k * 8)
  FROM atendimento a
  JOIN profissional  pr ON pr.id = a.profissional_id
  JOIN especialidade e  ON e.id  = pr.especialidade_id
  CROSS JOIN LATERAL generate_series(1, 1 + (a.id % 4)) AS k
 WHERE a.status = 'concluido'
   AND a.inicio < date_trunc('day', now())
   AND a.paciente_id IN (SELECT id FROM fila_pacientes);


-- ---------------------------------------------------------------------
-- Agenda de hoje para cada profissional (pacientes sintéticos)
-- ---------------------------------------------------------------------
INSERT INTO atendimento (paciente_id, profissional_id, sala, inicio, fim, status)
SELECT fp.id, eq.id, eq.sala, h.inicio,
       CASE WHEN h.inicio + interval '40 minutes' < now() THEN h.inicio + interval '40 minutes' END,
       CASE WHEN h.inicio + interval '40 minutes' < now() THEN 'concluido' ELSE 'agendado' END::status_atendimento
  FROM equipe eq
  CROSS JOIN LATERAL (
        SELECT date_trunc('day', now()) + make_interval(hours => 7 + s * 2, mins => 20) AS inicio, s
          FROM generate_series(0, 5) s
  ) h
  JOIN fila_pacientes fp ON fp.n = 1 + ((eq.id * 37 + h.s * 101) % (SELECT count(*) FROM fila_pacientes));


-- ---------------------------------------------------------------------
-- Auditoria: uma leitura e uma escrita para cada registro gerado
-- ---------------------------------------------------------------------
INSERT INTO acesso_prontuario (paciente_id, profissional_id, acao, momento)
SELECT r.paciente_id, r.profissional_id, 'leitura'::acao_acesso, r.criado_em - interval '3 minutes'
  FROM registro_clinico r
 WHERE r.paciente_id IN (SELECT id FROM fila_pacientes)
UNION ALL
SELECT r.paciente_id, r.profissional_id, 'escrita'::acao_acesso, r.criado_em
  FROM registro_clinico r
 WHERE r.paciente_id IN (SELECT id FROM fila_pacientes);

DROP TABLE equipe;
DROP TABLE fila_pacientes;
RESET ciclo.carga_historica;

-- estatísticas atualizadas para o planejador escolher bem os caminhos
ANALYZE;
