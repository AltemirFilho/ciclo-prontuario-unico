"""
Monta a apresentação num ARQUIVO ÚNICO (fontes, estilo, motor e imagens
embutidos), que abre com dois cliques em qualquer computador, sem
internet e sem servidor. É o plano C do dia.

Uso:
    python scripts/montar_apresentacao_unica.py <saida.html>
"""
import base64
import io
import re
import sys
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]
DECK = RAIZ / 'docs' / 'apresentacao'
SAIDA = Path(sys.argv[1])

html = (DECK / 'index.html').read_text(encoding='utf-8')
css = (DECK / 'estilo.css').read_text(encoding='utf-8')
motor = (DECK / 'motor.js').read_text(encoding='utf-8')


def dado(caminho, tipo):
    return f'data:{tipo};base64,' + base64.b64encode(caminho.read_bytes()).decode('ascii')


# fontes dentro do CSS
css = css.replace("url('fontes/geist.woff2')", f"url('{dado(DECK / 'fontes' / 'geist.woff2', 'font/woff2')}')")
css = css.replace("url('fontes/geist-mono.woff2')", f"url('{dado(DECK / 'fontes' / 'geist-mono.woff2', 'font/woff2')}')")


# imagens: reduzidas para 1600 px e convertidas em JPEG (o arquivo fica leve)
def embutir(m):
    arquivo = (DECK / m.group(1)).resolve()
    img = Image.open(arquivo).convert('RGB')
    if img.width > 1600:
        img = img.resize((1600, round(img.height * 1600 / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=88, optimize=True)
    return 'src="data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii') + '"'


html = re.sub(r'src="(\.\./evidencias/[^"]+\.png)"', embutir, html)
html = html.replace('<link rel="stylesheet" href="estilo.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script src="motor.js"></script>', f'<script>\n{motor}\n</script>')
# o link relativo do sistema vira o endereço do servidor local (INICIAR.bat)
html = html.replace('href="../../app/?quem=camila"', 'href="http://localhost:4517/app/?quem=camila"')
html = html.replace('<small>mesma pasta da apresentação</small>', '<small>localhost:4517 (com o INICIAR.bat aberto)</small>')

assert 'href="estilo.css"' not in html and 'src="motor.js"' not in html and '../evidencias' not in html
SAIDA.parent.mkdir(parents=True, exist_ok=True)
SAIDA.write_text(html, encoding='utf-8')
print(f'{SAIDA} ({SAIDA.stat().st_size / 1024 / 1024:.1f} MB)')
