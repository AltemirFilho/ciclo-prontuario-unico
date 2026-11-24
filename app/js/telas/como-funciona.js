// =====================================================================
// Aba Como funciona: o problema (antes), a solução (depois), o modelo
// do banco e o porquê de cada decisão, com o teste que prova.
// =====================================================================

const DECISOES = [
  {
    titulo: 'Uma tabela de registros para todas as especialidades',
    problema: 'Cada setor guardava a sua planilha. A história do paciente estava em cinco lugares.',
    decisao: '<b>registro_clinico</b> único. O comum vira coluna; o que muda por área (dor, peso, pressão) vai em <b>medidas JSONB</b>, com CHECK.',
    prova: 'T02, T04, T16, T31',
  },
  {
    titulo: 'CPF como chave natural, id como chave interna',
    problema: 'Um dígito trocado no CPF abria uma segunda ficha da mesma pessoa.',
    decisao: '<b>UNIQUE (cpf)</b> + <b>CHECK cpf_valido(cpf)</b> com os dígitos verificadores. As outras tabelas usam o <b>id IDENTITY</b>.',
    prova: 'T06, T07, T08',
  },
  {
    titulo: 'Chave estrangeira composta',
    problema: 'A folha de um paciente podia ir parar na pasta de outro.',
    decisao: '<b>FOREIGN KEY (atendimento_id, paciente_id)</b> referencia <b>atendimento (id, paciente_id)</b>: o registro só entra na ficha do paciente daquele atendimento.',
    prova: 'T13, T14',
  },
  {
    titulo: 'Prontuário que não se apaga',
    problema: 'Corretivo, folha arrancada, ou um UPDATE que some com o que estava escrito.',
    decisao: 'Gatilhos bloqueiam <b>UPDATE, DELETE e TRUNCATE</b>. Corrigir é <b>retificar</b>: registro novo que aponta para o antigo, só pelo autor, uma vez.',
    prova: 'T20 a T25',
  },
  {
    titulo: 'Alerta de alergia para todos',
    problema: 'A alergia grave a dipirona estava só na ficha do consultório 1.',
    decisao: 'Tabela <b>alergia</b> no topo de todo prontuário. <b>Índice único parcial</b>: uma alergia ativa por substância, sem ligar para maiúscula ou acento.',
    prova: 'T17, T18, T38',
  },
  {
    titulo: 'Compartilhar sem expor (LGPD e sigilo)',
    problema: 'Prontuário único não pode virar "todo mundo lê tudo".',
    decisao: 'Leitura só pela função <b>linha_do_tempo()</b>, que registra quem abriu e esconde o conteúdo <b>sigiloso</b> de quem não é da especialidade autora.',
    prova: 'T29, T30, T32, T33, T34',
  },
  {
    titulo: 'Busca que acha quem já existe',
    problema: '"Joao Pedro Conceicao" digitado sem acento não achava "João Pedro da Conceição", e nascia outra ficha.',
    decisao: '<b>pg_trgm + unaccent</b> com <b>índice GIN</b> sobre <b>normalizar(nome)</b>, e aviso de possível duplicidade antes de cadastrar.',
    prova: 'T35, T36, T37, I2',
  },
  {
    titulo: 'Índice onde a clínica consulta o dia todo',
    problema: 'Abrir o prontuário lia a tabela inteira de registros a cada paciente chamado.',
    decisao: '<b>(paciente_id, criado_em DESC)</b>: filtra e já entrega na ordem. Medido com EXPLAIN ANALYZE, sem e com, em três tamanhos de clínica.',
    prova: 'I1, I3, I4, escala',
  },
]

// posição das tabelas no diagrama
const TABELAS = [
  { nome: 'especialidade', x: 20, y: 30, campos: [['pk', 'id'], ['', 'nome (UNIQUE)'], ['', 'conselho']] },
  { nome: 'profissional', x: 20, y: 190, campos: [['pk', 'id'], ['', 'nome'], ['fk', 'especialidade_id'], ['', 'registro_conselho'], ['', 'uf_conselho'], ['', 'ativo']] },
  { nome: 'paciente', x: 330, y: 30, campos: [['pk', 'id'], ['', 'nome'], ['', 'cpf (UNIQUE, CHECK)'], ['', 'cns (UNIQUE)'], ['', 'data_nascimento'], ['', 'telefone']] },
  { nome: 'atendimento', x: 330, y: 270, campos: [['pk', 'id'], ['fk', 'paciente_id'], ['fk', 'profissional_id'], ['', 'sala'], ['', 'inicio · fim'], ['', 'status (ENUM)']] },
  { nome: 'registro_clinico', x: 640, y: 210, campos: [['pk', 'id'], ['fk', 'atendimento_id ┐ FK'], ['fk', 'paciente_id    ┘ composta'], ['fk', 'profissional_id'], ['', 'tipo (ENUM)'], ['', 'texto · medidas (JSONB)'], ['', 'sigiloso'], ['fk', 'retifica_id → registro'], ['', 'criado_em']] },
  { nome: 'alergia', x: 640, y: 20, campos: [['pk', 'id'], ['fk', 'paciente_id'], ['', 'substancia · gravidade'], ['fk', 'registrada_por']] },
  { nome: 'condicao', x: 900, y: 20, campos: [['pk', 'id'], ['fk', 'paciente_id'], ['', 'cid10 (CHECK)'], ['fk', 'registrada_por']] },
  { nome: 'acesso_prontuario', x: 900, y: 240, campos: [['pk', 'id'], ['fk', 'paciente_id'], ['fk', 'profissional_id'], ['', 'acao (ENUM)'], ['', 'momento']] },
]
const LARGURA = 220
const ALTURA_LINHA = 19

