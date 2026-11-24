-- =====================================================================
-- 04_gatilhos.sql · regras que uma restrição simples não alcança
--
-- CHECK olha só a linha que está entrando. Quando a regra depende de
-- outra tabela (o status do atendimento, o autor do registro original)
-- ou proíbe uma operação inteira (UPDATE, DELETE), entra o gatilho.
--
-- Os erros saem com o nome da regra no campo CONSTRAINT, igual a uma
-- restrição comum. Assim a tela e os testes tratam tudo do mesmo jeito.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Prontuário não se apaga nem se reescreve.
--
-- Situação real: na ficha de papel, corretivo e folha arrancada somem
-- com a história. No banco, um UPDATE faz o mesmo sem deixar marca.
-- A regra é: o que foi escrito fica; erro se corrige com retificação,
-- que é um registro novo apontando para o antigo.
-- Vale também para a trilha de auditoria: quem apaga o log apaga a prova.
-- ---------------------------------------------------------------------
CREATE FUNCTION bloquear_alteracao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION USING
        MESSAGE    = format('%s em %s não é permitido: o prontuário guarda a história inteira.',
                            TG_OP, TG_TABLE_NAME),
        HINT       = 'Para corrigir um registro, crie uma retificação (retifica_id).',
        CONSTRAINT = 'regra_' || TG_TABLE_NAME || '_imutavel';
END;
$$;

CREATE TRIGGER trg_registro_imutavel
    BEFORE UPDATE OR DELETE ON registro_clinico
    FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

CREATE TRIGGER trg_registro_sem_truncate
    BEFORE TRUNCATE ON registro_clinico
    FOR EACH STATEMENT EXECUTE FUNCTION bloquear_alteracao();

CREATE TRIGGER trg_acesso_imutavel
    BEFORE UPDATE OR DELETE ON acesso_prontuario
    FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

CREATE TRIGGER trg_acesso_sem_truncate
    BEFORE TRUNCATE ON acesso_prontuario
    FOR EACH STATEMENT EXECUTE FUNCTION bloquear_alteracao();


-- ---------------------------------------------------------------------
-- 2) Conferências antes de gravar um registro clínico.
--
--  a) A hora do registro é a do servidor. Ninguém escreve "ontem" para
--     cobrir um esquecimento. Exceção: a carga de dados antigos (migração),
--     que liga a opção ciclo.carga_historica só durante a importação.
--  b) Profissional desligado da clínica não escreve.
--  c) Atendimento cancelado ou em que o paciente faltou não recebe evolução.
--  d) Só quem escreveu pode retificar, e só registro do mesmo paciente.
-- ---------------------------------------------------------------------
CREATE FUNCTION validar_registro()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_ativo     boolean;
    v_status    status_atendimento;
    v_orig_pac  integer;
    v_orig_prof integer;
BEGIN
    -- a) hora do servidor
    IF coalesce(current_setting('ciclo.carga_historica', true), 'off') <> 'on' THEN
        NEW.criado_em := now();
    END IF;

    -- b) profissional ativo
    SELECT ativo INTO v_ativo FROM profissional WHERE id = NEW.profissional_id;
    IF v_ativo IS FALSE THEN
        RAISE EXCEPTION USING
            MESSAGE    = 'Profissional inativo não pode registrar no prontuário.',
            CONSTRAINT = 'regra_profissional_ativo';
    END IF;

    -- c) atendimento válido (se não existir, a chave estrangeira acusa depois)
    SELECT status INTO v_status FROM atendimento WHERE id = NEW.atendimento_id;
    IF v_status IN ('faltou', 'cancelado') THEN
        RAISE EXCEPTION USING
            MESSAGE    = format('Atendimento com status "%s" não recebe registro clínico.', v_status),
            CONSTRAINT = 'regra_atendimento_valido';
    END IF;

    -- d) retificação
    IF NEW.retifica_id IS NOT NULL THEN
        SELECT paciente_id, profissional_id
          INTO v_orig_pac, v_orig_prof
          FROM registro_clinico
         WHERE id = NEW.retifica_id;

        IF FOUND AND v_orig_pac <> NEW.paciente_id THEN
            RAISE EXCEPTION USING
                MESSAGE    = 'A retificação precisa ser do mesmo paciente do registro original.',
                CONSTRAINT = 'regra_retificacao_mesmo_paciente';
        END IF;

        IF FOUND AND v_orig_prof <> NEW.profissional_id THEN
            RAISE EXCEPTION USING
                MESSAGE    = 'Só o autor do registro pode retificá-lo.',
                HINT       = 'Outro profissional deve escrever um registro próprio.',
                CONSTRAINT = 'regra_retificacao_autor';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_registro_valida
    BEFORE INSERT ON registro_clinico
    FOR EACH ROW EXECUTE FUNCTION validar_registro();


-- ---------------------------------------------------------------------
-- 3) Toda escrita deixa rastro na auditoria, sem depender da tela.
-- Se outro sistema gravar direto no banco, o rastro aparece do mesmo jeito.
-- ---------------------------------------------------------------------
CREATE FUNCTION auditar_escrita()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF coalesce(current_setting('ciclo.carga_historica', true), 'off') = 'on' THEN
        RETURN NULL;  -- carga de dados antigos não gera log de acesso
    END IF;

    INSERT INTO acesso_prontuario (paciente_id, profissional_id, acao)
    VALUES (NEW.paciente_id,
            NEW.profissional_id,
            CASE WHEN NEW.retifica_id IS NULL THEN 'escrita' ELSE 'retificacao' END::acao_acesso);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_registro_audita
    AFTER INSERT ON registro_clinico
    FOR EACH ROW EXECUTE FUNCTION auditar_escrita();
