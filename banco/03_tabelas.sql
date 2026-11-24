-- =====================================================================
-- 03_tabelas.sql · tabelas e restrições
--
-- Convenção dos nomes das restrições (aparecem nas mensagens de erro
-- e nos testes):
--   pk_  chave primária        fk_  chave estrangeira
--   uq_  valor único           ck_  regra de conteúdo (CHECK)
--
-- Ideia central: UM paciente, UM prontuário. Todas as especialidades
-- escrevem na mesma tabela (registro_clinico), e cada linha sabe de
-- quem é, quem escreveu, em qual atendimento e em qual sala.
-- =====================================================================


-- ---------------------------------------------------------------------
-- especialidade: catálogo que cresce (a Ciclo começou na fisioterapia
-- e vai abrir para outras áreas). Por isso é tabela, e não ENUM:
-- especialidade nova entra com um INSERT, sem mexer na estrutura.
-- ---------------------------------------------------------------------
CREATE TABLE especialidade (
    id        smallint     GENERATED ALWAYS AS IDENTITY,
    nome      varchar(40)  NOT NULL,
    conselho  varchar(10)  NOT NULL,   -- CRM, COREN, CREFITO, CRN, CRP

    CONSTRAINT pk_especialidade      PRIMARY KEY (id),
    CONSTRAINT uq_especialidade_nome UNIQUE (nome)
);


-- ---------------------------------------------------------------------
-- profissional: quem atende. O registro no conselho identifica a
-- pessoa perante a lei; dois profissionais não podem ter o mesmo
-- número no mesmo conselho e estado.
-- ---------------------------------------------------------------------
CREATE TABLE profissional (
    id                 integer      GENERATED ALWAYS AS IDENTITY,
    nome               varchar(120) NOT NULL,
    especialidade_id   smallint     NOT NULL,
    registro_conselho  varchar(12)  NOT NULL,
    uf_conselho        char(2)      NOT NULL,
    ativo              boolean      NOT NULL DEFAULT true,

    CONSTRAINT pk_profissional               PRIMARY KEY (id),
    CONSTRAINT fk_profissional_especialidade FOREIGN KEY (especialidade_id)
                                             REFERENCES especialidade (id),
    CONSTRAINT uq_profissional_registro      UNIQUE (especialidade_id, uf_conselho, registro_conselho),
    CONSTRAINT ck_profissional_registro      CHECK (registro_conselho ~ '^[0-9]{3,8}(-[A-Z]{1,2})?$'),
    CONSTRAINT ck_profissional_uf            CHECK (uf_conselho ~ '^[A-Z]{2}$')
);


-- ---------------------------------------------------------------------
-- paciente: a identidade única. O CPF é a chave natural que a
-- recepção usa; o id é a chave interna que as outras tabelas usam
-- (número pequeno, nunca muda, não expõe dado pessoal).
-- ---------------------------------------------------------------------
CREATE TABLE paciente (
    id               integer       GENERATED ALWAYS AS IDENTITY,
    nome             varchar(150)  NOT NULL,
    nome_social      varchar(150),
    cpf              char(11)      NOT NULL,   -- só dígitos
    cns              char(15),                 -- Cartão Nacional de Saúde (opcional)
    data_nascimento  date          NOT NULL,
    telefone         varchar(11),              -- DDD + número, só dígitos
    criado_em        timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT pk_paciente            PRIMARY KEY (id),
    CONSTRAINT uq_paciente_cpf        UNIQUE (cpf),
    CONSTRAINT uq_paciente_cns        UNIQUE (cns),
    -- nome e sobrenome: "Maria" sozinha é o começo de uma ficha duplicada
    CONSTRAINT ck_paciente_nome       CHECK (btrim(nome) ~ '^\S+(\s+\S+)+$'),
    CONSTRAINT ck_paciente_cpf        CHECK (cpf_valido(cpf)),
    CONSTRAINT ck_paciente_cns        CHECK (cns ~ '^[0-9]{15}$'),
    -- a regra é conferida no momento da gravação
    CONSTRAINT ck_paciente_nascimento CHECK (data_nascimento BETWEEN DATE '1900-01-01' AND CURRENT_DATE),
    CONSTRAINT ck_paciente_telefone   CHECK (telefone ~ '^[0-9]{10,11}$')
);


