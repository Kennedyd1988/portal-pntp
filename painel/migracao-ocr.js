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

  // Junta os pedaços de texto do PDF pela posição: pedaços colados ("202" + "6", "D" + "O") viram uma palavra só;
  // espaço só onde há distância de verdade ou troca de linha (0.47.0; antes punha espaço entre todos os pedaços).
  function juntar(itens) {
    let t = '', ant = null;
    for (const x of itens) {
      if (ant && !ant.hasEOL && x.str) {
        const mesmaLinha = Math.abs(x.transform[5] - ant.transform[5]) < 2;
        const folga = x.transform[4] - (ant.transform[4] + ant.width);
        const alt = x.height || ant.height || 10;
        if ((!mesmaLinha || folga > alt * 0.15) && !/\s$/.test(t) && !/^\s/.test(x.str)) t += ' ';
      }
      t += x.str;
      if (x.hasEOL) t += '\n';
      if (x.str || x.hasEOL) ant = x;
    }
    return t;
  }

  // Texto do PDF (url pública, com CORS). paginas: quantas ler no máximo.
  // aceita: o texto já serve? (padrão: tem o corpo de um ato). Se não servir, lê a imagem das páginas (OCR).
  // url também pode ser o próprio arquivo (File/Blob) ou um ArrayBuffer: usado pelo "Preencher pelo PDF" (0.47.0).
  async function textoPdf(url, paginas, aceita) {
    const lib = await carregarPdf();
    let dados;
    if (typeof url === 'string') {
      const r = await fetch(url);
      if (!r.ok) throw new Error('PDF não abriu (' + r.status + ')');
      dados = await r.arrayBuffer();
    } else dados = url instanceof ArrayBuffer ? url : await url.arrayBuffer();
    const pdf = await lib.getDocument({ data: dados }).promise;
    const n = Math.min(pdf.numPages, paginas || 4);
    let texto = '';
    for (let p = 1; p <= n; p++) {
      const c = await (await pdf.getPage(p)).getTextContent();
      texto += juntar(c.items) + '\n';
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
