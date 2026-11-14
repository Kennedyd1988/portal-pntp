// =====================================================================
// Migração do site antigo — adaptador "Plataforma A"
// Sites de prefeitura com endereços /legislacao/detalhe/N, /licitacao/detalhe/N,
// /contrato/detalhe/N, /concurso/detalhe/N, /conta-publica/detalhe/N e
// /noticia/N (modelo usado por muitos municípios do RN, ex.: Riacho da Cruz).
//
// Cada seção sabe: achar o maior número (id) atual, montar o endereço de um
// item e transformar a página do item em registro do portal + arquivos.
// A varredura vai do maior id para baixo e para quando passa do período.
// Não grava nada: quem grava é o módulo (modulo-migracao.js).
// =====================================================================
(function () {
  'use strict';
  const MESES = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const limpar = (t) => String(t || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const sem = (t) => limpar(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // dd/mm/aaaa [hh:mm[:ss]] → 'aaaa-mm-dd' (ou com hora, ISO -03:00)
  function data(t, comHora) {
    const m = String(t || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const d = m[3] + '-' + m[2] + '-' + m[1];
    return comHora ? d + 'T' + (m[4] || '00') + ':' + (m[5] || '00') + ':' + (m[6] || '00') + '-03:00' : d;
  }
  function dataExtenso(t) {   // "Quarta-feira, 27 de Maio de 2026"
    const m = sem(t).match(/(\d{1,2}) de ([a-zç]+) de (\d{4})/);
    if (!m || !MESES[m[2]]) return null;
    return m[3] + '-' + String(MESES[m[2]]).padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  function valor(t) {
    const m = String(t || '').match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
    return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
  }
  function doc(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const m = d.querySelector('.container-conteudo') || d.body;
    m.querySelectorAll('script,style,svg,noscript').forEach((x) => x.remove());
    return { d, m };
  }
  // Tabelas "rótulo/valor": cabeçalhos (th) na ordem, valores (td) na mesma ordem.
  function campos(m) {
    const r = {};
    for (const t of m.querySelectorAll('table')) {
      const ths = [...t.querySelectorAll('th')].map((x) => limpar(x.innerText || x.textContent));
      if (ths.some((x) => /^nome do documento$/i.test(x))) continue;
      const tds = [...t.querySelectorAll('td')].map((x) => limpar(x.innerText || x.textContent));
      ths.forEach((h, i) => { if (h && tds[i] !== undefined && r[sem(h)] === undefined) r[sem(h)] = tds[i]; });
    }
    return r;
  }
  const pega = (c, ...nomes) => {
    for (const n of nomes) for (const k of Object.keys(c)) if (k.startsWith(sem(n))) return c[k];
    for (const n of nomes) for (const k of Object.keys(c)) if (k.includes(sem(n))) return c[k];
    return null;
  };
  // Links de download da seção (quando a tabela de documentos não tem o cabeçalho padrão).
  const baixar = (m, base, re) => [...new Set([...m.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => re.test(h)).map((h) => new URL(h, base).href))];
  // Tabela "Data | Nome do documento | Download"
  function documentos(m, base) {
    const lista = [];
    for (const t of m.querySelectorAll('table')) {
      const ths = [...t.querySelectorAll('th')].map((x) => sem(x.innerText || x.textContent));
      if (!ths.includes('nome do documento')) continue;
      for (const tr of t.querySelectorAll('tr')) {
        const tds = tr.querySelectorAll('td');
        const a = tr.querySelector('a[href]');
        if (tds.length < 2 || !a) continue;
        lista.push({ data: data(tds[0].textContent), titulo: limpar(tds[1].textContent).slice(0, 200), url: new URL(a.getAttribute('href'), base).href });
      }
    }
    return lista;
  }
  function tituloSecao(m) { const h = m.querySelector('h1') || m.querySelector('h2'); return limpar(h ? h.textContent : ''); }
  // "Modalidade - Pregão Eletrônico - 1/2026"
  function modalidadeNumero(m) {
    const h = [...m.querySelectorAll('h3')].map((x) => limpar(x.textContent)).find((x) => /^Modalidade\s*-/i.test(x)) || '';
    const p = h.split(/\s+-\s+/);
    const num = (p[p.length - 1] || '').match(/^(\S+)\/(\d{4})$/);
    return { modalidade: p.length >= 3 ? p.slice(1, -1).join(' - ') : '', numero: num ? num[1] : null, ano: num ? Number(num[2]) : null };
  }
  const tipoDoc = (t, mapa, padrao) => { const s = sem(t); for (const [re, tipo] of mapa) if (re.test(s)) return tipo; return padrao; };
  const DOC_LIC = [[/termo de referencia/, 'termo_referencia'], [/\betp\b|estudo tecnico/, 'estudo_tecnico'], [/edital/, 'edital'], [/aviso/, 'aviso'],
    [/parecer/, 'parecer'], [/\bata\b|ata de registro/, 'ata'], [/homolog/, 'homologacao'], [/adjudic/, 'adjudicacao'], [/resultado|julgamento/, 'resultado'],
    [/ratific/, 'ratificacao'], [/recurso/, 'recurso'], [/impugna/, 'impugnacao'], [/esclarec/, 'esclarecimento'], [/retifica|errata/, 'retificacao'],
    [/justificativa/, 'justificativa'], [/orcament|cotac|pesquisa de preco|mapa de preco/, 'orcamento'], [/contrato/, 'contrato'], [/anexo/, 'anexo']];
  const DOC_CONC = [[/retifica|errata/, 'retificacao'], [/edital/, 'edital'], [/inscri/, 'inscritos'], [/gabarito/, 'gabarito'], [/preliminar/, 'resultado_preliminar'],
    [/recurso/, 'recurso'], [/homolog/, 'homologacao'], [/resultado/, 'resultado_final'], [/convoca/, 'convocacao'], [/nomea/, 'nomeacao'], [/prorroga/, 'prorrogacao'], [/anexo/, 'anexo']];

  function maiorIdDe(html, re) {
    let maior = 0;
    for (const x of html.matchAll(re)) maior = Math.max(maior, Number(x[1]));
    return maior;
  }

  const SECOES = {
    // ---------------------------------------------------------------
    legislacao: {
      nome: 'Leis, decretos e portarias', destino: 'Publicações oficiais', pntp: true, pasta: 'publicacoes',
      listas: ['/legislacao/index/categoria/page/1/busca', '/legislacao'],
      reId: /\/legislacao\/detalhe\/(\d+)\//g,
      url: (o, id) => o + '/legislacao/detalhe/' + id + '/x/',
      ler(html, url) {
        const { m } = doc(html);
        const t = tituloSecao(m);
        if (!/^Legisla/i.test(t)) return { vazio: true };
        const c = campos(m);
        const cat = sem(t.replace(/^Legisla[cç][aã]o\s*-\s*/i, ''));
        const tipo = /complementar/.test(cat) ? 'lei_complementar' : /decreto|diaria/.test(cat) && !/tabela/.test(cat) ? 'decreto' : /portaria/.test(cat) ? 'portaria'
          : /lei|codigo/.test(cat) ? 'lei' : /resolu/.test(cat) ? 'resolucao' : 'outro';
        const dt = data(pega(c, 'data')) || null;
        const ano = Number(pega(c, 'ano')) || (dt ? Number(dt.slice(0, 4)) : null);
        const ementa = limpar(pega(c, 'ementa')).slice(0, 4000);
        const sit = sem(pega(c, 'situacao'));
        const docs = documentos(m, url);
        const arq = [...m.querySelectorAll('a[href*="download-lei"]')].map((a) => new URL(a.getAttribute('href'), url).href)[0] || (docs[0] && docs[0].url);
        return {
          ano, data: dt, chave: { tipo, numero: limpar(pega(c, 'numero')) || null, ano },
          registro: { tipo, numero: limpar(pega(c, 'numero')) || null, ano, data_publicacao: dt, ementa: ementa.length >= 5 ? ementa : (t + ' ' + (pega(c, 'numero') || '')).trim(),
            vigencia: /revogad/.test(sit) ? 'revogada' : /alterad/.test(sit) ? 'alterada' : 'vigente', observacao: /\(teste\)/i.test(ementa) ? null : (cat !== sem(tipo) ? 'Categoria no site antigo: ' + t.replace(/^Legisla[cç][aã]o\s*-\s*/i, '') : null) },
          arquivos: arq ? [{ url: arq, campo: 'arquivo_url' }] : []
        };
      }
    },
    // ---------------------------------------------------------------
    licitacao: {
      nome: 'Licitações e documentos', destino: 'Licitações', pntp: true, pasta: 'licitacoes',
      listas: ['/licitacao/index/categoria/page/1/busca', '/licitacao'],
      reId: /\/licitacao\/detalhe\/(\d+)\//g,
      url: (o, id) => o + '/licitacao/detalhe/' + id + '/x/',
      ler(html, url) {
        const { m } = doc(html);
        const mn = modalidadeNumero(m);
        if (!mn.modalidade) return { vazio: true };
        const c = campos(m);
        const s = sem(mn.modalidade);
        const modalidade = /pregao/.test(s) ? (/presencial/.test(s) ? 'pregao_presencial' : 'pregao_eletronico')
          : /concorrencia/.test(s) ? (/eletronic/.test(s) ? 'concorrencia_eletronica' : 'concorrencia_presencial')
          : /chamada/.test(s) ? 'chamada_publica' : /dispensa/.test(s) ? 'dispensa' : /inexig/.test(s) ? 'inexigibilidade'
          : /tomada/.test(s) ? 'tomada_precos' : /convite/.test(s) ? 'convite' : /leilao/.test(s) ? 'leilao_presencial'
          : /credenciamento/.test(s) ? 'credenciamento' : /adesao/.test(s) ? 'adesao_ata' : /concurso/.test(s) ? 'concurso' : 'outra';
        const cad = data(pega(c, 'data de cadastro'));
        const abertura = data(pega(c, 'data de abertura'), true);
        const ano = mn.ano || (cad ? Number(cad.slice(0, 4)) : null);
        const st = sem(pega(c, 'status'));
        const objeto = limpar(pega(c, 'objeto') || pega(c, 'resumo')).slice(0, 4000);
        const hoje = new Date().toISOString().slice(0, 10);
        const andamento = /cancel|anulad/.test(st) ? 'anulada' : /revog/.test(st) ? 'revogada' : /suspens/.test(st) ? 'suspensa' : /desert/.test(st) ? 'deserta'
          : /fracass/.test(st) ? 'fracassada' : /homolog/.test(st) ? 'homologada' : /encerr|finaliz|conclu/.test(st) ? 'encerrada'
          : abertura && abertura.slice(0, 10) > hoje ? 'aberta' : 'em_andamento';
        const lista = documentos(m, url);
        if (!lista.length) baixar(m, url, /\/licitacao\/download\//).forEach((u, i) => lista.push({ url: u, titulo: 'Documento ' + (i + 1), data: null }));
        const docs = lista.map((d) => ({ url: d.url, titulo: d.titulo, data: d.data, tipo: tipoDoc(d.titulo, DOC_LIC, 'outro') }));
        return {
          ano, data: cad, chave: { modalidade, numero: mn.numero, ano },
          registro: { origem: 'portal', modalidade, numero: mn.numero, ano, processo: limpar(pega(c, 'processo')) || null,
            objeto: objeto.length >= 5 ? objeto : 'Licitação ' + mn.modalidade + ' ' + (mn.numero || '') + '/' + ano, srp: /registro de preco/.test(sem(objeto)),
            valor_estimado: valor(pega(c, 'valor estimado')), data_publicacao: cad, data_abertura: abertura, andamento },
          documentos: docs
        };
      }
    },
    // ---------------------------------------------------------------
    contrato: {
      nome: 'Contratos', destino: 'Contratos', pntp: true, pasta: 'contratos',
      listas: ['/contrato/categoria/31/setor-administrativo/', '/contrato'],
      reId: /\/contrato\/detalhe\/(\d+)\//g,
      url: (o, id) => o + '/contrato/detalhe/' + id + '/x/',
      ler(html, url) {
        const { m } = doc(html);
        if (!/^Contrato/i.test(tituloSecao(m))) return { vazio: true };
        const mn = modalidadeNumero(m);
        const c = campos(m);
        const ini = data(pega(c, 'inicio do contrato')), fim = data(pega(c, 'fim do contrato')), cad = data(pega(c, 'data do cadastro'));
        const ano = mn.ano || (ini || cad ? Number((ini || cad).slice(0, 4)) : null);
        const objeto = limpar(pega(c, 'objeto')).slice(0, 4000);
        const contratado = limpar(pega(c, 'fornecedor', 'contratado', 'empresa')).slice(0, 200);
        const docs = documentos(m, url);
        if (!docs.length) baixar(m, url, /\/contrato\/download\//).forEach((u) => docs.push({ url: u, titulo: 'Contrato', data: null }));
        return {
          ano, data: ini || cad, chave: { numero: mn.numero, ano, contratado_nome: contratado },
          registro: { origem: 'portal', tipo: /\bata\b/.test(sem(objeto + ' ' + (docs[0] ? docs[0].titulo : ''))) ? 'ata_registro_precos' : 'contrato',
            numero: mn.numero, ano, objeto: objeto.length >= 5 ? objeto : 'Contrato ' + (mn.numero || ''), contratado_nome: contratado.length >= 2 ? contratado : 'Não informado no site antigo',
            valor_inicial: valor(pega(c, 'valor total', 'valor')), data_assinatura: ini || cad, vigencia_inicio: ini, vigencia_fim: fim && ini && fim >= ini ? fim : null,
            unidade_nome: mn.modalidade && !/^setor/i.test(mn.modalidade) ? mn.modalidade : null },
          arquivos: docs[0] ? [{ url: docs[0].url, campo: 'arquivo_url' }] : []
        };
      }
    },
    // ---------------------------------------------------------------
    concurso: {
      nome: 'Concursos e processos seletivos', destino: 'Concursos e seletivos', pntp: true, pasta: 'concursos',
      listas: ['/concurso/categoria/24/processo-seletivo/', '/concurso/categoria/25/concurso/', '/concurso'],
      reId: /\/concurso\/detalhe\/(\d+)\//g,
      url: (o, id) => o + '/concurso/detalhe/' + id + '/x/',
      ler(html, url) {
        const { m } = doc(html);
        const mn = modalidadeNumero(m);
        if (!mn.modalidade) return { vazio: true };
        const c = campos(m);
        const acolhe = data(pega(c, 'data de acolhimento')), abre = data(pega(c, 'data de abertura')), prova = data(pega(c, 'data da disputa'));
        const ano = mn.ano || (acolhe ? Number(acolhe.slice(0, 4)) : null);
        const titulo = limpar(pega(c, 'objeto')).slice(0, 300) || (mn.modalidade + ' ' + (mn.numero || '') + '/' + ano);
        const docs = documentos(m, url).map((d) => ({ url: d.url, titulo: d.titulo, data: d.data, tipo: tipoDoc(d.titulo, DOC_CONC, 'outro') }));
        const anoAtual = new Date().getFullYear();
        return {
          ano, data: acolhe, chave: { numero: mn.numero, ano, titulo },
          registro: { tipo: /seletivo/.test(sem(mn.modalidade)) ? 'processo_seletivo' : /estagi/.test(sem(mn.modalidade)) ? 'estagio' : 'concurso',
            numero: mn.numero, ano, titulo: titulo.length >= 5 ? titulo : 'Seleção ' + titulo, descricao: limpar(pega(c, 'resumo')).slice(0, 4000) || null,
            inscricoes_inicio: acolhe, inscricoes_fim: abre && acolhe && abre >= acolhe ? abre : null, data_prova: prova,
            andamento: ano < anoAtual ? 'encerrado' : 'em_andamento' },
          documentos: docs
        };
      }
    },
    // ---------------------------------------------------------------
    conta: {
      nome: 'Contas públicas (PPA, LDO, LOA, RREO, RGF, balanços)', destino: 'Planejamento e prestação de contas', pntp: true, pasta: 'contas',
      listas: ['/conta-publica'],
      reId: /\/conta-publica\/detalhe\/(\d+)\//g,
      url: (o, id) => o + '/conta-publica/detalhe/' + id + '/x/',
      ler(html, url) {
        const { m } = doc(html);
        const t = tituloSecao(m);
        if (!/^Conta P/i.test(t)) return { vazio: true };
        const cat = sem(t.replace(/^Conta P[uú]blica\s*-\s*/i, ''));
        const c = campos(m);
        const ano = Number(pega(c, 'ano')) || null;
        const per = sem(pega(c, 'periodo'));
        const n = Number((per.match(/(\d)/) || [])[1]) || null;
        let tipo = null, periodicidade = null, periodo = null, exercicio_fim = null;
        if (/resumido|rreo/.test(cat)) { tipo = 'rreo'; periodicidade = 'bimestral'; periodo = n; }
        else if (/gestao fiscal|rgf/.test(cat)) { tipo = 'rgf'; periodicidade = /semestr/.test(per) ? 'semestral' : 'quadrimestral'; periodo = n; }
        else if (/\bldo\b|diretrizes/.test(cat)) tipo = 'ldo';
        else if (/\bloa\b|orcamentaria anual/.test(cat)) tipo = 'loa';
        else if (/\bppa\b|plurianual/.test(cat)) { tipo = 'ppa'; exercicio_fim = ano ? ano + 3 : null; }
        else if (/balan/.test(cat)) tipo = 'balanco';
        else if (/\bpcg\b|\bpcs\b|prestacao de contas/.test(cat)) tipo = 'relatorio_gestao';
        if (!tipo || ((tipo === 'rreo' || tipo === 'rgf') && !periodo)) return { ignorar: 'Categoria sem equivalente no portal: ' + t.replace(/^Conta P[uú]blica\s*-\s*/i, '') + (tipo ? ' (período não informado)' : ''), ano };
        if (tipo === 'rreo' && periodo > 6) return { ignorar: 'Período inválido', ano };
        if (tipo === 'rgf' && periodo > (periodicidade === 'semestral' ? 2 : 3)) return { ignorar: 'Período inválido', ano };
        const docs = documentos(m, url);
        if (!docs.length) baixar(m, url, /\/conta-publica\/download\//).forEach((u, i) => docs.push({ url: u, titulo: i ? 'Anexo ' + i : t, data: null }));
        const dt = data(pega(c, 'data'));
        return {
          ano, data: dt, chave: { tipo, exercicio: ano, periodo },
          registro: { tipo, exercicio: ano, exercicio_fim, periodicidade, periodo, descricao: limpar(pega(c, 'descricao')).slice(0, 300) || null, data_publicacao: dt },
          arquivos: docs[0] ? [{ url: docs[0].url, campo: 'arquivo_url' }] : [],
          extras: docs.slice(1)
        };
      }
    },
    // ---------------------------------------------------------------
    noticia: {
      nome: 'Notícias', destino: 'Notícias', pntp: false, pasta: 'noticias',
      listas: ['/noticia/categoria'],
      reId: /\/noticia\/(\d+)\//g,
      url: (o, id) => o + '/noticia/' + id + '/x/',
      ler(html, url) {
        const { d, m } = doc(html);
        const cab = [...m.querySelectorAll('h2')].map((x) => limpar(x.textContent)).find((x) => /\d{4}$/.test(x) && / - /.test(x));
        const titulo = limpar((d.querySelector('meta[property="og:title"]') || {}).content || '');
        const corpo = m.querySelector('.noticia-interna-conteudo');
        if (!cab || !titulo || !corpo) return { vazio: true };
        const dt = dataExtenso(cab);
        const paragrafos = [...corpo.querySelectorAll('p, li')].map((p) => limpar(p.textContent)).filter(Boolean);
        const texto = (paragrafos.length ? paragrafos.join('\n\n') : limpar(corpo.textContent)).slice(0, 20000);
        const capa = (d.querySelector('meta[property="og:image"]') || {}).content;
        return {
          ano: dt ? Number(dt.slice(0, 4)) : null, data: dt, chave: { titulo: titulo.slice(0, 200), data: dt },
          registro: { titulo: titulo.slice(0, 200), resumo: texto.slice(0, 280) + (texto.length > 280 ? '…' : ''), conteudo: texto, categoria: limpar(cab.split(' - ')[0]).slice(0, 60) || null,
            publicado_em: dt ? dt + 'T09:00:00-03:00' : null, data_ordem: dt ? dt + 'T09:00:00-03:00' : null },
          arquivos: capa && /^https?:/.test(capa) ? [{ url: capa, campo: 'capa_url' }] : []
        };
      }
    }
  };

  window.MIGRACAO_ADAPTADORES = window.MIGRACAO_ADAPTADORES || {};
  window.MIGRACAO_ADAPTADORES.plataforma_a = {
    nome: 'Plataforma A (/legislacao, /licitacao, /contrato, /concurso, /conta-publica, /noticia)',
    reconhece: (html) => /\/legislacao\/|\/licitacao\/|\/conta-publica/.test(html) && /container-conteudo|_v2/.test(html),
    secoes: SECOES,
    maiorId: maiorIdDe,
    util: { data, dataExtenso, valor, campos, documentos, limpar }
  };
})();
