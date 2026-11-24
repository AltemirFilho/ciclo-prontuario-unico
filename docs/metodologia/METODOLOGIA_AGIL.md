# Metodologia ágil

O trabalho foi conduzido em Kanban, no próprio GitHub, com uma regra simples herdada do pedido do professor: **opinião sem teste não conta**. Por isso a nossa definição de pronto é um teste passando.

## Como o trabalho foi organizado

| Peça do GitHub | Uso no projeto |
|---|---|
| **Issues** | 16 histórias de usuário. Cada uma tem a situação real que motivou, os critérios de aceite e os testes ligados |
| **Milestones** | 4 entregas: (1) modelagem e regras, (2) consultas, índices e LGPD, (3) sistema e evidências, (4) artigo e apresentação |
| **Labels** | o tipo de trabalho: restrição, tipo de dado, gatilho, índice, consulta, LGPD, sistema, documentação, apresentação |
| **Projects (Kanban)** | colunas Backlog, A fazer, Fazendo, Revisão e Pronto |
| **Commits** | mensagens em português contando o porquê da mudança, com referência à história (`Refs #7`) |

## Histórias de usuário

Escritas no formato **Como** (quem) **quero** (o quê) **para** (por quê), sempre a partir de uma situação real da clínica. Exemplo, a issue #1:

> **Como** recepcionista, **quero** cadastrar cada paciente uma única vez, **para** que ninguém abra uma segunda ficha da mesma pessoa.
>
> **Situação real:** a Dona Maria chega, ninguém acha a ficha dela (o CPF foi anotado com um dígito trocado) e a recepção abre outra.
>
> **Testes ligados:** T01, T03, T06, T07, T08, T09, T10.

## Definição de pronto

Uma história do banco só fecha quando **todos os testes ligados a ela passam**. Isso não é feito à mão: o script `scripts/github/fechar-com-evidencia.mjs`

1. lê `testes/resultados/testes.json` e `indices.json`;
2. confere os testes de cada história aberta;
3. se todos passaram, comenta na issue a tabela **esperado × obtido** (com o código do PostgreSQL) e fecha a história;
4. se algum falhou, a história continua aberta.

As histórias que não são do banco (sistema, artigo, apresentação) fecham quando a entrega está publicada e conferida.

## Ciclo de cada história

1. **Backlog:** a história nasce de uma situação real.
2. **A fazer:** entra na entrega da vez.
3. **Fazendo:** SQL e teste escritos juntos (o teste diz o que o banco tem que recusar ou aceitar).
4. **Revisão:** `npm run testes` roda a bateria inteira; nada é aceito com teste vermelho.
5. **Pronto:** o script publica a evidência e fecha.

## Reproduzir

```bash
node scripts/github/criar-backlog.mjs          # cria etiquetas, entregas e histórias (pula o que já existe)
npm run testes                                 # gera as evidências
node scripts/github/fechar-com-evidencia.mjs   # fecha o que estiver comprovado
node scripts/github/criar-quadro.mjs           # monta o quadro Kanban (precisa do escopo "project" no gh)
```