-- ---------------------------------------------------------------------
-- alergia: o dado que mais machuca quando fica preso numa sala só.
-- Vale para todas as especialidades e aparece como alerta no topo.
-- A regra "uma alergia ativa por substância" é um índice único
-- parcial (ver 05_indices.sql), porque só vale enquanto ativa = true.
-- ---------------------------------------------------------------------
CREATE TABLE alergia (
    id              integer           GENERATED ALWAYS AS IDENTITY,
    paciente_id     integer           NOT NULL,
    substancia      varchar(80)       NOT NULL,
    reacao          varchar(200),
    gravidade       gravidade_alergia NOT NULL,
    registrada_por  integer           NOT NULL,
    registrada_em   timestamptz       NOT NULL DEFAULT now(),
    ativa           boolean           NOT NULL DEFAULT true,

    CONSTRAINT pk_alergia              PRIMARY KEY (id),
    CONSTRAINT fk_alergia_paciente     FOREIGN KEY (paciente_id) REFERENCES paciente (id),
    CONSTRAINT fk_alergia_profissional FOREIGN KEY (registrada_por) REFERENCES profissional (id),
    CONSTRAINT ck_alergia_substancia   CHECK (length(btrim(substancia)) >= 3)
);


-- ---------------------------------------------------------------------
-- condicao: problemas de saúde ativos, com código CID-10
-- (E11 = diabetes tipo 2, I10 = hipertensão, M54.5 = dor lombar...).
-- O médico registra; a nutricionista e a fisio enxergam.
-- ---------------------------------------------------------------------
CREATE TABLE condicao (
    id              integer      GENERATED ALWAYS AS IDENTITY,
    paciente_id     integer      NOT NULL,
    cid10           varchar(5)   NOT NULL,
    descricao       varchar(120) NOT NULL,
    desde           date,
    ativa           boolean      NOT NULL DEFAULT true,
    registrada_por  integer      NOT NULL,

    CONSTRAINT pk_condicao              PRIMARY KEY (id),
    CONSTRAINT fk_condicao_paciente     FOREIGN KEY (paciente_id) REFERENCES paciente (id),
    CONSTRAINT fk_condicao_profissional FOREIGN KEY (registrada_por) REFERENCES profissional (id),
    CONSTRAINT ck_condicao_cid          CHECK (cid10 ~ '^[A-Z][0-9]{2}(\.[0-9])?$')
);


-- ---------------------------------------------------------------------
-- atendimento: o encontro entre paciente e profissional, com sala e
-- horário. É aqui que mora a "sala": o prontuário de papel ficava
-- preso nela; no banco, a sala é só uma informação do atendimento.
-- ---------------------------------------------------------------------
CREATE TABLE atendimento (
    id               integer            GENERATED ALWAYS AS IDENTITY,
    paciente_id      integer            NOT NULL,
    profissional_id  integer            NOT NULL,
    sala             varchar(30)        NOT NULL,
    inicio           timestamptz        NOT NULL,
    fim              timestamptz,
    status           status_atendimento NOT NULL DEFAULT 'agendado',

    CONSTRAINT pk_atendimento              PRIMARY KEY (id),
    -- alvo da chave estrangeira composta de registro_clinico
    CONSTRAINT uq_atendimento_id_paciente  UNIQUE (id, paciente_id),
    CONSTRAINT fk_atendimento_paciente     FOREIGN KEY (paciente_id) REFERENCES paciente (id),
    CONSTRAINT fk_atendimento_profissional FOREIGN KEY (profissional_id) REFERENCES profissional (id),
    CONSTRAINT ck_atendimento_periodo      CHECK (fim IS NULL OR fim > inicio)
);


