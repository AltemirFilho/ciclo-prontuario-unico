"""
Gera o artigo (.docx) no modelo SBC da UNIT, com os números tirados dos
resultados dos testes (testes/resultados/*.json). Assim o texto nunca
diverge do que foi medido.

Uso:
    python scripts/artigo/gerar_artigo.py <modelo.docx> <saida.docx>

O modelo é o exemplo preenchido distribuído na disciplina: dele vêm as
margens, os estilos (SBCHeading1/2) e a formatação de cada parágrafo.
"""
import io
import json
import re
import struct
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
RES = RAIZ / 'testes' / 'resultados'
EVID = RAIZ / 'docs' / 'evidencias'

MODELO, SAIDA = Path(sys.argv[1]), Path(sys.argv[2])

ambiente = json.loads((RES / 'ambiente.json').read_text(encoding='utf-8'))
testes = {t['id']: t for t in json.loads((RES / 'testes.json').read_text(encoding='utf-8'))}
indices = json.loads((RES / 'indices.json').read_text(encoding='utf-8'))
escala = json.loads((RES / 'escala.json').read_text(encoding='utf-8'))
tamanhos = json.loads((RES / 'tamanhos.json').read_text(encoding='utf-8'))
linhas = {t['tabela']: t['linhas'] for t in ambiente['tabelas']}
exp = {e['id']: e for e in indices['experimentos']}
passaram = sum(1 for t in testes.values() if t['passou'])


# ---------------------------------------------------------------------
# formatação de números no padrão brasileiro
# ---------------------------------------------------------------------
def n(v):
    return f'{int(v):,}'.replace(',', '.')


def ms(v):
    casas = 3 if v < 1 else 2
    return f'{v:.{casas}f}'.replace('.', ',')


def vezes(v, casas=1):
    return f'{v:.{casas}f}'.replace('.', ',')


def mb(b):
    return f'{b / 1024 / 1024:.2f}'.replace('.', ',')


def tam_indice(nome):
    return next(i['bytes'] for i in tamanhos['indices'] if i['indice'] == nome)


def tam_tabela(nome):
    return next(t['dados_bytes'] for t in tamanhos['tabelas'] if t['tabela'] == nome)


def obtido_curto(t):
    if t.get('codigo'):
        return f"{t['codigo']}" + (f" · {t['restricao']}" if t.get('restricao') else '')
    return t['obtido']


# ---------------------------------------------------------------------
# peças de XML (mesma formatação do modelo)
# ---------------------------------------------------------------------
FONTE = 'Times New Roman'


def rpr(bold=False, italic=False, size=24, font=FONTE, highlight=None, sup=False):
    x = f'<w:rFonts w:ascii="{font}" w:cs="{font}" w:eastAsia="{font}" w:hAnsi="{font}"/>'
    if bold:
        x += '<w:b/><w:bCs/>'
    if italic:
        x += '<w:i/><w:iCs/>'
    x += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
    if highlight:
        x += f'<w:highlight w:val="{highlight}"/>'
    if sup:
        x += '<w:vertAlign w:val="superscript"/>'
    return f'<w:rPr>{x}</w:rPr>'


def run(texto, **k):
    return f'<w:r>{rpr(**k)}<w:t xml:space="preserve">{escape(texto)}</w:t></w:r>'


def marcado(texto, size=24, italic_base=False):
    """**negrito**, //itálico//, `código` dentro de um parágrafo."""
    saida = []
    for parte in re.split(r'(\*\*.+?\*\*|//.+?//|`.+?`)', texto):
        if not parte:
            continue
        if parte.startswith('**'):
            saida.append(run(parte[2:-2], bold=True, italic=italic_base, size=size))
        elif parte.startswith('//'):
            saida.append(run(parte[2:-2], italic=not italic_base, size=size))
        elif parte.startswith('`'):
            saida.append(run(parte[1:-1], size=size - 3, font='Courier New', italic=italic_base))
        else:
            saida.append(run(parte, size=size, italic=italic_base))
    return ''.join(saida)


def par(conteudo, spacing='<w:spacing w:after="120" w:line="276"/>', ind='<w:ind w:firstLine="720"/>',
        jc='both', estilo=None, keep_next=False):
    ppr = ''
    if estilo:
        ppr += f'<w:pStyle w:val="{estilo}"/>'
    if keep_next:
        ppr += '<w:keepNext/>'
    ppr += spacing + (ind or '') + f'<w:jc w:val="{jc}"/>'
    return f'<w:p><w:pPr>{ppr}</w:pPr>{conteudo}</w:p>'


def corpo(texto):
    return par(marcado(texto))


def secao(texto):
    return par(run(texto, bold=True, size=26), spacing='<w:spacing w:after="120" w:before="240"/>',
               ind=None, jc='left', estilo='SBCHeading1')


def subsecao(texto):
    return par(run(texto, bold=True, size=24), spacing='<w:spacing w:after="100" w:before="200"/>',
               ind=None, jc='left', estilo='SBCHeading2')


def legenda_tabela(texto):
    return par(run(texto, bold=True, size=20, font='Arial'), spacing='<w:spacing w:after="60" w:before="100"/>',
               ind=None, jc='center', keep_next=True)


def legenda_figura(texto):
    return par(run(texto, bold=True, size=20, font='Arial'), spacing='<w:spacing w:after="160" w:before="60"/>',
               ind=None, jc='center')


def referencia(texto):
    return par(marcado(texto), ind='<w:ind w:left="454" w:hanging="454"/>')


BORDAS = ''.join(f'<w:{b} w:val="single" w:color="auto" w:sz="4"/>'
                 for b in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))


