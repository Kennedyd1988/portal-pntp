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

  // "MARCOS AURELIO DE PAIVA RÊGO" → "Marcos Aurelio de Paiva Rêgo" (nomes em caixa alta no site antigo)
  const nomeProprio = (t) => t === t.toUpperCase()
    ? t.toLowerCase().replace(/(^|[\s'(-])(\S)/g, (x, a, b) => a + b.toUpperCase()).replace(/ (De|Da|Do|Das|Dos|E)(?= )/g, (x) => x.toLowerCase())
    : t;
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
      // Pela busca do próprio site, ano a ano: os números (ids) não seguem a ordem dos anos
      // (há leis antigas cadastradas depois), então a varredura por id parava antes da hora.
      // As portarias de diárias (categoria "Diária") ficam de fora: Diárias segue no sistema de pessoal.
      async listar(ctx) {
        const ini = await ctx.ler(ctx.origem + '/legislacao');
        const csrf = (new DOMParser().parseFromString(ini.html, 'text/html').querySelector('input[name=csrf]') || {}).value || '';
        const vistos = new Set();
        let diarias = 0;
        for (let ano = new Date().getFullYear(); ano >= ctx.de && !ctx.parar(); ano--) {
          for (let pag = 1, total = 1; pag <= total && !ctx.parar(); pag++) {
            const r = await ctx.ler(ctx.origem + '/legislacao/index/categoria/page/' + pag + '/busca?csrf=' + encodeURIComponent(csrf) +
              '&descricao=&numero=&ano=' + ano + '&dataInicio=&dataFinal=&categoria=');
            for (const x of r.html.matchAll(/\/legislacao\/index\/categoria\/page\/(\d+)\/busca/g)) total = Math.max(total, Number(x[1]));
            const d = new DOMParser().parseFromString(r.html, 'text/html');
            const tabela = [...d.querySelectorAll('table')].find((t) => /categoria/i.test(t.textContent) && t.querySelector('a[href*="/legislacao/detalhe/"]'));
            if (!tabela) break;
            for (const tr of tabela.querySelectorAll('tr')) {
              const a = tr.querySelector('a[href*="/legislacao/detalhe/"]');
              if (!a) continue;
              const id = Number((a.getAttribute('href').match(/\/detalhe\/(\d+)/) || [])[1]);
              if (!id || vistos.has(id)) continue;
              vistos.add(id);
              const cat = limpar((tr.querySelectorAll('td')[1] || {}).textContent);
              if (/^di[aá]rias?$/i.test(cat)) { diarias++; continue; }
              const url = ctx.origem + '/legislacao/detalhe/' + id + '/x/';
              let p; try { p = await ctx.ler(url); } catch (e) { ctx.log('lei ' + id + ': ' + e.message); continue; }
              await ctx.emitir(url, p.status === 200 ? SECOES.legislacao.ler(p.html, url) : { vazio: true });
            }
          }
        }
        if (diarias) ctx.log(diarias + ' portarias de diárias deixadas de fora (Diárias segue no sistema de pessoal).');
        return [];
      },
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
        else if (/\bpcg\b|\bpcs\b|prestacao de contas|relatorio( de)? gestao|controle interno/.test(cat)) tipo = 'relatorio_gestao';
        else if (/parecer/.test(cat)) tipo = 'parecer_tce';
        else if (/julgamento/.test(cat)) tipo = 'julgamento_camara';
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
      // Notícias pela lista do próprio site, página a página (período em "O restante"; padrão: todas).
      nome: 'Notícias', destino: 'Notícias', pntp: false, pasta: 'noticias',
      listas: ['/noticia/categoria'],
      reId: /\/noticia\/(\d+)\//g,
      url: (o, id) => o + '/noticia/' + id + '/x/',
      async listar(ctx) {
        const vistos = new Set();
        for (let pag = 1, total = 1; pag <= total && !ctx.parar(); pag++) {
          const r = await ctx.ler(ctx.origem + '/noticia/categoria' + (pag > 1 ? '/page/' + pag : ''));
          for (const x of r.html.matchAll(/\/noticia\/categoria\/page\/(\d+)/g)) total = Math.max(total, Number(x[1]));
          for (const x of r.html.matchAll(/\/noticia\/(\d+)\/[^"'\s]*/g)) {
            const id = Number(x[1]);
            if (vistos.has(id)) continue;
            vistos.add(id);
            const url = ctx.origem + '/noticia/' + id + '/x/';
            let p; try { p = await ctx.ler(url); } catch (e) { ctx.log('notícia ' + id + ': ' + e.message); continue; }
            await ctx.emitir(url, p.status === 200 ? SECOES.noticia.ler(p.html, url) : { vazio: true });
          }
        }
        return [];
      },
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
            publicado_em: dt ? dt + 'T09:00:00-03:00' : null },
          arquivos: capa && /^https?:/.test(capa) ? [{ url: capa, campo: 'capa_url' }] : []
        };
      }
    },
    // ---------------------------------------------------------------
    // Atas de registro de preços → Contratos (tipo "Ata de registro de preços")
    ata: {
      nome: 'Atas de registro de preços', destino: 'Contratos (atas)', pntp: true, pasta: 'contratos', pararApos: 80,
      listas: ['/ata-registro-preco'],
      reId: /\/ata-registro-preco\/page\/\d+\/detalhe\/(\d+)/g,
      url: (o, id) => o + '/ata-registro-preco/page/1/detalhe/' + id,
      ler(html, url) {
        const { m } = doc(html);
        const c = campos(m);
        const k = (re) => { for (const [kk, v] of Object.entries(c)) if (re.test(kk)) return limpar(v); return ''; };
        const objeto = k(/^objeto/).slice(0, 4000);
        const numero = k(/^n\S*\s*ata$/);
        if (!objeto && !numero) return { vazio: true };
        const dt = data(k(/^data/));
        const anoP = (k(/pregao/).match(/(\d{4})\s*$/) || [])[1];
        const ano = anoP ? Number(anoP) : dt ? Number(dt.slice(0, 4)) : null;
        const forn = k(/fornecedor|contratad/);
        const nd = ((forn.match(/(?:CNPJ|CPF)\s*:?\s*([\d./-]+)/i) || [])[1] || '').replace(/\D/g, '');
        const nome = limpar(forn.replace(/(?:CNPJ|CPF)\s*:?.*$/i, '')).slice(0, 200);
        const arq = baixar(m, url, /\/ata-registro-preco\/.*download\//);
        return {
          ano, data: dt, chave: { tipo: 'ata_registro_precos', numero: numero || null, ano },
          registro: { origem: 'portal', tipo: 'ata_registro_precos', numero: numero || null, ano, processo: k(/processo/) || null,
            objeto: objeto.length >= 5 ? objeto : 'Ata de registro de preços ' + (numero || ''),
            contratado_nome: nome.length >= 2 ? nome : 'Não informado no site antigo',
            contratado_doc: nd.length === 11 || nd.length === 14 ? nd : null,
            data_assinatura: dt || (ano ? ano + '-01-01' : null), vigencia_inicio: dt },
          arquivos: arq[0] ? [{ url: arq[0], campo: 'arquivo_url' }] : []
        };
      }
    },
    // ---------------------------------------------------------------
    // Audiências públicas → Publicações (tipo próprio "Audiência pública"), um registro por documento
    audiencia: {
      nome: 'Audiências públicas', destino: 'Publicações (Audiência pública)', pntp: true, pasta: 'publicacoes',
      listas: ['/audiencia-publica'],
      reId: /\/audiencia-publica\/detalhe\/(\d+)\//g,
      url: (o, id) => o + '/audiencia-publica/detalhe/' + id + '/',
      ler(html, url) {
        const { m } = doc(html);
        const c = campos(m);
        const k = (re) => { for (const [kk, v] of Object.entries(c)) if (re.test(kk)) return limpar(v); return ''; };
        const assunto = k(/^assunto/) || k(/^descricao/);
        if (!assunto) return { vazio: true };
        const dt = data(k(/presencial/)) || data(k(/encerramento/));
        const docs = [...m.querySelectorAll('a[href*="/audiencia-publica/documento"], a[href*="/audiencia-publica/download"]')]
          .map((a) => ({ url: new URL(a.getAttribute('href'), url).href, titulo: limpar(a.getAttribute('title') || a.textContent).slice(0, 150) || 'Documento', data: dt }));
        if (!docs.length) return { ignorar: 'Audiência sem documentos no site antigo', ano: dt ? Number(dt.slice(0, 4)) : null };
        return { ano: dt ? Number(dt.slice(0, 4)) : null, data: dt, chave: { assunto },
          registro: { assunto: assunto.slice(0, 300), descricao: k(/^descricao/).slice(0, 1000), status: k(/^status/) }, documentos: docs };
      }
    },
    // ---------------------------------------------------------------
    // Obras (portal de obras com dados em JSON) → Obras + medições
    obra: {
      nome: 'Obras', destino: 'Obras (com medições)', pntp: true, pasta: 'obras',
      listas: [],
      async listar(ctx) {
        const corpo = (o) => Object.entries(o).map(([a, b]) => encodeURIComponent(a) + '=' + encodeURIComponent(b)).join('&');
        const json = async (caminho, dados) => {
          const r = await ctx.ler(ctx.origem + caminho, { metodo: 'POST', corpo: corpo(dados || {}) });
          try { return JSON.parse(r.html).sucess; } catch (_) { return null; }
        };
        const rel = await json('/obra/obra/relatorio');
        if (!rel) throw new Error('Não achei o portal de obras do site antigo.');
        const itens = [];
        for (const o of Object.values(rel)) {
          if (ctx.parar()) break;
          const ini = data(o.dataInicio), prev = data(o.dataPrevista);
          const ano = Number((prev || ini || '').slice(0, 4)) || null;
          const url = ctx.origem + '/obra?id=' + o.id;
          if (!ano || ano < ctx.de) { itens.push({ url, x: { ano, foraPeriodo: true } }); continue; }
          const grupos = (await json('/obra/obra/documento', { idBanco: o.id })) || [];
          const docs = [];
          for (const g of grupos) for (const d of g.documentos || []) {
            if (!d.doc) continue;
            docs.push({ url: ctx.origem + '/admin/globalarq/obra/documento-auxiliar/' + d.doc, titulo: limpar(d.nome).slice(0, 150) || limpar(g.categoria), categoria: limpar(g.categoria), data: data(d.data) });
          }
          const sit = { 1: 'em_andamento', 2: 'concluida', 3: 'paralisada' }[o.situacao] || 'em_andamento';
          const recebimento = docs.find((d) => /receb/i.test(d.titulo + ' ' + d.categoria));
          const fim = sit === 'concluida' ? ((recebimento && recebimento.data) || prev || ini) : null;
          const medicoes = docs.filter((d) => /medi[cç][aã]o/i.test(d.titulo + ' ' + d.categoria))
            .map((d, i) => ({ url: d.url, numero: Number((d.titulo.match(/(\d+)\s*[ªaº°]?\s*medi/i) || [])[1]) || i + 1, descricao: d.titulo, data: d.data }));
          const outros = docs.filter((d) => !medicoes.some((x) => x.url === d.url));
          const titulo = limpar(o.titulo);
          itens.push({ url, x: {
            ano, data: ini, chave: { titulo },
            registro: { titulo: (titulo.length >= 5 ? titulo : 'Obra ' + titulo).slice(0, 300),
              descricao: [limpar(o.categoria) && 'Categoria: ' + limpar(o.categoria), limpar(o.tipo) && 'Tipo: ' + limpar(o.tipo)].filter(Boolean).join(' · ') || null,
              local: limpar(o.endereco).slice(0, 300) || null, contratada_nome: limpar(o.nomeEmpresa).slice(0, 200) || null,
              valor_contratado: Number(o.valor) || null, situacao_obra: sit, percentual: sit === 'concluida' ? 100 : Math.min(100, Number(o.percentualExecutado) || 0),
              data_inicio: ini, previsao_conclusao: prev && ini && prev >= ini ? prev : null, data_conclusao: fim && ini && fim < ini ? ini : fim },
            medicoes, outros
          } });
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Secretarias e departamentos → Estrutura (unidades) + responsável (gestores)
    secretaria: {
      nome: 'Secretarias e responsáveis', destino: 'Estrutura organizacional', semPeriodo: true, pasta: 'gestores',
      listas: ['/prefeitura/departamento'],
      reId: /\/prefeitura\/detalhe-departamento\/(\d+)\//g,
      url: (o, id) => o + '/prefeitura/detalhe-departamento/' + id + '/x/',
      ler(html, url) {
        const { m } = doc(html);
        const nome = limpar((m.querySelector('.container-titulo h1, .container-titulo h2') || {}).textContent);
        if (!nome || /^departamentos?$/i.test(nome)) return { vazio: true };
        const resp = limpar((m.querySelector('h3') || {}).textContent);
        const img = m.querySelector('img.img-fluid');
        const ps = [...m.querySelectorAll('p')].map((p) => limpar(p.textContent));
        const depois = (re) => { const p = ps.find((t) => re.test(t)); return p ? limpar(p.replace(re, '')).replace(/^:\s*/, '') : ''; };
        const iTel = ps.findIndex((t) => /^telefone:?$/i.test(t));
        const tel = depois(/^telefone:?/i) || (iTel >= 0 ? ps[iTel + 1] : '');
        const mail = (m.querySelector('a[href^="mailto:"]') || {}).textContent;
        const comp = m.querySelector('.esconde-conteudo');
        const compTexto = comp ? [...comp.querySelectorAll('p, li')].map((p) => limpar(p.textContent)).filter(Boolean).join('\n\n').slice(0, 8000) : '';
        const cargo = /^prefeito$/i.test(nome) ? 'Prefeito(a)' : /^vice/i.test(nome) ? 'Vice-prefeito(a)' : /chefe de gabinete/i.test(nome) ? 'Chefe de Gabinete'
          : /secretaria/i.test(nome) ? 'Secretário(a)' : 'Responsável';
        // Cargos de gabinete viram a unidade correspondente
        const unidade = /^prefeito$/i.test(nome) ? 'Gabinete do Prefeito' : /^vice/i.test(nome) ? 'Vice-Prefeitura' : /^chefe de gabinete/i.test(nome) ? 'Chefia de Gabinete'
          : nome.toLowerCase().replace(/(^|[\s,(-])(\S)/g, (t, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (t) => t.toLowerCase()).replace(/,(?=\S)/g, ', ');
        return { ano: null, chave: { nome: unidade },
          registro: { nome: unidade.slice(0, 200), endereco: depois(/^endere[cç]o:?/i).slice(0, 300) || null, horario_atendimento: depois(/^hor[aá]rio[^:]*:?/i).slice(0, 200) || null,
            telefone: limpar(tel).slice(0, 60) || null, email: limpar(mail) || null, competencias: compTexto || null },
          gestor: resp && !/^respons[aá]vel$/i.test(resp) ? { nome: nomeProprio(resp).slice(0, 200), cargo } : null,
          arquivos: img && img.getAttribute('src') ? [{ url: new URL(img.getAttribute('src'), url).href, campo: 'foto_url' }] : [] };
      }
    },
    // ---------------------------------------------------------------
    // Perguntas frequentes → FAQ
    faq: {
      nome: 'Perguntas frequentes', destino: 'Perguntas frequentes', semPeriodo: true, pasta: 'faq',
      listas: [],
      async listar(ctx) {
        const r = await ctx.ler(ctx.origem + '/prefeitura/perguntas-frequentes');
        const { m } = doc(r.html);
        const itens = []; let cat = null, ordem = 10;
        for (const n of m.querySelectorAll('h3, .mostra-conteudo')) {
          if (n.tagName === 'H3') { cat = limpar(n.textContent).slice(0, 80); continue; }
          const pergunta = limpar(n.textContent);
          let resp = n.nextElementSibling;
          while (resp && !resp.classList.contains('esconde-conteudo')) resp = resp.nextElementSibling;
          const resposta = resp ? [...resp.querySelectorAll('p, li')].map((p) => limpar(p.textContent)).filter(Boolean).join('\n\n') || limpar(resp.textContent) : '';
          if (pergunta.length < 5 || !resposta) continue;
          itens.push({ url: ctx.origem + '/prefeitura/perguntas-frequentes#' + encodeURIComponent(pergunta.slice(0, 80)),
            x: { ano: null, chave: { pergunta }, registro: { pergunta: pergunta.slice(0, 300), resposta, categoria: cat, ordem: ordem++ } } });
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Páginas livres (/pagina/N, com subpáginas) → Páginas institucionais, como RASCUNHO para revisar
    pagina: {
      nome: 'Páginas e documentos avulsos', destino: 'Páginas institucionais (rascunho para revisar)', semPeriodo: true, pasta: 'paginas',
      listas: ['/'],
      reId: /\/pagina\/(\d+)\//g,
      async listar(ctx) {
        const home = await ctx.ler(ctx.origem + '/');
        let maior = 0; for (const x of home.html.matchAll(/\/pagina\/(\d+)\//g)) maior = Math.max(maior, Number(x[1]));
        const itens = [];
        const conteudoDe = (m, base) => {
          const f = m.querySelector('form') || m;
          f.querySelectorAll('.busca-pagina-container, nav, .speech, button, input, select').forEach((x) => x.remove());
          const linhas = [], arquivos = [];
          for (const n of f.querySelectorAll('p, li, h3, h4, a[href]')) {
            if (n.tagName === 'A') {
              const h = n.getAttribute('href') || '';
              if (!/download|globalarq|uploads|\.(pdf|docx?|xlsx?|odt|ods|zip|jpe?g|png)(\?|$)/i.test(h) || /sub-pagina\/\d+\/$/.test(h)) continue;
              const u = new URL(h, base).href;
              if (arquivos.some((a) => a.url === u)) continue;
              const t = limpar(n.getAttribute('title') || n.textContent) || 'Documento';
              arquivos.push({ url: u, titulo: t.slice(0, 150) });
              linhas.push('- [' + t.replace(/[[\]]/g, '') + '](' + u + ')');
            } else if (!n.closest('a')) {
              const t = limpar(n.textContent);
              if (!t || /^(data de cria|última atualiza|acessar página|documentos anexados|informações atualizadas)/i.test(t)) continue;
              linhas.push(/^H[34]$/.test(n.tagName) ? '### ' + t : t);
            }
          }
          return { linhas: [...new Set(linhas)], arquivos };
        };
        for (let id = 1; id <= maior + 3 && !ctx.parar(); id++) {
          const url = ctx.origem + '/pagina/' + id + '/x';
          let r; try { r = await ctx.ler(url); } catch (e) { ctx.log('página ' + id + ': ' + e.message); continue; }
          if (r.status !== 200) continue;
          const { m } = doc(r.html);
          const titulo = limpar((m.querySelector('.container-titulo h1, .container-titulo h2') || {}).textContent);
          if (!titulo || titulo.length < 3) continue;
          const subs = [...new Set([...m.querySelectorAll('a[href*="/sub-pagina/"]')].map((a) => a.getAttribute('href')).filter((h) => /\/sub-pagina\/\d+\/$/.test(h)))];
          const base = conteudoDe(m, r.url_final || url);
          const blocos = [base.linhas.filter((l) => !subs.length || l.startsWith('- [')).join('\n\n')];
          const arquivos = base.arquivos.slice();
          for (const h of subs) {
            if (ctx.parar()) break;
            const su = new URL(h, url).href;
            let rs; try { rs = await ctx.ler(su); } catch (e) { ctx.log(su.replace(ctx.origem, '') + ': ' + e.message); continue; }
            const { m: ms } = doc(rs.html);
            const st = limpar((ms.querySelector('.container-titulo h1, .container-titulo h2') || {}).textContent) || 'Seção';
            if (/^\d{4}$/.test(st) && Number(st) < ctx.de) continue;   // subpágina de ano fora do período
            const c = conteudoDe(ms, rs.url_final || su);
            const linhas = c.linhas.filter((l) => l !== st);
            if (!linhas.length) continue;
            blocos.push('## ' + st + '\n\n' + linhas.join('\n\n'));
            for (const a of c.arquivos) if (!arquivos.some((x) => x.url === a.url)) arquivos.push(a);
          }
          const conteudo = blocos.filter((b) => b.trim()).join('\n\n');
          if (!conteudo.trim()) { itens.push({ url, x: { ignorar: 'Página vazia no site antigo', ano: null } }); continue; }
          const slug = sem(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'pagina-' + id;
          itens.push({ url, x: { ano: null, chave: { slug }, registro: { titulo: titulo.slice(0, 160), slug, conteudo: conteudo.slice(0, 100000) }, arquivosTexto: arquivos } });
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Página inicial: banners do carrossel, brasão, contatos e redes sociais do rodapé,
    // link do Diário Oficial, vídeos e atalhos para serviços pela internet.
    // A leitura é por pistas comuns a sites de prefeitura (não depende do modelo do site).
    inicio: {
      nome: 'Página inicial (banners, contatos, redes, vídeos e atalhos)', destino: 'Banners, Aparência e contatos, Vídeos e Carta de Serviços', semPeriodo: true, pasta: 'inicio',
      listas: [],
      async listar(ctx) {
        const r = await ctx.ler(ctx.origem + '/');
        return lerInicio(r.html, r.url_final || ctx.origem + '/', ctx.origem);
      }
    }
  };

  // ---------------- página inicial ----------------
  const REDES = [['facebook', /facebook\.com|fb\.com/i], ['instagram', /instagram\.com/i], ['youtube', /youtube\.com\/(?:@|c\/|channel\/|user\/)|youtube\.com\/[A-Za-z0-9_.-]+\/?$/i],
    ['whatsapp', /wa\.me|whatsapp\.com/i]];
  // Atalho que parece serviço pedido pela internet (vai para a Carta de Serviços como rascunho).
  const RE_SERVICO = /nota fiscal|nfs-?e|iptu|itbi|alvar|certid|tribut|contribuinte|boleto|guia|protocolo|agendamento|matr[ií]cula|inscri[cç]|segunda via|2[ªa] via|emiss[aã]o|contracheque|holerite|portal do servidor|consulta|servi[cç]os? on-?line|requerimento|licenciamento|cadastro/i;
  // Atalhos que o portal já tem como página própria (Aparência › Destinos das páginas).
  const RE_PROPRIO = /transpar|licita|contrato|e-?sic|acesso [aà] informa|ouvidoria|di[aá]rio oficial|receita|despesa|folha|di[aá]rias|obras|conv[eê]nio|emenda|concurso|seletivo|lgpd|carta de servi/i;
  function imagensDe(no, base) {
    const urls = [];
    const add = (u, alt, link) => {
      if (!u || /^data:/.test(u)) return;
      let abs; try { abs = new URL(u.trim().split(/\s+/)[0], base).href; } catch (_) { return; }
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(abs) && !/globalarq|upload|imagem|image|banner/i.test(abs)) return;
      if (!urls.some((x) => x.url === abs)) urls.push({ url: abs, alt: limpar(alt), link });
    };
    for (const n of no.querySelectorAll('img, [style*="background"]')) {
      const a = n.closest('a[href]');
      let link = a ? a.getAttribute('href') : null;
      try { link = link && !/^(#|javascript:)/i.test(link) ? new URL(link, base).href : null; } catch (_) { link = null; }
      const alt = n.getAttribute('alt') || n.getAttribute('title') || (a && (a.getAttribute('title') || a.textContent)) || '';
      if (n.tagName === 'IMG') add(n.getAttribute('data-src') || n.getAttribute('data-lazy-src') || n.getAttribute('src') || n.getAttribute('srcset'), alt, link);
      const bg = (n.getAttribute('style') || '').match(/background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
      if (bg) add(bg[1], alt, link);
    }
    return urls;
  }
  function lerInicio(html, base, origem) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,style,noscript').forEach((x) => x.remove());
    const itens = [];
    const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (_) { return ''; } };
    const meuHost = host(origem);
    const chaveUrl = (tipo, u) => origem + '/#inicio-' + tipo + ':' + u;

    // 1) Banners. Plataforma A: imagens de /banner/banner-principal/ (o carrossel tem cópias: tira as repetidas).
    // Outros sites: o primeiro carrossel/slider cujas imagens são de banner (não de gestores ou notícias).
    const vistos = new Set();
    let ordem = 10;
    const principais = imagensDe(d.body, base).filter((x) => /\/banner\/banner-principal\//i.test(x.url));
    for (const im of principais) {
      if (vistos.has(im.url)) continue; vistos.add(im.url);
      const titulo = (im.alt.length >= 3 ? im.alt : 'Destaque ' + vistos.size).slice(0, 160);
      itens.push({ url: chaveUrl('banner', im.url), x: { ano: null, tipo: 'banner', chave: { imagem: im.url },
        registro: { titulo, link_url: im.link && im.link !== base && im.link !== origem + '/' ? im.link : null, ordem, ativo: true },
        arquivos: [{ url: im.url, campo: 'imagem_url' }] } });
      ordem += 10;
    }
    const conts = vistos.size ? [] : [...d.querySelectorAll('.carousel, .swiper, .swiper-container, .slick-slider, .owl-carousel, .flexslider, .slider, [class*="banner"], [id*="banner"], [class*="slide"], [id*="slide"], [id*="carousel"], [class*="carrossel"]')]
      .filter((c) => !c.closest('footer, .rodape, [class*="footer"], [class*="rodape"], [class*="noticia"], [class*="news"], [class*="secretaria"], [class*="gestor"], [class*="departamento"]'));
    for (const c of conts) {
      if (conts.some((o) => o !== c && o.contains(c) && imagensDe(o, base).length)) continue;   // só o contêiner mais de fora
      const imgs = imagensDe(c, base).filter((x) => !/logo|brasao|bras%C3%A3o|icone|icon|selo|departamento|gestor|secretari|noticia|obra/i.test(x.url + ' ' + x.alt));
      if (!imgs.length || imgs.length > 15) continue;
      for (const im of imgs) {
        if (vistos.has(im.url)) continue; vistos.add(im.url);
        const titulo = (im.alt.length >= 3 ? im.alt : 'Destaque ' + (vistos.size)).slice(0, 160);
        itens.push({ url: chaveUrl('banner', im.url), x: { ano: null, tipo: 'banner', chave: { imagem: im.url },
          registro: { titulo, link_url: im.link && im.link !== base && im.link !== origem + '/' ? im.link : null, ordem: ordem, ativo: true },
          arquivos: [{ url: im.url, campo: 'imagem_url' }] } });
        ordem += 10;
      }
      if (vistos.size) break;
    }

    // 2) Identidade, contatos e redes sociais (rodapé, cabeçalho e links da página).
    const rodape = d.querySelector('footer, .rodape, #rodape, [class*="footer"], [class*="rodape"]') || d.body;
    // Texto com espaço entre os blocos (textContent cola "000Telefone" e atrapalha as buscas).
    const pedacos = []; const tw = d.createTreeWalker(rodape, 4); while (tw.nextNode()) pedacos.push(tw.currentNode.nodeValue);
    const texto = limpar(pedacos.join(' '));
    const ct = {};
    const mail = rodape.querySelector('a[href^="mailto:"]');
    ct.email = mail ? limpar(mail.getAttribute('href').replace(/^mailto:/i, '').split('?')[0]) : ((texto.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [])[0] || '');
    const tel = rodape.querySelector('a[href^="tel:"]');
    ct.telefone = tel ? limpar(tel.textContent) || limpar(tel.getAttribute('href').replace(/^tel:/i, '')) : ((texto.match(/\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/) || [])[0] || '');
    ct.cep = ((texto.match(/\b\d{2}\.?\d{3}-?\d{3}\b/) || [])[0] || '').replace(/\./, '');
    const linhas = [...rodape.querySelectorAll('p, li, span, address, div')].filter((n) => !n.children.length || n.tagName === 'ADDRESS' || n.tagName === 'P').map((n) => limpar(n.textContent)).filter(Boolean);
    const endereco = linhas.find((t) => /^(rua|r\.|av\.?|avenida|pra[cç]a|travessa|tv\.|rodovia|estrada|s[ií]tio)\b/i.test(t) || /endere[cç]o\s*:/i.test(t));
    ct.endereco = endereco ? limpar(endereco.replace(/^endere[cç]o\s*:\s*/i, '')).replace(/\s*[-–|]?\s*CEP.*$/i, '').slice(0, 300) : '';
    const horario = linhas.find((t) => /hor[aá]rio|expediente|segunda[\s-]*(feira)?\s*(a|à)\s*sexta/i.test(t) && /\d/.test(t) && t.length < 200);
    ct.horario = horario ? limpar(horario.replace(/^hor[aá]rio[^:]*:\s*/i, '')).slice(0, 200) : '';
    for (const a of d.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '';
      for (const [k, re] of REDES) if (!ct[k] && re.test(h) && !/sharer|share|intent|plugins/i.test(h)) ct[k] = h.trim();
    }
    const diario = [...d.querySelectorAll('a[href]')].find((a) => /di[aá]rio oficial/i.test(limpar(a.textContent + ' ' + (a.getAttribute('title') || ''))));
    if (diario) { try { const u = new URL(diario.getAttribute('href'), base).href; if (host(u) !== meuHost) ct.diario_oficial_url = u; } catch (_) { /* sem link */ } }
    const cab = d.querySelector('header, .cabecalho, #cabecalho, [class*="header"], [class*="topo"]') || d.body;
    const logo = [...cab.querySelectorAll('img')].find((i) => /logo|bras[aã]o|marca|prefeitura/i.test((i.getAttribute('src') || '') + ' ' + (i.getAttribute('alt') || '') + ' ' + (i.className || '')))
      || cab.querySelector('img');
    const logoUrl = logo ? (() => { try { return new URL(logo.getAttribute('data-src') || logo.getAttribute('src'), base).href; } catch (_) { return null; } })() : null;
    const valores = Object.fromEntries(Object.entries(ct).filter(([, v]) => v));
    if (Object.keys(valores).length || logoUrl) {
      itens.push({ url: chaveUrl('contatos', 'rodape'), x: { ano: null, tipo: 'contatos', chave: { contatos: true }, registro: valores,
        arquivos: logoUrl && /\.(jpe?g|png|webp)(\?|$)/i.test(logoUrl) ? [{ url: logoUrl, campo: 'brasao_url' }] : [] } });
    }

    // 3) Vídeos (YouTube incorporado ou link de vídeo na página inicial).
    const videos = new Map();
    for (const n of d.querySelectorAll('iframe[src], iframe[data-src], a[href]')) {
      const u = n.getAttribute('src') || n.getAttribute('data-src') || n.getAttribute('href') || '';
      const id = (u.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
      if (!id || videos.has(id)) continue;
      const t = limpar(n.getAttribute('title') || (n.tagName === 'A' ? n.textContent : ''));
      videos.set(id, /^(youtube( video)?( player)?|v[ií]deo)?$/i.test(t) || t.length < 3 ? '' : t);
    }
    for (const [id, t] of videos) itens.push({ url: chaveUrl('video', id), x: { ano: null, tipo: 'video', chave: { video: id },
      registro: { titulo: (t || 'Vídeo do site antigo (' + id + ')').slice(0, 200), url: 'https://www.youtube.com/watch?v=' + id, situacao: t ? 'publicado' : 'rascunho' } } });

    // 4) Atalhos para serviços pela internet (sistemas de fora: nota fiscal, IPTU, contracheque…).
    const atalhos = new Map();
    for (const a of d.querySelectorAll('a[href]')) {
      let u; try { u = new URL(a.getAttribute('href'), base).href; } catch (_) { continue; }
      if (!/^https?:/.test(u) || host(u) === meuHost || REDES.some(([, re]) => re.test(u)) || /youtu/.test(u)) continue;
      const nome = limpar(a.getAttribute('title') || a.textContent || (a.querySelector('img') || {}).alt || '');
      if (nome.length < 3 || nome.length > 120 || !RE_SERVICO.test(nome) || RE_PROPRIO.test(nome)) continue;
      if (![...atalhos.values()].some((x) => x.nome.toLowerCase() === nome.toLowerCase()) && !atalhos.has(u)) atalhos.set(u, { nome, url: u });
    }
    for (const { nome, url } of atalhos.values()) itens.push({ url: chaveUrl('atalho', url), x: { ano: null, tipo: 'atalho', chave: { nome },
      registro: { nome: nome.slice(0, 200), categoria: 'Serviços on-line', forma_prestacao: 'digital', link_digital: url, situacao: 'rascunho',
        descricao: 'Atalho trazido da página inicial do site antigo. Complete a descrição, os requisitos e as etapas antes de publicar.' } } });
    return itens;
  }

  window.MIGRACAO_ADAPTADORES = window.MIGRACAO_ADAPTADORES || {};
  window.MIGRACAO_ADAPTADORES.plataforma_a = {
    nome: 'Plataforma A (/legislacao, /licitacao, /contrato, /concurso, /conta-publica, /noticia, /ata-registro-preco, /obra, /pagina…)',
    reconhece: (html) => /\/legislacao\/|\/licitacao\/|\/conta-publica/.test(html) && /container-conteudo|_v2/.test(html),
    secoes: SECOES,
    maiorId: maiorIdDe,
    util: { data, dataExtenso, valor, campos, documentos, limpar }
  };
})();
