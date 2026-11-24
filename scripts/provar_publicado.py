"""
Prova que o que vai ser usado na sala funciona de verdade:
  1) o sistema NO AR (GitHub Pages) monta o banco e roda os 38 testes;
  2) a apresentação NO AR abre;
  3) a apresentação em arquivo único abre sem servidor (file://) com
     fontes e imagens embutidas.

Uso:
    python scripts/provar_publicado.py <apresentacao_unica.html> <pasta_fotos>
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

UNICA = Path(sys.argv[1]).resolve()
FOTOS = Path(sys.argv[2])
FOTOS.mkdir(parents=True, exist_ok=True)
SITE = 'https://altemirfilho.github.io/ciclo-prontuario-unico/'

with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={'width': 1440, 'height': 900})
    pg = ctx.new_page()
    erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))

    # 1) sistema no ar
    pg.goto(SITE + 'app/?quem=camila&paciente=18398029609', wait_until='domcontentloaded')
    pg.wait_for_function('window.__cicloPronto === true', timeout=180000)
    nome = pg.text_content('#prontuario h2')
    pg.click('[data-aba="laboratorio"]')
    pg.wait_for_function("/\\d+\\/38/.test(document.querySelector('#n-passaram')?.textContent || '')", timeout=180000)
    placar = pg.text_content('#n-passaram')
    pg.screenshot(path=str(FOTOS / 'no-ar-laboratorio.png'))
    print('sistema no ar:', nome, '| testes:', placar, '| erros JS:', erros or 'nenhum')

    # 2) apresentação no ar
    pg.goto(SITE + 'docs/apresentacao/?slide=10&k=0')
    pg.wait_for_timeout(1500)
    print('apresentação no ar: slides =', pg.evaluate("document.querySelectorAll('.slide').length"),
          '| fonte Geist:', pg.evaluate("document.fonts.check('700 40px Geist')"))
    pg.screenshot(path=str(FOTOS / 'no-ar-slide10.png'))

    # 3) arquivo único, sem servidor
    pg.goto(UNICA.as_uri() + '?slide=4&k=0')
    pg.wait_for_timeout(1500)
    imagens = pg.evaluate("[...document.images].map(i => i.complete && i.naturalWidth > 0)")
    print('arquivo único: imagens carregadas =', sum(imagens), 'de', len(imagens),
          '| fonte Geist:', pg.evaluate("document.fonts.check('700 40px Geist')"))
    pg.screenshot(path=str(FOTOS / 'arquivo-unico-slide4.png'))
    nav.close()