def tabela(cabecalho, linhas_, larguras, tamanho=18, alinhar=None):
    total = sum(larguras)
    alinhar = alinhar or ['left'] * len(larguras)
    grade = ''.join(f'<w:gridCol w:w="{w}"/>' for w in larguras)

    def celula(texto, w, al, cab):
        sombra = '<w:shd w:val="clear" w:color="auto" w:fill="E8ECF1"/>' if cab else ''
        paragrafos = ''.join(
            f'<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="{al}"/></w:pPr>'
            f'{run(linha, bold=True, size=tamanho) if cab else marcado(linha, size=tamanho)}</w:p>'
            for linha in str(texto).split('\n'))
        return f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{sombra}</w:tcPr>{paragrafos}</w:tc>'

    linhas_xml = [
        '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' +
        ''.join(celula(c, w, 'left' if a == 'left' else 'center', True) for c, w, a in zip(cabecalho, larguras, alinhar)) +
        '</w:tr>'
    ]
    for l in linhas_:
        linhas_xml.append('<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
                          ''.join(celula(c, w, a, False) for c, w, a in zip(l, larguras, alinhar)) + '</w:tr>')
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{total}" w:type="dxa"/><w:jc w:val="center"/>'
            f'<w:tblBorders>{BORDAS}</w:tblBorders><w:tblLayout w:type="fixed"/>'
            f'<w:tblCellMar><w:top w:w="45" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>'
            f'<w:bottom w:w="45" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>'
            f'<w:tblGrid>{grade}</w:tblGrid>{"".join(linhas_xml)}</w:tbl>'
            + par('', spacing='<w:spacing w:after="60"/>', ind=None))


# ---------------------------------------------------------------------
# figuras
# ---------------------------------------------------------------------
MIDIAS = []  # (nome_no_zip, bytes)
LARGURA_UTIL_EMU = int((11906 - 2 * 1701) / 1440 * 914400)  # largura útil da página


