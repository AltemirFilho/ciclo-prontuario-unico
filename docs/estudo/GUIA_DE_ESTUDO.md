# Guia de estudo · Ciclo Prontuário Único

Cada conceito de banco de dados usado no trabalho, explicado do jeito que a gente aprende melhor: **uma situação real, o erro, a causa, o jeito certo e o porquê**. Todo exemplo é do nosso código e aponta o teste que prova (T01 a T38, I1 a I5).

> Para ver tudo funcionando: dê dois cliques em `INICIAR.bat`, ou abra o sistema no ar e use a aba **Console SQL**.

## Mapa dos arquivos

| Arquivo | O que tem |
|---|---|
| `banco/01_tipos.sql` | extensões e tipos ENUM |
| `banco/02_funcoes.sql` | `cpf_valido()` e `normalizar()` |
| `banco/03_tabelas.sql` | as 8 tabelas e as restrições |
| `banco/04_gatilhos.sql` | as regras com gatilhos |
| `banco/05_indices.sql` | os 7 índices e o porquê de cada um |
| `banco/06_visoes.sql` | linha do tempo, busca, resumo, auditoria |
| `banco/07_dados_demo.sql` | a clínica e os pacientes com história |
| `banco/08_volume.sql` | três anos de dados sintéticos |
| `nucleo/casos-de-teste.js` | os 38 testes (o SQL de cada um está lá) |
| `nucleo/experimentos-indices.js` | os experimentos sem × com índice |
| `testes/resultados/RESULTADOS.md` | o resultado da última execução |

---

## 1. Chave primária e IDENTITY

**Situação.** Recepção e fisioterapia numeravam as fichas cada uma no seu caderno. Duas fichas diferentes ganharam o número 152.

**Erro.** Deixar quem digita escolher o identificador.

**Causa.** Sem um único "dono" da numeração, colisão é questão de tempo.

**Certo.**
```sql
id integer GENERATED ALWAYS AS IDENTITY,
CONSTRAINT pk_paciente PRIMARY KEY (id)
```

**Por quê.** O banco gera o número e o `ALWAYS` proíbe inserir id na mão. O teste T06 tentou e recebeu `428C9`. A PRIMARY KEY garante que o id é único e não nulo, e já cria um índice.

> **Chave natural × chave interna.** O CPF é a chave **natural** (a recepção conhece). O `id` é a chave **interna** (pequena, nunca muda, não expõe dado pessoal). As outras tabelas apontam para o `id`.

## 2. Escolher o tipo certo

| Situação | Tipo | Teste |
|---|---|---|
| Alguém escreve 30/02 como nascimento | `DATE` recusa data que não existe | T01 (`22008`) |
| Cada setor chama a evolução de um jeito | `ENUM tipo_registro` só aceita a lista | T02 (`22P02`) |
| CPF digitado com dígito a mais | `CHAR(11)` recusa valor maior | T03 (`22001`) |
| Medidas diferentes por especialidade | `JSONB` aceita objeto, recusa JSON quebrado | T04 (`22P02`) |
| Sistema externo manda hora em UTC | `TIMESTAMPTZ` guarda o instante certo | T05 |

**ENUM ou tabela?** ENUM para lista pequena e fechada (tipo de registro, gravidade, status). Tabela para catálogo que cresce (especialidade): especialidade nova entra com `INSERT`, sem mudar a estrutura.

**JSONB sem bagunça.** O JSON é flexível, mas a regra continua no banco:
```sql
CONSTRAINT ck_registro_dor CHECK (
    NOT (medidas ? 'dor')
    OR (jsonb_typeof(medidas -> 'dor') = 'number'
        AND (medidas ->> 'dor')::numeric BETWEEN 0 AND 10)
)
```
Leia assim: "se tem dor, ela é número entre 0 e 10". `?` pergunta se a chave existe; `->` devolve JSON; `->>` devolve texto. Teste T16: dor 15 foi recusada (`23514`).

## 3. NOT NULL e CHECK

**Situação.** A fisio salvou a evolução em branco. Em outro dia, escreveu só "ok".

**Erro.** Confiar que a tela vai obrigar.

**Causa.** Qualquer outro programa que grave no banco passa por cima da tela.

**Certo.**
```sql
texto text NOT NULL,
CONSTRAINT ck_registro_texto CHECK (length(btrim(texto)) >= 15)
```

**Por quê.** `NOT NULL` barra o vazio (T11, `23502`); o CHECK barra o texto que não conta nada (T12, `23514`). O nome da restrição aparece no erro, e a tela usa esse nome para mostrar uma mensagem em português.

