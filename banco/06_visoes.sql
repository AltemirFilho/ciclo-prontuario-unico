-- =====================================================================
-- 06_visoes.sql · visões e funções de leitura
--
-- A tela não monta consulta na mão: ela chama estas visões e funções.
-- Assim a regra (o que mostrar, o que esconder, o que registrar na
-- auditoria) fica num lugar só, dentro do banco.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Resumo do paciente: o cabeçalho que TODO profissional vê ao abrir.
-- Alergias e condições ativas, quais especialidades o acompanham e
-- quem escreveu por último (resposta para "isso está atualizado?").
-- ---------------------------------------------------------------------
CREATE VIEW vw_resumo_paciente AS
SELECT
    p.id,
    p.nome,
    p.nome_social,
    p.cpf,
    p.cns,
    p.data_nascimento,
    date_part('year', age(p.data_nascimento))::int AS idade,
    coalesce(al.lista, '[]'::jsonb)                AS alergias,
    coalesce(co.lista, '[]'::jsonb)                AS condicoes,
    coalesce(es.lista, '{}'::varchar[])            AS especialidades,
    coalesce(es.total_atendimentos, 0)             AS total_atendimentos,
    ult.criado_em                                  AS ultimo_registro_em,
    ult.profissional                               AS ultimo_registro_por,
    ult.especialidade                              AS ultimo_registro_especialidade,
    ult.sala                                       AS ultimo_registro_sala
FROM paciente p
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id', a.id,
                                        'substancia', a.substancia,
                                        'gravidade',  a.gravidade,
                                        'reacao',     a.reacao)
                     ORDER BY a.gravidade DESC, a.substancia) AS lista
      FROM alergia a
     WHERE a.paciente_id = p.id
       AND a.ativa
) al ON true
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('cid10', c.cid10, 'descricao', c.descricao)
                     ORDER BY c.cid10) AS lista
      FROM condicao c
     WHERE c.paciente_id = p.id
       AND c.ativa
) co ON true
LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT e.nome ORDER BY e.nome) AS lista,
           count(*)                                    AS total_atendimentos
      FROM atendimento at
      JOIN profissional pr  ON pr.id = at.profissional_id
      JOIN especialidade e  ON e.id  = pr.especialidade_id
     WHERE at.paciente_id = p.id
       AND at.status = 'concluido'
) es ON true
LEFT JOIN LATERAL (
    SELECT r.criado_em, pr.nome AS profissional, e.nome AS especialidade, at.sala
      FROM registro_clinico r
      JOIN profissional pr  ON pr.id = r.profissional_id
      JOIN especialidade e  ON e.id  = pr.especialidade_id
      JOIN atendimento at   ON at.id = r.atendimento_id
     WHERE r.paciente_id = p.id
     ORDER BY r.criado_em DESC
     LIMIT 1
) ult ON true;


