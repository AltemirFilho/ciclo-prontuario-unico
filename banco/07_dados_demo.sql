-- =====================================================================
-- 07_dados_demo.sql · a clínica de demonstração
--
-- Clínica Ciclo Saúde Integrada (fictícia), Aracaju/SE.
-- Pessoas, CPFs e histórias são inventados. Os CPFs passam no cálculo
-- dos dígitos verificadores porque foram gerados para isso.
--
-- As datas são relativas ao dia em que o banco é criado ("hoje",
-- "há 90 dias"). Assim a demonstração sempre parece o dia de hoje.
-- =====================================================================

SET TIME ZONE 'America/Maceio';      -- fuso de Aracaju
SET ciclo.carga_historica = 'on';    -- carga de histórico: mantém as datas antigas


-- ---------------------------------------------------------------------
-- gerar_cpf(9 dígitos): completa os dígitos verificadores.
-- Só serve para criar dados de teste.
-- ---------------------------------------------------------------------
CREATE FUNCTION gerar_cpf(p_base text)
RETURNS char(11)
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
    d    int[] := string_to_array(p_base, NULL)::int[];
    soma int := 0;
    dv   int;
BEGIN
    FOR i IN 1..9 LOOP soma := soma + d[i] * (11 - i); END LOOP;
    dv := (soma * 10) % 11; IF dv = 10 THEN dv := 0; END IF;
    d := d || dv;
    soma := 0;
    FOR i IN 1..10 LOOP soma := soma + d[i] * (12 - i); END LOOP;
    dv := (soma * 10) % 11; IF dv = 10 THEN dv := 0; END IF;
    RETURN p_base || d[10]::text || dv::text;
END;
$$;


-- ---------------------------------------------------------------------
-- Especialidades e equipe
-- ---------------------------------------------------------------------
INSERT INTO especialidade (nome, conselho) VALUES
    ('Medicina',     'CRM'),
    ('Enfermagem',   'COREN'),
    ('Fisioterapia', 'CREFITO'),
    ('Nutrição',     'CRN'),
    ('Psicologia',   'CRP');

INSERT INTO profissional (nome, especialidade_id, registro_conselho, uf_conselho, ativo)
SELECT v.nome, e.id, v.registro, 'SE', v.ativo
  FROM (VALUES
        ('Helena Prado',         'Medicina',     '4821',     true),
        ('Rafael Menezes',       'Medicina',     '5103',     true),
        ('Patrícia Lima',        'Enfermagem',   '312455',   true),
        ('Camila Rocha',         'Fisioterapia', '98321-F',  true),
        ('Bruno Tavares',        'Fisioterapia', '101544-F', true),
        ('Lucas Barreto',        'Nutrição',     '11873',    true),
        ('Renata Vasconcelos',   'Psicologia',   '3390',     true),
        ('Fernando Costa',       'Medicina',     '2977',     false)   -- saiu da clínica
       ) AS v (nome, especialidade, registro, ativo)
  JOIN especialidade e ON e.nome = v.especialidade;


-- ---------------------------------------------------------------------
-- Pacientes com história (os que aparecem na apresentação)
-- ---------------------------------------------------------------------
INSERT INTO paciente (nome, cpf, cns, data_nascimento, telefone, criado_em) VALUES
    ('Maria das Graças Souza',        '18398029609', '700509879465213', DATE '1959-03-12', '79991234567', now() - interval '2 years'),
    ('José Carlos Santos',            '14041343526', NULL,              DATE '1980-07-22', '79998765432', now() - interval '1 year'),
    ('Ana Beatriz Lima',              '43729576020', NULL,              DATE '1992-11-05', '79996543210', now() - interval '5 months'),
    ('João Pedro da Conceição',       '75770780770', '898001234567891', DATE '2017-05-14', '79988887777', now() - interval '3 years'),
    ('Francisca Alves de Oliveira',   '83113838398', NULL,              DATE '1949-01-30', '7932114455',  now() - interval '4 years'),
    ('Carlos Eduardo Menezes Neto',   '36639664534', NULL,              DATE '1975-09-09', '79981112233', now() - interval '8 months');


