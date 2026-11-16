// =====================================================================
// Migração do site antigo — adaptador "Plataforma A (King)" (revisado na 0.42.0: Prefeitura e Câmara)
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
      // Ficam de fora daqui: as portarias de concessão de diárias (categoria "Diária" ou ementa "Conceder … diária"),
      // que vão para o módulo Diárias (seção "Diárias concedidas"); e as proposições (requerimentos, indicações, moções),
      // que vão para Atividade legislativa. Lei Orgânica e Regimento Interno vêm sempre, de qualquer ano.
      async listar(ctx) {
        const cats = await categoriasLegislacao(ctx);
        const sempre = cats.filter((c) => /lei organica|regimento interno/.test(sem(c.nome)) && !/emenda/.test(sem(c.nome)));
        const vistos = new Set();
        let diarias = 0, props = 0;
        const buscas = [];
        for (let ano = new Date().getFullYear(); ano >= ctx.de; ano--) buscas.push({ ano, categoria: '' });
        for (const c of sempre) buscas.push({ ano: '', categoria: c.id, ementa: /regimento/.test(sem(c.nome)) ? 'Regimento' : 'Lei Org', semPeriodo: true });
        for (const b of buscas) {
          if (ctx.parar()) break;
          await buscaLegislacao(ctx, b, async (lin) => {
            if (vistos.has(lin.id)) return;
            if (ehConcessaoDiaria(lin.categoria, lin.ementa)) { vistos.add(lin.id); diarias++; return; }
            if (/requerimento|indicac|mocao/.test(sem(lin.categoria))) { vistos.add(lin.id); props++; return; }
            const url = ctx.origem + '/legislacao/detalhe/' + lin.id + '/x/';
            if (ctx.jaFeito && await ctx.jaFeito(url)) { vistos.add(lin.id); return; }
            let p; try { p = await ctx.ler(url); } catch (e) { ctx.log('lei ' + lin.id + ': ' + e.message); return; }
            const x = p.status === 200 ? SECOES.legislacao.ler(p.html, url) : { vazio: true };
            // Busca de matérias (Câmara): a categoria só aparece na página do item
            if (!lin.categoria && x.categoriaSite) {
              if (ehConcessaoDiaria(x.categoriaSite, x.registro.ementa)) { vistos.add(lin.id); diarias++; return; }
              if (/requerimento|indicac|mocao/.test(sem(x.categoriaSite))) { vistos.add(lin.id); props++; return; }
            }
            if (b.semPeriodo && (x.vazio || !['lei_organica', 'x_regimento_interno'].includes(x.registro.tipo))) return;   // busca por texto: só o que é
            vistos.add(lin.id);
            if (b.semPeriodo) x.semPeriodo = true;
            await ctx.emitir(url, x);
          });
        }
        if (diarias) ctx.log(diarias + ' portaria(s) de concessão de diárias deixada(s) de fora daqui: vêm pela seção "Diárias concedidas".');
        if (props) ctx.log(props + ' proposição(ões) (requerimentos, indicações, moções) deixada(s) de fora daqui: vêm pela seção "Proposições".');
        return [];
      },
      ler(html, url) {
        const { m } = doc(html);
        const t = tituloSecao(m);
        if (!/^Legisla/i.test(t)) return { vazio: true };
        const c = campos(m);
        const cat = sem(t.replace(/^Legisla[cç][aã]o\s*-\s*/i, ''));
        const tipo = /emenda.*lei organica/.test(cat) ? 'emenda_lei_organica' : /lei organica/.test(cat) ? 'lei_organica' : /regimento interno/.test(cat) ? 'x_regimento_interno'
          : /complementar/.test(cat) ? 'lei_complementar' : /decreto legislativo|decretos legislativos/.test(cat) ? 'decreto_legislativo'
          : /decreto|diaria/.test(cat) && !/tabela/.test(cat) ? 'decreto' : /portaria/.test(cat) ? 'portaria'
          : /instrucao normativa/.test(cat) ? 'instrucao_normativa' : /^atos?\b/.test(cat) ? 'ato'
          : /lei|codigo/.test(cat) ? 'lei' : /resolu/.test(cat) ? 'resolucao' : 'outro';
        const dt = data(pega(c, 'data')) || null;
        const ano = Number(pega(c, 'ano')) || (dt ? Number(dt.slice(0, 4)) : null);
        const ementa = limpar(pega(c, 'ementa')).slice(0, 4000);
        const sit = sem(pega(c, 'situacao'));
        const docs = documentos(m, url);
        const arq = [...m.querySelectorAll('a[href*="download-lei"]')].map((a) => new URL(a.getAttribute('href'), url).href)[0] || (docs[0] && docs[0].url);
        return {
          ano, data: dt, chave: { tipo, numero: limpar(pega(c, 'numero')) || null, ano }, categoriaSite: t.replace(/^Legisla[cç][aã]o\s*-\s*/i, ''),
          tipoNovo: tipo === 'x_regimento_interno' ? { codigo: 'x_regimento_interno', nome: 'Regimento Interno' } : null,
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
        // "A UG não realizou nenhum Concurso…": é declaração de inexistência (vem pela seção Declarações), não um concurso.
        if (NEGA.test(titulo) && !documentos(m, url).length) return { ignorar: 'Declaração de inexistência: vem pela seção "Declarações de inexistência"', ano };
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
        else if (/balan/.test(cat) || /^balan/.test(sem(pega(c, 'descricao')))) tipo = 'balanco';
        else if (/ordem cronologica|divida ativa/.test(cat)) return { ignorar: 'Sem lugar em Contas: ' + t.replace(/^Conta P[uú]blica\s*-\s*/i, '') + ' fica no sistema contábil (ligue em Aparência › Destinos das páginas)', ano };
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
            if (ctx.jaFeito && await ctx.jaFeito(url)) continue;
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
      listas: [],
      // Prefeitura: /prefeitura/departamento; Câmara: /camara/departamento (mesmo modelo).
      async listar(ctx) {
        for (const base of ['/prefeitura', '/camara']) {
          let r; try { r = await ctx.ler(ctx.origem + base + '/departamento'); } catch (_) { continue; }
          if (r.status !== 200) continue;
          const ids = [...new Set([...r.html.matchAll(/\/(?:prefeitura|camara)\/detalhe-departamento\/(\d+)\//g)].map((x) => x[1]))];
          if (!ids.length) continue;
          for (const id of ids) {
            if (ctx.parar()) break;
            const url = ctx.origem + base + '/detalhe-departamento/' + id + '/x/';
            if (ctx.jaFeito && await ctx.jaFeito(url)) continue;
            let p; try { p = await ctx.ler(url); } catch (e) { ctx.log('setor ' + id + ': ' + e.message); continue; }
            await ctx.emitir(url, p.status === 200 ? SECOES.secretaria.ler(p.html, url) : { vazio: true });
          }
          break;
        }
        return [];
      },
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
        const cargo = /^presidente/i.test(nome) ? 'Presidente' : /^prefeito$/i.test(nome) ? 'Prefeito(a)' : /^vice/i.test(nome) ? 'Vice-prefeito(a)' : /chefe de gabinete/i.test(nome) ? 'Chefe de Gabinete'
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
        let r = await ctx.ler(ctx.origem + '/prefeitura/perguntas-frequentes');
        if (r.status !== 200 || !/mostra-conteudo/.test(r.html)) r = await ctx.ler(ctx.origem + '/camara/perguntas-frequentes');
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
    // Páginas livres (/pagina/N, com subpáginas) → Páginas institucionais, como RASCUNHO para revisar.
    // O que das páginas "por ano" já foi para um módulo (declarações, PCA, planos, fiscais, acordos) não entra aqui.
    // Também as páginas fixas do modelo: história, hino e símbolos do município, galeria de prefeitos, links e telefones úteis.
    pagina: {
      nome: 'Páginas e documentos avulsos', destino: 'Páginas institucionais (rascunho para revisar)', semPeriodo: true, pasta: 'paginas',
      listas: [],
      async listar(ctx) {
        const itens = [];
        const slugDe = (t, id) => sem(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'pagina-' + id;
        for (const p of await paginasDoSite(ctx)) {
          const blocos = [];
          const arquivos = [];
          const anos = anosDaPagina(p);
          const foraDaqui = p.regra ? anos.filter((b) => classificar(p, b) !== 'pagina') : [];
          const ficam = p.regra ? anos.filter((b) => classificar(p, b) === 'pagina') : p.subs;
          const texto = p.subs.length ? p.linhas.filter((l) => l.startsWith('- [')) : (p.regra && anos.length ? p.linhas.filter((l) => !anos.some((b) => b.linhas.includes(l.replace(/^#+\s*/, ''))) && !/^(19|20)\d\d$/.test(l)) : p.linhas);
          if (texto.length) blocos.push(texto.join('\n\n'));
          for (const a of p.arquivos) if (texto.some((l) => l.includes('(' + a.url + ')'))) arquivos.push(a);
          // Saúde/Educação: os planos e relatórios vão para o módulo (seção "Planos e relatórios"); o resto fica aqui.
          const setorial = p.regra && (p.regra.doc === 'saude' || p.regra.doc === 'educacao');
          const levado = (a) => setorial && tipoSetorial(p.regra.doc, a.titulo);
          for (const b of ficam) {
            if (b.ano && b.ano < ctx.de) continue;   // ano fora do período
            const fora = b.arquivos.filter(levado).map((a) => '(' + a.url + ')');
            const linhas = b.linhas.filter((l) => !fora.some((f) => l.includes(f)));
            if (!linhas.length || !linhas.some((l) => l.trim())) continue;
            blocos.push('## ' + b.titulo + '\n\n' + linhas.join('\n\n'));
            for (const a of b.arquivos) if (!levado(a) && !arquivos.some((x) => x.url === a.url)) arquivos.push(a);
          }
          if (setorial && blocos.length) blocos[0] = blocos[0].split('\n\n').filter((l) => !p.arquivos.some((a) => levado(a) && l.includes('(' + a.url + ')'))).join('\n\n');
          const conteudo = blocos.filter((x) => x.trim()).join('\n\n');
          // Página "por ano" cujo conteúdo foi para os módulos: sobra só a introdução — não vale uma página.
          const curta = conteudo.replace(/[#\s]/g, '').length < (foraDaqui.length && !arquivos.length ? 150 : 20);
          if (!conteudo.trim() || curta) {
            itens.push({ url: p.url, x: { ignorar: foraDaqui.length ? 'Conteúdo levado para os módulos (declarações, PCA, planos, fiscais, acordos)' : 'Página vazia no site antigo', ano: null } });
            continue;
          }
          const slug = slugDe(p.titulo, p.id);
          itens.push({ url: p.url, x: { ano: null, chave: { slug }, registro: { titulo: p.titulo.slice(0, 160), slug, conteudo: conteudo.slice(0, 100000) }, arquivosTexto: arquivos } });
        }
        // Páginas fixas do modelo
        const FIXAS = [['/cidade', 'História do município'], ['/cidade/hino', 'Hino do município'], ['/cidade/simbolo', 'Símbolos municipais'],
          ['/prefeitura', 'Galeria de prefeitos'], ['/prefeitura/links-uteis', 'Links úteis'], ['/camara/links-uteis', 'Links úteis'],
          ['/prefeitura/telefones', 'Telefones úteis'], ['/camara/telefones', 'Telefones úteis'], ['/prefeitura/organograma', 'Organograma'], ['/camara/organograma', 'Organograma']];
        const feitas = new Set(itens.filter((i) => i.x.chave).map((i) => i.x.chave.slug));
        for (const [cam, tit] of FIXAS) {
          if (ctx.parar()) break;
          const slug = slugDe(tit, 0);
          if (feitas.has(slug)) continue;
          const url = ctx.origem + cam;
          let r; try { r = await ctx.ler(url); } catch (_) { continue; }
          if (r.status !== 200 || (r.url_final && new URL(r.url_final).pathname.replace(/\/$/, '') !== cam)) continue;
          const { m } = doc(r.html);
          let linhas = [];
          const arquivos = [];
          if (cam === '/prefeitura') {   // galeria de prefeitos: nome e gestão
            for (const h of m.querySelectorAll('h2')) {
              const nome = limpar(h.textContent); if (!nome || /galeria/i.test(nome)) continue;
              const ps = []; let n = h.nextElementSibling; while (n && n.tagName !== 'H2' && !n.querySelector('h2') && n.tagName !== 'A') { const t = limpar(n.textContent); if (t) ps.push(t); n = n.nextElementSibling; }
              linhas.push('- ' + nomeProprio(nome) + (ps.length ? ' — ' + ps.join(' · ').replace(/^gest[aã]o:\s*/i, 'Gestão ') : ''));
            }
          } else if (/organograma/.test(cam)) {
            const obj = m.querySelector('object[data], embed[src], iframe[src], img[src*="globalarq"], a[href*="globalarq"]');
            const u = obj && abs(obj.getAttribute('data') || obj.getAttribute('src') || obj.getAttribute('href'), url);
            if (u) { arquivos.push({ url: u, titulo: 'Organograma' }); linhas.push('- [Organograma](' + u + ')'); }
          } else linhas = conteudoDe(m, r.url_final || url).linhas;
          linhas = linhas.filter((l) => l !== tit && !/^(hist[oó]ria do munic[ií]pio|hino do munic[ií]pio|s[ií]mbolos municipais|links [uú]teis|telefones [uú]teis|organograma)$/i.test(l));
          const conteudo = linhas.join('\n\n');
          if (conteudo.replace(/[#\s-]/g, '').length < 20) continue;
          feitas.add(slug);
          itens.push({ url, x: { ano: null, chave: { slug }, registro: { titulo: tit, slug, conteudo: conteudo.slice(0, 100000) }, arquivosTexto: arquivos } });
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

  // =====================================================================
  // 0.42.0 — o que faltava do modelo King (revisão nos sites da Prefeitura e da Câmara de Riacho da Cruz)
  // =====================================================================
  const ANO_ATUAL = new Date().getFullYear();
  const HOJE = () => new Date().toISOString().slice(0, 10);
  const anoDe = (d) => (d ? Number(String(d).slice(0, 4)) : null);
  const abs = (h, base) => { try { return new URL(String(h || '').trim(), base).href; } catch (_) { return null; } };
  // Texto de "não houve / não há": vira declaração de inexistência no portal.
  const NEGA = /\bn[aã]o (houve|h[aá]|ocorre\w*|possui|possu[ií]a|firmou|realizou|foram|existe\w*|teve|contratou|celebrou|recebeu|concedeu|tem)\b|inexist|nenhum[a]? .{0,60}(cadastrad|registrad|realizad|firmad|vigente|contrat)|aguardando/i;
  const ehDocumento = (h) => /download|globalarq|\/uploads\/|\.(pdf|docx?|xlsx?|odt|ods|zip|jpe?g|png)(\?|$)/i.test(h || '');

  // Tabelas do modelo: cabeçalho (th) numa linha e valores (td) na(s) linha(s) seguinte(s). Linha de um só
  // cabeçalho (colspan) junta todos os valores até o próximo cabeçalho (ex.: vários "Apoio Vereador").
  function blocos(m) {
    const r = {};
    for (const t of m.querySelectorAll('table')) {
      let cab = [];
      for (const tr of t.querySelectorAll('tr')) {
        const ths = [...tr.querySelectorAll(':scope > th')];
        if (ths.length) { cab = ths.map((x) => sem(x.textContent).replace(/[:]+$/, '').trim()); continue; }
        const tds = [...tr.querySelectorAll(':scope > td')];
        if (!tds.length || !cab.length) continue;
        if (cab.length === 1) (r[cab[0]] = r[cab[0]] || []).push(...tds);
        else tds.forEach((td, i) => { if (cab[i]) (r[cab[i]] = r[cab[i]] || []).push(td); });
      }
    }
    return r;
  }
  const bk = (b, nome) => Object.keys(b).find((k) => k === sem(nome)) || Object.keys(b).find((k) => k.startsWith(sem(nome)));
  const bt = (b, ...nomes) => { for (const n of nomes) { const k = bk(b, n); if (k) { const t = limpar(b[k].map((td) => td.textContent).join(' ')); if (t && !/^n[aã]o declarado$/i.test(t)) return t; } } return ''; };
  const bel = (b, nome) => { const k = bk(b, nome); return k ? b[k] : []; };
  // Pares "<strong>Rótulo:</strong> valor" (ex.: perfil do vereador)
  function rotulos(m) {
    const r = {};
    for (const s of m.querySelectorAll('strong, b')) {
      const k = sem(s.textContent).replace(/:$/, '').trim();
      if (!k || r[k] !== undefined || !s.parentElement) continue;
      const v = limpar(s.parentElement.textContent.replace(s.textContent, '')).replace(/^:\s*/, '');
      if (v) r[k] = v;
    }
    return r;
  }

  // ---------------- legislação (busca do próprio site) ----------------
  async function categoriasLegislacao(ctx) {
    if (ctx._cats) return ctx._cats;
    const r = await ctx.ler(ctx.origem + '/legislacao');
    const d = new DOMParser().parseFromString(r.html, 'text/html');
    ctx._csrf = (d.querySelector('input[name=csrf]') || {}).value || '';
    const l = [];
    for (const a of d.querySelectorAll('a[href*="/legislacao/categoria/"]')) {
      const id = ((a.getAttribute('href') || '').match(/\/categoria\/(\d+)/) || [])[1];
      const nome = limpar(a.textContent).replace(/\d+$/, '').trim();
      if (id && nome && !l.some((x) => x.id === id)) l.push({ id, nome });
    }
    ctx._cats = l;
    return l;
  }
  // Uma busca (ano e/ou categoria), página a página. "cada" recebe { id, numero, categoria, ementa, data }.
  // Dois jeitos no modelo: Prefeitura — /legislacao/index/categoria/page/N/busca (com categoria na lista);
  // Câmara — essa busca dá erro e a busca é a de matérias (/busca/busca-materia/page/N/?tipoMateria=10), sem a categoria
  // (categoria vem vazia: quem chama confere na página do item). b.ementa: texto a procurar (só na busca de matérias).
  async function buscaLegislacao(ctx, b, cada) {
    if (ctx._csrf === undefined) await categoriasLegislacao(ctx);
    let renovou = false;
    for (let pag = 1, total = 1; pag <= total && !ctx.parar(); pag++) {
      const materia = ctx._modoBusca === 'materia';
      const u = materia
        ? ctx.origem + '/busca/busca-materia/page/' + pag + '/?ementa=' + encodeURIComponent(b.ementa || '') + '&numero=&ano=' + (b.ano || '') + '&vereador=&tipoMateria=10&situacao=&status='
        : ctx.origem + '/legislacao/index/categoria/page/' + pag + '/busca?csrf=' + encodeURIComponent(ctx._csrf || '') +
          '&descricao=&numero=&ano=' + (b.ano || '') + '&dataInicio=&dataFinal=&categoria=' + (b.categoria || '');
      const r = await ctx.ler(u);
      if (!materia && pag === 1 && /<h1>\s*An error occurred/i.test(r.html)) { ctx._modoBusca = 'materia'; pag = 0; continue; }
      for (const x of r.html.matchAll(materia ? /\/busca\/busca-materia\/page\/(\d+)\//g : /\/legislacao\/index\/categoria\/page\/(\d+)\/busca/g)) total = Math.max(total, Number(x[1]));
      const d = new DOMParser().parseFromString(r.html, 'text/html');
      // A primeira tabela com itens é o resultado (na Prefeitura, a segunda, quando há, é "últimas publicadas").
      const tabela = [...d.querySelectorAll('table')].find((t) => (materia || /categoria/i.test(t.textContent)) && t.querySelector('a[href*="/legislacao/detalhe/"]'));
      // Sem resultado na 1ª página (Prefeitura): o código de segurança da busca (csrf) pode ter vencido — pega outro e tenta de novo, uma vez.
      if (!tabela && !materia && pag === 1 && !renovou) { renovou = true; ctx._cats = null; await categoriasLegislacao(ctx); pag = 0; continue; }
      if (!tabela) break;
      for (const tr of tabela.querySelectorAll('tr')) {
        const a = tr.querySelector('a[href*="/legislacao/detalhe/"]');
        if (!a) continue;
        const td = [...tr.querySelectorAll('td')].map((x) => limpar(x.textContent));
        const id = Number((a.getAttribute('href').match(/\/detalhe\/(\d+)/) || [])[1]);
        if (!id) continue;
        if (materia) await cada({ id, numero: td[0] || '', categoria: '', ementa: td[1] || '', data: data(td[2] || '') });
        else await cada({ id, numero: td[0] || '', categoria: td[1] || '', ementa: td[2] || '', data: data(td[3] || '') });
      }
    }
  }
  const ehConcessaoDiaria = (cat, ementa) => /^di[aá]rias?$/i.test(limpar(cat)) || (/portaria|ato/i.test(cat || '') && /conceder.{0,250}di[aá]ria|di[aá]rias?.{0,40}conced/i.test(ementa || ''));

  // ---------------- páginas do site (/pagina/N), com subpáginas por ano ----------------
  // Cada página de "transparência por ano" do modelo (PCA, sancionados, estagiários, obras, convênios…) vira o que é:
  // texto "não houve" → declaração de inexistência; documento → o módulo certo (PCA, planos, fiscais, acordos);
  // o resto continua como página institucional (rascunho para revisar).
  const ANUAL = [
    [/plano (anual )?de contratac|\bpca\b/, { secoes: ['pca'], doc: 'pca' }],
    [/sancionad/, { secoes: ['sancionados'] }],
    [/terceirizad/, { secoes: ['pessoal_terceirizados'] }],
    [/estagiari/, { secoes: ['pessoal_estagiarios'] }],
    [/obras? paralisad/, { secoes: ['obras_paralisadas'] }],
    [/^obras?$/, { secoes: ['obras'] }],
    [/acordos? firmad/, { secoes: ['convenios_acordos'], doc: 'acordo' }],
    [/convenios/, { secoes: ['convenios_recebidas'], doc: 'acordo' }],
    [/emendas parlamentares/, { secoes: ['emendas_federais', 'emendas_estaduais'] }],
    [/renuncias? de receita/, { secoes: ['renuncias_valores'] }],
    [/carona|adesao a ata/, { secoes: ['licitacoes_adesoes'] }],
    [/apreciacao das contas|julgamento das contas/, { secoes: ['planejamento_julgamento_camara'] }],
    [/fiscais|gestor(es)? de contrato/, { secoes: ['fiscais'], doc: 'fiscal' }],
    [/plano (anual|municipal) d[ae] saude|programacao anual de saude/, { doc: 'saude' }],
    [/plano (anual|municipal) de educacao/, { doc: 'educacao' }]
  ];
  const regraAnual = (titulo) => { const t = sem(titulo); const r = ANUAL.find(([re]) => re.test(t)); return r ? r[1] : null; };
  const anoNoTexto = (t) => { const l = String(t || '').match(/\b(19[89]\d|20\d\d)\b/g); return l ? Number(l[0]) : null; };
  function conteudoDe(m, base) {
    const f = m.querySelector('form') || m;
    f.querySelectorAll('.busca-pagina-container, nav, .speech, button, input, select').forEach((x) => x.remove());
    const linhas = [], arquivos = [];
    for (const n of f.querySelectorAll('p, li, h1, h3, h4, a[href]')) {
      if (n.tagName === 'A') {
        const h = n.getAttribute('href') || '';
        if (!ehDocumento(h) || /(^|[^-])sub-pagina\/\d+\/$/.test(h)) continue;   // link para outra subpágina (não "download-sub-pagina")
        const u = abs(h, base);
        if (!u || arquivos.some((a) => a.url === u)) continue;
        const t0 = limpar(n.getAttribute('title') || n.textContent);
        const t = (/^https?:/.test(t0) ? decodeURIComponent(u.split('/').pop()).replace(/\.\w+$/, '') : t0) || 'Documento';
        arquivos.push({ url: u, titulo: t.slice(0, 150), data: data(t) });
        linhas.push('- [' + t.replace(/[[\]]/g, '') + '](' + u + ')');
      } else if (!n.closest('a')) {
        const t = limpar(n.textContent);
        // Endereço de arquivo escrito como texto (sem link), comum no modelo: vira documento
        const soltos = t.match(/https?:\/\/[^\s"'<>]+\.(?:pdf|docx?|xlsx?|odt|ods|zip)\b/gi);
        if (soltos && !n.querySelector('a[href]')) {
          for (const su of soltos) {
            const u = abs(su, base);
            if (!u || arquivos.some((a) => a.url === u)) continue;
            const tt = decodeURIComponent(u.split('/').pop()).replace(/\.\w+$/, '').replace(/[_+]/g, ' ').slice(0, 150) || 'Documento';
            arquivos.push({ url: u, titulo: tt, data: null });
            linhas.push('- [' + tt.replace(/[[\]]/g, '') + '](' + u + ')');
          }
          const resto = limpar(soltos.reduce((x, su) => x.replace(su, ''), t));
          if (resto.length < 3) continue;
          linhas.push(resto); continue;
        }
        if (!t || /^(data de cria|última atualiza|ultima atualiza|acessar página|documentos anexados|informações atualizadas|página|documentos|nenhum arquivo cadastrado|p[aá]gina sem conte[uú]do)/i.test(t)) continue;
        if (n.tagName === 'H1' && n.closest('.container-titulo')) continue;
        linhas.push(/^H[34]$/.test(n.tagName) ? '### ' + t : t);
      }
    }
    return { linhas: [...new Set(linhas)], arquivos };
  }
  // Lê /pagina/1…N (e as subpáginas). Guardado por alguns minutos: várias seções usam a mesma leitura.
  const CACHE_PAG = new Map();
  async function paginasDoSite(ctx) {
    const c = CACHE_PAG.get(ctx.origem);
    if (c && Date.now() - c.em < 15 * 60000) return c.lista;
    let maior = 0;
    for (const cam of ['/', '/mapa-site']) {
      try { const r = await ctx.ler(ctx.origem + cam); for (const x of r.html.matchAll(/\/pagina\/(\d+)\//g)) maior = Math.max(maior, Number(x[1])); } catch (_) { /* segue */ }
    }
    const lista = [];
    for (let id = 1; id <= maior + 3 && !ctx.parar(); id++) {
      const url = ctx.origem + '/pagina/' + id + '/x';
      let r; try { r = await ctx.ler(url); } catch (e) { ctx.log('página ' + id + ': ' + e.message); continue; }
      if (r.status !== 200) continue;
      const { m } = doc(r.html);
      const titulo = limpar((m.querySelector('.container-titulo h1, .container-titulo h2') || {}).textContent);
      if (!titulo || titulo.length < 3) continue;
      const subsH = [...new Set([...m.querySelectorAll('a[href*="/sub-pagina/"]')].map((a) => a.getAttribute('href')).filter((h) => /\/sub-pagina\/\d+\/$/.test(h)))];
      const base = conteudoDe(m, r.url_final || url);
      const subs = [];
      for (const h of subsH) {
        if (ctx.parar()) break;
        const su = abs(h, url);
        let rs; try { rs = await ctx.ler(su); } catch (e) { ctx.log(su.replace(ctx.origem, '') + ': ' + e.message); continue; }
        const { m: ms } = doc(rs.html);
        const st = limpar((ms.querySelector('.container-titulo h1, .container-titulo h2') || {}).textContent) || 'Seção';
        const cs = conteudoDe(ms, rs.url_final || su);
        subs.push({ url: su, titulo: st, ano: anoNoTexto(st) || anoNoTexto(cs.linhas.join(' ')), linhas: cs.linhas.filter((l) => l !== st), arquivos: cs.arquivos });
      }
      lista.push({ id, url, titulo, linhas: base.linhas, arquivos: base.arquivos, subs, regra: regraAnual(titulo) });
    }
    CACHE_PAG.set(ctx.origem, { em: Date.now(), lista });
    return lista;
  }
  // Blocos por ano de uma página: as subpáginas; ou, sem subpáginas, o texto dividido pelos anos
  // ("2026" sozinho numa linha, ou "… no ano de 2025.") — ex.: estagiários e atas de carona da Câmara.
  function anosDaPagina(p) {
    if (p.subs.length) return p.subs;
    const blocos = []; let atual = null;
    for (const l of p.linhas) {
      const t = l.replace(/^#+\s*/, '');
      if (/^(19|20)\d\d$/.test(t)) { atual = { url: p.url + '#' + t, titulo: t, ano: Number(t), linhas: [], arquivos: [] }; blocos.push(atual); continue; }
      const anoT = /^- \[/.test(t) ? null : (t.match(/\b(?:ano de|em|exerc[ií]cio(?: de)?)\s+((?:19|20)\d\d)\b/i) || [])[1];
      if (anoT && NEGA.test(t) && (!atual || Number(anoT) !== atual.ano)) {
        const ja = blocos.find((b) => b.ano === Number(anoT));
        if (ja) { ja.linhas.push(t); continue; }
        atual = { url: p.url + '#' + anoT, titulo: anoT, ano: Number(anoT), linhas: [t], arquivos: [] }; blocos.push(atual); continue;
      }
      if (atual) atual.linhas.push(t);
    }
    return blocos;
  }
  // O que fazer com cada bloco de ano: declaração, documento para um módulo, ou página (rascunho).
  function classificar(p, b) {
    const r = p.regra;
    if (!r || !b.ano) return 'pagina';
    const texto = b.linhas.join(' ');
    const docs = b.arquivos;
    const soDeclaracao = docs.length && docs.every((d) => /declara/i.test(d.titulo));
    // "A última transferência … ocorreu em 12/05/2026": houve no ano — não é declaração de inexistência do ano inteiro.
    const houve = /ocorreu em \d|ocorreram em \d|recebid[oa]s? em \d/i.test(texto);
    if (r.secoes && NEGA.test(texto) && !houve && (!docs.length || soDeclaracao)) return 'declaracao';
    if (r.doc === 'pca' && docs.length && !NEGA.test(texto)) return 'pca';
    if ((r.doc === 'saude' || r.doc === 'educacao') && docs.length && docs.every((d) => tipoSetorial(r.doc, d.titulo))) return 'setorial';
    if (r.doc === 'fiscal' && docs.length) return 'fiscal';
    if (r.doc === 'acordo' && docs.length && /coopera|parceria/i.test(texto)) return 'acordo';
    if (!docs.length && !texto.trim()) return 'vazio';
    return 'pagina';
  }
  // Plano/relatório de Saúde ou Educação pelo título; null = outro documento (ex.: estoque de medicamentos), que fica na página.
  function tipoSetorial(area, titulo) {
    const s = sem(titulo);
    if (area === 'saude') return /relatorio anual de gest|\brag\b/.test(s) ? 'relatorio_gestao' : /quadrimestr|rdqa/.test(s) ? 'relatorio_quadrimestral'
      : /programacao anual|\bpas\b/.test(s) ? 'programacao_anual' : /plano (municipal|anual)? ?de saude|\bpms\b/.test(s) ? 'plano_saude' : null;
    if (/portaria|decreto|comissao|nomeia|institui/.test(s)) return null;
    return /relatorio|monitoramento/.test(s) ? 'relatorio_educacao' : /plano (municipal|decenal|anual)? ?de educacao|\bpme\b/.test(s) ? 'plano_educacao' : null;
  }
  const textoDeclaracao = (b) => limpar(b.linhas.filter((l) => !/^- \[/.test(l) && NEGA.test(l)).join(' ') || b.linhas.join(' ')).replace(/^#+\s*/, '');

  // ---------------- concessão de diária (portaria do modelo King) ----------------
  // Prefeitura: "Conceder, a Sra. NOME, CPF nº …, Orientadora Social, 01 (uma) diária e meia, para que a mesma possa se deslocar
  // até a cidade de Mossoró/RN, nos dias 13 a 15 de maio de 2026, para participação no …". Câmara: "Conceder a NOME – CPF: …,
  // vereador da Câmara…, 01 (uma) diária …". O valor não vem no ato: sai da tabela de valores do cargo (seção "Diárias — tabela").
  const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
  const NUM_EXT = { meia: 0.5, uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
  const tronco = (t) => sem(t).split(/[^a-z]+/).filter((p) => p.length > 3 && !/^(municipa|munic|demais|servi(c|d)o|cidade|estado|outr|camara|prefeitura|poder|cargo|func)/.test(p)).map((p) => p.slice(0, 6));
  function valorDaTabela(cargo, abr, valores) {
    const l = (valores || []).filter((v) => v.abrangencia === abr);
    // Pela primeira palavra do cargo ("Assistente de secretaria" não é "Secretário")
    const cabeca = tronco(cargo)[0];
    let linha = l.find((v) => /presiden/.test(sem(v.grupo)) && /presiden/.test(sem(cargo)))
      || (cabeca ? l.find((v) => tronco(v.grupo)[0] === cabeca) || l.find((v) => tronco(v.grupo).includes(cabeca)) : null);
    if (linha) return { linha, padrao: false };
    linha = l.find((v) => /demais/.test(sem(v.grupo)));
    return linha ? { linha, padrao: true } : null;
  }
  function lerConcessao(textoBruto, base, valores) {
    const avisos = [];
    const pdf = limpar(textoBruto || '');
    // Corpo: a ementa do site (é o próprio "RESOLVE"); se veio vazia, o texto do PDF a partir do "Conceder".
    let t = limpar(base.ementa).replace(/^r\s*e\s*s\s*o\s*l\s*v\s*e\s*:?\s*/i, '').replace(/^art(igo)?\.?\s*1[ºo°]?\s*[-–—.:]?\s*/i, '');
    if (!/conceder/i.test(t) && /conceder/i.test(pdf)) t = pdf.slice(pdf.search(/conceder/i)).split(/cumpra-se|publique-se|registre-se|art\.?\s*2/i)[0];
    const cs = sem(t);
    // Beneficiário: depois de "Conceder (,) a (o) (Sr./Sra./Vereador)" até o CPF ou a primeira vírgula
    let nome = null, cargo = null, unidade = null;
    const mn = t.match(/conceder\s*,?\s*(?:(?:a|à|ao|aos|às|o)\s+)?(?:(?:o|a)\s+)?(?:excelent[ií]ssim[oa]\s+)?(?:(?:senhora?|sr\.?\s*a?|sra\.?)\s+)?(?:(?:vereador[a]?|servidor[a]?)\s+)?/i);
    let resto = '';
    if (mn) {
      const seg = t.slice(t.indexOf(mn[0]) + mn[0].length);
      const iC = seg.search(/\bCPF\b/i), iV = seg.indexOf(',');
      // "NOME – CPF", "NOME- CPF", "NOME CPF:", "NOME, CPF nº" ou só "NOME, cargo"
      const fim = iC >= 0 && (iV < 0 || iC < iV + 3) ? iC : iV;
      nome = limpar((fim >= 0 ? seg.slice(0, fim) : seg.slice(0, 80)).replace(/[\s,–—-]+$/, '')).replace(/^(sr\.?a?|sra\.?)\s+/i, '');
      resto = fim >= 0 ? seg.slice(fim) : '';
    }
    if (nome && (nome.length < 5 || /\d/.test(nome))) nome = null;
    // Cargo: o trecho depois do CPF até a próxima vírgula / quantidade
    for (let k = 0; k < 3 && /^[,\s]*(CPF|matr[ií]cula)/i.test(resto); k++) {
      resto = resto.replace(/^[,\s]*CPF\s*(?:n[ºo°.]*\s*)?:?\s*[\dxX.*]+(?:[\s.]*[\dxX.*]+)*\s*-?\s*\d*\s*-?\s*,?\s*/i, '')
        .replace(/^[,\s]*matr[ií]cula\s*(?:n[ºo°.]*\s*)?:?\s*[\d.\-/]+\s*,?\s*/i, '');
    }
    const mu = resto.match(/lotad[oa]\s+n[ao]\s+(.+?)(?:,|\s+0?\d+\s*\()/i);
    if (mu) unidade = limpar(mu[1]).slice(0, 200);
    const mc = resto.match(/^(.+?)(?:,|\s+lotad|\s+0?\d+\s*\(|\s+(?:meia|uma|duas|tr[eê]s)\s+di[aá]ria)/i);
    if (mc) cargo = limpar(mc[1]).replace(/\s+d[ao]\s+c[aâ]mara municipal.*$/i, '').replace(/\s+d[ao]\s+prefeitura municipal.*$/i, '').replace(/\s*\((?:a|as|os|o)\)/gi, '');
    if (!cargo || cargo.length < 2 || /di[aá]ria|^\d/.test(cargo)) { cargo = /vereador/i.test(t) ? 'Vereador(a)' : 'Não informado no ato'; if (cargo === 'Não informado no ato') avisos.push('Cargo não informado no ato'); }
    else cargo = cargo.charAt(0).toUpperCase() + cargo.slice(1).toLowerCase();
    if (!nome) { nome = 'Não informado no ato'; avisos.push('Beneficiário não lido: confira'); }
    // Quantidade: "01 (uma) diária e meia", "02 (duas) diárias", "meia diária"
    let qtd = null;
    const mq = t.match(/(\d+(?:[.,]\d+)?)\s*(?:\([^)]*\)\s*)?(e meia\s+)?di[aá]rias?(\s+e\s+meia)?/i);
    if (mq) qtd = Number(mq[1].replace(',', '.')) + (mq[2] || mq[3] ? 0.5 : 0);
    if (!qtd) { const w = (cs.match(/\b(meia|uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:e meia\s+)?diarias?\b/) || [])[1]; if (w) qtd = NUM_EXT[w] + (/(uma|um|duas|dois|tres)\s+diarias?\s+e\s+meia/.test(cs) ? 0.5 : 0); }
    if (!qtd) { qtd = 1; avisos.push('Quantidade não informada: entrou 1 diária'); }
    // Destino
    const LUGAR = "([A-ZÀ-Ú][\\wÀ-ú'.]*(?:\\s+(?:d[aeo]s?\\s+)?[A-ZÀ-Ú][\\wÀ-ú'.]*){0,4})";
    let destino = null;
    // Primeiro o "até (a cidade de) X/UF" (a cidade de origem também aparece no texto: "melhorias para o município de Riacho da Cruz/RN")
    const ATE = '\\bat[eé]\\s+(?:a\\s+)?(?:(?:cidade|capital|munic[ií]pio)\\s+(?:d[eoa]\\s+)?)?';
    let md = t.match(new RegExp(ATE + LUGAR + '\\s*(?:[/–—-]\\s*|\\s+)(' + UFS + ')\\b'))
      || t.match(new RegExp('(?:cidade|munic[ií]pio|capital)\\s+(?:d[eoa]\\s+)?' + LUGAR + '\\s*(?:[/–—-]\\s*|\\s+)(' + UFS + ')\\b'));
    if (md) destino = limpar(md[1]) + '/' + md[2];
    else {
      md = t.match(new RegExp('(?:cidade|munic[ií]pio|capital)\\s+(?:d[eoa]\\s+)?' + LUGAR)) || t.match(new RegExp('\\bat[eé]\\s+(?:a\\s+)?' + LUGAR));
      if (md) {
        destino = limpar(md[1]);
        // "até Foz do Iguaçu, … PR" — o estado aparece mais adiante
        const uf = t.match(new RegExp(destino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s,./–—-]+(' + UFS + ')\\b'));
        if (uf) destino += '/' + uf[1];
      }
    }
    const ufOrgao = String(((window.PNTP || {}).estado || {}).orgao && window.PNTP.estado.orgao.uf || 'RN').toUpperCase();
    let abrangencia = null;
    if (destino) { const uf = (destino.match(/\/([A-Z]{2})$/) || [])[1]; abrangencia = uf && uf !== ufOrgao ? 'fora_estado' : 'estado'; if (!uf) avisos.push('Estado do destino não informado: entrou como dentro do Estado'); }
    else { destino = 'Não informado no ato'; avisos.push('Destino não informado no ato'); }
    // Datas: "nos dias 13 a 15 de maio de 2026", "no dia 21 de outubro de 2026"
    const atoD = base.dataAto || (base.ano + '-01-01');
    const [aA, mA] = atoD.split('-').map(Number);
    let dIni = null, dFim = null;
    const mdias = cs.match(/\bn?[oa]s?\s+dias?\s+((?:\d{1,2}\s*(?:,|\be\b|\ba\b|\bate\b|-)\s*)*\d{1,2})(?:\s*(?:de\s+)?([a-z]+)(?:\s+de\s+(\d{4}))?|\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?)?/);
    if (mdias) {
      const dias = mdias[1].match(/\d{1,2}/g).map(Number).filter((x) => x >= 1 && x <= 31);
      const mes = mdias[2] && MESES[mdias[2]] ? MESES[mdias[2]] : (mdias[4] ? Number(mdias[4]) : mA);
      let ano = mdias[3] ? Number(mdias[3]) : (mdias[5] ? Number(mdias[5].length === 2 ? '20' + mdias[5] : mdias[5]) : aA);
      if (!mdias[3] && !mdias[5] && mes < mA - 6) ano = aA + 1;
      if (dias.length && mes >= 1 && mes <= 12) { const f = (d) => ano + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0'); dIni = f(Math.min(...dias)); dFim = f(Math.max(...dias)); }
    }
    const fmt = (a, mm, dd) => a + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    if (!dIni) {   // "de 24 a 27 de fevereiro de 2025"
      const m2 = cs.match(/\bde\s+(\d{1,2})\s+(?:a|ate)\s+(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/);
      if (m2 && MESES[m2[3]]) { const a = m2[4] ? Number(m2[4]) : aA; dIni = fmt(a, MESES[m2[3]], Number(m2[1])); dFim = fmt(a, MESES[m2[3]], Number(m2[2])); }
    }
    // "com deslocamento no dia 23 e retornando dia 29 de março"
    const mr = cs.match(/retorn\w*\s+(?:n?o\s+)?dia\s+(\d{1,2})(?:\s+de\s+([a-z]+))?(?:\s+de\s+(\d{4}))?/);
    if (dIni && mr) { const mm = mr[2] && MESES[mr[2]] ? MESES[mr[2]] : Number(dIni.slice(5, 7)); const f = fmt(mr[3] ? Number(mr[3]) : Number(dIni.slice(0, 4)), mm, Number(mr[1])); if (f >= dIni) dFim = f; }
    if (dIni && dFim === dIni && qtd > 1) {   // só a data de saída: o retorno pela quantidade de diárias
      const f = new Date(dIni + 'T12:00:00'); f.setDate(f.getDate() + Math.ceil(qtd) - 1); dFim = f.toISOString().slice(0, 10);
      avisos.push('Data de retorno não informada: calculada pela quantidade de diárias');
    }
    const longe = (d) => Math.abs((new Date(d) - new Date(atoD)) / 864e5) > 150;
    if (!dIni || !dFim || dFim < dIni || longe(dIni) || isNaN(new Date(dIni))) {
      dIni = atoD;
      const f = new Date(atoD + 'T12:00:00'); f.setDate(f.getDate() + Math.max(0, Math.ceil(qtd) - 1));
      dFim = f.toISOString().slice(0, 10);
      avisos.push('Datas da viagem não informadas no ato: saída na data da portaria e retorno pela quantidade de diárias');
    }
    // Motivo: o último "para …" (que não seja "para que o mesmo possa se deslocar")
    let motivo = null;
    const partes = t.split(/[,.]\s*para\s+(?!que\b)/i);
    if (partes.length > 1) motivo = limpar(partes.slice(1).join(', para ')).replace(/[.;,\s]+$/, '');
    else { const dep = t.match(/\bde\s+(?:19|20)\d\d\s*[,.]?\s*(.{8,})$/i); if (dep) motivo = limpar(dep[1]).replace(/[.;,'\s]+$/, ''); }
    if (!motivo || motivo.length < 3) { motivo = 'Custeio de despesas de deslocamento, alimentação e hospedagem'; avisos.push('Motivo não lido no ato: texto padrão'); }
    motivo = motivo.charAt(0).toUpperCase() + motivo.slice(1);
    // Valor: no PDF (quando houver) ou pela tabela de valores do cargo
    let valor_unitario = null, valor_total = null;
    const vU = ((pdf + ' ' + t).match(/(?:valor\s+unit[aá]rio|di[aá]rias?\s+no\s+valor(?:\s+unit[aá]rio)?)\s*(?:de\s*)?(?:R\s*\$|RS)\s*([\d.]+,\d{2})/i) || [])[1];
    const vT = ((pdf + ' ' + t).match(/(?:totaliza\w*|valor\s+total)\s*(?:o\s*)?(?:valor\s*)?(?:de\s*)?(?:R\s*\$|RS)\s*([\d.]+,\d{2})/i) || [])[1];
    if (vU) valor_unitario = valor(vU);
    if (vT) valor_total = valor(vT);
    if (valor_total == null && valor_unitario != null) valor_total = Math.round(valor_unitario * qtd * 100) / 100;
    if (valor_unitario == null && valor_total != null) valor_unitario = Math.round(valor_total / qtd * 100) / 100;
    if (valor_total == null) {
      const v = valorDaTabela(cargo, abrangencia || 'estado', valores);
      if (v) {
        valor_unitario = Number(v.linha.valor); valor_total = Math.round(valor_unitario * qtd * 100) / 100;
        avisos.push('Valor calculado pela tabela de valores (' + v.linha.grupo + (v.padrao ? ', cargo não achado na tabela: usado o valor dos demais' : '') + '), confira');
      } else avisos.push('Valor não informado no ato e sem tabela de valores: importe antes a seção "Diárias — tabela de valores"');
    }
    const vereador = /vereador|presidente da c[aâ]mara/i.test(cargo + ' ' + t.slice(0, 300));
    return {
      avisos, nomeVereador: vereador ? nome : null,
      registro: { nome: nomeProprio(nome).slice(0, 200), cargo: cargo.slice(0, 150), unidade, destino: destino.slice(0, 200), abrangencia, motivo: motivo.slice(0, 1000),
        data_inicio: dIni, data_fim: dFim, quantidade: qtd, valor_unitario, valor_total, ato_concessao: base.ato.slice(0, 120) }
    };
  }
  // Tabela de valores de diárias no texto do PDF da norma. Dois formatos do modelo:
  //  colunas por cargo: "LOCALIDADE I II III IV  CIDADES DENTRO DO ESTADO 500,00 400,00 …  FORA … LEGENDAS: I - PREFEITO; II - …"
  //  linhas por cargo:  "CARGO/FUNÇÃO  DENTRO DO ESTADO  FORA DO ESTADO  Presidente 500,00 900,00  Vereadores 400,00 700,00 …"
  function lerTabelaDiarias(texto) {
    const t = limpar(texto);
    const V = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2})';
    const linhas = [];
    const leg = t.match(/legendas?\s*:?\s*(.+)$/i);
    if (leg) {
      const nomes = {};
      for (const x of leg[1].matchAll(/\b(I{1,3}|IV|V|VI{0,3})\s*[-–—]\s*(.+?)(?=[;\s]+\b(?:I{1,3}|IV|V|VI{0,3})\s*[-–—]\s|$)/g)) nomes[x[1]] = limpar(x[2]).replace(/[.;\s]+$/, '');
      const cols = (t.match(/localidade\s+((?:\b(?:I{1,3}|IV|V|VI{0,3})\b\s*)+)/i) || [])[1];
      const ordem = cols ? cols.trim().split(/\s+/) : Object.keys(nomes);
      for (const [abr, re] of [['estado', /dentro do estado[^\d]*/i], ['fora_estado', /fora do estado[^\d]*/i]]) {
        const i = t.search(re); if (i < 0) continue;
        const vs = (t.slice(i).replace(re, '').match(new RegExp('^((?:' + V + '\\s*)+)')) || [])[1];
        (vs ? vs.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) : []).forEach((v, k) => { const c = ordem[k]; if (c && nomes[c]) linhas.push({ grupo: nomes[c].charAt(0) + nomes[c].slice(1).toLowerCase(), abrangencia: abr, valor: valor(v) }); });
      }
    }
    if (!linhas.length) {
      const i = t.search(/dentro do est\s?ado/i), j = t.search(/fora do est\s?ado/i);
      if (i >= 0 && j >= 0) {
        const depois = t.slice(Math.max(i, j)).replace(/^fora do est\s?ado[^A-Za-zÀ-ú]*|^dentro do est\s?ado[^A-Za-zÀ-ú]*/i, '');
        for (const x of depois.matchAll(new RegExp("([A-Za-zÀ-ú][A-Za-zÀ-ú()/ ]{2,60}?)\\s+(?:R\\$\\s*)?" + V + "\\s+(?:R\\$\\s*)?" + V, 'g'))) {
          const g = limpar(x[1]).replace(new RegExp('^(?:d[oae]\\s+)?(?:' + UFS + ')\\s+'), '').replace(/^(e|de|do|da)\s+/i, '');
          if (/^art\b|^par[aá]grafo/i.test(g)) break;
          linhas.push({ grupo: g, abrangencia: i < j ? 'estado' : 'fora_estado', valor: valor(x[2]) });
          linhas.push({ grupo: g, abrangencia: i < j ? 'fora_estado' : 'estado', valor: valor(x[3]) });
          if (linhas.length > 30) break;
        }
      }
    }
    const norma = (t.match(/\b((?:decreto|resolu[cç][aã]o|lei|portaria)(?:\s+municipal)?\s+n[ºo°.]*\s*[\d./-]+(?:,?\s+de\s+\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4})?)/i) || [])[1];
    return { linhas, norma: norma ? limpar(norma) : null };
  }

  // ---------------- Câmara: vereadores, Mesa, comissões, sessões (atas) e proposições ----------------
  async function ehCamara(ctx) {
    if (ctx._camara !== undefined) return ctx._camara;
    try { const r = await ctx.ler(ctx.origem + '/vereadores/lista'); ctx._camara = r.status === 200 && /\/vereadores\/\d+\//.test(r.html); }
    catch (_) { ctx._camara = false; }
    if (!ctx._camara) ctx.log('Este site não tem vereadores: seção só para Câmara.');
    return ctx._camara;
  }
  const funcaoDe = (t) => { const s = sem(t); return /vice/.test(s) ? 'vice_presidente' : /presiden/.test(s) ? 'presidente' : /relator/.test(s) ? 'relator' : /suplent/.test(s) ? 'suplente' : 'membro'; };
  const andamentoDe = (t) => { const s = sem(t); return /tramita/.test(s) ? 'em_tramitacao' : /sancion|promulg|transformad/.test(s) ? 'transformada_norma' : /vetad/.test(s) ? 'vetada'
    : /rejeit/.test(s) ? 'rejeitada' : /retirad/.test(s) ? 'retirada' : /prejudic/.test(s) ? 'prejudicada' : /aprovad|deferid/.test(s) ? 'aprovada' : /arquiv/.test(s) ? 'arquivada' : 'em_tramitacao'; };
  // Listagem com "Escolha o ano" (/X/lista/AAAA/…): devolve os links das listas dos anos do período.
  async function listasPorAno(ctx, caminho, re) {
    let r; try { r = await ctx.ler(ctx.origem + caminho); } catch (_) { return []; }
    if (r.status !== 200) return [];
    const l = [];
    for (const x of r.html.matchAll(re)) { const ano = Number(x[2]); if (ano >= ctx.de && !l.some((y) => y.url.endsWith(x[1]))) l.push({ url: ctx.origem + x[1], ano }); }
    return l;
  }
  const linhasDeLista = (html, base, reDet) => {
    const { m } = doc(html);
    const l = [];
    for (const tr of m.querySelectorAll('tr')) {
      const a = [...tr.querySelectorAll('a[href]')].find((x) => reDet.test(x.getAttribute('href') || ''));
      if (!a) continue;
      l.push({ url: abs(a.getAttribute('href'), base), td: [...tr.querySelectorAll('td')].map((x) => limpar(x.textContent)) });
    }
    return l;
  };
  // Nome da comissão do site que mais se parece com o texto (ex.: "Comissão permanente de Justiça e Redação Final" → "Legislação, Justiça e Redação Final").
  function comissaoParecida(texto, nomes) {
    const pal = (t) => sem(t).split(/[^a-z]+/).filter((p) => p.length > 3 && !/^(comiss|perma|perman|reuniao|ata)/.test(p));
    const tp = pal(texto);
    let melhor = null, nota = 1;
    for (const n of nomes) { const k = pal(n).filter((p) => tp.includes(p)).length; if (k > nota) { nota = k; melhor = n; } }
    return melhor;
  }
  function tipoProp(t) {
    const s = sem(t);
    if (/emenda a (lei organica|lom)/.test(s)) return 'projeto_emenda_lei_organica';
    if (/lei complementar/.test(s)) return 'projeto_lei_complementar';
    if (/projeto de lei/.test(s)) return 'projeto_lei';
    if (/decreto legislativo/.test(s)) return 'projeto_decreto_legislativo';
    if (/resolucao/.test(s)) return 'projeto_resolucao';
    if (/requerimento/.test(s)) return 'requerimento';
    if (/indicacao/.test(s)) return 'indicacao';
    if (/mocao/.test(s)) return 'mocao';
    if (/veto/.test(s)) return 'veto';
    return 'outro';
  }

  Object.assign(SECOES, {
    // ---------------------------------------------------------------
    // 20.1 Vereadores: das legislaturas (com os anos de cada uma) + perfil (partido, e-mail, biografia, foto).
    vereador: {
      nome: 'Vereadores (composição da Casa)', destino: 'Atividade legislativa › Vereadores', pntp: true, pasta: 'legislativo', soCamara: true,
      listas: [],
      async listar(ctx) {
        if (!(await ehCamara(ctx))) return [];
        const por = new Map();   // id → { ini, fim }
        const rl = await ctx.ler(ctx.origem + '/legislatura');
        for (const id of [...new Set([...rl.html.matchAll(/\/legislatura\/detalhe\/(\d+)\//g)].map((x) => x[1]))]) {
          let r; try { r = await ctx.ler(ctx.origem + '/legislatura/detalhe/' + id + '/'); } catch (_) { continue; }
          const anos = (limpar((doc(r.html).m.querySelector('h1') || {}).textContent).match(/\((\d{4})\s*-\s*(\d{4})\)/) || []);
          if (!anos[1]) continue;
          const ini = Number(anos[1]), fim = Number(anos[2]);
          for (const v of new Set([...r.html.matchAll(/\/vereadores\/(\d+)\//g)].map((x) => x[1]))) {
            const a = por.get(v) || { ini, fim };
            por.set(v, { ini: Math.min(a.ini, ini), fim: Math.max(a.fim, fim) });
          }
        }
        const lista = await ctx.ler(ctx.origem + '/vereadores/lista');
        for (const v of new Set([...lista.html.matchAll(/\/vereadores\/(\d+)\//g)].map((x) => x[1]))) if (!por.has(v)) por.set(v, { ini: null, fim: null, atual: true });
        let ordem = 10;
        for (const [id, l] of por) {
          if (ctx.parar()) break;
          if (l.fim && l.fim < ctx.de) continue;   // mandato inteiro antes do período
          const ord = ordem; ordem += 10;
          const url = ctx.origem + '/vereadores/' + id + '/x/';
          if (ctx.jaFeito && await ctx.jaFeito(url)) continue;
          let p; try { p = await ctx.ler(url); } catch (e) { ctx.log('vereador ' + id + ': ' + e.message); continue; }
          if (p.status !== 200) continue;
          const { m } = doc(p.html);
          const h = limpar((m.querySelector('h1') || {}).textContent).replace(/^vereador[a]?\s*-\s*/i, '');
          const c = rotulos(m);
          const nome = c.nome || h;
          if (!nome || nome.length < 3) continue;
          const bioT = [...m.querySelectorAll('td')].find((td) => /^biografia$/i.test(limpar(td.textContent)));
          const bioTr = bioT && bioT.closest('tr') && bioT.closest('tr').nextElementSibling;
          const bio = bioTr ? [...bioTr.querySelectorAll('p, li')].map((x) => limpar(x.textContent)).filter(Boolean).join('\n') || limpar(bioTr.textContent) : '';
          const foto = m.querySelector('img[src*="/vereador/"]');
          const email = (c['e-mail'] || c.email || '').toLowerCase();
          const atual = l.atual || (l.ini && l.ini <= ANO_ATUAL && l.fim >= ANO_ATUAL);
          await ctx.emitir(url, {
            ano: atual ? ANO_ATUAL : l.fim, chave: { nome_parlamentar: nome },
            registro: { nome: nomeProprio(nome).slice(0, 200), nome_parlamentar: nomeProprio(nome).slice(0, 120), partido: (c.partido || '').slice(0, 40) || null,
              biografia: bio ? bio.slice(0, 8000) : null, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null, telefone: (c.telefone || '').slice(0, 60) || null,
              legislatura_inicio: l.ini, legislatura_fim: l.fim, em_exercicio: !!atual, ordem: ord },
            arquivos: foto && !/semImagem/i.test(foto.getAttribute('src')) ? [{ url: abs(foto.getAttribute('src'), url), campo: 'foto_url' }] : []
          });
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // Mesa Diretora vigente (a de período que inclui hoje) → cargo na Mesa de cada vereador.
    mesa: {
      nome: 'Mesa Diretora (atual)', destino: 'Atividade legislativa › Vereadores (cargo na Mesa)', semPeriodo: true, pasta: 'legislativo', soCamara: true,
      listas: [],
      async listar(ctx) {
        if (!(await ehCamara(ctx))) return [];
        const r = await ctx.ler(ctx.origem + '/mesa-diretora');
        const linhas = linhasDeLista(r.html, ctx.origem, /\/mesa-diretora\/detalhe\//);
        const hoje = HOJE();
        const atual = linhas.find((l) => { const ds = (l.td.join(' ').match(/\d{2}\/\d{2}\/\d{4}/g) || []).map(data); return ds[0] && ds[1] && ds[0] <= hoje && hoje <= ds[1]; }) || linhas[0];
        if (!atual) return [];
        const sessao = (atual.td[1] || '') + ' ' + (atual.td[2] || '');
        const { m } = doc((await ctx.ler(atual.url)).html);
        const itens = [];
        for (const h3 of m.querySelectorAll('h3')) {
          let n = h3.nextElementSibling; while (n && !/^H2$/.test(n.tagName) && !n.querySelector('h2')) n = n.nextElementSibling;
          const nome = limpar(n ? (n.tagName === 'H2' ? n.textContent : n.querySelector('h2').textContent) : '');
          const cargo = limpar(h3.textContent).replace(/\s*atual$/i, '');
          if (!nome || !cargo || /mesa diretora/i.test(cargo)) continue;
          const c = cargo === cargo.toUpperCase() ? cargo.charAt(0) + cargo.slice(1).toLowerCase().replace(/(^|[\s-])(\S)/g, (x, a, b) => a + b.toUpperCase()) : cargo;
          itens.push({ url: atual.url + '#' + encodeURIComponent(sem(nome)), x: { ano: null, chave: { nome }, registro: { nome_parlamentar: nomeProprio(nome), cargo_mesa: c.slice(0, 80) }, sessao: limpar(sessao) } });
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // 20.5 Comissões: nome, competências, presidente e composição.
    comissao: {
      nome: 'Comissões e membros', destino: 'Atividade legislativa › Comissões', semPeriodo: true, pasta: 'legislativo', soCamara: true,
      listas: [],
      async listar(ctx) {
        if (!(await ehCamara(ctx))) return [];
        const r = await ctx.ler(ctx.origem + '/comissao');
        const ids = [...new Set([...r.html.matchAll(/\/comissao\/comissao\/gerencia\/(\d+)\//g)].map((x) => x[1]))];
        for (const id of ids) {
          if (ctx.parar()) break;
          const url = ctx.origem + '/comissao/comissao/gerencia/' + id + '/';
          if (ctx.jaFeito && await ctx.jaFeito(url)) continue;
          let p; try { p = await ctx.ler(url); } catch (e) { ctx.log('comissão ' + id + ': ' + e.message); continue; }
          const { m } = doc(p.html);
          const b = blocos(m);
          const nome = limpar((bel(b, 'nome')[0] || {}).textContent) || limpar((m.querySelector('h1') || {}).textContent).replace(/^comiss[aã]o\s*-\s*/i, '');
          if (!nome) continue;
          const membros = [];
          const hp = [...m.querySelectorAll('h3')].find((h) => /presidente/i.test(h.textContent));
          const tp = hp && hp.nextElementSibling && (hp.nextElementSibling.matches('table') ? hp.nextElementSibling : hp.nextElementSibling.querySelector('table'));
          const pres = tp ? limpar((tp.querySelector('td') || {}).textContent) : '';
          if (pres) membros.push({ nome: pres, funcao: 'presidente' });
          const comp = [...m.querySelectorAll('a[href*="/comissao-composicao/"]')].map((a) => abs(a.getAttribute('href'), url))[0];
          if (comp) {
            try {
              const { m: mc } = doc((await ctx.ler(comp)).html);
              for (const tr of mc.querySelectorAll('tr')) {
                const td = [...tr.querySelectorAll('td')].map((x) => limpar(x.textContent));
                if (td.length < 3 || !td[0]) continue;
                if (!membros.some((x) => sem(x.nome) === sem(td[0]))) membros.push({ nome: td[0], funcao: funcaoDe(td[2]) });
              }
            } catch (e) { ctx.log(nome + ': composição não lida (' + e.message + ')'); }
          }
          await ctx.emitir(url, { ano: null, chave: { nome },
            registro: { nome: nomeProprio(nome).slice(0, 200), tipo: /tempor/i.test(nome) ? 'temporaria' : /especial/i.test(nome) ? 'especial' : /inquerito|cpi/i.test(sem(nome)) ? 'cpi' : 'permanente',
              competencias: (bt(b, 'do que vai tratar', 'finalidade', 'competencia') || '').slice(0, 4000) || null, inicio: null, fim: null, ativa: true },
            membros });
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // 20.4 / 20.6 Sessões plenárias pelas atas (o modelo guarda as sessões só como atas): tipo, número, data e a ata.
    sessao: {
      nome: 'Sessões plenárias (pelas atas)', destino: 'Atividade legislativa › Sessões', pntp: true, pasta: 'legislativo', soCamara: true,
      listas: [],
      async listar(ctx) { return atas(ctx, false); }
    },
    // Reuniões das comissões (atas das comissões permanentes/especiais) → Sessões ligadas à comissão.
    reuniao: {
      nome: 'Reuniões das comissões (pelas atas)', destino: 'Atividade legislativa › Sessões (reuniões de comissão)', pntp: true, pasta: 'legislativo', soCamara: true,
      listas: [],
      async listar(ctx) { return atas(ctx, true); }
    },
    // ---------------------------------------------------------------
    // 20.3 Proposições: projetos (por modalidade), moções, indicações, representações e requerimentos, ano a ano.
    proposicao: {
      nome: 'Proposições (projetos, moções, indicações, requerimentos…)', destino: 'Atividade legislativa › Proposições', pntp: true, pasta: 'legislativo', soCamara: true,
      listas: [],
      async listar(ctx) {
        if (!(await ehCamara(ctx))) return [];
        const listas = [];
        // Projetos: uma lista por modalidade
        try {
          const r = await ctx.ler(ctx.origem + '/projeto');
          for (const x of new Set([...r.html.matchAll(/\/projeto\/categoria\/\d+\/[^"'\s]*\//g)].map((y) => y[0]))) {
            for (const l of await listasPorAno(ctx, x, /(\/projeto\/lista\/(\d{4})\/categoria\/[^"'\s]+?\/)["'\s]/g)) listas.push(l);
          }
        } catch (e) { ctx.log('projetos: ' + e.message); }
        for (const base of ['indicacao', 'mocao', 'representacao', 'requerimento']) {
          for (const l of await listasPorAno(ctx, '/' + base, new RegExp('(\\/' + base + '\\/lista\\/(\\d{4})\\/)', 'g'))) listas.push(l);
        }
        for (const l of listas) {
          if (ctx.parar()) break;
          let r; try { r = await ctx.ler(l.url); } catch (e) { ctx.log(l.url.replace(ctx.origem, '') + ': ' + e.message); continue; }
          const modalidade = limpar((doc(r.html).m.querySelector('h1, h2') || {}).textContent).replace(/^lista projetos\s*-\s*/i, '').replace(/\s*-\s*proposituras$/i, '');
          for (const it of linhasDeLista(r.html, l.url, /\/detalhe\/\d+/)) {
            if (ctx.parar()) break;
            const url = it.url.replace(/(\/detalhe\/\d+\/).*$/, '$1x/');
            if (ctx.jaFeito && await ctx.jaFeito(url)) continue;
            let p; try { p = await ctx.ler(it.url); } catch (e) { ctx.log('proposição ' + url.replace(ctx.origem, '') + ': ' + e.message); continue; }
            if (p.status !== 200) continue;
            const { m } = doc(p.html);
            const b = blocos(m);
            const nn = (it.td[0] || '').match(/^(\S+?)\/(\d{4})$/);
            const numero = bt(b, 'numero') || (nn ? nn[1] : '');
            const ano = Number(bt(b, 'ano')) || (nn ? Number(nn[2]) : l.ano);
            const tipoT = it.td.length > 4 ? it.td[1] : (limpar((m.querySelector('h2') || {}).textContent) || modalidade);
            const tipo = tipoProp(tipoT || modalidade);
            const ementa = (bt(b, 'ementa') || it.td[it.td.length > 4 ? 2 : 1] || '').slice(0, 2000);
            if (!numero || ementa.length < 5) { await ctx.emitir(url, { vazio: true }); continue; }
            const autorEl = bel(b, 'autor vereador')[0] || bel(b, 'autor')[0];
            const autorT = autorEl ? limpar(autorEl.textContent) : '';
            const executivo = /executivo/i.test(tipoT + ' ' + modalidade);
            const autor = autorT ? { nome: autorT, completo: autorT, vereador: !!(autorEl && autorEl.querySelector('a[href*="/vereadores/"]')) }
              : executivo ? { nome: 'Poder Executivo', completo: 'Poder Executivo', vereador: false } : null;
            const apoio = bel(b, 'apoio vereador').map((td) => limpar(td.textContent)).filter(Boolean);
            const dt = data(bt(b, 'data da sessao de apresentacao')) || data(bt(b, 'data do documento')) || data(it.td.join(' '));
            // Movimentação: "<h2>24/08/2026 - 12:07</h2><p>Situação - APROVADA …</p>"
            const tramites = [];
            for (const h of m.querySelectorAll('h2')) {
              const d = data(h.textContent); if (!d) continue;
              const pp = h.nextElementSibling && h.nextElementSibling.tagName === 'P' ? limpar(h.nextElementSibling.textContent).replace(/\s*-\s*arquivo\s*-\s*$/i, '') : '';
              if (pp.length >= 3) tramites.push({ data: d, descricao: pp.slice(0, 1000), status: pp });
            }
            const arq = [...m.querySelectorAll('a[href*="/download/"]')].map((a) => abs(a.getAttribute('href'), url))[0];
            const sit = bt(b, 'situacao');
            await ctx.emitir(url, { ano, data: dt, chave: { tipo, numero, ano },
              registro: { tipo, numero: String(numero).slice(0, 20), ano, ementa: ementa.length >= 5 ? ementa : tipoT + ' ' + numero + '/' + ano,
                data_apresentacao: dt || ano + '-01-01', andamento: andamentoDe(sit), autoria_externa: null },
              autor, tipoOriginal: tipo === 'outro' ? tipoT || modalidade : null,
              arquivos: arq ? [{ url: arq, campo: 'arquivo_url' }] : [], documentos: [], tramites,
              apoio: apoio.length ? apoio : null });
          }
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // 7.2 Diárias — tabela de valores: lida do PDF da norma (categoria "Tabela … Diárias" da Legislação, ou PDFs da página "Diárias").
    diaria_tabela: {
      nome: 'Diárias — tabela de valores', destino: 'Diárias › Valores das diárias', semPeriodo: true, pasta: 'diarias',
      listas: [],
      async listar(ctx) {
        const itens = [];
        // Prefeitura: categoria da Legislação "Tabela Explicativa de Valores de Diárias" (a mais recente)
        const cats = await categoriasLegislacao(ctx);
        const cat = cats.find((c) => /tabela.*diaria|valores? de diaria/.test(sem(c.nome)));
        if (cat && ctx._modoBusca !== 'materia') {
          let primeiro = null;
          await buscaLegislacao(ctx, { ano: '', categoria: cat.id }, async (l) => { if (!primeiro && sem(l.categoria) === sem(cat.nome)) primeiro = l; });
          if (primeiro) itens.push({ url: ctx.origem + '/legislacao/download-lei/' + primeiro.id + '/', x: { ano: null, chave: { norma: primeiro.id }, pdf: ctx.origem + '/legislacao/download-lei/' + primeiro.id + '/',
            norma: limpar(primeiro.ementa).slice(0, 200), normaUrl: ctx.origem + '/legislacao/detalhe/' + primeiro.id + '/x/', lerTabela: lerTabelaDiarias } });
        }
        // Câmara: PDFs da página "Diárias" (resolução com a tabela)
        if (!itens.length) {
          for (const p of await paginasDoSite(ctx)) {
            if (!/diaria/.test(sem(p.titulo))) continue;
            for (const a of p.arquivos) itens.push({ url: a.url, x: { ano: null, chave: { norma: a.url }, pdf: a.url, norma: a.titulo, lerTabela: lerTabelaDiarias } });
          }
        }
        if (!itens.length) ctx.log('Não achei a tabela de valores das diárias no site antigo.');
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // 7.1 Diárias concedidas: as portarias de concessão da Legislação (categoria "Diária", ou portarias "Conceder … diária").
    // A ementa é o próprio ato; o valor vem da tabela de valores (importe antes a seção acima).
    diaria_concessao: {
      nome: 'Diárias concedidas (portarias de concessão)', destino: 'Diárias › Diárias concedidas', pntp: true, pasta: 'diarias',
      listas: [],
      async listar(ctx) {
        const cats = await categoriasLegislacao(ctx);
        const alvo = cats.filter((c) => /^diarias?$/.test(sem(c.nome)) || /portaria|atos? d/.test(sem(c.nome)));
        const vistos = new Set();
        for (let ano = ANO_ATUAL; ano >= ctx.de && !ctx.parar(); ano--) {
          for (const c of alvo.length ? alvo : [{ id: '' }]) {
            if (ctx._modoBusca === 'materia' && c !== alvo[0] && alvo.length) continue;   // busca de matérias não filtra por categoria: uma por ano basta
            await buscaLegislacao(ctx, { ano, categoria: c.id }, async (l) => {
              if (vistos.has(l.id)) return; vistos.add(l.id);
              // Busca de matérias (Câmara): a lista corta a ementa ("Conceder a NOME – CPF…"): confere na página do item.
              if (!(l.categoria ? ehConcessaoDiaria(l.categoria, l.ementa) : /^conceder\b/i.test(l.ementa) || ehConcessaoDiaria('Portaria', l.ementa))) return;
              const url = ctx.origem + '/legislacao/detalhe/' + l.id + '/x/';
              if (ctx.jaFeito && await ctx.jaFeito(url)) return;
              let p; try { p = await ctx.ler(url); } catch (e) { ctx.log('diária ' + l.id + ': ' + e.message); return; }
              if (p.status !== 200) return;
              const { m } = doc(p.html);
              const cc = campos(m);
              const ementa = limpar(pega(cc, 'ementa')) || l.ementa;
              if (!l.categoria && !ehConcessaoDiaria(tituloSecao(m).replace(/^Legisla[cç][aã]o\s*-\s*/i, ''), ementa)) return;
              const numero = limpar(pega(cc, 'numero')) || (l.numero.split('/')[0] || '');
              const dataAto = data(pega(cc, 'data')) || l.data;
              const anoA = Number(pega(cc, 'ano')) || anoDe(dataAto) || ano;
              const pdf = [...m.querySelectorAll('a[href*="download-lei"]')].map((a) => abs(a.getAttribute('href'), url))[0] || null;
              const ato = 'Portaria nº ' + numero + '/' + anoA;
              const base = { numero, ano: anoA, ementa, dataAto: dataAto || anoA + '-01-01', ato };
              // A ementa já traz o ato inteiro: o PDF só é lido se a ementa não tiver o "Conceder".
              await ctx.emitir(url, { ano: anoA, data: dataAto, chave: { ato_concessao: ato }, base, pdf, lerPdf: !/conceder/i.test(ementa),
                arquivos: pdf ? [{ url: pdf, campo: 'ato_url' }] : [], lerTexto: (texto, valores) => lerConcessao(texto, base, valores) });
            });
          }
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // PCA (8.6): o documento de cada ano (página "Plano de Contratação Anual"). Ano sem PCA → Declarações.
    pca: {
      nome: 'Plano de Contratações Anual (PCA)', destino: 'Licitações › PCA', pntp: true, pasta: 'pca',
      listas: [],
      async listar(ctx) {
        const itens = [];
        for (const p of await paginasDoSite(ctx)) {
          if (!p.regra || p.regra.doc !== 'pca') continue;
          for (const b of anosDaPagina(p)) {
            if (classificar(p, b) !== 'pca') continue;
            const d = b.arquivos.find((a) => /pca|plano/i.test(a.titulo)) || b.arquivos[0];
            itens.push({ url: d.url, x: { ano: b.ano, chave: { ano: b.ano }, registro: { ano: b.ano, tipo: 'plano', descricao: ('Plano de Contratações Anual ' + b.ano).slice(0, 1000),
              data_aprovacao: d.data || b.ano + '-01-01' }, arquivos: [{ url: d.url, campo: 'arquivo_url' }] } });
          }
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Declarações de inexistência por ano (texto do próprio site antigo): páginas por ano (PCA, sancionados, estagiários,
    // terceirizados, obras, acordos, convênios, emendas, renúncias, carona, julgamento das contas) e concursos "não realizou".
    declaracao: {
      nome: 'Declarações de inexistência (por página e ano)', destino: 'Declarações de cada página do PNTP', pntp: true, pasta: 'declaracoes',
      listas: [],
      async listar(ctx) {
        const itens = [];
        const add = (url, secao, ano, texto, pagina) => {
          if (!ano || !secao) return;
          itens.push({ url: url + (url.includes('#') ? '-' : '#') + 'declaracao-' + secao + '-' + ano,
            x: { ano, chave: { secao, ano }, secao, declaracao: { abrangencia: 'ano', exercicio: ano }, texto: limpar(texto).slice(0, 500), pagina } });
        };
        for (const p of await paginasDoSite(ctx)) {
          if (!p.regra || !p.regra.secoes) continue;
          for (const b of anosDaPagina(p)) if (classificar(p, b) === 'declaracao') for (const sc of p.regra.secoes) add(b.url, sc, b.ano, textoDeclaracao(b), p.titulo);
        }
        // Concursos e seletivos "A UG não realizou nenhum…"
        const vistos = new Set();
        for (const l of ['/concurso', '/concurso/categoria/24/processo-seletivo/', '/concurso/categoria/25/concurso/']) {
          let r; try { r = await ctx.ler(ctx.origem + l); } catch (_) { continue; }
          for (const id of new Set([...r.html.matchAll(/\/concurso\/detalhe\/(\d+)\//g)].map((x) => x[1]))) {
            if (vistos.has(id) || ctx.parar()) continue; vistos.add(id);
            const url = ctx.origem + '/concurso/detalhe/' + id + '/x/';
            let p; try { p = await ctx.ler(url); } catch (_) { continue; }
            const x = p.status === 200 ? SECOES.concurso.ler(p.html, url) : null;
            if (!x || !x.ignorar || !/inexist/.test(x.ignorar)) continue;
            const { m } = doc(p.html);
            const c = campos(m);
            const txt = limpar(pega(c, 'resumo') || pega(c, 'objeto'));
            // "nos exercícios de 2020 a 2026, não foram realizados concursos": uma declaração por ano da faixa
            const fx = sem(txt).match(/exercicios? de (\d{4}) (?:a|ate) (\d{4})/);
            if (fx) for (let a = Math.max(Number(fx[1]), ctx.de); a <= Math.min(Number(fx[2]), ANO_ATUAL); a++) add(url + '#' + a, 'concursos', a, txt, 'Concursos');
            else add(url, 'concursos', x.ano, txt, 'Concursos');
          }
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Fiscais e gestores de contratos: o documento de cada ano (portaria/declaração de designação) → Publicações,
    // tipo próprio "Fiscais e gestores de contratos".
    fiscal: {
      nome: 'Fiscais e gestores de contratos (designações)', destino: 'Publicações (Fiscais e gestores de contratos)', pntp: true, pasta: 'publicacoes',
      listas: [],
      async listar(ctx) {
        const itens = [];
        for (const p of await paginasDoSite(ctx)) {
          if (!p.regra || p.regra.doc !== 'fiscal') continue;
          for (const b of anosDaPagina(p)) {
            if (classificar(p, b) !== 'fiscal') continue;
            for (const d of b.arquivos) itens.push({ url: d.url, x: { ano: b.ano, data: d.data, chave: { url: d.url },
              registro: { ano: b.ano, data_publicacao: d.data || b.ano + '-01-01', ementa: (nomeProprio(p.titulo) + ' ' + b.ano + ' — ' + d.titulo).slice(0, 1000) },
              arquivos: [{ url: d.url, campo: 'arquivo_url' }] } });
          }
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Acordos de cooperação (página "Convênios e Transferências" / "Acordos firmados" com documento) → Convênios, sem repasse.
    convenio: {
      nome: 'Acordos de cooperação e convênios (páginas por ano)', destino: 'Convênios e transferências', pntp: true, pasta: 'convenios',
      listas: [],
      async listar(ctx) {
        const itens = [];
        for (const p of await paginasDoSite(ctx)) {
          if (!p.regra || p.regra.doc !== 'acordo') continue;
          for (const b of anosDaPagina(p)) {
            if (classificar(p, b) !== 'acordo') continue;
            const texto = b.linhas.filter((l) => !/^- \[/.test(l)).join(' ');
            const parte = (texto.match(/(?:com|junto\s+[àa])\s+(?:o|a)\s+(.+?)\s+(?:com o objetivo|visando|para|,)/i) || [])[1];
            const d = b.arquivos[0];
            itens.push({ url: d.url, x: { ano: b.ano, data: d.data, chave: { url: d.url },
              registro: { tipo: 'sem_repasse', instrumento: 'acordo_cooperacao', numero: null, processo: null, objeto: (d.titulo + ' — ' + texto).slice(0, 2000),
                parte_nome: (parte ? limpar(parte) : 'Não informado no site antigo').slice(0, 500), valor_previsto: null, valor_contrapartida: null, valor_repassado: null,
                data_assinatura: d.data, vigencia_inicio: null, vigencia_fim: null, andamento: b.ano < ANO_ATUAL ? 'concluido' : 'em_execucao' },
              arquivos: [{ url: d.url, campo: 'arquivo_url' }] } });
          }
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Planos e relatórios de Saúde e Educação (18.1 / 19.1) → Saúde/Educação › Planos e relatórios.
    setorial: {
      nome: 'Planos e relatórios de Saúde e Educação', destino: 'Saúde / Educação › Planos e relatórios', pntp: true, pasta: 'setoriais',
      listas: [],
      async listar(ctx) {
        const itens = [];
        for (const p of await paginasDoSite(ctx)) {
          if (!p.regra || (p.regra.doc !== 'saude' && p.regra.doc !== 'educacao')) continue;
          const area = p.regra.doc;
          const blocosA = anosDaPagina(p).concat(p.arquivos.length ? [{ url: p.url, titulo: p.titulo, ano: null, linhas: p.linhas, arquivos: p.arquivos }] : []);
          for (const b of blocosA) {
            for (const d of b.arquivos) {
              const tipo = tipoSetorial(area, d.titulo);
              if (!tipo) continue;   // outros documentos (estoque de medicamentos…) ficam na página
              const ano = anoNoTexto(d.titulo) || b.ano || anoDe(d.data);
              if (!ano) continue;
              // "PMS 2022-2025", "Plano 2015-2025": vale até o último ano (é por ele que entra no período)
              const fx = d.titulo.match(/\b((?:19|20)\d\d)\s*[-–a]+\s*((?:19|20)\d\d)\b/);
              const fim = fx && Number(fx[2]) > Number(fx[1]) ? Number(fx[2]) : null;
              itens.push({ url: d.url, x: { ano: fim || ano, data: d.data, chave: { url: d.url },
                registro: { area, tipo, titulo: (d.titulo.length >= 3 ? d.titulo : nomeProprio(p.titulo) + ' ' + ano).slice(0, 300), exercicio: fx ? Number(fx[1]) : ano, exercicio_fim: fim, data_publicacao: d.data },
                arquivos: [{ url: d.url, campo: 'arquivo_url' }] } });
            }
          }
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Vídeos: galeria do site (/galeria-videos ou /video), com a data de cada um. O título vem do YouTube na importação.
    video: {
      nome: 'Vídeos (galeria do site)', destino: 'Notícias › Vídeos', semPeriodo: true, pasta: 'videos',
      listas: [],
      async listar(ctx) {
        const itens = [];
        for (const cam of ['/galeria-videos', '/video', '/tv']) {
          let r; try { r = await ctx.ler(ctx.origem + cam); } catch (_) { continue; }
          if (r.status !== 200) continue;
          const { m } = doc(r.html);
          for (const a of m.querySelectorAll('a[href*="youtu"]')) {
            const id = ((a.getAttribute('href') || '').match(/(?:watch\?v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1];
            if (!id || itens.some((x) => x.x.chave.video === id)) continue;
            const caixa = a.closest('div[class*="col"]') || a.parentElement;
            const dt = data(caixa ? caixa.textContent : '');
            const t = limpar(a.getAttribute('data-title') || '').replace(/\.\.\.$|…$/, '');
            itens.push({ url: ctx.origem + cam + '#' + id, x: { ano: null, data: dt, chave: { video: id }, registro: { url: 'https://www.youtube.com/watch?v=' + id }, tituloSite: t } });
          }
          if (itens.length) break;
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // Carta de Serviços: cada serviço (descrição, requisitos, documentos, prazo, horário, local, contatos) → Carta de Serviços, como RASCUNHO.
    servico: {
      nome: 'Carta de Serviços', destino: 'Carta de Serviços (rascunho para revisar)', semPeriodo: true, pasta: 'servicos',
      listas: [],
      async listar(ctx) {
        const r = await ctx.ler(ctx.origem + '/carta-servico/categoria');
        if (r.status !== 200) return [];
        const links = new Set([...r.html.matchAll(/\/carta-servico\/(\d+)\/[^"'\s]*\//g)].map((x) => x[1]));
        for (const cat of new Set([...r.html.matchAll(/\/carta-servico\/(?:categoria|index)\/(\d+)\/[^"'\s]*\//g)].map((x) => x[0]))) {
          try { const rc = await ctx.ler(ctx.origem + cat); for (const x of rc.html.matchAll(/\/carta-servico\/(\d+)\/[^"'\s]*\//g)) links.add(x[1]); } catch (_) { /* segue */ }
        }
        const itens = [], nomes = new Set();
        for (const id of links) {
          if (ctx.parar()) break;
          const url = ctx.origem + '/carta-servico/' + id + '/x/';
          let p; try { p = await ctx.ler(url); } catch (e) { ctx.log('serviço ' + id + ': ' + e.message); continue; }
          if (p.status !== 200) continue;
          const { m } = doc(p.html);
          const v = {};
          for (const h of m.querySelectorAll('h4')) {
            const k = sem(h.textContent).replace(/:\s*$/, '').trim();
            const l = []; let n = h.nextElementSibling;
            while (n && n.tagName !== 'H4' && n.tagName !== 'DT') { const t = limpar(n.textContent); if (t) l.push(t); n = n.nextElementSibling; }
            if (k && l.length && v[k] === undefined) v[k] = l.join('\n');
          }
          let nome = limpar((m.querySelector('h2') || m.querySelector('h1') || {}).textContent);
          const cat = limpar(((m.querySelector('.container-titulo h1') || {}).textContent) || '');
          if (nome.length < 3) continue;
          if (nomes.has(sem(nome))) nome = (nome + ' (' + id + ')');
          nomes.add(sem(nome));
          const online = /^sim/i.test(v['servico online'] || '');
          const link = ((v['links uteis'] || '').match(/https?:\/\/\S+/) || [])[0] || ((v['meios de contato'] || '').match(/https?:\/\/\S+/) || [])[0] || null;
          const contato = [v.telefone && 'Telefone: ' + v.telefone, v.celular && 'Celular: ' + v.celular, v['e-mail'] && 'E-mail: ' + v['e-mail'], v['meios de contato'] && 'Contato: ' + v['meios de contato']].filter(Boolean).join('\n');
          const reg = { nome: nomeProprio(nome).slice(0, 200), categoria: cat && sem(cat) !== sem(nome) ? nomeProprio(cat).slice(0, 100) : null,
            descricao: [v.descricao, contato, v['orgao responsavel'] && 'Órgão responsável: ' + v['orgao responsavel'], v['forma de acompanhamento'] && 'Acompanhamento: ' + v['forma de acompanhamento']].filter(Boolean).join('\n\n').slice(0, 4000) || null,
            requisitos: [v.requisitos, v['documentos necessarios'] && 'Documentos necessários:\n' + v['documentos necessarios']].filter(Boolean).join('\n\n').slice(0, 4000) || null,
            prazo_maximo: (v.prazo || '').slice(0, 200) || null, horario: (v['dia e horario de atendimento'] || '').slice(0, 200) || null,
            local_atendimento: (v['periodo de solicitacao'] || v.local || '').slice(0, 300) || null,
            forma_prestacao: online && link ? 'presencial_digital' : 'presencial', link_digital: online && link ? link : null, situacao: 'rascunho' };
          itens.push({ url, x: { ano: null, chave: { nome: reg.nome }, registro: reg } });
        }
        return itens;
      }
    }
  });

  // Atas do modelo (/atas → modalidades → anos → lista → detalhe com o PDF). comissoes: só as das comissões (reuniões) ou só as do Plenário.
  async function atas(ctx, comissoes) {
    if (!(await ehCamara(ctx))) return [];
    const r = await ctx.ler(ctx.origem + '/atas');
    const mods = [...new Set([...r.html.matchAll(/\/atas\/ano\/modalidade\/(\d+)\/([^"'\s/]+)\//g)].map((x) => x[1] + '|' + x[2]))].map((x) => { const [id, slug] = x.split('|'); return { id, slug }; })
      .filter((md) => /comiss/.test(md.slug) === comissoes);
    let nomesCom = [];
    if (comissoes) { try { const rc = await ctx.ler(ctx.origem + '/comissao'); nomesCom = [...doc(rc.html).m.querySelectorAll('a[href*="/comissao/comissao/gerencia/"]')].map((a) => limpar(a.textContent)); } catch (_) { /* sem comissões */ } }
    for (const md of mods) {
      for (const l of await listasPorAno(ctx, '/atas/ano/modalidade/' + md.id + '/' + md.slug + '/', /(\/atas\/lista\/(\d{4})\/modalidade\/[^"'\s]+?\/)["'\s]/g)) {
        if (ctx.parar()) break;
        let rl; try { rl = await ctx.ler(l.url); } catch (e) { ctx.log(l.url.replace(ctx.origem, '') + ': ' + e.message); continue; }
        for (const it of linhasDeLista(rl.html, l.url, /\/atas\/detalhe\//)) {
          if (ctx.parar()) break;
          const url = it.url;
          if (ctx.jaFeito && await ctx.jaFeito(url)) continue;
          const dt = data(it.td[2] || '') || data(it.td[0] || '');
          if (!dt) continue;
          const ident = it.td[0] || '';
          const numero = ((ident.match(/(\d+)\s*[ªºo°]/) || [])[1] || '') || null;
          let arq = null;
          try { const pd = await ctx.ler(url); arq = [...doc(pd.html).m.querySelectorAll('a[href*="/atas/download/"]')].map((a) => abs(a.getAttribute('href'), url))[0] || null; } catch (_) { /* sem PDF */ }
          const tp = sem(md.slug + ' ' + (it.td[3] || ''));
          if (comissoes) {
            const com = comissaoParecida(ident + ' ' + (it.td[1] || ''), nomesCom);
            await ctx.emitir(url, { ano: anoDe(dt), data: dt, comissao: com, chave: { comissao: com, data: dt, numero },
              registro: { tipo: 'reuniao', numero, data: dt, local: null, pauta: /^ementa n[aã]o inclu/i.test(it.td[1] || '') ? null : (it.td[1] || '').slice(0, 20000) || null, andamento: 'realizada' },
              arquivos: arq ? [{ url: arq, campo: 'ata_url' }] : [], ...(com ? {} : { ignorar: 'Comissão não identificada no título da ata: "' + ident + '" (cadastre a reunião à mão)' }) });
          } else {
            const tipo = /extraord/.test(tp) ? 'extraordinaria' : /solene|posse/.test(tp) ? 'solene' : /especial|secreta/.test(tp) ? 'especial' : /audiencia/.test(tp) ? 'audiencia_publica' : 'ordinaria';
            await ctx.emitir(url, { ano: anoDe(dt), data: dt, chave: { data: dt, tipo, numero },
              registro: { tipo, numero, data: dt, hora: null, video_url: null, pauta: null, andamento: 'realizada', local: null },
              titulo: ident, arquivos: arq ? [{ url: arq, campo: 'ata_url' }] : [] });
          }
        }
      }
    }
    return [];
  }

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
    nome: 'Plataforma A (King)',
    descricao: 'Sites de Prefeitura e de Câmara da King (kingpage): /legislacao, /licitacao, /contrato, /concurso, /conta-publica, /noticia, /pagina, /vereadores, /atas…',
    reconhece: (html) => /\/legislacao\/|\/licitacao\/|\/conta-publica/.test(html) && /container-conteudo|_v2/.test(html) && !/intgest\.com\.br|intellgest-sigl-media/i.test(html),
    // Ordem na tela: o que outras seções usam vem antes (vereadores antes de Mesa/comissões/proposições/diárias;
    // tabela de valores antes das diárias concedidas; comissões antes das reuniões).
    secoes: Object.fromEntries(['vereador', 'mesa', 'comissao', 'sessao', 'reuniao', 'proposicao', 'legislacao', 'diaria_tabela', 'diaria_concessao',
      'licitacao', 'contrato', 'ata', 'pca', 'concurso', 'conta', 'declaracao', 'fiscal', 'convenio', 'obra', 'audiencia', 'setorial',
      'secretaria', 'servico', 'faq', 'video', 'noticia', 'pagina', 'inicio'].filter((k) => SECOES[k]).map((k) => [k, SECOES[k]])),
    maiorId: maiorIdDe,
    util: { data, dataExtenso, valor, campos, documentos, limpar, blocos, lerConcessao, lerTabelaDiarias, classificar, anosDaPagina }
  };
})();
