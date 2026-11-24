-- =====================================================================
-- 02_funcoes.sql · funções de apoio usadas pelas restrições e índices
-- =====================================================================

-- ---------------------------------------------------------------------
-- cpf_valido(cpf): confere os dois dígitos verificadores do CPF.
--
-- Situação real: na ficha de papel, um dígito trocado ("...-26" no
-- lugar de "...-25") faz o mesmo paciente parecer outra pessoa. Na
-- próxima visita ninguém acha a ficha e abre-se uma nova: é assim que
-- o prontuário se espalha. Aqui o banco recusa o CPF impossível
-- antes que ele vire uma segunda ficha.
--
-- IMMUTABLE: a mesma entrada sempre dá a mesma saída, o que permite
-- usar a função dentro de CHECK.
-- ---------------------------------------------------------------------
CREATE FUNCTION cpf_valido(p_cpf text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
    d    int[];
    soma int;
    dv1  int;
    dv2  int;
BEGIN
    -- só 11 dígitos, sem ponto nem traço (a tela tira a máscara)
    IF p_cpf !~ '^[0-9]{11}$' THEN
        RETURN false;
    END IF;

    -- 000.000.000-00, 111.111.111-11... passam na conta, mas não existem
    IF p_cpf ~ '^(\d)\1{10}$' THEN
        RETURN false;
    END IF;

    d := string_to_array(p_cpf, NULL)::int[];

    soma := 0;
    FOR i IN 1..9 LOOP
        soma := soma + d[i] * (11 - i);
    END LOOP;
    dv1 := (soma * 10) % 11;
    IF dv1 = 10 THEN dv1 := 0; END IF;

    soma := 0;
    FOR i IN 1..10 LOOP
        soma := soma + d[i] * (12 - i);
    END LOOP;
    dv2 := (soma * 10) % 11;
    IF dv2 = 10 THEN dv2 := 0; END IF;

    RETURN dv1 = d[10] AND dv2 = d[11];
END;
$$;

-- ---------------------------------------------------------------------
-- normalizar(texto): minúsculas e sem acento.
-- "  João da CONCEIÇÃO " vira "joao da conceicao".
--
-- A unaccent() padrão não é IMMUTABLE (depende de um dicionário que
-- pode mudar), e índice só aceita função IMMUTABLE. Fixando o
-- dicionário explicitamente, a função pode entrar no índice de busca.
-- ---------------------------------------------------------------------
CREATE FUNCTION normalizar(p_texto text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT lower(btrim(public.unaccent('public.unaccent'::regdictionary, p_texto)));
$$;