-- ---------------------------------------------------------------------
-- Ajudantes temporários (somem quando a sessão termina)
-- ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.dia(p_dias_atras integer, p_hora text)
RETURNS timestamptz LANGUAGE sql AS $$
    SELECT date_trunc('day', now()) - make_interval(days => p_dias_atras) + p_hora::interval;
$$;

CREATE FUNCTION pg_temp.atender(p_pac integer, p_prof integer, p_sala text,
                                p_inicio timestamptz, p_status status_atendimento DEFAULT 'concluido')
RETURNS integer LANGUAGE sql AS $$
    INSERT INTO atendimento (paciente_id, profissional_id, sala, inicio, fim, status)
    VALUES (p_pac, p_prof, p_sala, p_inicio,
            CASE WHEN p_status = 'concluido' THEN p_inicio + interval '40 minutes' END,
            p_status)
    RETURNING id;
$$;

CREATE FUNCTION pg_temp.escrever(p_at integer, p_tipo tipo_registro, p_texto text,
                                 p_medidas jsonb DEFAULT '{}', p_minuto integer DEFAULT 15,
                                 p_sigiloso boolean DEFAULT false, p_retifica bigint DEFAULT NULL)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO registro_clinico (atendimento_id, paciente_id, profissional_id, tipo, texto,
                                  medidas, sigiloso, retifica_id, criado_em)
    SELECT a.id, a.paciente_id, a.profissional_id, p_tipo, p_texto,
           p_medidas, p_sigiloso, p_retifica, a.inicio + make_interval(mins => p_minuto)
      FROM atendimento a
     WHERE a.id = p_at
    RETURNING id;
$$;


-- ---------------------------------------------------------------------
-- As histórias
-- ---------------------------------------------------------------------
DO $$
DECLARE
    -- pacientes
    maria int; jose int; ana int; joao int; francisca int; carlos int;
    -- equipe
    helena int; rafael int; patricia int; camila int; bruno int; lucas int; renata int;
    -- auxiliares
    at int;
    r  bigint;
    agora timestamptz := date_trunc('minute', now());
