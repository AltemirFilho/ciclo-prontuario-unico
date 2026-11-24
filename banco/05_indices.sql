-- =====================================================================
-- 05_indices.sql · índices
--
-- Índice funciona como o índice remissivo de um livro: em vez de
-- folhear a tabela inteira, o banco vai direto na página certa.
-- Ele custa espaço e deixa a gravação um pouco mais lenta, então só
-- entra onde existe uma consulta que a clínica faz o dia inteiro.
-- Cada índice abaixo tem teste de antes e depois (testes/indices.js).
--
-- Índices que já existem sem a gente pedir: toda PRIMARY KEY e todo
-- UNIQUE criam um. A busca por CPF da recepção usa o uq_paciente_cpf
-- (teste I4), por isso não existe um "ix_paciente_cpf".
--
-- Onde NÃO criamos: condicao e especialidade são tabelas pequenas;
-- ler tudo custa menos do que manter um índice atualizado.
-- =====================================================================

-- 1) Linha do tempo: "todos os registros deste paciente, do mais novo
--    para o mais antigo". É a consulta que abre o prontuário, repetida
--    a cada paciente chamado, em todas as salas. A ordem das colunas
--    importa: primeiro filtra pelo paciente, depois já entrega ordenado
--    pela data, sem precisar ordenar depois.
CREATE INDEX ix_registro_paciente_data
    ON registro_clinico (paciente_id, criado_em DESC);

-- 2) Busca de paciente que tolera acento e erro de digitação.
--    GIN + trigramas: acha "joao pedro conseicao" quando o cadastro é
--    "João Pedro da Conceição". Sem isso a recepção não acha a ficha
--    que já existe e abre outra.
CREATE INDEX ix_paciente_nome_busca
    ON paciente USING gin (normalizar(nome) gin_trgm_ops);

-- 3) Agenda do profissional: "meus atendimentos de hoje".
CREATE INDEX ix_atendimento_profissional_inicio
    ON atendimento (profissional_id, inicio);

-- 4) Atendimentos de um paciente (quais especialidades o acompanham).
CREATE INDEX ix_atendimento_paciente
    ON atendimento (paciente_id, inicio DESC);

-- 5) Auditoria: "quem abriu o prontuário deste paciente?"
CREATE INDEX ix_acesso_paciente_momento
    ON acesso_prontuario (paciente_id, momento DESC);

-- 6) Regra de negócio feita com índice: uma alergia ATIVA por
--    substância e por paciente, sem ligar para maiúscula ou acento
--    ("Dipirona" = "dipirona"). Índice único PARCIAL: a alergia
--    desativada não conta, então dá para registrar de novo se voltar.
CREATE UNIQUE INDEX uq_alergia_ativa
    ON alergia (paciente_id, normalizar(substancia))
    WHERE ativa;

-- 7) Cada registro só pode ser retificado uma vez. Para corrigir de
--    novo, retifica-se a retificação. Assim a versão que vale é sempre
--    a única que ninguém retificou.
CREATE UNIQUE INDEX uq_registro_retifica
    ON registro_clinico (retifica_id)
    WHERE retifica_id IS NOT NULL;