-- ---------------------------------------------------------------------
-- linha_do_tempo(paciente, quem_esta_lendo)
--
-- O prontuário inteiro, de todas as especialidades, do mais novo para
-- o mais antigo. Duas regras moram aqui:
--
--  1) Toda leitura deixa rastro em acesso_prontuario (LGPD).
--  2) Registro sigiloso (ex.: sessão de psicologia) aparece na linha
--     do tempo, mas o conteúdo só abre para a especialidade autora.
--     Os outros sabem que houve atendimento, não o que foi dito.
--     É o que a Resolução CFP nº 001/2009 pede para prontuário
--     compartilhado: registrar para a equipe só o necessário.
-- ---------------------------------------------------------------------
CREATE FUNCTION linha_do_tempo(p_paciente integer, p_leitor integer)
RETURNS TABLE (
    registro_id      bigint,
    criado_em        timestamptz,
    especialidade    varchar,
    profissional     varchar,
    profissional_id  integer,
    sala             varchar,
    tipo             tipo_registro,
    texto            text,
    medidas          jsonb,
    sigiloso         boolean,
    oculto           boolean,
    retifica_id      bigint,
    retificado_por   bigint
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
    v_esp_leitor smallint;
BEGIN
    SELECT pr.especialidade_id INTO v_esp_leitor
      FROM profissional pr
     WHERE pr.id = p_leitor;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            MESSAGE    = 'Leitura sem profissional identificado.',
            CONSTRAINT = 'regra_leitor_identificado';
    END IF;

    INSERT INTO acesso_prontuario (paciente_id, profissional_id, acao)
    VALUES (p_paciente, p_leitor, 'leitura');

    RETURN QUERY
    SELECT r.id,
           r.criado_em,
           e.nome,
           pr.nome,
           pr.id,
           at.sala,
           r.tipo,
           CASE WHEN r.sigiloso AND pr.especialidade_id <> v_esp_leitor
                THEN 'Conteúdo sigiloso, visível só para ' || e.nome || '.'
                ELSE r.texto
           END,
           CASE WHEN r.sigiloso AND pr.especialidade_id <> v_esp_leitor
                THEN '{}'::jsonb
                ELSE r.medidas
           END,
           r.sigiloso,
           (r.sigiloso AND pr.especialidade_id <> v_esp_leitor),
           r.retifica_id,
           rt.id
      FROM registro_clinico r
      JOIN profissional  pr ON pr.id = r.profissional_id
      JOIN especialidade e  ON e.id  = pr.especialidade_id
      JOIN atendimento   at ON at.id = r.atendimento_id
      LEFT JOIN registro_clinico rt ON rt.retifica_id = r.id
     WHERE r.paciente_id = p_paciente
     ORDER BY r.criado_em DESC, r.id DESC;
END;
$$;


-- ---------------------------------------------------------------------
-- buscar_paciente(termo): a busca da recepção.
-- Se o termo tem 11 dígitos, procura pelo CPF (índice único).
-- Senão, procura pelo nome sem acento e aceita erro de digitação
-- (operador <% do pg_trgm, que usa o índice ix_paciente_nome_busca).
-- ---------------------------------------------------------------------
CREATE FUNCTION buscar_paciente(p_termo text, p_limite integer DEFAULT 8)
RETURNS TABLE (
    id               integer,
    nome             varchar,
    cpf              char(11),
    data_nascimento  date,
    semelhanca       real
)
LANGUAGE plpgsql STABLE
AS $$
#variable_conflict use_column
DECLARE
    v_digitos text := regexp_replace(p_termo, '\D', '', 'g');
BEGIN
    IF length(v_digitos) = 11 THEN
        RETURN QUERY
        SELECT p.id, p.nome, p.cpf, p.data_nascimento, 1::real
          FROM paciente p
         WHERE p.cpf = v_digitos;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id, p.nome, p.cpf, p.data_nascimento,
           word_similarity(normalizar(p_termo), normalizar(p.nome))
      FROM paciente p
     WHERE normalizar(p_termo) <% normalizar(p.nome)
     ORDER BY 5 DESC, p.nome
     LIMIT p_limite;
END;
$$;


-- ---------------------------------------------------------------------
-- possiveis_duplicados(nome, nascimento): roda ANTES de cadastrar.
-- Mesma data de nascimento + nome parecido = provavelmente a mesma
-- pessoa. A tela mostra a lista e pergunta: "não é um destes?"
-- ---------------------------------------------------------------------
CREATE FUNCTION possiveis_duplicados(p_nome text, p_nascimento date)
RETURNS TABLE (
    id               integer,
    nome             varchar,
    cpf              char(11),
    data_nascimento  date,
    semelhanca       real
)
LANGUAGE sql STABLE
AS $$
    SELECT p.id, p.nome, p.cpf, p.data_nascimento,
           similarity(normalizar(p.nome), normalizar(p_nome))
      FROM paciente p
     WHERE p.data_nascimento = p_nascimento
       AND similarity(normalizar(p.nome), normalizar(p_nome)) >= 0.45
     ORDER BY 5 DESC
     LIMIT 5;
$$;


-- ---------------------------------------------------------------------
-- Agenda do dia (usa ix_atendimento_profissional_inicio)
-- ---------------------------------------------------------------------
CREATE VIEW vw_agenda_hoje AS
SELECT at.id              AS atendimento_id,
       at.inicio,
       at.fim,
       at.sala,
       at.status,
       at.profissional_id,
       p.id               AS paciente_id,
       p.nome             AS paciente,
       date_part('year', age(p.data_nascimento))::int AS idade,
       EXISTS (SELECT 1
                 FROM alergia a
                WHERE a.paciente_id = p.id
                  AND a.ativa
                  AND a.gravidade = 'grave') AS alerta_grave
  FROM atendimento at
  JOIN paciente p ON p.id = at.paciente_id
 WHERE at.inicio >= date_trunc('day', now())
   AND at.inicio <  date_trunc('day', now()) + interval '1 day';


-- ---------------------------------------------------------------------
-- Auditoria legível (quem, o quê, quando)
-- ---------------------------------------------------------------------
CREATE VIEW vw_auditoria AS
SELECT ac.id,
       ac.momento,
       ac.acao,
       ac.paciente_id,
       p.nome   AS paciente,
       pr.nome  AS profissional,
       e.nome   AS especialidade
  FROM acesso_prontuario ac
  JOIN paciente      p  ON p.id  = ac.paciente_id
  JOIN profissional  pr ON pr.id = ac.profissional_id
  JOIN especialidade e  ON e.id  = pr.especialidade_id;
