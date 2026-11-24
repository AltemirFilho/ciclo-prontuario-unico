// Monta o banco do zero, arquivo por arquivo, na ordem certa.
// Usado pelos testes (Node) e pelo sistema (navegador). Quem chama
// entrega a conexão e o jeito de ler os arquivos .sql.

export const ARQUIVOS_DO_BANCO = [
  { arquivo: '01_tipos.sql',       etapa: 'Criando os tipos' },
  { arquivo: '02_funcoes.sql',     etapa: 'Criando as funções de validação' },
  { arquivo: '03_tabelas.sql',     etapa: 'Criando as tabelas e restrições' },
  { arquivo: '04_gatilhos.sql',    etapa: 'Ligando as regras (gatilhos)' },
  { arquivo: '05_indices.sql',     etapa: 'Criando os índices' },
  { arquivo: '06_visoes.sql',      etapa: 'Criando as visões e funções de leitura' },
  { arquivo: '07_dados_demo.sql',  etapa: 'Cadastrando a clínica e os pacientes' },
  { arquivo: '08_volume.sql',      etapa: 'Gerando três anos de atendimentos' },
]

/**
 * @param {object}   db              conexão PGlite
 * @param {function} lerArquivo      (nome) => Promise<string com o SQL>
 * @param {object}   [opcoes]
 * @param {number}   [opcoes.pacientes=5000]
 * @param {number}   [opcoes.atendimentos=80000]
 * @param {boolean}  [opcoes.semVolume=false]  pula o 08 (banco pequeno)
 * @param {function} [opcoes.aoProgredir]      ({ etapa, indice, total, ms }) => void
 */
export async function montarBanco(db, lerArquivo, opcoes = {}) {
  const {
    pacientes = 5000,
    atendimentos = 80000,
    semVolume = false,
    aoProgredir = () => {},
  } = opcoes

  await db.exec(`SET TIME ZONE 'America/Maceio';`)
  await db.exec(`SET ciclo.vol_pacientes = '${Number(pacientes)}';`)
  await db.exec(`SET ciclo.vol_atendimentos = '${Number(atendimentos)}';`)

  const lista = semVolume
    ? ARQUIVOS_DO_BANCO.filter((a) => a.arquivo !== '08_volume.sql')
    : ARQUIVOS_DO_BANCO

  const tempos = []
  for (let i = 0; i < lista.length; i++) {
    const { arquivo, etapa } = lista[i]
    aoProgredir({ etapa, indice: i, total: lista.length, ms: null })
    const sql = await lerArquivo(arquivo)
    const inicio = performance.now()
    try {
      await db.exec(sql)
    } catch (erro) {
      erro.message = `[${arquivo}] ${erro.message}`
      throw erro
    }
    const ms = performance.now() - inicio
    tempos.push({ arquivo, etapa, ms })
    aoProgredir({ etapa, indice: i, total: lista.length, ms })
  }
  return tempos
}

/** Contagem rápida das tabelas, para mostrar o tamanho do banco. */
export async function contarTabelas(db) {
  const { rows } = await db.query(`
    SELECT 'paciente' AS tabela, count(*)::int AS linhas FROM paciente
    UNION ALL SELECT 'profissional', count(*)::int FROM profissional
    UNION ALL SELECT 'atendimento', count(*)::int FROM atendimento
    UNION ALL SELECT 'registro_clinico', count(*)::int FROM registro_clinico
    UNION ALL SELECT 'alergia', count(*)::int FROM alergia
    UNION ALL SELECT 'condicao', count(*)::int FROM condicao
    UNION ALL SELECT 'acesso_prontuario', count(*)::int FROM acesso_prontuario
  `)
  return rows
}
