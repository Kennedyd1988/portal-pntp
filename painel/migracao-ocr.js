// =====================================================================
// Migração do site antigo — leitura do texto de PDFs (0.40.0)
// Usado pelas diárias (Plataforma B; e a tabela de valores da Plataforma A): as portarias de concessão são PDFs
// escaneados (só o cabeçalho do Diário Oficial vem como texto). Primeiro
// tenta o texto do próprio PDF; se não tiver o corpo do ato, lê a imagem
// das páginas com OCR (Tesseract, português), tudo no navegador.
// As bibliotecas só são baixadas na primeira vez que precisar.
// =====================================================================
(function () {
  'use strict';
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let pdfjs = null, trabalhador = null, fila = Promise.resolve();

  async function carregarPdf() {
    if (pdfjs) return pdfjs;
    pdfjs = await import(PDFJS);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return pdfjs;
  }
  function script(src) {
    return new Promise((ok, erro) => {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar o leitor de texto (OCR).'));
      document.head.appendChild(s);
    });
  }
  async function carregarOcr() {
    if (trabalhador) return trabalhador;
    await script(TESSERACT);
    trabalhador = await window.Tesseract.createWorker('por');
    return trabalhador;
  }
  // Corpo de ato: a parte que interessa vem depois do "RESOLVE"/"Art. 1º". Só cabeçalho = PDF escaneado.
  const temCorpo = (t) => /resolve|art\.?\s*1|conceder/i.test(t) && t.replace(/\s+/g, ' ').length > 300;

  // Texto do PDF (url pública, com CORS). paginas: quantas ler no máximo.
  // aceita: o texto já serve? (padrão: tem o corpo de um ato). Se não servir, lê a imagem das páginas (OCR).
  async function textoPdf(url, paginas, aceita) {
    const lib = await carregarPdf();
    const r = await fetch(url);
    if (!r.ok) throw new Error('PDF não abriu (' + r.status + ')');
    const pdf = await lib.getDocument({ data: await r.arrayBuffer() }).promise;
    const n = Math.min(pdf.numPages, paginas || 4);
    let texto = '';
    for (let p = 1; p <= n; p++) {
      const c = await (await pdf.getPage(p)).getTextContent();
      texto += c.items.map((x) => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    if ((aceita || temCorpo)(texto)) return { texto, ocr: false };
    // Escaneado: uma leitura por vez (o OCR usa bastante memória).
    const ler = async () => {
      const w = await carregarOcr();
      let t = '';
      for (let p = 1; p <= n; p++) {
        const pg = await pdf.getPage(p);
        const v = pg.getViewport({ scale: 2 });
        const cv = document.createElement('canvas'); cv.width = v.width; cv.height = v.height;
        // intent "print": desenha mesmo com a aba em segundo plano (sem esperar a tela).
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: v, intent: 'print' }).promise;
        t += (await w.recognize(cv)).data.text + '\n';
        cv.width = cv.height = 0;
      }
      return t;
    };
    const p = fila.then(ler, ler);
    fila = p.catch(() => null);
    return { texto: await p, ocr: true };
  }

  window.MIGRACAO_OCR = { textoPdf };
})();