-- ---------------------------------------------------------------------
-- registro_clinico: o coração do prontuário único.
--
-- * Uma tabela para TODAS as especialidades. O que é comum a todas
--   (quem, quando, tipo, texto) é coluna. O que muda de área para
--   área (dor da fisio, peso da nutrição, pressão da enfermagem) vai
--   em "medidas", um JSONB. Separar uma tabela por especialidade seria
--   recriar, dentro do banco, as planilhas de cada setor.
--
-- * Chave estrangeira COMPOSTA (atendimento_id, paciente_id): garante
--   que o registro pertence ao mesmo paciente do atendimento. Não dá
--   para escrever a evolução do José na ficha da Maria.
--
-- * Nada aqui se altera nem se apaga (gatilhos em 04_gatilhos.sql).
--   Correção é um registro novo que aponta para o antigo (retifica_id).
-- ---------------------------------------------------------------------
CREATE TABLE registro_clinico (
    id               bigint        GENERATED ALWAYS AS IDENTITY,
    atendimento_id   integer       NOT NULL,
    paciente_id      integer       NOT NULL,
    profissional_id  integer       NOT NULL,
    tipo             tipo_registro NOT NULL,
    texto            text          NOT NULL,
    medidas          jsonb         NOT NULL DEFAULT '{}'::jsonb,
    sigiloso         boolean       NOT NULL DEFAULT false,
    retifica_id      bigint,
    criado_em        timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT pk_registro_clinico     PRIMARY KEY (id),
    CONSTRAINT fk_registro_atendimento FOREIGN KEY (atendimento_id, paciente_id)
                                       REFERENCES atendimento (id, paciente_id),
    CONSTRAINT fk_registro_profissional FOREIGN KEY (profissional_id) REFERENCES profissional (id),
    CONSTRAINT fk_registro_retifica    FOREIGN KEY (retifica_id) REFERENCES registro_clinico (id),
    -- "ok", "idem" e "paciente bem" não contam a história de ninguém
    CONSTRAINT ck_registro_texto       CHECK (length(btrim(texto)) >= 15),
    CONSTRAINT ck_registro_medidas     CHECK (jsonb_typeof(medidas) = 'object'),
    -- escala de dor vai de 0 a 10
    CONSTRAINT ck_registro_dor         CHECK (
        NOT (medidas ? 'dor')
        OR (jsonb_typeof(medidas -> 'dor') = 'number'
            AND (medidas ->> 'dor')::numeric BETWEEN 0 AND 10)
    ),
    -- peso plausível em kg
    CONSTRAINT ck_registro_peso        CHECK (
        NOT (medidas ? 'peso_kg')
        OR (jsonb_typeof(medidas -> 'peso_kg') = 'number'
            AND (medidas ->> 'peso_kg')::numeric > 0
            AND (medidas ->> 'peso_kg')::numeric < 400)
    ),
    CONSTRAINT ck_registro_retifica    CHECK (retifica_id IS NULL OR retifica_id <> id)
);


-- ---------------------------------------------------------------------
-- acesso_prontuario: quem abriu, escreveu ou corrigiu o prontuário,
-- e quando. Dado de saúde é dado pessoal sensível (LGPD, art. 5º, II);
-- a clínica precisa conseguir responder "quem viu a minha ficha?".
-- ---------------------------------------------------------------------
CREATE TABLE acesso_prontuario (
    id               bigint       GENERATED ALWAYS AS IDENTITY,
    paciente_id      integer      NOT NULL,
    profissional_id  integer      NOT NULL,
    acao             acao_acesso  NOT NULL,
    momento          timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT pk_acesso_prontuario  PRIMARY KEY (id),
    CONSTRAINT fk_acesso_paciente    FOREIGN KEY (paciente_id) REFERENCES paciente (id),
    CONSTRAINT fk_acesso_profissional FOREIGN KEY (profissional_id) REFERENCES profissional (id)
);
