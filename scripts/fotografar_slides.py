"""
Fotografa cada slide no estado final (todas as paradas) e a página de issues
do GitHub usada no slide da metodologia.

Uso (servidor rodando em http://localhost:4517):
    python scripts/fotografar_slides.py <pasta_saida> [--github]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

SAIDA = Path(sys.argv[1])
SAIDA.mkdir(parents=True, exist_ok=True)
DECK = 'http://localhost:4517/docs/apresentacao/'
EVID = Path(__file__).resolve().parents[1] / 'docs' / 'evidencias'

with sync_playwright() as p:
    nav = p.chromium.launch()

    if '--github' in sys.argv:
        ctx = nav.new_context(viewport={'width': 1280, 'height': 860}, device_scale_factor=2, locale='pt-BR', color_scheme='dark')
        pg = ctx.new_page()
        pg.goto('https://github.com/AltemirFilho/ciclo-prontuario-unico/issues?q=is%3Aissue', wait_until='networkidle')
        pg.wait_for_timeout(1500)
        pg.screenshot(path=str(EVID / 'github-issues.png'))
        pg.goto('https://github.com/AltemirFilho/ciclo-prontuario-unico/milestones?state=closed', wait_until='networkidle')
        pg.wait_for_timeout(1000)
        pg.screenshot(path=str(EVID / 'github-entregas.png'))
        ctx.close()

    ctx = nav.new_context(viewport={'width': 1600, 'height': 900})
    pg = ctx.new_page()
    pg.goto(DECK)
    pg.wait_for_timeout(800)
    total = pg.evaluate("document.querySelectorAll('.slide').length")
    for n in range(1, total + 1):
        passos = pg.evaluate(f"+document.querySelectorAll('.slide')[{n - 1}].dataset.steps || 0")
        pg.goto(f'{DECK}?slide={n}&k={passos}')
        pg.wait_for_timeout(700)
        pg.screenshot(path=str(SAIDA / f's{n:02d}.png'))
    print(total, 'slides fotografados em', SAIDA)
    nav.close()