def figura(arquivo, largura_cm=15.0):
    img = Image.open(EVID / arquivo)
    if img.width > 1800:
        img = img.resize((1800, round(img.height * 1800 / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    numero = len(MIDIAS) + 1
    nome = f'media/evidencia{numero}.png'
    MIDIAS.append((nome, buf.getvalue()))
    cx = min(int(largura_cm / 2.54 * 914400), LARGURA_UTIL_EMU)
    cy = int(cx * img.height / img.width)
    rid = f'rIdEvid{numero}'
    desenho = (
        f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
        f'<wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
        f'<wp:docPr id="{100 + numero}" name="Evidencia {numero}"/>'
        f'<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        f'<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        f'<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f'<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f'<pic:nvPicPr><pic:cNvPr id="{100 + numero}" name="evidencia{numero}.png"/><pic:cNvPicPr/></pic:nvPicPr>'
        f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        f'<a:ln w="6350"><a:solidFill><a:srgbClr val="B8C2CE"/></a:solidFill></a:ln></pic:spPr>'
        f'</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
    )
    return par(desenho, spacing='<w:spacing w:after="60" w:before="120"/>', ind=None, jc='center', keep_next=True)


# =====================================================================
# TEXTO DO ARTIGO
# =====================================================================
I1, I2, I3, I4 = exp['I1'], exp['I2'], exp['I3'], exp['I4']
E_pequena, E_media, E_grande = escala[0], escala[1], escala[2]
REPO = 'github.com/AltemirFilho/ciclo-prontuario-unico'
SITE = 'altemirfilho.github.io/ciclo-prontuario-unico'

B = []  # corpo do documento

# ---- cabeçalho -------------------------------------------------------
B.append(par(run('Prontuário Único: um Banco de Dados para Acabar com o Prontuário Espalhado em Clínicas Multidisciplinares',
                 bold=True, size=32), spacing='<w:spacing w:after="60"/>', ind=None, jc='center'))
B.append(par(run('Single Health Record: a Database to End Scattered Patient Records in Multidisciplinary Clinics',
                 bold=True, size=28), spacing='<w:spacing w:after="200"/>', ind=None, jc='center'))
B.append(par(run('Altemir Cruz da Silva Filho', bold=True) + run('1', bold=True, sup=True) +
             run(', Juscelino Santos de Andrade', bold=True) + run('1', bold=True, sup=True),
             spacing='<w:spacing w:after="80"/>', ind=None, jc='center'))
B.append(par(run('Disciplina: Banco de Dados · Professor: Sérgio Roberto Santos Santana (UNIT)', italic=True, size=20),
             spacing='<w:spacing w:after="80"/>', ind=None, jc='center'))
B.append(par(run('1', sup=True) + run('Curso de Ciência da Computação · Universidade Tiradentes (UNIT) · Aracaju/SE'),
             spacing='<w:spacing w:after="20"/>', ind=None, jc='center'))
B.append(par(run('[e-mail institucional de cada um]', size=20, font='Courier New', highlight='yellow') +
             run(' · ' + REPO, size=20, font='Courier New'),
             spacing='<w:spacing w:after="280"/>', ind=None, jc='center'))

resumo = (
    'Em clínicas com várias especialidades, o prontuário do paciente costuma ficar preso à sala de quem atendeu por último '
    'ou dividido em fichas e planilhas de cada setor. O resultado é informação desatualizada, cadastro duplicado e alertas, '
    'como alergias, que não chegam a quem atende depois. Este trabalho propõe e testa um banco de dados relacional para um '
    'prontuário único, baseado na Ciclo, plataforma para profissionais de saúde desenvolvida pelos autores. O modelo, em '
    f'PostgreSQL 19, tem oito tabelas e concentra no próprio banco as regras que evitam o espalhamento: CPF único e com '
    'dígito verificador conferido, chave estrangeira composta entre registro e atendimento, registros imutáveis com '
    f'retificação, trilha de auditoria e sigilo por especialidade. Foram executados {len(testes)} testes de tipos, restrições, '
    f'regras e consultas, todos com o resultado esperado, e quatro experimentos de índice com EXPLAIN ANALYZE sobre '
    f'{n(linhas["registro_clinico"])} registros clínicos sintéticos. O índice da linha do tempo reduziu a consulta de '
    f'{ms(I1["sem"]["mediana"])} ms para {ms(I1["com"]["mediana"])} ms e, numa clínica com {n(E_grande["registros"])} registros, '
    f'de {ms(E_grande["sem"])} ms para {ms(E_grande["com"])} ms. Levar as regras para o banco torna o prontuário único '
    'confiável qualquer que seja a tela usada.'
)
B.append(par(run('Resumo.  ', bold=True, italic=True) + run(resumo, italic=True),
             spacing='<w:spacing w:after="60"/>', ind='<w:ind w:left="454" w:right="454"/>'))
B.append(par(run('Palavras-chave: ', bold=True) + run('banco de dados relacional, prontuário eletrônico, integridade de dados, índices, PostgreSQL.'),
             spacing='<w:spacing w:after="200"/>', ind=None, jc='left'))

abstract = (
    'In clinics with several specialties, the patient record often stays in the room of the last appointment or is split '
    'into each sector\'s own forms and spreadsheets. The result is outdated information, duplicate registrations and alerts, '
    'such as allergies, that never reach the next professional. This work proposes and tests a relational database for a '
    'single health record, based on Ciclo, a platform for health professionals developed by the authors. The model, in '
    'PostgreSQL 19, has eight tables and keeps inside the database the rules that prevent scattering: a unique tax ID (CPF) '
    'with verified check digits, a composite foreign key between record and appointment, immutable entries with formal '
    f'amendment, an audit trail and confidentiality per specialty. We ran {len(testes)} tests on data types, constraints, rules '
    f'and queries, all with the expected outcome, and four index experiments with EXPLAIN ANALYZE over '
    f'{n(linhas["registro_clinico"]).replace(".", ",")} synthetic clinical entries. The timeline index cut the query from '
    f'{ms(I1["sem"]["mediana"]).replace(",", ".")} ms to {ms(I1["com"]["mediana"]).replace(",", ".")} ms and, in a clinic with '
    f'{n(E_grande["registros"]).replace(".", ",")} entries, from {ms(E_grande["sem"]).replace(",", ".")} ms to '
    f'{ms(E_grande["com"]).replace(",", ".")} ms. Moving the rules into the database makes the single record reliable '
    'regardless of the user interface.'
)
B.append(par(run('Abstract.  ', bold=True, italic=True) + run(abstract, italic=True),
             spacing='<w:spacing w:after="60"/>', ind='<w:ind w:left="454" w:right="454"/>'))
B.append(par(run('Keywords: ', bold=True) + run('relational database, electronic health record, data integrity, indexes, PostgreSQL.'),
             spacing='<w:spacing w:after="100"/>', ind=None, jc='left'))

# ---- 1. Introdução ---------------------------------------------------
B.append(secao('1. Introdução'))
B.append(corpo(
    'Numa clínica multidisciplinar, o mesmo paciente passa pelo clínico, pela enfermagem, pela fisioterapia, pela nutrição '
    'e pela psicologia, muitas vezes na mesma semana. Quando o prontuário é de papel, ou quando cada setor mantém a própria '
    'ficha ou planilha, a informação fica onde foi escrita: a ficha está na sala do último atendimento, a planilha da nutrição '
    'não conversa com a da fisioterapia, e quem atende a seguir trabalha com uma versão incompleta do paciente. É isso que '
    'chamamos aqui de **prontuário espalhado**.'))
B.append(corpo(
    'Um cenário ilustrativo, montado a partir de situações comuns nesse tipo de clínica, resume o problema. Dona Maria, 67 anos, '
    'diabética e hipertensa, tem alergia grave a dipirona, anotada pela médica no consultório 1. Numa terça de manhã, a médica '
    'encontra um derrame no joelho e pede que a fisioterapia suspenda os exercícios com carga. À tarde, a fisioterapeuta atende '
    'Dona Maria em outro andar, com a ficha do próprio setor, onde a alergia não aparece e a mudança de conduta ainda não chegou. '
    'Na nutrição, a dose antiga da metformina, já corrigida pela médica, continua copiada na ficha. E, como o CPF foi anotado com '
    'um dígito trocado na fisioterapia, para qualquer cadastro essas fichas pertencem a pessoas diferentes.'))
B.append(corpo(
    'O problema não é só de organização. A Resolução CFM nº 1.638/2002 define o prontuário como //documento único// que '
    '//possibilita a comunicação entre membros da equipe multiprofissional// e a continuidade da assistência [3]. A Lei nº '
    '13.787/2018 permite guardá-lo em meio digital, desde que preservadas a integridade, a autenticidade e a confidencialidade, '
    'por no mínimo 20 anos a partir do último registro [2]. E dado referente à saúde é dado pessoal sensível na Lei Geral de '
    'Proteção de Dados [1], o que obriga a clínica a saber quem acessou cada prontuário.'))
B.append(corpo(
    'Este trabalho tem como objetivo geral propor, implementar e testar um banco de dados relacional para um prontuário único em '
    'clínica multidisciplinar, tomando como base a Ciclo, plataforma para profissionais de saúde que os autores desenvolvem, que '
    'nasceu atendendo fisioterapeutas e pretende abrir para outras especialidades. Como objetivos específicos, buscamos: (i) '
    'modelar um prontuário em que todas as especialidades escrevam no mesmo lugar; (ii) garantir no próprio banco, e não só na '
    'tela, as regras que impedem o espalhamento; (iii) comprovar cada decisão sobre tipos, restrições, índices e consultas com '
    'testes executados; e (iv) disponibilizar um sistema demonstrativo e o acompanhamento ágil do trabalho no GitHub.'))
B.append(corpo(
    'O restante do artigo está organizado assim: a Seção 2 apresenta trabalhos relacionados; a Seção 3, a metodologia; a Seção 4, '
    'o desenvolvimento, os testes e os resultados; e a Seção 5, as considerações finais.'))

# ---- 2. Trabalhos relacionados ---------------------------------------
B.append(secao('2. Trabalhos Relacionados'))
B.append(corpo(
    'No Sistema Único de Saúde, a estratégia e-SUS APS oferece gratuitamente o Prontuário Eletrônico do Cidadão (PEC) às unidades '
    'da Atenção Primária, com o registro clínico compartilhado pela equipe da unidade [7]. Para a troca de informações entre '
    'estabelecimentos, o Ministério da Saúde instituiu a Rede Nacional de Dados em Saúde (RNDS), com padrões de interoperabilidade '
    '[6]. Fora do país, o OpenMRS é uma plataforma de prontuário eletrônico de código aberto criada para serviços de saúde de '
    'países de baixa e média renda [8].'))
B.append(corpo(
    'Esses sistemas tratam o prontuário em escala de rede pública ou de produto completo. Nosso recorte é menor e mais concreto: a '
    'clínica privada multidisciplinar de pequeno porte, que ainda trabalha com fichas por setor. A diferença principal está em '
    '//onde// as regras moram. Em vez de depender só do código da aplicação, levamos para o banco as regras que evitam o '
    'espalhamento (restrições, gatilhos e funções de leitura), seguindo o princípio de que a integridade deve ser garantida pelo '
    'próprio sistema gerenciador [9], e comprovamos cada uma com um teste executado.'))

# ---- 3. Metodologia ---------------------------------------------------
B.append(secao('3. Metodologia'))
B.append(corpo(
    'O trabalho seguiu quatro etapas: (i) levantamento das situações que espalham o prontuário, a partir do cenário da Seção 1 e '
    'da experiência dos autores no desenvolvimento da Ciclo; (ii) modelagem e implementação do banco; (iii) testes de tipos, '
    'restrições, regras e consultas, e medição dos índices; e (iv) construção de um sistema web para demonstrar o uso. A Figura 1 '
    'compara a situação de partida com a proposta.'))
B.append(figura('17-antes-depois-projetor.png', 15.5))
B.append(legenda_figura('Figura 1. A mesma paciente em três fichas (antes) e no prontuário único (depois).'))
B.append(corpo(
    f'O banco foi implementado em **{ambiente["postgres"].split(" (")[0]}**, executado pelo **PGlite {ambiente["pglite"]}**, uma '
    'distribuição do PostgreSQL compilada para WebAssembly que roda no Node.js e no navegador sem instalação [10, 11]. A escolha '
    'permitiu usar exatamente os mesmos arquivos SQL nos testes automatizados e no sistema demonstrativo, e segue o que a própria '
    'Ciclo já faz nos seus testes. Os testes rodaram em um notebook com processador '
    f'{ambiente["processador"].replace("(R)", "").replace("(TM)", "")}, {ambiente["memoriaGB"]} GB de memória, Windows 11 e '
    f'Node.js {ambiente["node"].lstrip("v")}.'))
B.append(corpo(
    'Dado de saúde real não pode ser usado num trabalho acadêmico sem autorização e anonimização, por isso toda a base é sintética '
    'e reproduzível (a mesma semente aleatória gera sempre os mesmos dados). Ela representa uma clínica fictícia com cinco '
    'especialidades (Medicina, Enfermagem, Fisioterapia, Nutrição e Psicologia), oito profissionais (um deles desligado), seis '
    'pacientes com história escrita à mão, como a Dona Maria, e três anos de atendimentos gerados por script (Tabela 1). As datas '
    'são relativas ao dia em que o banco é montado, para a demonstração sempre parecer o dia de hoje.'))
B.append(legenda_tabela('Tabela 1. Tamanho da base usada nos testes.'))
B.append(tabela(['Tabela', 'Linhas', 'O que guarda'], [
    ['`paciente`', n(linhas['paciente']), 'identidade única de cada pessoa'],
    ['`profissional`', n(linhas['profissional']), 'equipe, com registro no conselho'],
    ['`atendimento`', n(linhas['atendimento']), 'encontro paciente × profissional, com sala e horário'],
    ['`registro_clinico`', n(linhas['registro_clinico']), 'tudo o que foi escrito no prontuário'],
    ['`alergia`', n(linhas['alergia']), 'alertas que aparecem para toda a equipe'],
    ['`condicao`', n(linhas['condicao']), 'problemas de saúde ativos, com CID-10'],
    ['`acesso_prontuario`', n(linhas['acesso_prontuario']), 'quem leu ou escreveu, e quando'],
], [2200, 1300, 4900], tamanho=19, alinhar=['left', 'center', 'left']))
B.append(corpo(
    'Cada teste parte de uma situação real da clínica e declara o que o banco deve fazer: **recusar** a operação, informando o '
    'código de erro do PostgreSQL (SQLSTATE) e o nome da regra violada, ou **aceitar**, quando uma consulta de conferência '
    'verifica o resultado. Todo teste roda dentro de uma transação desfeita ao final (`BEGIN ... ROLLBACK`), para que um não '
    'interfira no outro. Nos índices, a mesma consulta foi medida sem e com o índice, usando o tempo de execução informado pelo '
    'próprio PostgreSQL no `EXPLAIN ANALYZE`; cada valor é a mediana de 15 execuções. Um teste de escala repetiu a medição da '
    'linha do tempo em três tamanhos de clínica.'))
B.append(corpo(
    'O acompanhamento foi feito no GitHub, com quadro Kanban, 16 histórias de usuário cadastradas como //issues// e quatro entregas '
    '(//milestones//), em uma adaptação simples de práticas ágeis [12, 13]. A definição de pronto foi objetiva: uma história só '
    'fecha quando os testes ligados a ela passam. Um script lê os resultados, fecha a história e publica na //issue// a tabela de '
    f'evidência. Código, testes e evidências estão em {REPO}, e o sistema pode ser aberto em {SITE}.'))

# ---- 4. Desenvolvimento e resultados -----------------------------------
B.append(secao('4. Desenvolvimento e Resultados'))
B.append(subsecao('4.1. O modelo do banco'))
B.append(corpo(
    'A Figura 2 mostra o modelo, com oito tabelas. A decisão central foi ter **uma única tabela de registros clínicos para todas '
    'as especialidades**. O que é comum a qualquer área (paciente, profissional, atendimento, tipo, texto e data) virou coluna; o '
    'que muda de uma especialidade para outra (a dor na fisioterapia, o peso na nutrição, a pressão na enfermagem) foi para uma '
    'coluna `JSONB` chamada `medidas`. A alternativa, uma tabela por especialidade, recriaria dentro do banco as planilhas de cada '
    'setor, que são justamente a origem do problema.'))
B.append(figura('18-modelo-banco-projetor.png', 15.5))
B.append(legenda_figura('Figura 2. Modelo do banco do prontuário único (oito tabelas).'))
B.append(corpo(
    'O atendimento guarda a sala e o horário. No papel, a ficha ficava presa à sala; no banco, a sala passa a ser só um atributo '
    'do atendimento, e o prontuário abre de qualquer lugar. A tabela de auditoria registra cada leitura e cada escrita, e as '
    'tabelas de alergia e de condições (com código CID-10) alimentam o cabeçalho que todo profissional vê ao abrir a ficha '
    '(Figura 3), com a resposta para a pergunta "isto está atualizado?": quem escreveu por último, de qual área e em qual sala.'))
B.append(figura('01b-cabecalho-projetor.png', 14))
B.append(legenda_figura('Figura 3. Cabeçalho do prontuário, aberto pela fisioterapeuta: alergia, condições e última atualização.'))

B.append(subsecao('4.2. Tipos de dados'))
B.append(corpo('A Tabela 2 resume as escolhas de tipo, o motivo de cada uma e o teste que a comprova.'))
B.append(legenda_tabela('Tabela 2. Tipos de dados escolhidos e testes executados.'))
tipos = [
    ('`DATE`', 'nascimento', 'data impossível não entra no cadastro', 'T01'),
    ('`ENUM tipo_registro`', 'registro', 'acaba com "evol.", "Evolução" e "EV" convivendo', 'T02'),
    ('`CHAR(11)` + CHECK', 'CPF', 'só os 11 dígitos, sem máscara', 'T03'),
    ('`JSONB` + CHECK', 'medidas', 'o específico de cada área no mesmo registro', 'T04'),
    ('`TIMESTAMPTZ`', 'datas e horas', 'guarda o instante, não o relógio da sala', 'T05'),
    ('`IDENTITY`', 'chaves', 'quem numera é o banco, sem colisão entre setores', 'T06'),
]
B.append(tabela(['Tipo', 'Onde', 'Por quê', 'Teste: resultado obtido'],
                [[t, o, p, f'{i}: {obtido_curto(testes[i])}'] for t, o, p, i in tipos],
                [1900, 1200, 2900, 2500], tamanho=18))
B.append(corpo(
    'A escolha mais discutida foi o `JSONB`. Ele dá flexibilidade sem abrir mão de regra: a escala de dor de 0 a 10 e o peso '
    'plausível são conferidos por `CHECK` dentro do próprio JSON (teste T16, na próxima seção). Já as listas pequenas e fechadas '
    '(tipo de registro, gravidade da alergia, situação do atendimento) viraram `ENUM`, enquanto a especialidade, que é um catálogo '
    'que cresce, virou tabela: especialidade nova entra com um `INSERT`, sem mudar a estrutura.'))

B.append(subsecao('4.3. Restrições de integridade'))
B.append(corpo(
    'A Tabela 3 lista as restrições testadas. Todas as recusas vieram com o código esperado e o nome exato da restrição, o que '
    'mostra que foi aquela regra, e não outra, que barrou a operação.'))
B.append(legenda_tabela('Tabela 3. Restrições, situação real e resultado obtido.'))
restr = [
    ('T07', '`UNIQUE (cpf)`', 'a recepção abre uma segunda ficha da Dona Maria'),
    ('T08', '`CHECK cpf_valido(cpf)`', 'um dígito trocado no CPF criaria outra pessoa'),
    ('T09', '`CHECK` nome completo', 'cadastro só com "Maria"'),
    ('T10', '`CHECK` nascimento', 'ano digitado como 2062'),
    ('T11', '`NOT NULL` texto', 'evolução salva em branco'),
    ('T12', '`CHECK` texto mínimo', 'evolução escrita só "ok"'),
    ('T13', '`FOREIGN KEY`', 'registro em atendimento que não existe'),
    ('T14', '`FOREIGN KEY` composta', 'evolução do José gravada na ficha da Maria'),
    ('T15', '`CHECK` período', 'atendimento que termina antes de começar'),
    ('T16', '`CHECK` no JSONB', 'dor anotada como 15'),
    ('T17', '`UNIQUE` parcial', '"dipirona" de novo, já registrada como "Dipirona"'),
    ('T18', '`UNIQUE` parcial', 'alergia desativada registrada de novo'),
    ('T19', '`UNIQUE` registro no conselho', 'segundo médico com o mesmo CRM'),
]
B.append(tabela(['Teste', 'Restrição', 'Situação real', 'Resultado obtido'],
                [[i, r, s, ('aceito: ' if not testes[i].get('codigo') else 'recusado: ') + obtido_curto(testes[i])] for i, r, s in restr],
                [700, 2100, 2900, 2800], tamanho=18))
B.append(corpo(
    'Três decisões merecem destaque. A primeira é o CPF: além de `UNIQUE`, ele passa por um `CHECK` que chama a função '
    '`cpf_valido`, declarada `IMMUTABLE`, que confere os dois dígitos verificadores; o dígito trocado do cenário inicial não chega '
    'a virar uma segunda pessoa (T08). A segunda é a **chave estrangeira composta**: o registro aponta para '
    '`(atendimento_id, paciente_id)`, e não só para o atendimento, então não existe evolução de um paciente na ficha de outro '
    '(T14). A terceira é o **índice único parcial** da alergia, que vale só para alergias ativas e compara o nome sem maiúscula e '
    'sem acento: impede o alerta duplicado (T17), mas deixa registrar de novo uma alergia desativada por engano (T18).'))
B.append(corpo(
    'O sistema demonstrativo não valida campos de propósito: quem barra é o banco, e a tela mostra a mensagem junto com o código '
    'do PostgreSQL (Figura 4). Assim, a mesma regra vale para qualquer outra tela ou integração que venha a gravar no prontuário.'))
B.append(figura('02-erro-dor-projetor.png', 8.5))
B.append(legenda_figura('Figura 4. A fisioterapeuta anota dor 15 e o banco recusa (SQLSTATE 23514, ck_registro_dor).'))

B.append(subsecao('4.4. Regras de negócio com gatilhos'))
B.append(corpo(
    'Algumas regras dependem de outra tabela ou proíbem uma operação inteira, e por isso não cabem num `CHECK`. Elas foram '
    'implementadas com gatilhos (//triggers//) e estão na Tabela 4. A mais importante é a imutabilidade: no papel, corretivo e '
    'folha arrancada somem com a informação; no banco, um `UPDATE` faria o mesmo sem deixar marca. Por isso, correção é feita por '
    '**retificação**, um registro novo que aponta para o original, que continua visível (Figura 5).'))
B.append(legenda_tabela('Tabela 4. Regras implementadas com gatilhos e testes executados.'))
gat = [
    ('Prontuário não se altera nem se apaga', 'BEFORE UPDATE, DELETE e TRUNCATE levantam erro', 'T20, T21, T22'),
    ('Correção só por retificação, feita pelo autor, uma única vez', 'BEFORE INSERT confere autor e paciente; índice único parcial em `retifica_id`', 'T23, T24, T25'),
    ('Atendimento com falta não recebe evolução', 'BEFORE INSERT lê o status do atendimento', 'T26'),
    ('Profissional desligado não escreve', 'BEFORE INSERT lê `profissional.ativo`', 'T27'),
    ('A hora do registro é a do servidor', 'BEFORE INSERT sobrescreve `criado_em`', 'T28'),
    ('Toda escrita deixa rastro', 'AFTER INSERT grava em `acesso_prontuario`', 'T29'),
    ('A auditoria não pode ser apagada', 'BEFORE UPDATE e DELETE levantam erro', 'T30'),
]
def resultado_varios(ids):
    partes = []
    for i in ids.split(', '):
        t = testes[i]
        partes.append(f'{i} ' + ('ok' if t['passou'] else 'FALHOU'))
    return '; '.join(partes)
B.append(tabela(['Regra', 'Como foi feita', 'Testes'],
                [[r, c, resultado_varios(i)] for r, c, i in gat],
                [3000, 3700, 1800], tamanho=18))
B.append(corpo(
    f'Nos testes T20 a T22, o banco recusou as três operações com `{obtido_curto(testes["T20"])}`. No T24, a fisioterapeuta '
    f'tentou retificar a prescrição da médica e recebeu `{obtido_curto(testes["T24"])}`. No T28, o registro foi pedido com a data '
    f'de ontem e o resultado foi "{testes["T28"]["obtido"]}". A exceção a essa regra é a carga de dados antigos, que liga a opção '
    '`ciclo.carga_historica` só durante a importação.'))
B.append(figura('05-retificacao-projetor.png', 14))
B.append(legenda_figura('Figura 5. Retificação: o registro original fica visível e riscado, e a correção entra por cima.'))

B.append(subsecao('4.5. Consultas, sigilo e LGPD'))
B.append(corpo(
    'A tela não monta consulta na mão: ela chama funções e visões do banco. A função `linha_do_tempo(paciente, leitor)` devolve o '
    'prontuário inteiro, de todas as especialidades, do mais novo para o mais antigo, e faz duas coisas no caminho. Primeiro, '
    f'registra a leitura em `acesso_prontuario` (T32: "{testes["T32"]["obtido"]}"). Segundo, aplica o sigilo: o registro marcado '
    'como sigiloso aparece para todos, mas o conteúdo só abre para a especialidade autora (Figura 6). É o que a Resolução CFP nº '
    '001/2009 orienta para o registro em prontuário compartilhado: deixar para a equipe só o necessário [5]. Os testes T33 e T34 '
    'confirmaram os dois lados.'))
B.append(figura('11-sigilo-projetor.png', 11))
B.append(legenda_figura('Figura 6. O fisioterapeuta do José vê que houve psicologia, mas não o conteúdo das sessões.'))
B.append(corpo(
    f'Para a Dona Maria, a linha do tempo aberta pela fisioterapeuta trouxe "{testes["T31"]["obtido"]}" (T31). A busca de paciente '
    'usa as extensões `unaccent` e `pg_trgm` sobre a função `normalizar(nome)`: a recepção digitou "joao pedro conseicao", sem '
    f'acento e com erro, e o banco respondeu com "{testes["T35"]["obtido"].replace("primeiro resultado: ", "")}" (T35). Antes de '
    f'cadastrar alguém, a função `possiveis_duplicados` compara nome e data de nascimento; para "Maria das Gracas Sousa", o retorno '
    f'foi "{testes["T37"]["obtido"].replace("parecido com: ", "")}" (T37). Esse é o ponto em que o prontuário costumava se '
    'espalhar: a ficha existia, mas ninguém a encontrava.'))

B.append(subsecao('4.6. Índices'))
B.append(corpo(
    'Índice acelera a leitura, mas ocupa espaço e precisa ser atualizado a cada gravação. Por isso, só criamos índices para as '
    'consultas que a clínica repete o dia inteiro, e medimos cada um sem e com o índice (Tabela 5).'))
B.append(legenda_tabela(f'Tabela 5. Tempo de execução sem e com índice (mediana de 15 execuções, {n(linhas["registro_clinico"])} registros).'))

def plano(e, lado):
    nos = [x for x in reversed(e[lado]['nos']) if x != 'Limit']
    texto = ' + '.join(nos)
    usados = e[lado]['indicesUsados']
    if lado == 'sem' and usados:
        texto = texto.replace('Index Scan', f'Index Scan ({usados[0]})', 1)
    return texto
B.append(tabela(['Consulta', 'Índice', 'Sem (ms)', 'Com (ms)', 'Ganho', 'Plano de execução'], [
    [e['titulo'], f'`{e["indice"]}`', ms(e['sem']['mediana']), ms(e['com']['mediana']),
     f'{vezes(e["vezesMaisRapido"])}×', f'sem: {plano(e, "sem")}\ncom: {plano(e, "com")}']
    for e in (I1, I2, I3, I4)
], [1750, 1950, 800, 800, 750, 2450], tamanho=17, alinhar=['left', 'left', 'center', 'center', 'center', 'left']))
B.append(corpo(
    f'O índice composto `(paciente_id, criado_em DESC)` levou a abertura do prontuário de {ms(I1["sem"]["mediana"])} ms para '
    f'{ms(I1["com"]["mediana"])} ms. A ordem das colunas importa: primeiro o banco filtra pelo paciente, depois já encontra os '
    'registros na ordem da data, sem precisar ordenar; no plano, a leitura sequencial da tabela inteira (//Seq Scan//) seguida de '
    'ordenação deu lugar a uma leitura pelo índice (//Index Scan//). A busca por CPF não ganhou índice próprio, porque o `UNIQUE` '
    f'já cria um: o plano da consulta mostrou o uso do `{indices["cpf"]["indice"]}` (I5). A agenda do dia (I4) teve o menor '
    'ganho porque, mesmo sem o índice próprio, o PostgreSQL percorreu inteiro outro índice que também tem a data '
    '(`ix_atendimento_paciente`), o que já é mais barato do que ler a tabela.'))
ix_nome = tam_indice('ix_paciente_nome_busca')
ix_tl = tam_indice('ix_registro_paciente_data')
ix_ac = tam_indice('ix_acesso_paciente_momento')
B.append(corpo(
    f'O custo também foi medido, com `pg_relation_size`. O índice da linha do tempo ocupa {mb(ix_tl)} MB, contra '
    f'{mb(tam_tabela("registro_clinico"))} MB da tabela de registros. O da busca por nome ocupa {mb(ix_nome)} MB, cerca de '
    f'{vezes(ix_nome / tam_tabela("paciente"))} vezes o tamanho da própria tabela de pacientes ({mb(tam_tabela("paciente"))} MB). '
    'Ele só se justifica porque evita a ficha duplicada, que é o centro do problema; numa coluna pouco consultada, esse custo não '
    'valeria a pena.'))
B.append(corpo(
    'Por fim, o teste de escala repetiu a consulta da linha do tempo em três clínicas de tamanhos diferentes, com pacientes e '
    'atendimentos crescendo juntos (Tabela 6).'))
B.append(legenda_tabela('Tabela 6. Linha do tempo conforme a clínica cresce.'))
B.append(tabela(['Pacientes', 'Registros clínicos', 'Sem índice (ms)', 'Com índice (ms)', 'Ganho'], [
    [n(e['pacientes']), n(e['registros']), ms(e['sem']), ms(e['com']), f'{vezes(e["vezes"])}×'] for e in escala
], [1500, 2000, 1700, 1700, 1300], tamanho=19, alinhar=['center'] * 5))
B.append(corpo(
    f'Quando os registros passaram de {n(E_pequena["registros"])} para {n(E_grande["registros"])} (16 vezes mais), o tempo sem '
    f'índice subiu de {ms(E_pequena["sem"])} ms para {ms(E_grande["sem"])} ms, crescendo junto com a tabela. Com o índice, ficou '
    f'entre {ms(min(e["com"] for e in escala))} ms e {ms(max(e["com"] for e in escala))} ms nos três tamanhos. Em outras palavras: '
    'sem índice, cada novo paciente deixa o prontuário de todos um pouco mais lento; com índice, o tempo de abrir a ficha não '
    'depende do tamanho da clínica.'))

B.append(subsecao('4.7. Resultado geral'))
B.append(corpo(
    f'Os {len(testes)} testes tiveram o resultado esperado ({passaram} de {len(testes)}), tanto no terminal quanto no laboratório de '
    'testes do sistema, que roda a mesma bateria ao vivo no navegador (Figura 7). A Tabela 7 lista todos os casos. No GitHub, as '
    'histórias de usuário do banco foram fechadas automaticamente pelo script de definição de pronto, cada uma com a tabela de '
    'evidência no comentário da //issue//.'))
B.append(figura('12-laboratorio-projetor.png', 15.5))
B.append(legenda_figura(f'Figura 7. Laboratório de testes do sistema: {passaram} de {len(testes)} testes executados ao vivo no navegador, '
                        'numa base menor (2.506 pacientes e 90.102 registros) para a página abrir rápido.'))
B.append(legenda_tabela('Tabela 7. Todos os testes executados (E = recusar com o código; A = aceitar e conferir).'))
B.append(tabela(['Teste', 'Grupo', 'O que foi testado', 'Esp.', 'Obtido', 'Resultado'], [
    [t['id'], t['grupo'], t['titulo'], 'E' if t['esperado'].startswith('Recusar') else 'A',
     obtido_curto(t), 'passou' if t['passou'] else 'FALHOU']
    for t in testes.values()
], [650, 1150, 2750, 520, 2350, 1080], tamanho=16, alinhar=['left', 'left', 'left', 'center', 'left', 'center']))

# ---- 5. Conclusão -----------------------------------------------------
B.append(secao('5. Conclusão'))
B.append(corpo(
    'O prontuário espalhado é, no fundo, um problema de dados: a mesma informação existe em vários lugares, sem uma regra que '
    'diga qual vale. Ao concentrar o prontuário em um único banco e levar para dentro dele as regras que antes dependiam do '
    'cuidado de cada pessoa, o modelo proposto impede, por construção, as falhas do cenário inicial: a segunda ficha da mesma '
    'pessoa, a folha na pasta errada, o registro apagado, a alergia que não chega e o acesso sem rastro. Os '
    f'{len(testes)} testes executados confirmaram o comportamento de cada tipo, restrição, regra e consulta, e os experimentos '
    f'mostraram que os índices escolhidos mantêm a abertura do prontuário abaixo de 0,1 ms mesmo com {n(E_grande["registros"])} '
    'registros, enquanto sem eles o tempo cresce junto com a clínica.'))
B.append(corpo(
    'Como limitações, destacamos: os dados são sintéticos; o PGlite atende uma conexão por vez, então não testamos dois '
    'profissionais gravando ao mesmo tempo; o controle de acesso por papel ainda não foi implementado no banco (a leitura passa '
    'pela função que audita, mas a tabela continua acessível a um administrador); e o CPF obrigatório deixa de fora quem ainda '
    'não tem o documento, como recém-nascidos e estrangeiros.'))
B.append(corpo(
    'Como trabalhos futuros, propomos: (i) controle de acesso por especialidade com //Row Level Security//; (ii) assinatura '
    'digital dos registros com certificado ICP-Brasil, exigida para o prontuário sem papel [4]; (iii) integração com a RNDS pelo '
    'padrão HL7 FHIR [6, 14]; (iv) testes de concorrência em um servidor PostgreSQL; (v) identificação pelo Cartão Nacional de '
    'Saúde para quem não tem CPF; e (vi) a incorporação do modelo à Ciclo, que hoje atende fisioterapeutas e é o caminho natural '
    'para levar o prontuário único a clínicas reais.'))

# ---- Declaração de IA ---------------------------------------------------
B.append(secao('Declaração de Uso de Inteligência Artificial'))
B.append(corpo(
    'Em conformidade com a Portaria CNPq nº 2.664/2026 e com as orientações da Universidade Tiradentes, os autores declaram que '
    'utilizaram o assistente de IA generativa Claude (Anthropic) como apoio na escrita do código (scripts SQL, testes '
    'automatizados e telas do sistema demonstrativo), na geração dos dados sintéticos, na organização das tabelas de evidência e '
    'na redação e revisão deste texto. O problema, o tema e a proposta foram definidos pelos autores, e todos os resultados '
    'apresentados vêm de testes efetivamente executados, que podem ser repetidos com os scripts do repositório. A autoria e a '
    'responsabilidade pelo conteúdo permanecem integralmente dos autores.'))

# ---- Referências ---------------------------------------------------------
B.append(secao('Referências'))
refs = [
    '[1] BRASIL. Lei nº 13.709, de 14 de agosto de 2018. Lei Geral de Proteção de Dados Pessoais (LGPD). Diário Oficial da União, Brasília, 2018.',
    '[2] BRASIL. Lei nº 13.787, de 27 de dezembro de 2018. Dispõe sobre a digitalização e a utilização de sistemas informatizados para a guarda, o armazenamento e o manuseio de prontuário de paciente. Diário Oficial da União, Brasília, 2018.',
    '[3] CONSELHO FEDERAL DE MEDICINA. Resolução CFM nº 1.638, de 10 de julho de 2002. Define prontuário médico e torna obrigatória a criação da Comissão de Revisão de Prontuários nas instituições de saúde. Brasília, 2002.',
    '[4] CONSELHO FEDERAL DE MEDICINA. Resolução CFM nº 1.821, de 11 de julho de 2007. Aprova as normas técnicas concernentes à digitalização e uso dos sistemas informatizados para a guarda e manuseio dos documentos dos prontuários dos pacientes. Brasília, 2007.',
    '[5] CONSELHO FEDERAL DE PSICOLOGIA. Resolução CFP nº 001/2009. Dispõe sobre a obrigatoriedade do registro documental decorrente da prestação de serviços psicológicos. Brasília, 2009.',
    '[6] BRASIL. Ministério da Saúde. Portaria GM/MS nº 1.434, de 28 de maio de 2020. Institui o Programa Conecte SUS e a Rede Nacional de Dados em Saúde (RNDS). Brasília, 2020.',
    '[7] BRASIL. Ministério da Saúde. e-SUS Atenção Primária: Prontuário Eletrônico do Cidadão (PEC). Brasília: Ministério da Saúde.',
    '[8] MAMLIN, B. W. et al. Cooking up an open source EMR for developing countries: OpenMRS, a recipe for successful collaboration. AMIA Annual Symposium Proceedings, p. 529-533, 2006.',
    '[9] ELMASRI, R.; NAVATHE, S. B. Sistemas de banco de dados. 7. ed. São Paulo: Pearson, 2018.',
    '[10] THE POSTGRESQL GLOBAL DEVELOPMENT GROUP. PostgreSQL Documentation: constraints, triggers, indexes and EXPLAIN. Disponível em: https://www.postgresql.org/docs/. Acesso em: 24 nov. 2026.',
    '[11] ELECTRICSQL. PGlite: Postgres in WASM. Disponível em: https://pglite.dev. Acesso em: 24 nov. 2026.',
    '[12] SCHWABER, K.; SUTHERLAND, J. The Scrum Guide. 2020. Disponível em: https://scrumguides.org. Acesso em: 24 nov. 2026.',
    '[13] BECK, K. et al. Manifesto for Agile Software Development. 2001. Disponível em: https://agilemanifesto.org. Acesso em: 24 nov. 2026.',
    '[14] HL7 INTERNATIONAL. FHIR R4: Fast Healthcare Interoperability Resources. Disponível em: https://hl7.org/fhir/R4/. Acesso em: 24 nov. 2026.',
]
for r in refs:
    B.append(referencia(r))


# =====================================================================
# Montagem do .docx a partir do modelo
# =====================================================================
with zipfile.ZipFile(MODELO) as z:
    arquivos = {i.filename: z.read(i.filename) for i in z.infolist()}

doc = arquivos['word/document.xml'].decode('utf8')
cabeca = doc[:doc.index('<w:body>') + len('<w:body>')]
sect = re.search(r'<w:sectPr.*?</w:sectPr>', doc, re.S).group(0)
arquivos['word/document.xml'] = (cabeca + ''.join(B) + sect + '</w:body></w:document>').encode('utf8')

rels = arquivos['word/_rels/document.xml.rels'].decode('utf8')
novas = ''.join(
    f'<Relationship Id="rIdEvid{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="{nome}"/>'
    for i, (nome, _) in enumerate(MIDIAS, start=1))
arquivos['word/_rels/document.xml.rels'] = rels.replace('</Relationships>', novas + '</Relationships>').encode('utf8')
for nome, dados in MIDIAS:
    arquivos[f'word/{nome}'] = dados

agora = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
arquivos['docProps/core.xml'] = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    '<dc:title>Prontuário Único: um Banco de Dados para Acabar com o Prontuário Espalhado</dc:title>'
    '<dc:creator>Altemir Cruz da Silva Filho; Juscelino Santos de Andrade</dc:creator>'
    '<cp:lastModifiedBy>Altemir Cruz da Silva Filho</cp:lastModifiedBy><cp:revision>1</cp:revision>'
    f'<dcterms:created xsi:type="dcterms:W3CDTF">{agora}</dcterms:created>'
    f'<dcterms:modified xsi:type="dcterms:W3CDTF">{agora}</dcterms:modified></cp:coreProperties>'
).encode('utf8')

SAIDA.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(SAIDA, 'w', zipfile.ZIP_DEFLATED) as z:
    # [Content_Types].xml primeiro, sem as sobras "[trash]" do modelo
    ordem = ['[Content_Types].xml'] + [k for k in arquivos if k != '[Content_Types].xml']
    for nome in ordem:
        if nome.startswith('[trash]') or nome.endswith('/'):
            continue
        z.writestr(nome, arquivos[nome])
print(f'artigo gerado: {SAIDA} ({len(MIDIAS)} figuras, {len(B)} blocos)')