BEGIN
    SELECT id INTO maria     FROM paciente WHERE cpf = '18398029609';
    SELECT id INTO jose      FROM paciente WHERE cpf = '14041343526';
    SELECT id INTO ana       FROM paciente WHERE cpf = '43729576020';
    SELECT id INTO joao      FROM paciente WHERE cpf = '75770780770';
    SELECT id INTO francisca FROM paciente WHERE cpf = '83113838398';
    SELECT id INTO carlos    FROM paciente WHERE cpf = '36639664534';

    SELECT id INTO helena   FROM profissional WHERE nome = 'Helena Prado';
    SELECT id INTO rafael   FROM profissional WHERE nome = 'Rafael Menezes';
    SELECT id INTO patricia FROM profissional WHERE nome = 'Patrícia Lima';
    SELECT id INTO camila   FROM profissional WHERE nome = 'Camila Rocha';
    SELECT id INTO bruno    FROM profissional WHERE nome = 'Bruno Tavares';
    SELECT id INTO lucas    FROM profissional WHERE nome = 'Lucas Barreto';
    SELECT id INTO renata   FROM profissional WHERE nome = 'Renata Vasconcelos';

    -- =================================================================
    -- DONA MARIA, 67 anos. Diabética, hipertensa, dor no joelho.
    -- Passa por clínico, enfermagem, nutrição e fisioterapia.
    -- No papel, a alergia grave a dipirona ficava no consultório 1.
    -- =================================================================
    INSERT INTO condicao (paciente_id, cid10, descricao, desde, registrada_por) VALUES
        (maria, 'E11',   'Diabetes mellitus tipo 2',     DATE '2015-06-01', helena),
        (maria, 'I10',   'Hipertensão essencial',        DATE '2012-03-01', helena),
        (maria, 'M17.1', 'Artrose primária do joelho',   DATE '2026-07-20', helena);
    INSERT INTO alergia (paciente_id, substancia, reacao, gravidade, registrada_por, registrada_em) VALUES
        (maria, 'Dipirona', 'Edema de glote em 2019, precisou de pronto-socorro', 'grave', helena, pg_temp.dia(120, '08:50'));

    at := pg_temp.atender(maria, helena, 'Consultório 1', pg_temp.dia(120, '08:30'));
    PERFORM pg_temp.escrever(at, 'anamnese',
        'Paciente de 67 anos, diabética há 11 anos e hipertensa. Dor no joelho direito ao subir escadas e ao levantar da cadeira há 3 meses. Nega quedas. Refere alergia GRAVE a dipirona (edema de glote em 2019).',
        '{"pa": "150x90", "fc": 84}', 15);
    r := pg_temp.escrever(at, 'prescricao',
        'Losartana 50 mg, 1 comprimido ao dia. Metformina 850 mg, 3 vezes ao dia. Para dor: paracetamol 750 mg até 6/6h. Não usar dipirona.',
        '{}', 30);
    -- uma hora depois a médica percebe o erro de dose e retifica (não apaga)
    PERFORM pg_temp.escrever(at, 'prescricao',
        'Retificação: a metformina é 850 mg 2 vezes ao dia (após café e jantar), e não 3. O restante da prescrição está mantido.',
        '{}', 95, false, r);
    PERFORM pg_temp.escrever(at, 'encaminhamento',
        'Encaminho para fisioterapia (fortalecimento de quadríceps) e nutrição (controle glicêmico e perda de peso). Pedido de hemoglobina glicada.',
        '{}', 35);

    at := pg_temp.atender(maria, patricia, 'Sala de Enfermagem', pg_temp.dia(119, '07:40'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Coleta de sangue em jejum para hemoglobina glicada. Glicemia capilar 182 mg/dL. Orientada sobre sinais de hipoglicemia e hidratação.',
        '{"pa": "148x92", "glicemia": 182}', 10);

    at := pg_temp.atender(maria, lucas, 'Consultório de Nutrição', pg_temp.dia(110, '14:00'));
    PERFORM pg_temp.escrever(at, 'anamnese',
        'Recordatório: café com pão branco e cuscuz com manteiga, almoço com arroz, feijão e farofa, refrigerante 4 vezes por semana. Caminha pouco por causa do joelho. Meta: perder 4 kg em 3 meses.',
        '{"peso_kg": 82.4, "altura_cm": 158, "imc": 33.0}', 20);
    PERFORM pg_temp.escrever(at, 'prescricao',
        'Plano alimentar com troca do pão branco por integral, cuscuz sem manteiga, feijão sem farofa e refrigerante só no fim de semana. Fracionar em 5 refeições.',
        '{}', 35);

    at := pg_temp.atender(maria, camila, 'Ginásio de Fisioterapia', pg_temp.dia(105, '10:00'));
    PERFORM pg_temp.escrever(at, 'anamnese',
        'Avaliação: dor no joelho direito ao subir escadas, força de quadríceps grau 4, sem derrame articular. Plano: fortalecimento 2 vezes por semana por 8 semanas.',
        '{"dor": 7}', 25);
    at := pg_temp.atender(maria, camila, 'Ginásio de Fisioterapia', pg_temp.dia(84, '10:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Sessão 6. Realizou agachamento parcial com apoio e ponte. Relata menos dor para levantar da cadeira.',
        '{"dor": 5}', 30);
    at := pg_temp.atender(maria, camila, 'Ginásio de Fisioterapia', pg_temp.dia(63, '10:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Sessão 12. Sobe 1 lance de escada sem apoio. Progressão de carga no leg press.',
        '{"dor": 4}', 30);

    at := pg_temp.atender(maria, lucas, 'Consultório de Nutrição', pg_temp.dia(45, '14:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Trocou o refrigerante por água com limão. Ainda belisca à noite. Perdeu 2,3 kg.',
        '{"peso_kg": 80.1}', 20);

    at := pg_temp.atender(maria, helena, 'Consultório 1', pg_temp.dia(30, '08:30'));
    PERFORM pg_temp.escrever(at, 'exame',
        'Hemoglobina glicada 7,4% (antes 8,6%). Melhora importante com dieta e medicação.',
        '{"pa": "136x86"}', 15);

    -- HOJE de manhã: a médica muda a conduta. No papel, a fisio só saberia
    -- quando a ficha descesse do consultório 1.
    at := pg_temp.atender(maria, patricia, 'Sala de Enfermagem', agora - interval '4 hours');
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Triagem antes da consulta. Joelho direito com aumento de volume desde o fim de semana.',
        '{"pa": "138x88", "glicemia": 131}', 8);
    at := pg_temp.atender(maria, helena, 'Consultório 1', agora - interval '3 hours 30 minutes');
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Retorno. Derrame articular leve no joelho direito após caminhada longa no fim de semana. Pedido de ultrassom. Fisioterapia: suspender exercícios com carga no joelho direito por 7 dias, manter só isometria.',
        '{"pa": "134x84", "fc": 78}', 20);
    -- agora mesmo ela está na fisio
    PERFORM pg_temp.atender(maria, camila, 'Ginásio de Fisioterapia', agora - interval '10 minutes', 'em_atendimento');
    PERFORM pg_temp.atender(maria, lucas,  'Consultório de Nutrição', agora + interval '2 hours', 'agendado');

    -- =================================================================
    -- JOSÉ CARLOS, 46 anos. Dor lombar e ansiedade.
    -- A psicologia escreve no mesmo prontuário, com sigilo.
    -- =================================================================
    INSERT INTO condicao (paciente_id, cid10, descricao, desde, registrada_por) VALUES
        (jose, 'M54.5', 'Dor lombar baixa',              DATE '2026-05-10', rafael),
        (jose, 'F41.1', 'Ansiedade generalizada',        DATE '2026-06-02', rafael);

    at := pg_temp.atender(jose, rafael, 'Consultório 2', pg_temp.dia(170, '09:00'));
    PERFORM pg_temp.escrever(at, 'anamnese',
        'Motorista de aplicativo, 10 horas por dia sentado. Dor lombar há 4 meses, sem irradiação para as pernas. Dorme mal e se diz preocupado com dinheiro.',
        '{"pa": "128x82", "fc": 88}', 15);
    PERFORM pg_temp.escrever(at, 'encaminhamento',
        'Encaminho para fisioterapia (lombalgia mecânica) e psicologia (sintomas ansiosos que pioram a dor).',
        '{}', 30);

    at := pg_temp.atender(jose, bruno, 'Ginásio de Fisioterapia', pg_temp.dia(160, '17:00'));
    PERFORM pg_temp.escrever(at, 'anamnese',
        'Dor lombar que piora no fim do dia. Teste de elevação da perna estendida negativo. Plano: controle motor e pausas ativas a cada 2 horas de direção.',
        '{"dor": 8}', 25);

    at := pg_temp.atender(jose, renata, 'Sala de Psicologia', pg_temp.dia(150, '18:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Primeira sessão. Relata dívida com o carro financiado e brigas em casa por causa das horas trabalhadas. Choro ao falar do filho. Combinado acompanhamento semanal.',
        '{}', 50, true);
    PERFORM pg_temp.escrever(at, 'orientacao',
        'Para a equipe: paciente responde bem a metas curtas e concretas. Evitar falar em afastamento do trabalho sem preparo, aumenta a ansiedade.',
        '{}', 55);

    at := pg_temp.atender(jose, bruno, 'Ginásio de Fisioterapia', pg_temp.dia(120, '17:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Fez as pausas na maior parte dos dias. Prancha 3x30 s sem dor.',
        '{"dor": 5}', 30);
    at := pg_temp.atender(jose, renata, 'Sala de Psicologia', pg_temp.dia(90, '18:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Sessão 8. Conseguiu renegociar a dívida. Dorme melhor. Trabalhamos respiração para os engarrafamentos.',
        '{}', 50, true);
    at := pg_temp.atender(jose, bruno, 'Ginásio de Fisioterapia', pg_temp.dia(60, '17:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Sem dor ao fim do expediente em 4 dos últimos 5 dias. Alta programada em 1 mês.',
        '{"dor": 2}', 30);

    PERFORM pg_temp.atender(jose, rafael, 'Consultório 2', agora - interval '5 hours', 'concluido');
    PERFORM pg_temp.atender(jose, bruno,  'Ginásio de Fisioterapia', agora + interval '20 minutes', 'agendado');
    PERFORM pg_temp.atender(jose, renata, 'Sala de Psicologia', agora + interval '3 hours', 'agendado');

    -- =================================================================
    -- ANA BEATRIZ, 34 anos. Pós-operatório de ligamento do joelho.
    -- =================================================================
    INSERT INTO condicao (paciente_id, cid10, descricao, desde, registrada_por) VALUES
        (ana, 'S83.5', 'Lesão do ligamento cruzado anterior (pós-operatório)', DATE '2026-08-18', rafael);

    at := pg_temp.atender(ana, bruno, 'Ginásio de Fisioterapia', pg_temp.dia(90, '07:30'));
    PERFORM pg_temp.escrever(at, 'anamnese',
        'Reconstrução do LCA do joelho esquerdo há 3 semanas. Marcha com muletas, flexão de 70 graus. Objetivo dela: voltar ao vôlei de praia.',
        '{"dor": 6}', 25);
    at := pg_temp.atender(ana, lucas, 'Consultório de Nutrição', pg_temp.dia(75, '12:30'));
    PERFORM pg_temp.escrever(at, 'prescricao',
        'Aumentar proteína para 1,6 g/kg/dia para ajudar na recuperação muscular. Sugerido iogurte natural e ovos no lanche.',
        '{"peso_kg": 61.5, "altura_cm": 167}', 25);
    at := pg_temp.atender(ana, bruno, 'Ginásio de Fisioterapia', pg_temp.dia(20, '07:30'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Flexão de 125 graus, marcha sem muletas, início de corrida leve na esteira.',
        '{"dor": 2}', 30);
    PERFORM pg_temp.atender(ana, bruno, 'Ginásio de Fisioterapia', agora + interval '1 hour 20 minutes', 'agendado');

    -- =================================================================
    -- JOÃO PEDRO, 9 anos. Asma, alergia a amoxicilina.
    -- É o nome que a recepção digita sem acento e com erro.
    -- =================================================================
    INSERT INTO condicao (paciente_id, cid10, descricao, desde, registrada_por) VALUES
        (joao, 'J45.9', 'Asma', DATE '2021-04-01', helena);
    INSERT INTO alergia (paciente_id, substancia, reacao, gravidade, registrada_por, registrada_em) VALUES
        (joao, 'Amoxicilina', 'Urticária no corpo todo', 'moderada', helena, pg_temp.dia(400, '10:00'));

    at := pg_temp.atender(joao, helena, 'Consultório 1', pg_temp.dia(40, '10:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Duas crises de chiado no último mês, ambas à noite. Mãe conta que há mofo no quarto. Ajustada a dose da bombinha de manutenção.',
        '{"fc": 96}', 15);
    PERFORM pg_temp.escrever(at, 'orientacao',
        'Orientada a mãe sobre limpeza do mofo e uso do espaçador. Retorno em 30 dias.',
        '{}', 25);
    PERFORM pg_temp.atender(joao, helena, 'Consultório 1', agora + interval '30 minutes', 'agendado');

    -- =================================================================
    -- DONA FRANCISCA, 77 anos. Hipertensa, alergia grave a penicilina.
    -- Faltou à fisioterapia na semana passada.
    -- =================================================================
    INSERT INTO condicao (paciente_id, cid10, descricao, desde, registrada_por) VALUES
        (francisca, 'I10', 'Hipertensão essencial', DATE '2005-01-01', rafael);
    INSERT INTO alergia (paciente_id, substancia, reacao, gravidade, registrada_por, registrada_em) VALUES
        (francisca, 'Penicilina', 'Choque anafilático em 1998', 'grave', rafael, pg_temp.dia(900, '09:00'));

    at := pg_temp.atender(francisca, camila, 'Ginásio de Fisioterapia', pg_temp.dia(21, '15:00'));
    PERFORM pg_temp.escrever(at, 'anamnese',
        'Duas quedas em casa nos últimos 6 meses. Levanta da cadeira com apoio das mãos. Plano: treino de equilíbrio e marcha.',
        '{"dor": 3}', 25);
    PERFORM pg_temp.atender(francisca, camila, 'Ginásio de Fisioterapia', pg_temp.dia(7, '15:00'), 'faltou');
    PERFORM pg_temp.atender(francisca, patricia, 'Sala de Enfermagem', agora + interval '40 minutes', 'agendado');
    PERFORM pg_temp.atender(francisca, camila, 'Ginásio de Fisioterapia', agora + interval '50 minutes', 'agendado');

    -- =================================================================
    -- CARLOS EDUARDO, 51 anos. Diabetes e obesidade, compulsão alimentar.
    -- =================================================================
    INSERT INTO condicao (paciente_id, cid10, descricao, desde, registrada_por) VALUES
        (carlos, 'E11',   'Diabetes mellitus tipo 2', DATE '2023-02-01', rafael),
        (carlos, 'E66.9', 'Obesidade',                DATE '2023-02-01', rafael);

    at := pg_temp.atender(carlos, lucas, 'Consultório de Nutrição', pg_temp.dia(60, '16:00'));
    PERFORM pg_temp.escrever(at, 'anamnese',
        'Come rápido e em grande quantidade quando chega do trabalho. Já tentou 4 dietas. Pediu ajuda para "parar de atacar a geladeira".',
        '{"peso_kg": 118.0, "altura_cm": 176}', 25);
    at := pg_temp.atender(carlos, renata, 'Sala de Psicologia', pg_temp.dia(50, '19:00'));
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Episódios de compulsão ligados a cobrança no trabalho. Registro diário de emoções combinado.',
        '{}', 50, true);
    at := pg_temp.atender(carlos, renata, 'Sala de Psicologia', agora - interval '2 hours');
    PERFORM pg_temp.escrever(at, 'evolucao',
        'Sessão 6. Três episódios na semana, antes eram sete. Trouxe o registro preenchido.',
        '{}', 50, true);
    PERFORM pg_temp.atender(carlos, lucas, 'Consultório de Nutrição', agora + interval '40 minutes', 'agendado');
END;
$$;


-- ---------------------------------------------------------------------
-- Trilha de auditoria das histórias: cada registro antigo ganha a sua
-- escrita e uma leitura alguns minutos antes (o profissional abriu a
-- ficha, depois escreveu).
-- ---------------------------------------------------------------------
INSERT INTO acesso_prontuario (paciente_id, profissional_id, acao, momento)
SELECT paciente_id, profissional_id, 'leitura', criado_em - interval '4 minutes'
  FROM registro_clinico
UNION ALL
SELECT paciente_id, profissional_id,
       CASE WHEN retifica_id IS NULL THEN 'escrita' ELSE 'retificacao' END::acao_acesso,
       criado_em
  FROM registro_clinico;

RESET ciclo.carga_historica;
