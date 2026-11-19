// =====================================================================
// Preencher pelo PDF (0.47.0)
// Componente reaproveitável: dentro da janela de cadastro, o usuário envia
// o PDF primeiro e o sistema lê o arquivo e preenche os campos. Continua
// sendo possível digitar tudo à mão (o PDF é só um atalho).
//
// Leitura: 1º o texto do próprio PDF (pdf.js); se o PDF for escaneado,
// OCR em português (Tesseract), tudo no navegador, sem custo e sem mandar
// o arquivo para fora. Bibliotecas baixadas só na primeira vez (migracao-ocr.js).
//
// Peças:
//   P.zonaPdf({ titulo, texto, aoLer(arquivo, { texto, ocr }) → relatório })
//        relatório = { preenchidos: [rótulos], faltou: [rótulos], avisos: [textos] }
//        devolve o elemento, com .ler(arquivo) para ler um PDF escolhido em outro campo.
//   P.preencherLido(input, valor)  → coloca o valor e marca o campo como "lido do PDF"
//        (a marca some quando o usuário mexe no campo).
//   P.lerAto(texto, tipos)          → { tipo, numero, ano, data, ementa, ementaDoArtigo }
//        para leis, decretos, portarias, resoluções… (tipos = { codigo: 'Nome' }).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { el } = P;

  // ---------------------------------------------------------------
  // Marca de campo preenchido pelo arquivo
  function preencherLido(input, valor) {
    input.value = valor;
    input.classList.add('lido-pdf');
    const rotulo = input.id && document.querySelector('label[for="' + input.id + '"]');
    if (rotulo && !rotulo.querySelector('.etiqueta-lido')) rotulo.append(' ', el('span', { class: 'etiqueta etiqueta-lido' }, 'Lido do PDF'));
    if (!input._lidoOuvindo) {
      input._lidoOuvindo = true;
      const tirar = () => {
        input.classList.remove('lido-pdf');
        const r = input.id && document.querySelector('label[for="' + input.id + '"] .etiqueta-lido');
        if (r) r.remove();
      };
      input.addEventListener('input', tirar); input.addEventListener('change', tirar);
    }
  }

  // ---------------------------------------------------------------
  // Zona "Já tem o PDF? Envie primeiro"
  function zonaPdf(o) {
    const entrada = el('input', { type: 'file', accept: 'application/pdf', class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
    const btn = el('button', { type: 'button', class: 'btn btn-primario btn-p' }, 'Escolher PDF');
    const situacao = el('div', { class: 'zona-pdf-situacao', 'aria-live': 'polite' });
    const zona = el('div', { class: 'zona-pdf' },
      el('div', { class: 'zona-pdf-icone', 'aria-hidden': 'true' }, 'PDF'),
      el('div', { class: 'zona-pdf-texto' },
        el('strong', null, o.titulo || 'Já tem o PDF? Envie primeiro'),
        el('span', { class: 'ajuda' }, o.texto || 'O sistema lê o arquivo e preenche os campos. Se preferir, é só digitar os dados abaixo.'),
        el('span', { class: 'ajuda' }, 'Arraste o arquivo para cá ou clique em "Escolher PDF".')),
      btn, entrada);
    const caixa = el('div', { class: 'caixa-zona-pdf' }, zona, situacao);
    let lendo = false;

    btn.addEventListener('click', () => entrada.click());
    entrada.addEventListener('change', () => { if (entrada.files[0]) ler(entrada.files[0]); entrada.value = ''; });
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault(); zona.classList.remove('arrastando');
      const a = e.dataTransfer && e.dataTransfer.files[0];
      if (a) ler(a);
    });

    async function ler(arquivo) {
      if (lendo) return;
      try { P.validarPdf(arquivo); } catch (e) { situacao.replaceChildren(el('p', { class: 'msg msg-erro' }, e.message)); return; }
      if (!window.MIGRACAO_OCR) { situacao.replaceChildren(el('p', { class: 'msg msg-erro' }, 'O leitor de PDF não carregou. Atualize a página e tente de novo.')); return; }
      lendo = true; P.ocupado(btn, 'Lendo…'); zona.classList.add('lendo');
      situacao.replaceChildren(el('p', { class: 'msg msg-info' }, 'Lendo "' + arquivo.name + '"…'));
      // Se em 3 s ainda estiver lendo, é PDF escaneado (OCR): avisa que demora.
      const aviso = setTimeout(() => situacao.replaceChildren(el('p', { class: 'msg msg-info' },
        'O PDF parece ser uma imagem escaneada. Lendo o texto da imagem (OCR)… pode levar até 1 minuto.')), 3000);
      try {
        const lido = await window.MIGRACAO_OCR.textoPdf(arquivo, o.paginas || 3,
          (t) => t.replace(/\s+/g, ' ').trim().length > 200);
        clearTimeout(aviso);
        const r = (await o.aoLer(arquivo, lido)) || {};
        const partes = [];
        partes.push(el('p', { class: 'msg msg-ok' },
          el('strong', null, '"' + arquivo.name + '" lido' + (lido.ocr ? ' por OCR' : '') + '. '),
          r.preenchidos && r.preenchidos.length ? 'Preenchido: ' + r.preenchidos.join(', ') + '. Confira os campos marcados com "Lido do PDF" antes de salvar.'
            : 'Não foi possível reconhecer os dados no arquivo. Preencha os campos à mão.'));
        if ((r.faltou && r.faltou.length) || (r.avisos && r.avisos.length)) {
          partes.push(el('div', { class: 'msg msg-falta' },
            r.faltou && r.faltou.length ? el('p', null, 'Não encontrado no PDF (preencha à mão): ' + r.faltou.join(', ') + '.') : null,
            (r.avisos || []).map((t) => el('p', null, t))));
        }
        if (lido.ocr) partes.push(el('p', { class: 'ajuda' }, 'Leitura por OCR pode trocar letras e números. Confira com atenção.'));
        situacao.replaceChildren(...partes);
      } catch (e) {
        clearTimeout(aviso);
        situacao.replaceChildren(el('p', { class: 'msg msg-erro' }, 'Não foi possível ler o PDF (' + ((e && e.message) || 'erro desconhecido') + '). Preencha os campos à mão.'));
      } finally { lendo = false; P.ocupado(btn); zona.classList.remove('lendo'); }
    }
    caixa.ler = ler;
    return caixa;
  }

  // ---------------------------------------------------------------
  // Leitura de atos oficiais (lei, decreto, portaria, resolução…)
  const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  // Nome do tipo como aparece no cabeçalho do ato. Os mais longos primeiro (Lei Complementar antes de Lei).
  const PADROES_TIPO = [
    ['emenda_lei_organica', 'EMENDA\\s+(?:[ÀA]\\s+)?(?:LEI\\s+ORG[ÂA]NICA)'],
    ['lei_complementar', 'LEI\\s+COMPLEMENTAR'],
    ['decreto_legislativo', 'DECRETO\\s+LEGISLATIVO'],
    ['instrucao_normativa', 'INSTRU[ÇC][ÃA]O\\s+NORMATIVA'],
    ['lei_organica', 'LEI\\s+ORG[ÂA]NICA'],
    ['lei', 'LEI(?:\\s+ORDIN[ÁA]RIA)?'],
    ['decreto', 'DECRETO(?:\\s+EXECUTIVO)?'],
    ['portaria', 'PORTARIA'],
    ['resolucao', 'RESOLU[ÇC][ÃA]O'],
    ['edital', 'EDITAL'],
    ['ato', 'ATO(?:\\s+DA\\s+MESA)?']
  ];
  const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Nº escrito de vários jeitos (e como o OCR costuma ler): Nº, N°, N.º, No, Nr., NÚMERO.
  const NUM = '\\s*(?:MUNICIPAL\\s*)?(?:N(?:[ºo°.\\s]|[UÚ]MERO|R\\.?)*\\s*[:\\-]?\\s*)?(\\d(?:[\\d.]|\\s(?=\\d))*)(?:\\s*[\\/\\-]\\s*(\\d{4}|\\d{2})(?!\\d))?';
  const RE_DATA_EXT = /(\d{1,2})\s*[º°o]?\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i;
  const RE_DATA_NUM = /(\d{1,2})\s*[\/.]\s*(\d{1,2})\s*[\/.]\s*(\d{4})/;
  // Onde a ementa termina: começo do preâmbulo ou do texto do ato.
  // Sem diferenciar maiúsculas: fórmulas de abertura. Só em CAIXA ALTA: autoridade ("O PREFEITO", "O SECRETÁRIO"),
  // para não cortar ementas como "Designa o Secretário de Obras…".
  const RE_PREAMBULO = /\bFA[ÇC]O\s+SABER|\bno\s+uso\s+d[ea]s?\s+(?:suas\s+)?atribui|\bRESOLVE\s*[:.]|\bDECRETA\s*[:.]|\bArt(?:igo)?\.?\s*1\s*[º°o]?\b|\b(?:O|A)\s+Prefeit[oa]\s+(?:Municipal|Constitucional|d[eoa])\b|(?<=[.;:”"]\s|^)(?:O|A)\s+(?:Excelent[íi]ssim[oa]\s+)?(?:Senhor[a]?\s+)?(?:Prefeit|Vice|President|Secret[áa]ri|Diretor|Gestor|Superintendent|C[âa]mara|Mesa|Conselho)/i;
  const RE_PREAMBULO_CAIXA = /(?<=[.;:”"]\s|^)(?:O|A)\s+(?:EXCELENT[ÍI]SSIM[OA]\s+)?(?:SENHOR[A]?\s+)?(?:PREFEIT|VICE|PRESIDENT|SECRET[ÁA]RI|DIRETOR|GESTOR|SUPERINTENDENT|C[ÂA]MARA|MESA|CONSELHO)/;
  function inicioPreambulo(t) {
    const a = RE_PREAMBULO.exec(t), b = RE_PREAMBULO_CAIXA.exec(t);
    const i = Math.min(a ? a.index : Infinity, b ? b.index : Infinity);
    return i === Infinity ? null : { index: i };
  }

  const doisDig = (n) => String(n).padStart(2, '0');
  function dataIso(m, ext) {
    if (!m) return null;
    const d = parseInt(m[1], 10), mes = ext ? MESES[semAcento(m[2]).replace('ç', 'c')] : parseInt(m[2], 10), a = parseInt(m[3], 10);
    if (!(d >= 1 && d <= 31 && mes >= 1 && mes <= 12 && a >= 1900 && a <= 2100)) return null;
    return a + '-' + doisDig(mes) + '-' + doisDig(d);
  }
  function primeiraData(t) {
    const e = RE_DATA_EXT.exec(t), n = RE_DATA_NUM.exec(t);
    const c = [e && { i: e.index, fim: e.index + e[0].length, v: dataIso(e, true) }, n && { i: n.index, fim: n.index + n[0].length, v: dataIso(n, false) }]
      .filter((x) => x && x.v).sort((a, b) => a.i - b.i);
    return c[0] || null;
  }
  const limpar = (t) => t.replace(/^[\s\-–—:;,.]+|[\s\-–—:;,]+$/g, '').trim();
  // Ementa sugerida nunca leva CPF (LGPD): o número fica só no PDF.
  const semCpf = (t) => t.replace(/,?\s*(?:portador[a]?\s+d[oa]\s+|inscrit[oa]\s+no\s+)?CPF(?:\/MF)?\s*(?:n[º°o.]*|sob\s+o\s+n[º°o.]*)?\s*[:\-]?\s*\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}/gi, '')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ');
  function cortar(t, max) {
    if (t.length <= max) return t;
    const c = t.slice(0, max); const i = c.lastIndexOf(' ');
    return (i > max * 0.6 ? c.slice(0, i) : c).replace(/[,;:\s]+$/, '') + '…';
  }

  // Ementa sugerida (0.47.2): o Art. 1º reescrito como ementa — verbo na 3ª pessoa ("Nomear" → "Nomeia",
  // "Fica exonerada…" → "Exonera…"), sem os complementos de praxe e cortado no essencial.
  const VERBOS_IRREG = { dispor: 'Dispõe', propor: 'Propõe', compor: 'Compõe', impor: 'Impõe', repor: 'Repõe', expor: 'Expõe', manter: 'Mantém', ter: 'Tem', ver: 'Vê', dar: 'Dá' };
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  function terceiraPessoa(v) {
    const b = v.toLowerCase();
    if (VERBOS_IRREG[b]) return VERBOS_IRREG[b];
    if (/ear$/.test(b)) return cap(b.slice(0, -3) + 'eia');          // nomear → nomeia
    if (/uir$/.test(b)) return cap(b.slice(0, -2) + 'i');            // instituir → institui
    if (/ar$/.test(b)) return cap(b.slice(0, -2) + 'a');             // designar → designa
    if (/[ei]r$/.test(b)) return cap(b.slice(0, -2) + 'e');          // conceder → concede, conferir → confere
    return cap(v);
  }
  function participioParaVerbo(p) {
    const b = p.toLowerCase().replace(/(ad|id|íd|ost)(?:[oa]s?)$/, '$1o');
    if (/eado$/.test(b)) return terceiraPessoa(b.slice(0, -4) + 'ear');
    if (/u[íi]do$/.test(b)) return terceiraPessoa(b.slice(0, -4) + 'uir');
    if (/ado$/.test(b)) return terceiraPessoa(b.slice(0, -3) + 'ar');
    if (/ido$/.test(b)) return terceiraPessoa(b.slice(0, -3) + 'er');   // concedido → concede; conferido → confere (mesma forma)
    if (/osto$/.test(b)) return terceiraPessoa(b.slice(0, -4) + 'or');
    return null;
  }
  function comoEmenta(t) {
    let e = t.trim(), m;
    if ((m = e.match(/^ficam?\s+([a-zà-ú]+(?:ad|id|íd|ost)[oa]s?)\b\s*(.*)$/i))) {   // "Fica exonerada, a pedido, MARIA…" → "Exonera, a pedido, MARIA…"
      const v = participioParaVerbo(m[1]); if (v) e = v + (m[2] ? (m[2][0] === ',' ? '' : ' ') + m[2] : '');
    } else if ((m = e.match(/^([a-zà-ú]+(?:ar|er|ir|or))\b(.*)$/i))) e = terceiraPessoa(m[1]) + m[2];
    e = e.replace(/,\s+(para|como|no cargo|do cargo|na função|da função)\b/gi, ' $1')   // vírgula que sobrou do CPF tirado
      // Complementos de praxe que não entram na ementa.
      .replace(/,?\s*(?:nos termos d[ao]s?|de acordo com|conforme|com fundamento n[ao]s?|com base n[ao]s?|em conformidade com)\s[^,;]*?(?=[,;]|\.?$)/gi, '')
      .replace(/,?\s*(?:a contar de|a partir de)\s[^,;]*?(?=[,;]|\.?$)/gi, '')
      .replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').replace(/[,;:\s.]+$/, '');
    return e + '.';
  }

  function lerAto(texto, tipos) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim();
    const r = { tipo: null, numero: null, ano: null, data: null, ementa: null, ementaDoArtigo: false };
    if (!t) return r;
    // 1) Tipo e número. Tipos criados pelo órgão também (ex.: "Ata do Conselho nº 3/2026").
    const padroes = PADROES_TIPO.slice();
    for (const [cod, nome] of Object.entries(tipos || {})) if (/^x_/.test(cod) && nome) padroes.unshift([cod, escapar(nome)]);
    const achados = [];
    for (const [cod, pad] of padroes) {
      if (tipos && !tipos[cod]) continue;
      const re = new RegExp('\\b(' + pad + ')' + NUM, 'gi');
      let m;
      while ((m = re.exec(t)) && achados.length < 60) {
        achados.push({ cod, i: m.index, fim: m.index + m[0].length, caixaAlta: m[1] === m[1].toUpperCase(), numero: m[2].replace(/\s+/g, '').replace(/\.$/, ''), ano: m[3] });
      }
    }
    // Cabeçalho do ato vem em CAIXA ALTA; citações de outras leis no texto, não. Na mesma posição, o tipo mais longo vence.
    achados.sort((a, b) => (b.caixaAlta - a.caixaAlta) || (a.i - b.i) || (b.fim - a.fim));
    const cab = achados[0];
    let depois = t;
    if (cab) {
      r.tipo = cab.cod; r.numero = cab.numero;
      if (cab.ano) { let a = parseInt(cab.ano, 10); if (a < 100) a += a >= 50 ? 1900 : 2000; r.ano = a; }
      depois = t.slice(cab.fim);
    }
    // 2) Data: a que vem junto do cabeçalho ("…, DE 10 DE NOVEMBRO DE 2026"), antes do preâmbulo;
    //    se não houver, a da assinatura (a última do texto). Nunca uma data do meio do texto (férias, prazos…).
    const pre0 = inicioPreambulo(depois);
    const perto = primeiraData(depois.slice(0, Math.min(160, pre0 ? pre0.index : 160)));
    let fimCab = 0;
    if (perto) { r.data = perto.v; fimCab = perto.fim; }
    else {
      const ult = (re, ext) => { const v = [...t.matchAll(new RegExp(re.source, 'gi'))].map((m) => dataIso(m, ext)).filter(Boolean); return v[v.length - 1]; };
      r.data = ult(RE_DATA_EXT, true) || ult(RE_DATA_NUM, false) || null;
    }
    if (!r.ano && r.data) r.ano = parseInt(r.data.slice(0, 4), 10);
    // 3) Ementa: entre o cabeçalho e o preâmbulo ("O PREFEITO…", "no uso de suas atribuições", "RESOLVE").
    const resto = depois.slice(fimCab);
    const p = inicioPreambulo(resto);
    const candidata = limpar((p ? resto.slice(0, p.index) : resto.slice(0, 400)).replace(/^\s*(?:,\s*)?de\s+\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/i, ''));
    // Ementa entre aspas (“DISPÕE SOBRE…”.) fica sem as aspas.
    const semAspas = (e) => e.replace(/^[“"'‘]+\s*/, '').replace(/\s*[”"'’]+\s*([.;]?)$/, '$1');
    const autoridade = /^(?:O|A)\s+(?:Excelent|Senhor|Secret|Prefeit|President|Diretor|Gestor|Vice|Superintendent|C[âa]mara|Mesa|Conselho)/i.test(candidata);
    if (cab && !autoridade && candidata.length >= 15 && candidata.length <= 700 && /[a-zà-ú]{3}/i.test(candidata)) r.ementa = cortar(semAspas(semCpf(candidata)), 600);
    else {
      // Sem ementa (comum em portarias): resume o Art. 1º ("Nomear FULANO para o cargo de…").
      const a1 = /(?:RESOLVE|DECRETA)\s*[:.]?\s*(?:Art(?:igo)?\.?\s*1\s*[º°o]?\s*[-–—.:]?\s*)?(.+)|Art(?:igo)?\.?\s*1\s*[º°o]?\s*[-–—.:]?\s*(.+)/i.exec(resto || t);
      if (a1) {
        let corpo = (a1[1] || a1[2] || '').split(/\s+Art(?:igo)?\.?\s*2\s*[º°o]?|\s+Par[áa]grafo\s+[úu]nico|\s+§\s*1|\s+(?:Gabinete|Pal[áa]cio|Registre-se|Publique-se|Cumpra-se|Sala\s+das\s+Sess)/i)[0];
        corpo = limpar(corpo.split(/(?<=[a-zà-ú0-9)\]]{2})\.\s+(?=[A-ZÀ-Ú])/)[0]);
        if (corpo.length >= 10) { corpo = comoEmenta(semCpf(corpo)); r.ementa = cortar(corpo.charAt(0).toUpperCase() + corpo.slice(1), 250); r.ementaDoArtigo = true; }
      }
    }
    return r;
  }

  // ---------------------------------------------------------------
  // Envio em lote (0.47.2): vários PDFs de uma vez → tabela de conferência editável → grava cada linha.
  // o = { titulo, explicacao, colunas: [{ k, r, t: 'text'|'date'|'sel'|'area'|'num', op, ob, largura }],
  //       ler(arquivo, lido) → { valores, avisos }, duplicado(valores) → texto | null,
  //       gravar(valores, arquivo, situacao) → Promise, podePublicar, depois() }
  function loteDePdfs(o) {
    const linhas = [];
    const entrada = el('input', { type: 'file', accept: 'application/pdf', multiple: true, class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
    const btnEscolher = el('button', { type: 'button', class: 'btn btn-primario btn-p' }, 'Escolher PDFs');
    const zona = el('div', { class: 'zona-pdf' },
      el('div', { class: 'zona-pdf-icone', 'aria-hidden': 'true' }, 'PDF'),
      el('div', { class: 'zona-pdf-texto' },
        el('strong', null, 'Arraste os PDFs para cá ou clique em "Escolher PDFs"'),
        el('span', { class: 'ajuda' }, o.explicacao || 'O sistema lê cada arquivo e monta a tabela abaixo. Confira e corrija nas próprias células antes de salvar.')),
      btnEscolher, entrada);
    const situacao = el('p', { class: 'ajuda lote-situacao', 'aria-live': 'polite' });
    const corpoTabela = el('tbody');
    const tabela = el('div', { class: 'tabela-caixa lote-caixa', hidden: true },
      el('table', { class: 'tabela tabela-lote' },
        el('thead', null, el('tr', null, el('th', null, 'Arquivo'), o.colunas.map((c) => el('th', null, c.r)), el('th', null, 'Situação'), el('th', null, el('span', { class: 'sr' }, 'Remover')))),
        corpoTabela));
    const corpo = el('div', { class: 'lote-pdf' }, zona, situacao, tabela);
    // Telas sem rascunho (ex.: Diárias, que entram no ar ao salvar): um botão só, que grava as linhas completas.
    const btnRascunho = o.semSituacao ? null : el('button', { type: 'button', class: 'btn btn-claro', disabled: true }, 'Salvar todos como rascunho');
    const btnPublicar = o.semSituacao ? el('button', { type: 'button', class: 'btn btn-primario', disabled: true }, 'Salvar os completos')
      : o.podePublicar ? el('button', { type: 'button', class: 'btn btn-primario', disabled: true }, 'Publicar os completos') : null;
    const dlg = P.abrirDialogo(o.titulo, corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Fechar'), btnRascunho, btnPublicar]);
    dlg.classList.add('dialogo-largo', 'dialogo-lote');
    let lendo = false, gravou = false;
    dlg.addEventListener('close', () => { if (gravou && o.depois) o.depois(); });

    btnEscolher.addEventListener('click', () => entrada.click());
    entrada.addEventListener('change', () => { adicionar([...entrada.files]); entrada.value = ''; });
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
    zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('arrastando'); adicionar([...(e.dataTransfer ? e.dataTransfer.files : [])]); });

    function controle(c, v) {
      let i;
      if (c.t === 'sel') i = el('select', null, el('option', { value: '' }, '— Escolha —'), Object.entries(c.op).map(([k, t]) => el('option', { value: k, selected: k === v }, t)));
      else if (c.t === 'area') { i = el('textarea', { rows: 2 }); i.value = v || ''; }
      else i = el('input', { type: c.t === 'date' ? 'date' : 'text', inputmode: c.t === 'num' ? 'decimal' : null, value: v === null || v === undefined ? '' : (c.t === 'num' ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v) });
      i.setAttribute('aria-label', c.r);
      if (c.largura) i.style.minWidth = c.largura;
      if (v !== null && v !== undefined && v !== '') i.classList.add('lido-pdf');
      i.addEventListener('input', () => { i.classList.remove('lido-pdf'); conferir(i._linha); });
      i.addEventListener('change', () => conferir(i._linha));
      return i;
    }
    function valoresDe(l) {
      const v = {};
      for (const c of o.colunas) {
        const x = l.campos[c.k].value.trim();
        v[c.k] = !x ? null : c.t === 'num' ? Number(x.replace(/\./g, '').replace(',', '.')) : x;
      }
      return v;
    }
    function etiqueta(l, tipo, texto) { l.sit.replaceChildren(el('span', { class: 'etiqueta etiqueta-' + tipo }, texto)); l.estado = tipo; }
    function conferir(l) {
      if (!l || l.salvo) return;
      const v = valoresDe(l);
      const falta = o.colunas.filter((c) => c.ob && (v[c.k] === null || (c.t === 'num' && Number.isNaN(v[c.k])))).map((c) => c.r);
      l.completo = !falta.length && !l.dup;
      if (l.dup) etiqueta(l, 'lote-dup', l.dup);
      else if (falta.length) etiqueta(l, 'lote-falta', 'Falta: ' + falta.join(', '));
      else etiqueta(l, 'lote-ok', l.avisos.length ? 'Confira: ' + l.avisos.join(' · ') : 'Lido');
      atualizarBotoes();
    }
    function atualizarBotoes() {
      const pendentes = linhas.filter((l) => !l.salvo && !l.removido && l.lido);
      if (btnRascunho) btnRascunho.disabled = lendo || !pendentes.length;
      if (btnPublicar) btnPublicar.disabled = lendo || !pendentes.some((l) => l.completo);
    }
    async function adicionar(arquivos) {
      const pdfs = arquivos.filter((a) => /\.pdf$/i.test(a.name) || a.type === 'application/pdf');
      if (arquivos.length > pdfs.length) P.toast((arquivos.length - pdfs.length) + ' arquivo(s) não são PDF e ficaram de fora.', true);
      if (!pdfs.length) return;
      tabela.hidden = false;
      const novas = pdfs.map((a) => {
        const l = { arquivo: a, campos: {}, avisos: [], lido: false };
        l.sit = el('td', { 'data-rotulo': 'Situação' }, el('span', { class: 'etiqueta' }, 'Na fila'));
        const rem = el('button', { type: 'button', class: 'btn btn-claro btn-p', 'aria-label': 'Tirar ' + a.name + ' da lista', onclick: () => { if (l.salvo) return; l.removido = true; l.tr.remove(); atualizarBotoes(); } }, '×');
        l.tr = el('tr', null, el('td', { 'data-rotulo': 'Arquivo', class: 'lote-arquivo', title: a.name }, a.name), o.colunas.map((c) => el('td', { 'data-rotulo': c.r }, '…')), l.sit, el('td', { class: 'acoes' }, rem));
        corpoTabela.append(l.tr); linhas.push(l);
        return l;
      });
      lendo = true; atualizarBotoes();
      for (let k = 0; k < novas.length; k++) {
        const l = novas[k];
        if (l.removido) continue;
        situacao.textContent = 'Lendo ' + (k + 1) + ' de ' + novas.length + ': "' + l.arquivo.name + '"…';
        etiqueta(l, 'lendo', 'Lendo…');
        let r = { valores: {}, avisos: [] };
        try {
          P.validarPdf(l.arquivo);
          const lido = await window.MIGRACAO_OCR.textoPdf(l.arquivo, 3, (t) => t.replace(/\s+/g, ' ').trim().length > 200);
          r = (await o.ler(l.arquivo, lido)) || r;
          if (lido.ocr) r.avisos = ['lido por OCR'].concat(r.avisos || []);
        } catch (e) { r.avisos = ['não foi possível ler (' + ((e && e.message) || 'erro') + '), preencha à mão']; }
        l.avisos = r.avisos || []; l.extras = r.extras || {};
        const tds = l.tr.querySelectorAll('td');
        o.colunas.forEach((c, i) => { const ctl = controle(c, (r.valores || {})[c.k]); ctl._linha = l; l.campos[c.k] = ctl; tds[i + 1].replaceChildren(ctl); });
        l.lido = true;
        try { l.dup = o.duplicado ? await o.duplicado(valoresDe(l)) : null; } catch (e) { l.dup = null; }
        conferir(l);
      }
      lendo = false;
      const n = linhas.filter((l) => !l.removido && !l.salvo);
      situacao.textContent = n.length + ' arquivo(s) na lista. Confira as células (as preenchidas pelo arquivo estão em verde) e salve.';
      atualizarBotoes();
    }
    async function gravarTodos(sit, btn) {
      const alvo = linhas.filter((l) => !l.salvo && !l.removido && l.lido && (sit === 'rascunho' ? !l.dup : l.completo));
      const pulados = linhas.filter((l) => !l.salvo && !l.removido && l.lido).length - alvo.length;
      if (!alvo.length) { P.toast(sit === 'publicado' ? 'Nenhuma linha completa para ' + (o.semSituacao ? 'salvar.' : 'publicar.') : 'Nada para salvar (linhas já cadastradas ficam de fora).', true); return; }
      P.ocupado(btn, sit === 'publicado' ? 'Publicando…' : 'Salvando…');
      let ok = 0;
      for (const l of alvo) {
        const v = valoresDe(l);
        const falta = sit === 'rascunho' ? o.colunas.filter((c) => c.obRascunho && v[c.k] === null).map((c) => c.r) : [];
        if (falta.length) { etiqueta(l, 'lote-falta', 'Falta: ' + falta.join(', ')); continue; }
        etiqueta(l, 'lendo', 'Gravando…');
        try {
          const url = await P.enviarArquivo(o.modulo, l.arquivo, 'pdf', 'application/pdf');
          try { await o.gravar(Object.assign({}, l.extras, v), url, o.semSituacao ? null : sit); }
          catch (e) { P.apagarArquivo(url); throw e; }
          l.salvo = true; ok++; gravou = true;
          etiqueta(l, 'lote-salvo', o.semSituacao ? 'Salvo ✓' : sit === 'publicado' ? 'Publicado ✓' : 'Rascunho salvo ✓');
          Object.values(l.campos).forEach((i) => { i.disabled = true; });
        } catch (e) { etiqueta(l, 'lote-erro', P.traduzirErro ? P.traduzirErro(e) : (e.message || 'Erro ao gravar')); }
      }
      P.ocupado(btn);
      atualizarBotoes();
      situacao.textContent = ok + ' gravado(s)' + (pulados ? '; ' + pulados + ' ficaram na lista (incompletos ou já cadastrados)' : '') + '.';
      P.toast(ok + (o.semSituacao ? ' salvo(s).' : sit === 'publicado' ? ' publicado(s).' : ' rascunho(s) salvo(s).'));
    }
    if (btnRascunho) btnRascunho.addEventListener('click', () => gravarTodos('rascunho', btnRascunho));
    if (btnPublicar) btnPublicar.addEventListener('click', () => gravarTodos('publicado', btnPublicar));
    return dlg;
  }

  Object.assign(P, { zonaPdf, preencherLido, lerAto, loteDePdfs, textoSemAcento: semAcento });
})();
