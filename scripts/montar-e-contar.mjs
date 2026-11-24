// Sobe o banco completo e mostra quanto tempo cada arquivo levou.
import { novoBanco } from '../testes/conexao-node.mjs'
import { contarTabelas } from '../nucleo/montar-banco.js'

const inicio = performance.now()
const { db, tempos } = await novoBanco({
  aoProgredir: ({ etapa, ms }) => { if (ms !== null) console.log(`  ${etapa.padEnd(42)} ${Math.round(ms)} ms`) },
})
console.log(`Total: ${Math.round(performance.now() - inicio)} ms`)
console.table(await contarTabelas(db))
const r = await db.query(`SELECT nome, idade, alergias, condicoes, especialidades, ultimo_registro_por, ultimo_registro_sala
                            FROM vw_resumo_paciente WHERE cpf = '18398029609'`)
console.log(JSON.stringify(r.rows[0], null, 1))
const busca = await db.query(`SELECT * FROM buscar_paciente('joao pedro conseicao')`)
console.table(busca.rows)
await db.close()
