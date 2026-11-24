# Resultados dos testes

Executado em 24/11/2026, 09:37:45 · PostgreSQL 19.0 (PGlite 0.6.0) (PGlite 0.6.0) · Node v24.15.0
Máquina: Intel(R) Core(TM) Ultra 9 185H, 32 GB de RAM, Windows_NT 10.0.26200

Tamanho do banco durante os testes:

| Tabela | Linhas |
| --- | ---: |
| paciente | 5.006 |
| profissional | 8 |
| atendimento | 80.077 |
| registro_clinico | 180.239 |
| alergia | 592 |
| condicao | 1.749 |
| acesso_prontuario | 360.478 |

## Tipos, restrições, regras e consultas: 38 de 38 passaram

| Teste | Grupo | O que foi testado | Situação real | Esperado | Obtido | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Tipo de dado | DATE recusa data que não existe | Na ficha de papel alguém escreveu 30/02 como data de nascimento. | Recusar (22008) | 22008 · date/time field value out of range: "2026-02-30" | PASSOU |
| T02 | Tipo de dado | ENUM recusa tipo de registro fora da lista | Cada setor chamava a evolução de um jeito: "evol.", "Evolução", "EV". | Recusar (22P02) | 22P02 · invalid input value for enum tipo_registro: "evol." | PASSOU |
| T03 | Tipo de dado | CHAR(11) não aceita CPF com dígito a mais | O CPF foi digitado com um zero a mais no fim. | Recusar (22001) | 22001 · value too long for type character(11) | PASSOU |
| T04 | Tipo de dado | JSONB recusa medida mal escrita | A medida da dor chegou como texto quebrado: {"dor": 5 | Recusar (22P02) | 22P02 · invalid input syntax for type json | PASSOU |
| T05 | Tipo de dado | TIMESTAMPTZ guarda o instante certo, em qualquer fuso | Um sistema externo manda o horário em UTC (13h); em Aracaju são 10h. | Aceitar e conferir o resultado | gravado 13:00 UTC = 10:00 em Aracaju | PASSOU |
| T06 | Tipo de dado | IDENTITY: quem numera a ficha é o banco | Dois setores criando fichas com o mesmo número de controle. | Recusar (428C9) | 428C9 · cannot insert a non-DEFAULT value into column "id" | PASSOU |
| T07 | Restrição | UNIQUE: o mesmo CPF não ganha segunda ficha | A recepção abre uma ficha nova para a Dona Maria, que já tem ficha. | Recusar (23505 · uq_paciente_cpf) | 23505 · uq_paciente_cpf · duplicate key value violates unique constraint "uq_paciente_cpf" | PASSOU |
| T08 | Restrição | CHECK: CPF com dígito verificador errado | Um dígito trocado no CPF (…-08 no lugar de …-09) criaria outra pessoa. | Recusar (23514 · ck_paciente_cpf) | 23514 · ck_paciente_cpf · new row for relation "paciente" violates check constraint "ck_paciente_cpf" | PASSOU |
| T09 | Restrição | CHECK: nome completo obrigatório | Cadastro feito só com "Maria", o começo de uma ficha duplicada. | Recusar (23514 · ck_paciente_nome) | 23514 · ck_paciente_nome · new row for relation "paciente" violates check constraint "ck_paciente_nome" | PASSOU |
| T10 | Restrição | CHECK: nascimento no futuro | O ano foi digitado como 2062 no lugar de 1962. | Recusar (23514 · ck_paciente_nascimento) | 23514 · ck_paciente_nascimento · new row for relation "paciente" violates check constraint "ck_paciente_nascimento" | PASSOU |
| T11 | Restrição | NOT NULL: evolução sem texto | O botão de salvar foi apertado com o campo em branco. | Recusar (23502) | 23502 · null value in column "texto" of relation "registro_clinico" violates not-null constraint | PASSOU |
| T12 | Restrição | CHECK: texto curto demais ("ok") | Evolução registrada só com "ok", que não conta nada a quem vem depois. | Recusar (23514 · ck_registro_texto) | 23514 · ck_registro_texto · new row for relation "registro_clinico" violates check constraint "ck_registro_texto" | PASSOU |
| T13 | Restrição | FK: registro em atendimento que não existe | Uma evolução aponta para o atendimento 999999, que nunca aconteceu. | Recusar (23503 · fk_registro_atendimento) | 23503 · fk_registro_atendimento · insert or update on table "registro_clinico" violates foreign key constraint "fk_registro_atendimento" | PASSOU |
| T14 | Restrição | FK composta: evolução do José na ficha da Maria | A folha do José foi parar na pasta da Maria (atendimento de um, paciente de outro). | Recusar (23503 · fk_registro_atendimento) | 23503 · fk_registro_atendimento · insert or update on table "registro_clinico" violates foreign key constraint "fk_registro_atendimento" | PASSOU |
| T15 | Restrição | CHECK: atendimento termina antes de começar | Hora de saída digitada antes da hora de entrada. | Recusar (23514 · ck_atendimento_periodo) | 23514 · ck_atendimento_periodo · new row for relation "atendimento" violates check constraint "ck_atendimento_periodo" | PASSOU |
| T16 | Restrição | CHECK no JSONB: dor fora da escala 0 a 10 | A dor foi anotada como 15. | Recusar (23514 · ck_registro_dor) | 23514 · ck_registro_dor · new row for relation "registro_clinico" violates check constraint "ck_registro_dor" | PASSOU |
| T17 | Restrição | UNIQUE parcial: alergia ativa repetida | A fisio registra "dipirona" sem saber que a médica já registrou "Dipirona". | Recusar (23505 · uq_alergia_ativa) | 23505 · uq_alergia_ativa · duplicate key value violates unique constraint "uq_alergia_ativa" | PASSOU |
| T18 | Restrição | UNIQUE parcial: alergia desativada pode voltar | A alergia foi descartada por engano e precisa ser registrada de novo. | Aceitar e conferir o resultado | 1 ativa, 1 desativada | PASSOU |
| T19 | Restrição | UNIQUE: o mesmo registro de conselho duas vezes | Cadastro de um segundo médico com o CRM 4821/SE, que é da Dra. Helena. | Recusar (23505 · uq_profissional_registro) | 23505 · uq_profissional_registro · duplicate key value violates unique constraint "uq_profissional_registro" | PASSOU |
| T20 | Regra (gatilho) | UPDATE em registro clínico é bloqueado | Alguém tenta "corrigir" a evolução escrevendo por cima do texto antigo. | Recusar (P0001 · regra_registro_clinico_imutavel) | P0001 · regra_registro_clinico_imutavel · UPDATE em registro_clinico não é permitido: o prontuário guarda a história inteira. | PASSOU |
| T21 | Regra (gatilho) | DELETE em registro clínico é bloqueado | Alguém tenta sumir com um registro, como arrancar a folha da pasta. | Recusar (P0001 · regra_registro_clinico_imutavel) | P0001 · regra_registro_clinico_imutavel · DELETE em registro_clinico não é permitido: o prontuário guarda a história inteira. | PASSOU |
| T22 | Regra (gatilho) | TRUNCATE no prontuário é bloqueado | Um comando de limpeza geral rodado no banco errado. | Recusar (P0001 · regra_registro_clinico_imutavel) | P0001 · regra_registro_clinico_imutavel · TRUNCATE em registro_clinico não é permitido: o prontuário guarda a história inteira. | PASSOU |
| T23 | Regra (gatilho) | Retificação feita pelo autor é aceita | A fisio Camila corrige a própria evolução; a original continua lá. | Aceitar e conferir o resultado | 2 registros: o original e a retificação que aponta para ele | PASSOU |
| T24 | Regra (gatilho) | Retificação feita por outro profissional é bloqueada | A fisio tenta corrigir a prescrição da médica. | Recusar (P0001 · regra_retificacao_autor) | P0001 · regra_retificacao_autor · Só o autor do registro pode retificá-lo. | PASSOU |
| T25 | Regra (gatilho) | O mesmo registro não é retificado duas vezes | A prescrição já foi corrigida; corrigir de novo o original deixaria duas versões valendo. | Recusar (23505 · uq_registro_retifica) | 23505 · uq_registro_retifica · duplicate key value violates unique constraint "uq_registro_retifica" | PASSOU |
| T26 | Regra (gatilho) | Atendimento com falta não recebe evolução | Dona Francisca faltou à fisio; alguém tenta lançar uma sessão nesse dia. | Recusar (P0001 · regra_atendimento_valido) | P0001 · regra_atendimento_valido · Atendimento com status "faltou" não recebe registro clínico. | PASSOU |
| T27 | Regra (gatilho) | Profissional desligado não escreve | O Dr. Fernando saiu da clínica, mas o login dele ainda existe. | Recusar (P0001 · regra_profissional_ativo) | P0001 · regra_profissional_ativo · Profissional inativo não pode registrar no prontuário. | PASSOU |
| T28 | Regra (gatilho) | A hora do registro é a do servidor | Tentativa de lançar uma evolução com data de ontem para cobrir esquecimento. | Aceitar e conferir o resultado | pedido: 23/11 09:37 · gravado: 24/11 09:37 | PASSOU |
| T29 | Regra (gatilho) | Toda escrita deixa rastro na auditoria | A fisio grava uma evolução; o banco anota quem, o quê e quando. | Aceitar e conferir o resultado | 1 linha de auditoria: escrita por Camila Rocha | PASSOU |
| T30 | Regra (gatilho) | A auditoria não pode ser apagada | Alguém tenta apagar o rastro de quem abriu a ficha. | Recusar (P0001 · regra_acesso_prontuario_imutavel) | P0001 · regra_acesso_prontuario_imutavel · DELETE em acesso_prontuario não é permitido: o prontuário guarda a história inteira. | PASSOU |
| T31 | Consulta | Linha do tempo única, de todas as especialidades | A fisio abre o prontuário da Dona Maria e enxerga o que médica, enfermagem e nutrição escreveram. | Aceitar e conferir o resultado | 14 registros de 4 especialidades; o mais recente é de Medicina (Helena Prado) | PASSOU |
| T32 | Consulta | Abrir o prontuário também deixa rastro | Só de abrir a ficha, a leitura fica registrada (LGPD). | Aceitar e conferir o resultado | 1 leitura registrada: Camila Rocha às 09:37 | PASSOU |
| T33 | Consulta | Sigilo: a fisio sabe que houve psicologia, mas não lê o conteúdo | José faz psicologia e fisioterapia no mesmo prontuário. | Aceitar e conferir o resultado | 2 registros sigilosos aparecem; conteúdo oculto em todos: true | PASSOU |
| T34 | Consulta | Sigilo: a psicóloga lê o próprio registro | A mesma linha do tempo, aberta pela psicóloga Renata. | Aceitar e conferir o resultado | 2 registros sigilosos, todos legíveis para a Psicologia | PASSOU |
| T35 | Consulta | Busca acha o paciente sem acento e com erro de digitação | A recepção digita "joao pedro conseicao". | Aceitar e conferir o resultado | primeiro resultado: João Pedro da Conceição (semelhança 0.65) | PASSOU |
| T36 | Consulta | Busca pelo CPF digitado com máscara | A recepção digita o CPF com pontos e traço: 183.980.296-09. | Aceitar e conferir o resultado | encontrado: Maria das Graças Souza | PASSOU |
| T37 | Consulta | Aviso de possível ficha duplicada antes de cadastrar | Tentam cadastrar "Maria das Gracas Sousa", nascida em 12/03/1959, sem CPF em mãos. | Aceitar e conferir o resultado | parecido com: Maria das Graças Souza (semelhança 0.76) | PASSOU |
| T38 | Consulta | Resumo mostra alergia, condições e quem escreveu por último | O cabeçalho que todo profissional vê ao abrir a ficha da Dona Maria. | Aceitar e conferir o resultado | alergia: Dipirona (grave); 3 condições; Enfermagem, Fisioterapia, Medicina, Nutrição; último registro: Helena Prado | PASSOU |

## Índices: a mesma consulta sem e com o índice

Tempo de execução informado pelo próprio PostgreSQL (EXPLAIN ANALYZE), mediana de 15 execuções.

| Exp. | Consulta | Índice | Sem índice (ms) | Com índice (ms) | Ganho | Plano sem | Plano com |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| I1 | Abrir a linha do tempo do paciente | ix_registro_paciente_data | 9,20 | 0,095 | 96.9x | Limit > Sort > Seq Scan | Limit > Index Scan |
| I2 | Buscar paciente pelo nome, sem acento | ix_paciente_nome_busca | 38,35 | 0,575 | 66.7x | Seq Scan | Bitmap Heap Scan > Bitmap Index Scan |
| I3 | Auditoria: quem abriu este prontuário | ix_acesso_paciente_momento | 14,02 | 0,029 | 483.4x | Limit > Sort > Seq Scan | Limit > Index Scan |
| I4 | Agenda do dia do profissional | ix_atendimento_profissional_inicio | 1,88 | 0,045 | 41.7x | Sort > Index Scan | Sort > Bitmap Heap Scan > Bitmap Index Scan |

I5. Buscar pelo CPF usa o índice que o UNIQUE criou: sim, usou uq_paciente_cpf (0,020 ms).

### I1. Abrir a linha do tempo do paciente

Cada paciente chamado em qualquer sala abre o prontuário: é a consulta mais repetida do dia.

```sql
SELECT id, criado_em, tipo
  FROM registro_clinico
 WHERE paciente_id = 3048
 ORDER BY criado_em DESC
 LIMIT 50
```

Sem o índice:

```
Limit (actual rows=50.00 loops=1)
  Buffers: shared hit=3698
  ->  Sort (actual rows=50.00 loops=1)
        Sort Key: criado_em DESC
        Sort Method: quicksort  Memory: 30kB
        Buffers: shared hit=3698
        ->  Seq Scan on registro_clinico (actual rows=78.00 loops=1)
              Filter: (paciente_id = 3048)
              Rows Removed by Filter: 180161
              Buffers: shared hit=3698
```

Com o índice:

```
Limit (actual rows=50.00 loops=1)
  Buffers: shared hit=14
  ->  Index Scan using ix_registro_paciente_data on registro_clinico (actual rows=50.00 loops=1)
        Index Cond: (paciente_id = 3048)
        Index Searches: 1
        Buffers: shared hit=14
```

### I2. Buscar paciente pelo nome, sem acento

A recepção digita "maria souza" para achar a ficha antes de abrir outra.

```sql
SELECT id, nome
  FROM paciente
 WHERE normalizar('maria souza') <% normalizar(nome)
```

Sem o índice:

```
Seq Scan on paciente (actual rows=14.00 loops=1)
  Filter: ('maria souza'::text <% normalizar((nome)::text))
  Rows Removed by Filter: 4992
  Buffers: shared hit=58
```

Com o índice:

```
Bitmap Heap Scan on paciente (actual rows=14.00 loops=1)
  Filter: ('maria souza'::text <% normalizar((nome)::text))
  Rows Removed by Filter: 34
  Heap Blocks: exact=29
  Buffers: shared hit=54
  ->  Bitmap Index Scan on ix_paciente_nome_busca (actual rows=48.00 loops=1)
        Index Cond: (normalizar((nome)::text) %> 'maria souza'::text)
        Index Searches: 1
        Buffers: shared hit=25
Planning:
  Buffers: shared hit=1
```

### I3. Auditoria: quem abriu este prontuário

O paciente pergunta, com base na LGPD, quem viu a ficha dele.

```sql
SELECT momento, acao, profissional_id
  FROM acesso_prontuario
 WHERE paciente_id = 3048
 ORDER BY momento DESC
 LIMIT 20
```

Sem o índice:

```
Limit (actual rows=20.00 loops=1)
  Buffers: shared hit=2651
  ->  Sort (actual rows=20.00 loops=1)
        Sort Key: momento DESC
        Sort Method: top-N heapsort  Memory: 26kB
        Buffers: shared hit=2651
        ->  Seq Scan on acesso_prontuario (actual rows=156.00 loops=1)
              Filter: (paciente_id = 3048)
              Rows Removed by Filter: 360322
              Buffers: shared hit=2651
```

Com o índice:

```
Limit (actual rows=20.00 loops=1)
  Buffers: shared hit=23
  ->  Index Scan using ix_acesso_paciente_momento on acesso_prontuario (actual rows=20.00 loops=1)
        Index Cond: (paciente_id = 3048)
        Index Searches: 1
        Buffers: shared hit=23
```

### I4. Agenda do dia do profissional

Cada profissional abre "meus atendimentos de hoje" várias vezes por turno.

```sql
SELECT id, inicio, sala, status
  FROM atendimento
 WHERE profissional_id = 6
   AND inicio >= date_trunc('day', now())
   AND inicio <  date_trunc('day', now()) + interval '1 day'
 ORDER BY inicio
```

Sem o índice:

```
Sort (actual rows=8.00 loops=1)
  Sort Key: inicio
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=310
  ->  Index Scan using ix_atendimento_paciente on atendimento (actual rows=8.00 loops=1)
        Index Cond: ((inicio >= date_trunc('day'::text, now())) AND (inicio < (date_trunc('day'::text, now()) + '1 day'::interval)))
        Filter: (profissional_id = 6)
        Rows Removed by Filter: 47
        Index Searches: 1
        Buffers: shared hit=310
```

Com o índice:

```
Sort (actual rows=8.00 loops=1)
  Sort Key: inicio
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=5
  ->  Bitmap Heap Scan on atendimento (actual rows=8.00 loops=1)
        Recheck Cond: ((profissional_id = 6) AND (inicio >= date_trunc('day'::text, now())) AND (inicio < (date_trunc('day'::text, now()) + '1 day'::interval)))
        Heap Blocks: exact=2
        Buffers: shared hit=5
        ->  Bitmap Index Scan on ix_atendimento_profissional_inicio (actual rows=8.00 loops=1)
              Index Cond: ((profissional_id = 6) AND (inicio >= date_trunc('day'::text, now())) AND (inicio < (date_trunc('day'::text, now()) + '1 day'::interval)))
              Index Searches: 1
              Buffers: shared hit=3
```

### I5. CPF

```
Index Scan using uq_paciente_cpf on paciente (actual rows=1.00 loops=1)
  Index Cond: (cpf = '18398029609'::bpchar)
  Index Searches: 1
  Buffers: shared hit=3
```

## Escala: a linha do tempo conforme a clínica cresce

| Pacientes | Atendimentos | Registros clínicos | Sem índice (ms) | Com índice (ms) | Ganho |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1.250 | 10.000 | 22.457 | 1,18 | 0,043 | 27.4x |
| 5.000 | 40.000 | 90.171 | 4,71 | 0,047 | 100.2x |
| 20.000 | 160.000 | 360.051 | 28,33 | 0,049 | 578.2x |
