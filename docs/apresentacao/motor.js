/* Motor dos slides (o mesmo da defesa do TCC): navegação por slides e paradas, rodapé, menu, laser e captura */
(() => {
  const slides = [...document.querySelectorAll('.slide')];
  const rodSec = document.querySelector('#rodape .sec');
  const rodNum = document.querySelector('#rodape .num');
  const barra = document.querySelector('#progresso i');
  const menu = document.getElementById('menu');
  const laser = document.getElementById('laser');
  const preto = document.getElementById('preto');
  const passos = s => +s.dataset.steps || 0;
  const totalParadas = slides.reduce((t, s) => t + passos(s) + 1, 0);
  let i = 0, k = 0, t0 = performance.now();
  // proteção do passador: tecla segurada (auto-repetição) não avança, e dois toques em menos de 0,2 s contam como um
  const INTERVALO_MIN = 200;
  let ultimaNav = -Infinity;
  const libera = () => { const agora = performance.now(); if (agora - ultimaNav < INTERVALO_MIN) return false; ultimaNav = agora; return true; };

  // monta as figuras uma vez
  const figuras = [];
  document.querySelectorAll('[data-fig]').forEach(el => {
    const f = window.FIG && FIG[el.dataset.fig];
    if (!f) return;
    const st = f.montar(el) || {};
    figuras.push({ el, f, st, slide: el.closest('.slide') });
  });

  function aplicarPasso() {
    const s = slides[i];
    // o passo do slide vai em data-passo: data-k é só dos elementos que entram a cada clique
    // (com data-k no próprio slide, a regra [data-k] do CSS descia o slide inteiro 1,8rem e cortava o esmaecer)
    s.dataset.passo = k;
    s.querySelectorAll('[data-k]').forEach(el => {
      const n = +el.dataset.k;
      el.classList.toggle('vis', k >= n);
      el.classList.toggle('atual', k === n);
    });
    s.querySelectorAll('[data-ate]').forEach(el => el.classList.toggle('some', k > +el.dataset.ate));
    if (window.AULA_PASSO) AULA_PASSO(s, k);
    figuras.forEach(o => { if (o.slide === s && o.f.passo) o.f.passo(o.st, k); });
    let feito = 0;
    for (let j = 0; j < i; j++) feito += passos(slides[j]) + 1;
    feito += k + 1;
    barra.style.width = (100 * feito / totalParadas).toFixed(2) + '%';
    // pontinhos no rodapé: quantos cliques este slide ainda guarda
    const pontos = document.querySelector('#rodape .pontos');
    if (pontos) pontos.innerHTML = passos(s) ? Array.from({ length: passos(s) + 1 }, (_, j) => `<i class="${j <= k ? 'on' : ''}"></i>`).join('') : '';
    history.replaceState(null, '', '#' + (i + 1) + (k ? '.' + k : ''));
  }

  function ir(n, kk = 0) {
    n = Math.max(0, Math.min(slides.length - 1, n));
    const mudou = n !== i || !slides[n].classList.contains('ativo');
    if (mudou) {
      slides.forEach((s, j) => s.classList.toggle('ativo', j === n));
      i = n; t0 = performance.now();
      const s = slides[i];
      document.body.classList.toggle('escuro', s.classList.contains('escuro'));
      document.body.classList.toggle('capa', s.classList.contains('capa'));
      rodSec.textContent = (document.body.dataset.rodape || '') + (s.dataset.sec ? ' · ' + s.dataset.sec : '');
      rodNum.textContent = (i + 1) + ' / ' + slides.length;
      figuras.forEach(o => { if (o.slide === s && o.f.entrar) o.f.entrar(o.st); });
    }
    k = Math.max(0, Math.min(passos(slides[i]), kk));
    aplicarPasso();
  }

  const prox = () => { if (k < passos(slides[i])) { k++; aplicarPasso(); } else if (i < slides.length - 1) ir(i + 1, 0); };
  const ant = () => { if (k > 0) { k--; aplicarPasso(); } else if (i > 0) ir(i - 1, passos(slides[i - 1])); };

  // menu
  const grade = menu.querySelector('.grade-menu');
  slides.forEach((s, j) => {
    const b = document.createElement('button');
    b.innerHTML = '<span>' + String(j + 1).padStart(2, '0') + '</span>' + (s.dataset.titulo || '');
    b.onclick = e => { e.stopPropagation(); fecharMenu(); ir(j, 0); };
    grade.appendChild(b);
  });
  const abrirMenu = () => { [...grade.children].forEach((b, j) => b.classList.toggle('atual', j === i)); menu.classList.add('on'); };
  const fecharMenu = () => menu.classList.remove('on');

  function telaCheia() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
  }

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tecla = e.key;
    if (preto.classList.contains('on') && !['b', 'B', '.', 'Escape'].includes(tecla)) { preto.classList.remove('on'); e.preventDefault(); return; }
    if (menu.classList.contains('on')) { if (tecla === 'Escape' || tecla === 'm' || tecla === 'M') fecharMenu(); return; }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(tecla)) { e.preventDefault(); if (!e.repeat && libera()) prox(); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(tecla)) { e.preventDefault(); if (!e.repeat && libera()) ant(); }
    else if (tecla === 'Home') ir(0, 0);
    else if (tecla === 'End') ir(slides.length - 1, 0);
    else if (tecla === 'f' || tecla === 'F') telaCheia();
    else if (tecla === 'm' || tecla === 'M' || tecla === 'Escape') { if (tecla !== 'Escape') abrirMenu(); }
    else if (tecla === 'l' || tecla === 'L') { laser.classList.toggle('on'); document.body.classList.toggle('sem-cursor', laser.classList.contains('on')); }
    else if (tecla === 'b' || tecla === 'B' || tecla === '.') preto.classList.toggle('on');
  });

  document.addEventListener('click', e => {
    if (menu.classList.contains('on') || e.target.closest('a,button')) return;
    if (preto.classList.contains('on')) { preto.classList.remove('on'); return; }
    if (!libera()) return;
    if (e.clientX < innerWidth * 0.18) ant(); else prox();
  });
  document.addEventListener('contextmenu', e => { e.preventDefault(); if (libera()) ant(); });

  let toqueX = null;
  document.addEventListener('touchstart', e => { toqueX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (toqueX === null) return;
    const dx = e.changedTouches[0].clientX - toqueX; toqueX = null;
    if (Math.abs(dx) > 40 && libera()) { dx < 0 ? prox() : ant(); }
  });

  // cursor some sozinho; laser acompanha o mouse
  let ocioso;
  document.addEventListener('mousemove', e => {
    laser.style.left = e.clientX + 'px'; laser.style.top = e.clientY + 'px';
    if (!laser.classList.contains('on')) {
      document.body.classList.remove('sem-cursor');
      clearTimeout(ocioso); ocioso = setTimeout(() => document.body.classList.add('sem-cursor'), 2500);
    }
  });

  // laço de animação: só as figuras do slide ativo
  let ultimoQuadro = 0;
  function quadro(agora) {
    ultimoQuadro = performance.now();
    const t = (agora - t0) / 1000;
    for (const o of figuras) if (o.f.tick && o.slide === slides[i]) o.f.tick(o.st, t);
  }
  function laco(agora) { quadro(agora); requestAnimationFrame(laco); }

  // posição inicial: ?slide=N&k=K (capturas) ou #N.K (recarregar sem perder o lugar)
  const q = new URLSearchParams(location.search);
  let n0 = 0, k0 = 0;
  if (q.has('slide')) { n0 = +q.get('slide') - 1; k0 = +q.get('k') || 0; }
  else if (/^#\d+/.test(location.hash)) { const [a, b] = location.hash.slice(1).split('.'); n0 = +a - 1; k0 = +b || 0; }
  if (q.has('slide')) {
    // modo captura: sem transições, figuras adiantadas até o instante ?t= (padrão 6 s)
    const pdf = q.has('pdf');
    document.documentElement.classList.add('captura');
    if (pdf) document.documentElement.classList.add('pdf');
    ir(n0, k0);
    const tc = q.has('t') ? +q.get('t') : 6;
    const adianta = (o, t) => { for (let n = 240; n >= 0; n--) o.f.tick(o.st, t - n / 60); };
    for (const o of figuras) {
      if (!o.f.tick || o.slide !== slides[i]) continue;
      // modo PDF: o movimento vira sequência; cada instante-chave deixa uma cópia esmaecida (fantasma)
      if (pdf && o.f.quadros) for (const qd of o.f.quadros(o.st, k)) {
        adianta(o, qd.t);
        o.f.grupos(o.st).forEach(g => { const c = g.cloneNode(true); c.setAttribute('opacity', qd.op); c.classList.add('fantasma'); g.parentNode.insertBefore(c, g); });
      }
      adianta(o, tc);
    }
    if (pdf) {
      for (const o of figuras) if (o.slide === slides[i] && o.f.pdf) o.f.pdf(o.st, k);
      document.querySelectorAll('.atual').forEach(e => e.classList.remove('atual'));
      if (q.has('pg')) { rodNum.textContent = q.get('pg') + ' / ' + q.get('tot'); barra.style.width = (100 * q.get('pg') / q.get('tot')).toFixed(2) + '%'; }
    }
    return;
  }
  ir(n0, k0);
  requestAnimationFrame(laco);
  // salvaguarda: se o navegador segurar o requestAnimationFrame, um temporizador assume
  setInterval(() => { if (performance.now() - ultimoQuadro > 250) quadro(performance.now()); }, 33);
})();
