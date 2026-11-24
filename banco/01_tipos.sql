-- =====================================================================
-- Ciclo Prontuário Único
-- 01_tipos.sql · extensões e tipos enumerados
--
-- Por que ENUM aqui: são listas pequenas, fechadas e que só mudam por
-- decisão clínica (ninguém inventa um "tipo de registro" novo no meio
-- do atendimento). O banco recusa qualquer valor fora da lista, então
-- não existe "evolucao", "Evolução" e "evol." convivendo na mesma base.
--
-- O que é catálogo que cresce (especialidades, por exemplo) virou
-- tabela, não ENUM. Ver 03_tabelas.sql.
-- =====================================================================

-- pg_trgm: compara textos por trigramas (pedaços de 3 letras).
-- Usado na busca de paciente que tolera erro de digitação.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent: tira acentos ("João" vira "Joao").
-- A recepção digita sem acento; a busca precisa achar mesmo assim.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- O que foi escrito no prontuário
CREATE TYPE tipo_registro AS ENUM (
    'anamnese',        -- primeira conversa, história do paciente
    'evolucao',        -- como o paciente está naquele atendimento
    'prescricao',      -- remédio, exercício, dieta
    'exame',           -- pedido ou resultado de exame
    'encaminhamento',  -- envio para outra especialidade
    'orientacao'       -- orientação dada ao paciente ou à família
);

-- Gravidade da alergia (define a cor do alerta na tela)
CREATE TYPE gravidade_alergia AS ENUM ('leve', 'moderada', 'grave');

-- Situação do atendimento na agenda
CREATE TYPE status_atendimento AS ENUM (
    'agendado', 'em_atendimento', 'concluido', 'faltou', 'cancelado'
);

-- O que aconteceu com o prontuário (trilha de auditoria, LGPD)
CREATE TYPE acao_acesso AS ENUM ('leitura', 'escrita', 'retificacao');
