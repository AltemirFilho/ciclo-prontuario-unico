# Ciclo Prontuário Único

**O fim do prontuário espalhado:** numa clínica com várias especialidades, cada paciente tem uma ficha só, escrita e lida por todos, com as regras garantidas pelo próprio banco de dados.

Trabalho da disciplina **Banco de Dados** · Ciência da Computação · UNIT, Aracaju/SE · 2026
Professor: Sérgio Roberto Santos Santana
Dupla: **Altemir Cruz da Silva Filho** e **Juscelino Santos de Andrade**

| | |
|---|---|
| Sistema no ar | https://altemirfilho.github.io/ciclo-prontuario-unico/app/?quem=camila |
| Apresentação | https://altemirfilho.github.io/ciclo-prontuario-unico/docs/apresentacao/ |
| Artigo (SBC) | [`docs/artigo/`](docs/artigo/) |
| Resultados dos testes | [`testes/resultados/RESULTADOS.md`](testes/resultados/RESULTADOS.md) |
| Tour do projeto | https://altemirfilho.github.io/ciclo-prontuario-unico/docs/estudo/tour.html |
| Guia de estudo | [`docs/estudo/GUIA_DE_ESTUDO.md`](docs/estudo/GUIA_DE_ESTUDO.md) |
| Metodologia ágil | [`docs/metodologia/METODOLOGIA_AGIL.md`](docs/metodologia/METODOLOGIA_AGIL.md) |

## O problema

Dona Maria, 67 anos, diabética, hipertensa e alérgica a dipirona (pessoa fictícia). De manhã, a médica pede que a fisioterapia tire a carga do joelho. À tarde, a fisioterapeuta atende com a ficha do próprio setor, sem a alergia e sem a mudança de conduta. A nutrição copiou a dose antiga do remédio. E, com o CPF anotado com um dígito trocado, para qualquer cadastro são três pessoas diferentes.

## A solução

Um banco PostgreSQL com **uma tabela de registros para todas as especialidades** e as regras que impedem o espalhamento **dentro do banco**:

* CPF único e com dígito verificador conferido por `CHECK`;
* chave estrangeira composta: o registro nunca cai na ficha de outro paciente;
* prontuário imutável (gatilhos bloqueiam UPDATE, DELETE e TRUNCATE) e correção por retificação;
* alerta de alergia para toda a equipe, com índice único parcial;
* auditoria de toda leitura e escrita (LGPD) e sigilo por especialidade;
* busca que acha o paciente sem acento e com erro de digitação (`pg_trgm` + `unaccent`);
* índices medidos sem e com, com `EXPLAIN ANALYZE`.

## Resultados

* **38 de 38 testes** de tipos, restrições, regras e consultas com o resultado esperado (código do PostgreSQL e nome da regra conferidos).
* Abrir a linha do tempo: **9,24 ms → 0,089 ms** com o índice composto. Com 360 mil registros: **22,01 ms → 0,044 ms**.

Executado em PostgreSQL 19.0 via [PGlite](https://pglite.dev) 0.6.0 (o PostgreSQL compilado para WebAssembly), com 5.006 pacientes, 80.077 atendimentos e 180.239 registros sintéticos.

## Como rodar

```bash
npm install
npm run testes     # monta o banco, roda os testes e grava as evidências
npm run servidor   # http://localhost:4517/app/ (sistema) e /docs/apresentacao/
```

No Windows, `INICIAR.bat` sobe o servidor e abre a apresentação.

## Estrutura

```
banco/        o banco, um arquivo por assunto (tipos, funções, tabelas, gatilhos, índices, visões, dados)
nucleo/       peças usadas no terminal e no navegador: montagem, casos de teste, experimentos de índice
testes/       execução no Node e as evidências (resultados/)
app/          o sistema web (o PostgreSQL roda no navegador)
docs/         artigo, apresentação, evidências em imagem, guia de estudo e metodologia
scripts/      servidor local, capturas de tela, gerador do artigo, automação do GitHub
```

## Dados e uso de IA

Todos os dados são fictícios e gerados por script. O uso de ferramentas de IA está declarado no artigo, como pede o manual da UNIT; os resultados vêm de testes executados e podem ser repetidos com os comandos acima.
