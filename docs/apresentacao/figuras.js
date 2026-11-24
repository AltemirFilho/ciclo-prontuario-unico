/* Figuras animadas dos slides. O motor chama, para cada [data-fig]:
   montar(el) uma vez · entrar(st) quando o slide aparece · tick(st, t) a cada quadro
   (t = segundos desde que o slide apareceu). No modo captura o motor adianta o
   tempo, então tudo aparece no estado final. */
window.FIG = {
  // número que conta de 0 até data-alvo (data-casas, data-atraso, data-dur)
  contador: {
    montar(el) {
      return {
        el,
        alvo: +el.dataset.alvo,
        casas: +(el.dataset.casas || 0),
        atraso: +(el.dataset.atraso || 0.4),
        dur: +(el.dataset.dur || 1.4),
      }
    },
    entrar(st) { st.el.textContent = (0).toFixed(st.casas).replace('.', ',') },
    tick(st, t) {
      const p = Math.min(1, Math.max(0, (t - st.atraso) / st.dur))
      const suave = 1 - Math.pow(1 - p, 3)
      st.el.textContent = (st.alvo * suave).toFixed(st.casas).replace('.', ',')
    },
  },

  // terminal que digita comandos e mostra a resposta do banco
  terminal: {
    montar(el) {
      const linhas = [...el.querySelectorAll('[data-linha]')].map((l) => ({
        el: l, texto: l.textContent, inicio: +l.dataset.inicio, tipo: l.dataset.linha,
      }))
      return { el, linhas }
    },
    entrar(st) { for (const l of st.linhas) { l.el.textContent = ''; l.el.classList.remove('on') } },
    tick(st, t) {
      for (const l of st.linhas) {
        if (l.tipo === 'cmd') {
          const n = Math.max(0, Math.min(l.texto.length, Math.floor((t - l.inicio) * 28)))
          l.el.textContent = l.texto.slice(0, n)
          l.el.classList.toggle('on', t >= l.inicio)
          l.el.classList.toggle('digitando', n > 0 && n < l.texto.length)
        } else {
          const on = t >= l.inicio
          l.el.textContent = on ? l.texto : ''
          l.el.classList.toggle('on', on)
        }
      }
    },
  },
}