**CHECK com função.** O CPF tem dígitos verificadores. A função `cpf_valido(cpf)` faz a conta e é `IMMUTABLE` (mesma entrada, mesma saída), por isso pode entrar num CHECK:
```sql
CONSTRAINT ck_paciente_cpf CHECK (cpf_valido(cpf))
```
T08: o CPF com o último dígito trocado foi recusado. É exatamente o erro que criava a "segunda Dona Maria".

## 4. UNIQUE e UNIQUE parcial

**Situação 1.** A recepção abre uma ficha nova para quem já é paciente.
```sql
CONSTRAINT uq_paciente_cpf UNIQUE (cpf)
```
T07: recusado com `23505`. E o UNIQUE também cria índice: a busca por CPF já é rápida (I5).

**Situação 2.** A médica registrou "Dipirona". A fisio, sem saber, registra "dipirona".

**Erro.** `UNIQUE (paciente_id, substancia)` não resolve: diferencia maiúscula, e impediria registrar de novo uma alergia desativada.

**Certo.** Índice único **parcial** (com `WHERE`) sobre o texto normalizado:
```sql
CREATE UNIQUE INDEX uq_alergia_ativa
    ON alergia (paciente_id, normalizar(substancia))
    WHERE ativa;
```

**Por quê.** A restrição UNIQUE não aceita condição; o índice aceita. Só as ativas entram na regra, e `normalizar()` tira acento e maiúscula. T17 recusou a repetida; T18 aceitou registrar de novo depois de desativar.

## 5. Chave estrangeira simples e composta

**Situação.** A folha de evolução do José foi parar na pasta da Maria.

**Erro.** Só `FOREIGN KEY (atendimento_id)`: o registro aponta para um atendimento que existe, mas pode dizer que é de outro paciente.

**Causa.** O registro guarda `paciente_id` (para o índice da linha do tempo) e `atendimento_id`. Nada obriga os dois a concordarem.

**Certo.**
```sql
-- no atendimento: o par (id, paciente_id) é único
CONSTRAINT uq_atendimento_id_paciente UNIQUE (id, paciente_id),
-- no registro: a chave estrangeira aponta para o par
CONSTRAINT fk_registro_atendimento FOREIGN KEY (atendimento_id, paciente_id)
    REFERENCES atendimento (id, paciente_id)
```

**Por quê.** Agora o banco só aceita o registro se aquele atendimento for daquele paciente. T14 tentou gravar a evolução do José na ficha da Maria: `23503`. T13 tentou um atendimento que não existe: também `23503`.

## 6. Gatilhos (triggers)

CHECK olha só a linha que está entrando. Quando a regra depende de **outra tabela** ou proíbe **uma operação inteira**, entra o gatilho.

| Peça | Significado |
|---|---|
| `BEFORE` / `AFTER` | roda antes ou depois da operação |
| `FOR EACH ROW` / `FOR EACH STATEMENT` | uma vez por linha ou uma vez por comando |
| `NEW` | a linha que está entrando |
| `RAISE EXCEPTION` | cancela a operação com erro |

**Situação.** Alguém "corrige" a evolução escrevendo por cima. Ou apaga.

**Certo.**
```sql
CREATE TRIGGER trg_registro_imutavel
    BEFORE UPDATE OR DELETE ON registro_clinico
    FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();
```
T20, T21 e T22 (UPDATE, DELETE e TRUNCATE): todos recusados com `P0001` e o nome `regra_registro_clinico_imutavel`.

**Então como corrige?** Retificação: um registro novo com `retifica_id` apontando para o original. Outro gatilho (`validar_registro`) confere que só o autor retifica (T24) e um índice único parcial em `retifica_id` impede retificar duas vezes o mesmo registro (T25).

**Outras regras no mesmo gatilho:** a hora do registro é a do servidor (`NEW.criado_em := now()`, T28), atendimento com falta não recebe evolução (T26), profissional desligado não escreve (T27).

**Gatilho AFTER para auditoria:** depois de cada INSERT no prontuário, grava uma linha em `acesso_prontuario` (T29). Assim o rastro existe mesmo se outro programa gravar direto no banco.

## 7. Funções e visões de leitura

**Visão (VIEW)** é uma consulta com nome. `vw_resumo_paciente` monta o cabeçalho: alergias, condições, especialidades e quem escreveu por último (T38).

**Por que a linha do tempo é FUNÇÃO e não visão?** Porque ela precisa saber **quem está lendo**, e visão não recebe parâmetro. A função `linha_do_tempo(paciente, leitor)`:
1. grava a leitura na auditoria (T32);
2. devolve tudo, de todas as especialidades, do mais novo para o mais antigo (T31);
3. troca o texto sigiloso por "conteúdo sigiloso" quando o leitor é de outra especialidade (T33 e T34).