function caixaTabela(t) {
  const altura = 30 + t.campos.length * ALTURA_LINHA + 8
  return `<g class="tabela-der" transform="translate(${t.x},${t.y})">
    <rect class="caixa" width="${LARGURA}" height="${altura}" rx="10" />
    <rect class="cabeca" width="${LARGURA}" height="28" rx="10" />
    <rect class="cabeca" y="14" width="${LARGURA}" height="14" />
    <text class="nome-tabela" x="12" y="19">${t.nome}</text>
    ${t.campos.map(([tipo, campo], i) =>
      `<text class="${tipo}" x="12" y="${48 + i * ALTURA_LINHA}">${tipo === 'pk' ? '🔑 ' : tipo === 'fk' ? '↗ ' : '   '}${campo}</text>`).join('')}
  </g>`
}

function diagrama() {
  // ligações (de -> para), desenhadas como curvas simples
  const rel = [
    'M 130 108 C 130 150, 130 150, 130 190',          // especialidade -> profissional
    'M 240 300 C 290 300, 290 330, 330 330',           // profissional -> atendimento
    'M 440 168 C 440 220, 440 230, 440 270',           // paciente -> atendimento
    'M 550 330 C 600 330, 600 300, 640 300',           // atendimento -> registro
    'M 550 80 C 600 80, 600 60, 640 60',               // paciente -> alergia
    'M 550 60 C 720 -10, 840 -10, 900 50',             // paciente -> condicao
    'M 860 300 C 880 300, 880 300, 900 300',           // registro -> acesso (escrita gera auditoria)
    'M 240 260 C 420 420, 760 470, 900 380',           // profissional -> acesso
    'M 860 380 C 900 420, 880 450, 840 440 C 800 430, 820 410, 860 400', // auto-relação retifica
  ]
  return `<svg class="der" viewBox="0 0 1140 470" role="img" aria-label="Diagrama entidade-relacionamento">
    ${rel.map((d) => `<path class="rel" d="${d}" />`).join('')}
    ${TABELAS.map(caixaTabela).join('')}
    <text class="card" x="140" y="160">1 : N</text>
    <text class="card" x="450" y="225">1 : N</text>
    <text class="card" x="575" y="318">1 : N</text>
    <text class="card" x="868" y="460">retifica (1 : 0..1)</text>
    <text class="card" x="862" y="292">gatilho</text>
  </svg>`
}

export async function iniciar(raiz) {
  raiz.innerHTML = `
    <div class="antes-depois">
      <div class="cartao">
        <h3>Antes: a Dona Maria em três pastas</h3>
        <p class="apagado" style="margin:0">Cada setor com a sua ficha. Nenhuma estava errada sozinha; juntas, contavam histórias diferentes.</p>
        <div class="fichas">
          <div class="ficha" style="--giro:-1.5deg"><b>Consultório 1 · clínico</b>Maria das Graças Souza<br>CPF 183.980.296-09<br>DM2 · HAS<br><span class="risco">ALÉRGICA A DIPIRONA</span><br>Metformina 850 2x/dia</div>
          <div class="ficha" style="--giro:1deg"><b>Fisioterapia</b>Maria das Gracas Sousa<br>CPF 183.980.296-<span class="risco">08</span><br>Dor joelho D<br>Alergias: <span class="risco">nega</span><br>Dor 7/10</div>
          <div class="ficha" style="--giro:-0.5deg"><b>Nutrição</b>Maria G. Souza<br>CPF <span class="risco">não informado</span><br>Diabética<br>Medicação: <span class="risco">metformina 3x/dia</span><br>Peso 82,4 kg</div>
        </div>
        <ul class="problemas">
          <li>Três grafias do nome e um CPF com dígito trocado: para o sistema, três pessoas.</li>
          <li>A alergia grave só existe na pasta do consultório 1.</li>
          <li>A nutrição copiou a dose antiga, que a médica já tinha corrigido.</li>
          <li>Ninguém sabe quem leu a ficha, nem quando ela foi atualizada.</li>
        </ul>
      </div>
      <div class="cartao">
        <h3>Depois: um prontuário só</h3>
        <p class="apagado" style="margin:0">Cada especialidade escreve no mesmo lugar, e o banco garante as regras.</p>
        <ul class="problemas" style="margin-top:16px">
          <li><b>Uma ficha por pessoa:</b> CPF único e conferido; busca que acha o nome sem acento e com erro.</li>
          <li><b>Alerta para todos:</b> a alergia aparece em vermelho no topo, em qualquer sala.</li>
          <li><b>Sempre atualizado:</b> a linha do tempo mostra quem escreveu por último, de qual área e em qual sala.</li>
          <li><b>Nada some:</b> o erro é corrigido por retificação; o original continua visível.</li>
          <li><b>Rastro de acesso:</b> toda leitura e escrita fica registrada (LGPD).</li>
          <li><b>Sigilo onde precisa:</b> a equipe vê que houve psicologia, não o conteúdo.</li>
        </ul>
        <p style="margin:14px 0 0" class="suave">Cada item tem teste executado na aba <b>Laboratório de testes</b>.</p>
      </div>
    </div>

    <div class="cartao" style="padding:16px 18px">
      <div class="cartao-titulo" style="padding:0 0 10px">Modelo do banco (8 tabelas)</div>
      ${diagrama()}
    </div>

    <h2 class="secao-titulo">Por que cada decisão</h2>
    <div class="decisoes">
      ${DECISOES.map((d) => `
        <div class="cartao decisao">
          <h4>${d.titulo}</h4>
          <dl>
            <dt>Problema</dt><dd>${d.problema}</dd>
            <dt>Decisão</dt><dd>${d.decisao}</dd>
            <dt>Prova</dt><dd class="mono">${d.prova}</dd>
          </dl>
        </div>`).join('')}
    </div>`
}
