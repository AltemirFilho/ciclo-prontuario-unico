// Roda os casos de teste. Funciona igual no Node e no navegador:
// recebe a conexão PGlite e devolve o resultado de cada caso.

/** Texto curto do erro do PostgreSQL: código, regra e mensagem. */
export function descreverErro(erro) {
  const partes = [erro.code]
  if (erro.constraint) partes.push(erro.constraint)
  return `${partes.join(' · ')} · ${erro.message}`
}

/** O que o caso espera, em português, para mostrar na tabela. */
export function descreverEspera(espera) {
  if (espera.erro) {
    return `Recusar (${espera.erro}${espera.restricao ? ' · ' + espera.restricao : ''})`
  }
  return 'Aceitar e conferir o resultado'
}

export async function rodarCaso(db, caso) {
  const inicio = performance.now()
  let resultado = null

  await db.exec('BEGIN')
  try {
    const comandos = Array.isArray(caso.sql) ? caso.sql : [caso.sql]
    let erro = null

    for (let i = 0; i < comandos.length; i++) {
      try {
        await db.exec(comandos[i])
      } catch (e) {
        // erro na preparação = o teste está mal montado, não é o que queremos medir
        if (i < comandos.length - 1) throw new Error(`a preparação do teste falhou: ${descreverErro(e)}`)
        erro = e
      }
    }

    if (caso.espera.erro) {
      if (!erro) {
        resultado = { passou: false, obtido: 'O banco ACEITOU, nenhum erro foi levantado.' }
      } else {
        const codigoCerto = erro.code === caso.espera.erro
        const regraCerta = !caso.espera.restricao || erro.constraint === caso.espera.restricao
        resultado = {
          passou: codigoCerto && regraCerta,
          obtido: descreverErro(erro),
          codigo: erro.code,
          restricao: erro.constraint ?? null,
        }
      }
    } else if (erro) {
      resultado = { passou: false, obtido: descreverErro(erro) }
    } else {
      const { rows } = await db.query(caso.verificacao)
      resultado = { passou: rows[0]?.ok === true, obtido: String(rows[0]?.obtido ?? '') }
    }
  } catch (e) {
    resultado = { passou: false, obtido: e.message }
  } finally {
    await db.exec('ROLLBACK')
  }

  return {
    id: caso.id,
    grupo: caso.grupo,
    titulo: caso.titulo,
    situacao: caso.situacao,
    esperado: descreverEspera(caso.espera),
    sql: Array.isArray(caso.sql) ? caso.sql.join(';\n') : caso.sql,
    verificacao: caso.verificacao ?? null,
    ...resultado,
    ms: performance.now() - inicio,
  }
}

export async function rodarTodos(db, casos, aoTerminarCaso = () => {}) {
  const resultados = []
  for (const caso of casos) {
    const r = await rodarCaso(db, caso)
    resultados.push(r)
    aoTerminarCaso(r)
  }
  return resultados
}