**Busca tolerante.** `buscar_paciente('joao pedro conseicao')` usa `unaccent` (tira acento) e `pg_trgm` (compara pedaços de 3 letras) e acha "João Pedro da Conceição" (T35). `possiveis_duplicados(nome, nascimento)` avisa antes de cadastrar (T37).

## 8. Índices

Índice é o índice remissivo do livro: em vez de folhear a tabela inteira, o banco vai direto na página. **Custa espaço e deixa a escrita um pouco mais lenta**, então só entra onde a clínica consulta o dia todo.

**Índice composto: a ordem importa.**
```sql
CREATE INDEX ix_registro_paciente_data ON registro_clinico (paciente_id, criado_em DESC);
```
Primeiro filtra pelo paciente; dentro dele, os registros já estão na ordem da data. A consulta `WHERE paciente_id = ? ORDER BY criado_em DESC` não precisa ordenar nada. Se fosse `(criado_em, paciente_id)`, não serviria para essa consulta.

**GIN com trigramas** para buscar no meio do nome e tolerar erro (B-tree não faz isso):
```sql
CREATE INDEX ix_paciente_nome_busca ON paciente USING gin (normalizar(nome) gin_trgm_ops);
```

**Resultado medido** (mediana de 15 execuções, 180.239 registros):

| Consulta | Sem índice | Com índice | Ganho |
|---|---|---|---|
| I1 · linha do tempo | 9,24 ms | 0,089 ms | 104× |
| I2 · busca por nome | 36,54 ms | 0,516 ms | 71× |
| I3 · auditoria | 14,52 ms | 0,036 ms | 403× |
| I4 · agenda do dia | 2,29 ms | 0,041 ms | 56× |

**Escala:** com 16 vezes mais registros, sem índice o tempo subiu 19 vezes (1,14 → 22,01 ms); com índice ficou em 0,04 ms.

**Quando NÃO criar.** Tabela pequena (`condicao`, `especialidade`): ler tudo custa menos do que manter índice. E o custo é real: o índice de busca por nome ocupa 2,16 MB, quase 5 vezes a tabela de pacientes. Ele se paga porque evita a ficha duplicada.

## 9. Como ler um plano (EXPLAIN ANALYZE)

`EXPLAIN` mostra o plano. `EXPLAIN ANALYZE` **executa** e mostra o tempo real.

| No plano | Quer dizer |
|---|---|
| `Seq Scan` | leu a tabela inteira |
| `Index Scan using ix_...` | foi direto pelo índice |
| `Bitmap Index Scan` + `Bitmap Heap Scan` | marcou as páginas pelo índice e depois leu só elas |
| `Sort` | precisou ordenar (custa) |
| `Limit` | parou nas N primeiras linhas |
| `Execution Time` | o tempo que usamos nas medições |

Sem o índice, a linha do tempo era `Seq Scan` + `Sort` (leu 180 mil linhas e ordenou). Com o índice, só `Index Scan`.

## 10. Transações nos testes

```sql
BEGIN;
  -- o teste: tenta gravar, apagar...
ROLLBACK;
```
Tudo o que o teste fez é desfeito no fim. Um teste não suja o banco para o outro, e a ordem não muda o resultado. Quando um erro acontece dentro da transação, ela fica "abortada" até o ROLLBACK: por isso o erro esperado é sempre o **último** comando do teste.

## 11. LGPD dentro do banco

* Dado de saúde é **dado pessoal sensível** (LGPD, art. 5º, II).
* O prontuário precisa ser guardado por pelo menos **20 anos** (Lei 13.787/2018), então não se apaga: por isso a imutabilidade.
* A clínica precisa responder **"quem viu a minha ficha?"**: auditoria de toda leitura e escrita, que também não se apaga (T30).
* **Compartilhar não é expor:** o sigilo da psicologia fica na função de leitura (CFP 001/2009).

## 12. Códigos de erro que aparecem nos testes

| SQLSTATE | Significado | Exemplo |
|---|---|---|
| `22001` | valor maior que o tipo | CPF com 12 dígitos |
| `22008` | data ou hora fora do intervalo | 30/02 |
| `22P02` | texto inválido para o tipo | "evol." no ENUM, JSON quebrado |
| `23502` | NOT NULL violado | evolução sem texto |
| `23503` | chave estrangeira violada | registro na ficha errada |
| `23505` | UNIQUE violado | CPF repetido |
| `23514` | CHECK violado | dor 15 |
| `428C9` | não pode inserir id gerado pelo banco | id na mão |
| `P0001` | erro levantado por gatilho | DELETE no prontuário |

## 13. Como rodar

```bash
npm install
npm run testes     # monta o banco, roda os 38 testes, mede os índices e grava testes/resultados
npm run servidor   # sistema em http://localhost:4517/app/ e apresentação em /docs/apresentacao/
```
No Windows, `INICIAR.bat` faz o segundo comando e já abre a apresentação.
