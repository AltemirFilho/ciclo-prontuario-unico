"""
Tira as capturas de tela usadas no artigo e nos slides.

Uso (com o servidor rodando em http://localhost:4517):
    python scripts/capturas.py docs/evidencias projetor
    python scripts/capturas.py docs/evidencias escuro

Cada captura é o sistema de verdade, com o banco montado no navegador e
as ações feitas como um usuário faria (digitar, clicar, salvar).
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4517/app/'
SAIDA = Path(sys.argv[1])
TEMA = sys.argv[2] if len(sys.argv) > 2 else 'projetor'
SAIDA.mkdir(parents=True, exist_ok=True)

MARIA, JOSE = '18398029609', '14041343526'


def arquivo(nome):
    return str(SAIDA / f'{nome}-{TEMA}.png')


def abrir(pagina, quem, paciente=None, aba=None):
    url = f'{BASE}?quem={quem}&tema={TEMA}'
    if paciente:
        url += f'&paciente={paciente}'
    if aba:
        url += f'&aba={aba}'
    pagina.goto(url)
    pagina.wait_for_function('window.__cicloPronto === true', timeout=120000)
    pagina.wait_for_timeout(700)


def recorte(pagina, seletores, margem=8):
    """Foto da área que cobre todos os seletores (na tela visível)."""
    pagina.locator(seletores[0]).scroll_into_view_if_needed()
    caixas = [pagina.locator(s).bounding_box() for s in seletores]
    x0 = min(c['x'] for c in caixas) - margem
    y0 = min(c['y'] for c in caixas) - margem
    x1 = max(c['x'] + c['width'] for c in caixas) + margem
    y1 = max(c['y'] + c['height'] for c in caixas) + margem
    return {'x': max(x0, 0), 'y': max(y0, 0), 'width': x1 - max(x0, 0), 'height': y1 - max(y0, 0)}


with sync_playwright() as p:
    navegador = p.chromium.launch()
    contexto = navegador.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2,
                                     locale='pt-BR', timezone_id='America/Maceio')
    pg = contexto.new_page()

    # 1) A fisio abre o prontuário da Dona Maria
    abrir(pg, 'camila', MARIA)
    pg.screenshot(path=arquivo('01-prontuario'))
    pg.locator('.paciente-topo').screenshot(path=arquivo('01b-cabecalho'))

    # 2) O banco recusa a dor 15
    pg.fill('#reg-texto', 'Sessão de isometria de quadríceps, sem carga, como pediu a Dra. Helena.')
    pg.fill('#m-dor', '15')
    pg.click('#form-registro button[type=submit]')
    pg.wait_for_selector('#aviso-registro .aviso-banco')
    pg.locator('#lateral .cartao').first.screenshot(path=arquivo('02-erro-dor'))

    # 3) Registro válido entra no topo da linha do tempo
    pg.fill('#m-dor', '3')
    pg.click('#form-registro button[type=submit]')
    pg.wait_for_selector('.toast.ok')
    pg.wait_for_timeout(2800)

    # 4) Tentar apagar: o gatilho recusa
    pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
    pg.locator('[data-apagar]').first.click()
    pg.wait_for_selector('.toast.erro')
    pg.locator('.toast.erro').screenshot(path=arquivo('04-apagar-recusado'))
    pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")

    # 5) Retificação: a original fica riscada, a correção entra por cima
    pg.locator('[data-retificar]').first.click()
    pg.fill('#reg-texto', 'Retificação: isometria de quadríceps, 3 séries de 10, joelho direito sem carga.')
    pg.click('#form-registro button[type=submit]')
    pg.wait_for_selector('.toast.ok')
    pg.wait_for_timeout(2800)
    pg.evaluate("window.scrollTo(0, 0)")
    pg.screenshot(path=arquivo('05-retificacao'),
                  clip=recorte(pg, ['#linha-do-tempo > li:nth-child(1)', '#linha-do-tempo > li:nth-child(2)']))

    # 6) Auditoria: quem abriu e quem escreveu
    pg.locator('#lateral .cartao').nth(1).screenshot(path=arquivo('06-auditoria'))

    # 7) Alergia repetida (índice único parcial)
    pg.evaluate("window.scrollTo(0, 0)")
    pg.click('#abrir-alergia')
    pg.fill('#al-subst', 'dipirona')
    pg.click('#form-alergia button[type=submit]')
    pg.wait_for_selector('#aviso-alergia .aviso-banco')
    pg.locator('.paciente-topo').screenshot(path=arquivo('07-alergia-repetida'))

    # 8) Busca sem acento e com erro de digitação
    pg.fill('#busca', 'joao pedro conseicao')
    pg.wait_for_selector('#resultados-busca li button')
    pg.wait_for_timeout(300)
    pg.locator('.coluna-fixa .cartao').first.screenshot(path=arquivo('08-busca'))

    # 9) Cadastro: aviso de ficha parecida, depois CPF inválido
    pg.click('#novo-paciente')
    pg.fill('#np-nome', 'Maria das Gracas Sousa')
    pg.fill('#np-cpf', '183.980.296-08')
    pg.fill('#np-nasc', '1959-03-12')
    pg.click('#np-salvar')
    pg.wait_for_selector('.parecidos')
    pg.locator('#modal-paciente').screenshot(path=arquivo('09-ficha-parecida'))
    pg.click('#nao-e-ninguem')
    pg.wait_for_selector('#aviso-paciente .aviso-banco')
    pg.locator('#modal-paciente').screenshot(path=arquivo('10-cpf-invalido'))
    pg.click('#np-cancelar')

    # 11) Sigilo: o fisio do José vê que houve psicologia, mas não o conteúdo
    abrir(pg, 'bruno', JOSE)
    pg.locator('#filtros button', has_text='Psicologia').click()
    pg.wait_for_timeout(300)
    pg.screenshot(path=arquivo('11-sigilo'), clip=recorte(pg, ['.paciente-topo', '#linha-do-tempo']))

    # 12) Laboratório: os 38 testes ao vivo
    pg.click('[data-aba="laboratorio"]')
    pg.wait_for_function("/38\\/38/.test(document.querySelector('#n-passaram')?.textContent || '')", timeout=120000)
    pg.wait_for_timeout(300)
    pg.evaluate("window.scrollTo(0, 0)")
    pg.screenshot(path=arquivo('12-laboratorio'))
    pg.locator('.tabela-testes').screenshot(path=arquivo('12b-tabela-testes-completa'))

    # 13) Índices medidos no navegador
    pg.click('#rodar-indices')
    pg.wait_for_function("document.querySelector('#prova-cpf')?.innerText?.length > 0", timeout=180000)
    pg.wait_for_timeout(900)
    pg.locator('#indices').screenshot(path=arquivo('13-indices'))
    pg.locator('#escala').screenshot(path=arquivo('14-escala'))

    # 15) Console: as restrições que existem de verdade no banco
    pg.click('[data-aba="console"]')
    pg.wait_for_selector('.prontas button')
    pg.locator('.prontas button', has_text='Todas as restrições').click()
    pg.wait_for_selector('.resultado-sql table')
    pg.wait_for_timeout(300)
    pg.screenshot(path=arquivo('15-console-restricoes'))
    pg.locator('.prontas button', has_text='Tentar apagar o prontuário').click()
    pg.wait_for_selector('#saida .aviso-banco.erro')
    pg.screenshot(path=arquivo('16-console-delete'))

    # 17) Como funciona: antes e depois, e o modelo do banco
    pg.click('[data-aba="como"]')
    pg.wait_for_selector('.der')
    pg.wait_for_timeout(400)
    pg.locator('.antes-depois').screenshot(path=arquivo('17-antes-depois'))
    pg.locator('.der').screenshot(path=arquivo('18-modelo-banco'))

    navegador.close()
    print('capturas em', SAIDA)
