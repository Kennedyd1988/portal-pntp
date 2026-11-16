// =====================================================================
// Migração do site antigo — adaptador "Plataforma B (IntGest)" (0.39.0)
// Sites de Câmara Municipal feitos pela IntGest (rodapé "© IntGest",
// arquivos em intellgest-sigl-media.s3.amazonaws.com), ex.: cmjosedapenha.rn.gov.br.
//
// Endereços do modelo:
//   /parlamentares/ (+ /N/perfil/, /mesa-diretora/)       → Vereadores e Mesa Diretora
//   /atividade-legislativa/comissoes/ (+ /N/reunioes/)      → Comissões, membros e reuniões
//   /atividade-legislativa/proposicoes/proposicoes/?ano=     → Proposições (+ autor, tramitação, arquivos)
//   /atividade-legislativa/sessoes/                          → Sessões plenárias (+ ata, vídeo)
//   /institucional/legislacao/?ano=&esfera_federacao=M       → Normas jurídicas → Publicações oficiais
//   /transparencia/transparencia-administrativa/licitacoes/?exercicio=   → Licitações + anexos
//   /transparencia/transparencia-administrativa/contratos/?ano=          → Contratos
//   /transparencia/transparencia-administrativa/{ppa,ldo,loa,rgf}/export/?format=json&exercicio=
//   /transparencia/transparencia-administrativa/diarias/     → só a tabela de valores (as portarias de concessão ficam de fora)
//   /transparencia/convenios/{recebidos,transferencias-realizadas,acordos-sem-transferencia}/ e /convenios-arquivo/
//   /institucional/obras-publicas/ · /institucional/faq/
//
// As listagens são paginadas (?page=N) e filtradas por ano no próprio site: a
// varredura vai ano a ano, do atual até o início do período da migração.
// Anexos de licitação abrem num visualizador (/visualizador-documento/…): o
// adaptador lê o visualizador e pega o endereço real do arquivo.
// Não grava nada: quem grava é o módulo (modulo-migracao.js).
// =====================================================================
(function () {
  'use strict';
  const ANO = new Date().getFullYear();
  const HOJE = () => new Date().toISOString().slice(0, 10);
  const MESES = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const limpar = (t) => String(t || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const sem = (t) => limpar(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const vazio = (t) => { const s = limpar(t); return !s || /^(-+|n[aã]o (informad[oa]|encontrad[oa]|h[aá])\.?|nenhum.*|sem .*)$/i.test(s) || (s.length < 45 && /n[aã]o (informad|encontrad|cadastrad)[oa]s?\.?$/i.test(s)); };
  const util = (t) => (vazio(t) ? null : limpar(t));
  // dd/mm/aaaa → aaaa-mm-dd; aaaa-mm-dd fica como está
  function data(t) {
    const s = String(t || '');
    let m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }
  const hora = (t) => { const m = String(t || '').match(/(\d{2}):(\d{2})/); return m ? m[1] + ':' + m[2] : null; };
  function dataExtenso(t) {   // "2 de Janeiro de 2023"
    const m = sem(t).match(/(\d{1,2}) de ([a-zç]+) de (\d{4})/);
    if (!m || !MESES[m[2]]) return data(t);
    return m[3] + '-' + String(MESES[m[2]]).padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  // "R$ 1.234,56" ou "1234.56" (exportação JSON)
  function valor(t) {
    const s = String(t == null ? '' : t);
    let m = s.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
    if (m) return Number(m[1].replace(/\./g, '').replace(',', '.'));
    m = s.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    return m ? Number(m[1]) : null;
  }
  // "MARCOS AURELIO DE PAIVA RÊGO" → "Marcos Aurelio de Paiva Rêgo" (nomes em caixa alta no site antigo)
  const nomeProprio = (t) => (t && t === t.toUpperCase()
    ? t.toLowerCase().replace(/(^|[\s'(/-])(\S)/g, (x, a, b) => a + b.toUpperCase()).replace(/ (De|Da|Do|Das|Dos|E)(?= )/g, (x) => x.toLowerCase())
    : t);
  const anoDe = (d) => (d ? Number(d.slice(0, 4)) : null);

  function doc(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,style,svg,noscript').forEach((x) => x.remove());
    return { d, m: d.querySelector('main') || d.body };
  }
  // Pares "rótulo/valor" do modelo: <span|p|strong class="texto-negrito">Rótulo</span><span class="texto-info">Valor</span> e <dt>/<dd>.
  function kv(m) {
    const r = {};
    for (const n of m.querySelectorAll('.texto-negrito, dt')) {
      const v = n.nextElementSibling;
      const k = sem(n.textContent).replace(/[:?]+$/, '').trim();
      if (!k || !v || r[k]) continue;
      r[k] = { texto: limpar(v.innerText || v.textContent), el: v };
    }
    return r;
  }
  const pega = (c, ...nomes) => {
    for (const n of nomes) { const k = sem(n); if (c[k] && !vazio(c[k].texto)) return c[k].texto; }
    for (const n of nomes) for (const k of Object.keys(c)) if (k.startsWith(sem(n)) && !vazio(c[k].texto)) return c[k].texto;
    return null;
  };
  const elDe = (c, nome) => { const k = Object.keys(c).find((x) => x.startsWith(sem(nome))); return k ? c[k].el : null; };
  const titulo = (m) => limpar((m.querySelector('h4.titulo-base, h4, h1, h2') || {}).textContent);
  const abs = (h, base) => { try { return new URL(String(h || '').trim(), base).href; } catch (_) { return null; } };
  const ehArquivo = (u) => /intellgest-sigl-media\.s3\.amazonaws\.com\/media\/(?!.*novo_portal_static)/i.test(u || '') && !/\/appconfig\//.test(u || '');

  // ---------------- leitura ----------------
  // Percorre uma listagem paginada (?page=N). "cada" recebe o documento da página e devolve false para parar.
  async function paginas(ctx, caminho, params, cada) {
    for (let pag = 1, max = 1; pag <= max && pag <= 300 && !ctx.parar(); pag++) {
      const q = new URLSearchParams(Object.assign({}, params || {}, pag > 1 ? { page: pag } : {})).toString();
      const r = await ctx.ler(ctx.origem + caminho + (q ? '?' + q : ''));
      if (r.status !== 200) break;
      const { d, m } = doc(r.html);
      for (const a of d.querySelectorAll('a[href]')) {
        const h = a.getAttribute('href') || '';
        if (/\/export\//.test(h)) continue;
        const x = h.match(/[?&]page=(\d+)/); if (x) max = Math.max(max, Number(x[1]));
      }
      if ((await cada(m, pag, d)) === false) break;
    }
  }
  // Links de detalhe de uma página de listagem (na ordem, sem repetir).
  const linksDe = (m, re, base) => [...new Set([...m.querySelectorAll('a[href]')].map((a) => (a.getAttribute('href') || '').trim()).filter((h) => re.test(h)).map((h) => abs(h, base)))];
  // Lê o detalhe e entrega ao módulo (o que já veio, em retomada da importação, nem é relido).
  async function detalhe(ctx, url, ler, rotulo) {
    if (ctx.parar()) return;
    if (ctx.jaFeito && await ctx.jaFeito(url)) return;
    let p; try { p = await ctx.ler(url); } catch (e) { ctx.log(rotulo + ': ' + e.message); return; }
    let x;
    try { x = p.status === 200 ? await ler(p.html, url) : { vazio: true }; }
    catch (e) { ctx.log(rotulo + ': ' + e.message); return; }
    await ctx.emitir(url, x);
  }
  // Anexo que abre no visualizador do site (/visualizador-documento/…): o arquivo real está dentro da página.
  async function resolver(ctx, url) {
    if (!url) return null;
    if (ehArquivo(url) || !/\/visualizador-documento\//.test(url)) return url;
    ctx._cacheDoc = ctx._cacheDoc || new Map();
    if (ctx._cacheDoc.has(url)) return ctx._cacheDoc.get(url);
    let real = null;
    try {
      const r = await ctx.ler(url);
      // A página do visualizador também tem fotos (vereadores, brasão): vale só documento (PDF, planilha…) ou a pasta de arquivos.
      const todos = (r.html.match(/https?:\/\/intellgest-sigl-media\.s3\.amazonaws\.com\/media\/[^"'<>\s]+/g) || []).map((u) => u.replace(/&amp;/g, '&')).filter(ehArquivo)
        .filter((u) => !/\/(parlamentar|autor|casa|appconfig|logotipo)\//i.test(u));
      real = todos.find((u) => /\.(pdf|docx?|xlsx?|odt|ods|zip|rar|csv)(\?|$)/i.test(u)) || todos.find((u) => /\/media\/arquivos\//i.test(u)) || null;
    } catch (e) { ctx.log('anexo ' + url.replace(ctx.origem, '') + ': ' + e.message); }
    ctx._cacheDoc.set(url, real);
    return real;
  }
  // Anos do período, do atual para trás (inclui o seguinte para LOA/LDO já publicadas).
  const anos = (ctx, maisUm) => { const l = []; for (let a = ANO + (maisUm ? 1 : 0); a >= Math.max(ctx.de, 1990); a--) l.push(a); return l; };

  // Anos que a própria listagem oferece no filtro (campo de seleção): o site ignora o filtro quando o ano
  // não é uma das opções e devolve tudo, então só se pesquisa ano que existe. Sem campo de seleção: todos do período.
  async function anosDaLista(ctx, caminho, campo, maisUm) {
    try {
      const r = await ctx.ler(ctx.origem + caminho);
      const sel = doc(r.html).m.querySelector('select[name="' + campo + '"]');
      if (sel) {
        const l = [...sel.options].map((o) => Number(o.value)).filter((a) => a >= ctx.de && a <= ANO + 1).sort((a, b) => b - a);
        return [...new Set(l)];
      }
    } catch (_) { /* usa o período inteiro */ }
    return anos(ctx, maisUm);
  }

  // ---------------- tabelas de tradução ----------------
  const tipoDoc = (t, mapa, padrao) => { const s = sem(t); for (const [re, tipo] of mapa) if (re.test(s)) return tipo; return padrao; };
  const DOC_LIC = [[/termo de referencia/, 'termo_referencia'], [/\betp\b|estudo tecnico/, 'estudo_tecnico'], [/edital/, 'edital'], [/aviso/, 'aviso'],
    [/parecer/, 'parecer'], [/\bata\b|ata de registro/, 'ata'], [/homolog/, 'homologacao'], [/adjudic/, 'adjudicacao'], [/resultado|julgamento/, 'resultado'],
    [/ratific/, 'ratificacao'], [/recurso/, 'recurso'], [/impugna/, 'impugnacao'], [/esclarec/, 'esclarecimento'], [/retifica|errata/, 'retificacao'],
    [/justificativa|autorizacao/, 'justificativa'], [/orcament|cotac|pesquisa de preco|mapa de preco/, 'orcamento'], [/contrato/, 'contrato'], [/anexo/, 'anexo']];
  function modalidadeDe(t) {
    const s = sem(t);
    return /pregao/.test(s) ? (/presencial/.test(s) ? 'pregao_presencial' : 'pregao_eletronico')
      : /concorrencia/.test(s) ? (/eletronic/.test(s) ? 'concorrencia_eletronica' : 'concorrencia_presencial')
      : /chamada/.test(s) ? 'chamada_publica' : /dispensa/.test(s) ? 'dispensa' : /inexig/.test(s) ? 'inexigibilidade'
      : /tomada/.test(s) ? 'tomada_precos' : /convite/.test(s) ? 'convite' : /leilao/.test(s) ? 'leilao_presencial'
      : /credenciamento/.test(s) ? 'credenciamento' : /adesao/.test(s) ? 'adesao_ata' : /concurso/.test(s) ? 'concurso' : 'outra';
  }
  function tipoProposicao(t) {
    const s = sem(t);
    if (/emenda a lei organica|emenda.*lei organica/.test(s)) return 'projeto_emenda_lei_organica';
    if (/lei complementar/.test(s)) return 'projeto_lei_complementar';
    if (/projeto de lei/.test(s)) return 'projeto_lei';
    if (/decreto legislativo/.test(s)) return 'projeto_decreto_legislativo';
    if (/projeto de resolucao/.test(s)) return 'projeto_resolucao';
    if (/requerimento/.test(s)) return 'requerimento';
    if (/indicacao/.test(s)) return 'indicacao';
    if (/mocao/.test(s)) return 'mocao';
    if (/veto/.test(s)) return 'veto';
    if (/^emenda/.test(s)) return 'emenda';
    return 'outro';
  }
  function tipoNorma(t) {
    const s = sem(t);
    if (/emenda a lei organica/.test(s)) return 'emenda_lei_organica';
    if (/lei organica/.test(s)) return 'lei_organica';
    if (/lei complementar/.test(s)) return 'lei_complementar';
    if (/decreto legislativo/.test(s)) return 'decreto_legislativo';
    if (/decreto/.test(s)) return 'decreto';
    if (/instrucao normativa/.test(s)) return 'instrucao_normativa';
    if (/resolucao/.test(s)) return 'resolucao';
    if (/portaria/.test(s)) return 'portaria';
    if (/regimento interno/.test(s)) return 'x_regimento_interno';
    if (/^lei\b/.test(s)) return 'lei';
    return 'outro';
  }
  const funcaoDe = (t) => { const s = sem(t); return /vice/.test(s) ? 'vice_presidente' : /presiden/.test(s) ? 'presidente' : /relator/.test(s) ? 'relator' : /suplent/.test(s) ? 'suplente' : 'membro'; };

  // ---------------- seções ----------------
  const SECOES = {
    // ---------------------------------------------------------------
    // 20.1 Vereadores: da lista (com as legislaturas de cada um) + perfil (nome civil, partido, biografia, contatos, foto).
    // Período: vêm os vereadores com mandato no período escolhido para o que pontua no PNTP.
    vereador: {
      nome: 'Vereadores (composição da Casa)', destino: 'Atividade legislativa › Vereadores', pntp: true, pasta: 'legislativo',
      listas: [],
      async listar(ctx) {
        const r = await ctx.ler(ctx.origem + '/parlamentares/');
        const { m } = doc(r.html);
        const sel = m.querySelector('#id_parlamentar_filter, select');
        const legs = {};
        for (const o of sel ? sel.options : []) {
          const a = limpar(o.textContent).match(/(\d{4})\s*-\s*(\d{4})/);
          if (o.value && a) legs[o.value] = { ini: Number(a[1]), fim: Number(a[2]), atual: /atual/i.test(o.textContent) };
        }
        const por = new Map();   // id do site antigo → legislaturas
        for (const it of m.querySelectorAll('.parlamentar-item')) {
          const a = it.querySelector('a[href*="/perfil/"]');
          const id = a && ((a.getAttribute('href') || '').match(/\/parlamentares\/(\d+)\/perfil/) || [])[1];
          if (!id) continue;
          const l = legs[it.getAttribute('data-filter-value')];
          if (!por.has(id)) por.set(id, []);
          if (l) por.get(id).push(l);
        }
        let ordem = 10;
        for (const [id, ls] of por) {
          if (ctx.parar()) break;
          const ini = ls.length ? Math.min(...ls.map((l) => l.ini)) : null;
          const fim = ls.length ? Math.max(...ls.map((l) => l.fim)) : null;
          const atual = ls.some((l) => l.atual);
          const ord = ordem; ordem += 10;
          const url = ctx.origem + '/parlamentares/' + id + '/perfil/';
          if (fim && fim < ctx.de) continue;   // mandato inteiro antes do período
          await detalhe(ctx, url, (html) => {
            const { m: p } = doc(html);
            const topo = p.querySelector('#nav_menu_parlamentar') || p;
            const apelido = limpar((topo.querySelector('.nome-parlamentar') || {}).textContent);
            if (!apelido) return { vazio: true };
            const c = kv(p);
            const civil = pega(c, 'nome civil');
            const bioT = [...p.querySelectorAll('h3')].find((h) => /biografia/i.test(h.textContent));
            const bio = bioT && bioT.nextElementSibling ? limpar(bioT.nextElementSibling.textContent) : '';
            const email = (pega(c, 'e-mail') || '').toLowerCase();
            const foto = (topo.querySelector('img[src]') || {}).getAttribute ? topo.querySelector('img[src]').getAttribute('src') : null;
            const fotoUrl = foto ? abs(foto, url) : null;
            return {
              ano: atual ? ANO : fim, chave: { nome_parlamentar: apelido },
              registro: { nome: nomeProprio(civil || apelido).slice(0, 200), nome_parlamentar: nomeProprio(apelido).slice(0, 120),
                partido: util((topo.querySelector('small') || {}).textContent) ? limpar(topo.querySelector('small').textContent).slice(0, 40) : null,
                biografia: vazio(bio) ? null : bio.slice(0, 8000), email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
                telefone: (pega(c, 'telefone') || '').slice(0, 60) || null, legislatura_inicio: ini, legislatura_fim: fim, em_exercicio: atual, ordem: ord },
              arquivos: fotoUrl && ehArquivo(fotoUrl) ? [{ url: fotoUrl, campo: 'foto_url' }] : []
            };
          }, 'vereador ' + id);
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // Mesa Diretora da sessão legislativa atual → cargo na Mesa de cada vereador (importe antes os vereadores).
    mesa: {
      nome: 'Mesa Diretora (atual)', destino: 'Atividade legislativa › Vereadores (cargo na Mesa)', semPeriodo: true, pasta: 'legislativo',
      listas: [],
      async listar(ctx) {
        const r = await ctx.ler(ctx.origem + '/parlamentares/mesa-diretora/');
        const { m } = doc(r.html);
        const sel = m.querySelector('select');
        const op = sel && ([...sel.options].find((o) => /atual/i.test(o.textContent)) || [...sel.options].find((o) => o.value));
        const itens = [];
        if (!op) return itens;
        const sessao = limpar(op.textContent).replace(/\s*\(atual\)\s*/i, '');
        for (const it of m.querySelectorAll('.parlamentar-item[data-filter-value="' + op.value + '"]')) {
          const nome = limpar((it.querySelector('h3, .nome-vereadores') || {}).textContent);
          const cargo = limpar((it.querySelector('p') || {}).textContent);
          if (!nome || !cargo) continue;
          itens.push({ url: ctx.origem + '/parlamentares/mesa-diretora/#' + op.value + '-' + encodeURIComponent(sem(nome)),
            x: { ano: null, chave: { nome }, registro: { nome_parlamentar: nomeProprio(nome), cargo_mesa: cargo.slice(0, 80) }, sessao } });
        }
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // 20.5 Comissões com a composição (presidência e membros).
    comissao: {
      nome: 'Comissões e membros', destino: 'Atividade legislativa › Comissões', semPeriodo: true, pasta: 'legislativo',
      listas: [],
      async listar(ctx) {
        const links = [];
        await paginas(ctx, '/atividade-legislativa/comissoes/', {}, (m) => { const l = linksDe(m, /\/comissoes\/\d+\/resumo\/?$/, ctx.origem); l.forEach((u) => links.includes(u) || links.push(u)); return l.length > 0; });
        for (const url of links) {
          if (ctx.parar()) break;
          const base = url.replace(/resumo\/?$/, '');
          await detalhe(ctx, url, async (html) => {
            const { m } = doc(html);
            const nome = titulo(m);
            if (!nome) return { vazio: true };
            const c = kv(m);
            let membros = [], composicao = null;
            try {
              const pr = doc((await ctx.ler(base + 'parlamentares/presidencia/')).html).m;
              const op = [...pr.querySelectorAll('select option')].find((o) => o.value && o.selected) || [...pr.querySelectorAll('select option')].find((o) => o.value);
              const per = op ? limpar(op.textContent).match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/) : null;
              composicao = per ? { ini: data(per[1]), fim: data(per[2]) } : null;
              for (const n of pr.querySelectorAll('.nome-parlamentar')) {
                const papel = n.nextElementSibling ? limpar(n.nextElementSibling.textContent) : '';
                const nm = limpar(n.textContent);
                if (nm && !membros.some((x) => sem(x.nome) === sem(nm))) membros.push({ nome: nm, funcao: funcaoDe(papel) });
              }
              const mb = doc((await ctx.ler(base + 'parlamentares/membros/')).html).m;
              for (const tr of mb.querySelectorAll('tr.item-parlamentar')) {
                const td = tr.querySelector('td');
                const papel = limpar((td.querySelector('p') || {}).textContent);
                const nm = limpar(td.textContent.replace(papel, ''));
                const desl = limpar((tr.querySelector('td[data-label="Desligamento"]') || {}).textContent);
                if (!nm || data(desl)) continue;   // já saiu da comissão
                if (!membros.some((x) => sem(x.nome) === sem(nm))) membros.push({ nome: nm, funcao: funcaoDe(papel) });
              }
            } catch (e) { ctx.log(nome + ': composição não lida (' + e.message + ')'); }
            // Composição do site antigo já encerrada (ex.: da legislatura passada): não liga membros que não estão mais lá.
            if (composicao && composicao.fim && composicao.fim < HOJE() && membros.length) {
              ctx.log(nomeProprio(nome) + ': a composição do site antigo terminou em ' + composicao.fim.split('-').reverse().join('/') + ' — membros não trazidos; cadastre a composição atual.');
              membros = [];
            }
            const st = sem(pega(c, 'status'));
            const t = sem(pega(c, 'tipo'));
            const fim = dataExtenso(pega(c, 'data de extincao'));
            const ini = dataExtenso(pega(c, 'data de criacao'));
            return { ano: null, chave: { nome },
              registro: { nome: nomeProprio(nome).slice(0, 200), tipo: /tempor/.test(t) ? 'temporaria' : /especial/.test(t) ? 'especial' : /inquerito|cpi/.test(t) ? 'cpi' : /perman/.test(t) ? 'permanente' : 'outra',
                competencias: (pega(c, 'finalidades') || '').slice(0, 4000) || null, inicio: ini, fim: fim && ini && fim >= ini ? fim : null, ativa: !/inativ|extint/.test(st) },
              membros };
          }, 'comissão ' + url.replace(ctx.origem, ''));
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // Reuniões das comissões (pauta e ata) → Sessões, ligadas à comissão (importe antes as Comissões).
    reuniao: {
      nome: 'Reuniões das comissões', destino: 'Atividade legislativa › Sessões (reuniões de comissão)', pntp: true, pasta: 'legislativo',
      listas: [],
      async listar(ctx) {
        const coms = [];
        await paginas(ctx, '/atividade-legislativa/comissoes/', {}, (m) => {
          for (const tr of m.querySelectorAll('tbody tr')) {
            const a = tr.querySelector('a[href*="/resumo/"]'); if (!a) continue;
            const u = abs(a.getAttribute('href'), ctx.origem);
            if (!coms.some((x) => x.url === u)) coms.push({ url: u, nome: limpar((tr.querySelector('td') || {}).textContent) });
          }
        });
        for (const cm of coms) {
          if (ctx.parar()) break;
          const base = cm.url.replace(/resumo\/?$/, '');
          const reus = [];
          await paginas(ctx, new URL(base + 'reunioes/').pathname, {}, (m) => {
            let novas = 0, noPeriodo = 0;
            for (const tr of m.querySelectorAll('tbody tr')) {
              const a = tr.querySelector('a[href*="/reuniao/"]'); if (!a) continue;
              const u = abs(a.getAttribute('href'), ctx.origem); if (reus.some((x) => x.url === u)) continue;
              const dt = data(tr.textContent); novas++;
              if (dt && anoDe(dt) < ctx.de) continue;
              noPeriodo++;
              reus.push({ url: u, data: dt, numero: (limpar(tr.querySelector('td').textContent).match(/^(\S+?)\//) || [])[1] || null });
            }
            return novas > 0 && noPeriodo > 0;   // listagem do mais novo para o mais antigo: para quando sai do período
          });
          for (const rn of reus) {
            await detalhe(ctx, rn.url, (html) => {
              const { m } = doc(html);
              const c = kv(m);
              const dt = data(pega(c, 'inicio')) || rn.data;
              if (!dt) return { vazio: true };
              const arqs = [...m.querySelectorAll('a[href]')].map((a) => abs(a.getAttribute('href'), rn.url)).filter(ehArquivo);
              const pauta = arqs.find((u) => /\/pauta\//i.test(u)), ata = arqs.find((u) => /\/ata\//i.test(u));
              return { ano: anoDe(dt), data: dt, comissao: cm.nome, chave: { comissao: cm.nome, data: dt, numero: rn.numero },
                registro: { tipo: 'reuniao', numero: (rn.numero || '').slice(0, 20) || null, data: dt, local: util(pega(c, 'local')) ? pega(c, 'local').slice(0, 200) : null,
                  pauta: util(pega(c, 'tema')) ? pega(c, 'tema').slice(0, 20000) : null, andamento: dt <= HOJE() ? 'realizada' : 'prevista' },
                arquivos: [pauta && { url: pauta, campo: 'pauta_url' }, ata && { url: ata, campo: 'ata_url' }].filter(Boolean) };
            }, 'reunião ' + rn.url.replace(ctx.origem, ''));
          }
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // 20.3 Proposições, ano a ano: tipo, número, ementa, autor, situação, texto original, anexos e tramitação.
    proposicao: {
      nome: 'Proposições (projetos, requerimentos, indicações…)', destino: 'Atividade legislativa › Proposições', pntp: true, pasta: 'legislativo',
      listas: [],
      async listar(ctx) {
        for (const ano of await anosDaLista(ctx, '/atividade-legislativa/proposicoes/proposicoes/', 'ano')) {
          if (ctx.parar()) break;
          const links = [];
          await paginas(ctx, '/atividade-legislativa/proposicoes/proposicoes/', { ano }, (m) => {
            const l = linksDe(m, /\/materia-legislativa\/\d+\/detalhe\/?$/, ctx.origem).filter((u) => !links.includes(u));
            links.push(...l); return l.length > 0;
          });
          for (const url of links) {
            await detalhe(ctx, url, (html) => {
              const { m } = doc(html);
              const t = titulo(m);
              const nn = t.match(/n[ºo°]\s*(\S+?)\/(\d{4})/i);
              const c = kv(m);
              const tipoT = pega(c, 'tipo') || t.replace(/\s*n[ºo°].*$/i, '');
              const ementa = (pega(c, 'ementa') || '').slice(0, 2000);
              const dt = data(pega(c, 'abertura'));
              if (!nn || !tipoT) return { vazio: true };
              const anoP = Number(nn[2]);
              // Autor: o primeiro cartão do lado (vereador com link para o perfil, ou autor externo como o Prefeito)
              const card = m.querySelector('aside .parlamentar-item');
              const autorT = card ? limpar((card.querySelector('.nome-vereadores, h3, p') || {}).textContent) : '';
              const autorVereador = !!(card && card.querySelector('a[href*="/perfil/"]'));
              // Tramitação
              const tramites = [];
              const sec = [...m.querySelectorAll('section')].find((s) => /tramita/i.test(s.getAttribute('aria-label') || '') || /hist[oó]rico de tramita/i.test((s.querySelector('h3') || {}).textContent || ''));
              for (const tr of sec ? sec.querySelectorAll('tbody tr') : []) {
                const td = (l) => limpar((tr.querySelector('td[data-label="' + l + '"]') || {}).textContent);
                const d = data(td('Data')); if (!d) continue;
                const partes = [td('Status'), td('Texto')].filter((x) => x && !vazio(x));
                const rota = td('Origem') && td('Destino') && td('Origem') !== td('Destino') ? ' (' + td('Origem') + ' → ' + td('Destino') + ')' : '';
                const desc = (partes.join(' — ') + rota).slice(0, 1000);
                if (desc.length >= 3) tramites.push({ data: d, descricao: desc, status: td('Status') });
              }
              // Arquivos: o "Texto Original" é o principal; os demais viram anexos na tramitação
              const lista = m.querySelector('aside ul') || m;
              const docs = []; let principal = null;
              for (const a of lista.querySelectorAll('a[href]')) {
                const u = abs(a.getAttribute('href'), url); if (!ehArquivo(u) || docs.some((x) => x.url === u) || u === principal) continue;
                const rot = limpar(a.textContent) || 'Anexo';
                if (!principal && /texto original|inteiro teor/i.test(rot + ' ' + (a.getAttribute('aria-label') || ''))) { principal = u; continue; }
                docs.push({ url: u, titulo: rot.slice(0, 150), data: data(rot) || dt });
              }
              const s = sem(pega(c, 'situacao'));
              const ult = sem(tramites.length ? tramites[tramites.length - 1].status + ' ' + tramites.map((x) => x.status).join(' ') : '');
              const andamento = /em tramita/.test(s) && !/encerrad/.test(s) ? 'em_tramitacao'
                : /sancion|promulg|transformad/.test(ult) ? 'transformada_norma' : /vetad/.test(ult) ? 'vetada' : /rejeit/.test(ult) ? 'rejeitada'
                : /retirad/.test(ult) ? 'retirada' : /prejudic/.test(ult) ? 'prejudicada' : /aprovad|deferid/.test(ult) ? 'aprovada' : 'arquivada';
              const estimado = andamento === 'arquivada' && !/arquiv/.test(ult);
              return { ano: anoP, data: dt, chave: { tipo: tipoProposicao(tipoT), numero: nn[1], ano: anoP },
                registro: { tipo: tipoProposicao(tipoT), numero: nn[1].slice(0, 20), ano: anoP, ementa: ementa.length >= 5 ? ementa : t.slice(0, 2000),
                  data_apresentacao: dt || anoP + '-01-01', andamento,
                  autoria_externa: null },
                autor: autorT ? { nome: limpar(autorT.replace(/\s+-\s+.*$/, '')), completo: autorT, vereador: autorVereador } : null,
                tipoOriginal: tipoT, andamentoEstimado: estimado ? (pega(c, 'situacao') || 'encerrada') : null,
                arquivos: principal ? [{ url: principal, campo: 'arquivo_url' }] : [], documentos: docs, tramites };
            }, 'proposição ' + url.replace(ctx.origem, ''));
          }
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // 20.4 / 20.6 / 20.9 Sessões plenárias: tipo, número, data e hora, situação, ata (quando publicada) e vídeo.
    sessao: {
      nome: 'Sessões plenárias', destino: 'Atividade legislativa › Sessões', pntp: true, pasta: 'legislativo',
      listas: [],
      async listar(ctx) {
        const lista = [];
        await paginas(ctx, '/atividade-legislativa/sessoes/', {}, (m) => {
          let novas = 0, noPeriodo = 0;
          for (const tr of m.querySelectorAll('tbody tr')) {
            const a = tr.querySelector('a[href*="/resumo/"]'); if (!a) continue;
            const u = abs(a.getAttribute('href'), ctx.origem); if (lista.some((x) => x.url === u)) continue;
            novas++;
            const dt = data(tr.textContent);
            if (dt && anoDe(dt) < ctx.de) continue;
            noPeriodo++; lista.push({ url: u, data: dt, hora: hora(tr.textContent) });
          }
          return novas > 0 && noPeriodo > 0;
        });
        for (const it of lista) {
          await detalhe(ctx, it.url, async (html) => {
            const { m } = doc(html);
            const c = kv(m);
            const ab = pega(c, 'abertura');
            const dt = data(ab) || it.data;
            if (!dt) return { vazio: true };
            const t = titulo(m);
            const tp = sem(pega(c, 'tipo') || t);
            const tipo = /extraord/.test(tp) ? 'extraordinaria' : /solene/.test(tp) ? 'solene' : /especial|secreta/.test(tp) ? 'especial' : /audiencia/.test(tp) ? 'audiencia_publica' : 'ordinaria';
            const numero = String(Number(pega(c, 'sessao')) || (t.match(/^(\d+)/) || [])[1] || '') || null;
            const st = sem(pega(c, 'status'));
            const yt = (html.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|live\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
            let ata = null;
            try {
              const pa = await ctx.ler(it.url.replace(/resumo\/?$/, 'ata/'));
              if (pa.status === 200) ata = [...doc(pa.html).m.querySelectorAll('a[href]')].map((a) => abs(a.getAttribute('href'), it.url)).find(ehArquivo) || null;
            } catch (_) { /* sem ata */ }
            return { ano: anoDe(dt), data: dt, chave: { data: dt, tipo, numero },
              registro: { tipo, numero, data: dt, hora: hora(ab) || it.hora, video_url: yt ? 'https://www.youtube.com/watch?v=' + yt : null,
                andamento: /cancel/.test(st) ? 'cancelada' : /adiad/.test(st) ? 'adiada' : /nao iniciada/.test(st) && dt >= HOJE() ? 'prevista' : 'realizada',
                local: null },
              titulo: t, arquivos: ata ? [{ url: ata, campo: 'ata_url' }] : [] };
          }, 'sessão ' + it.url.replace(ctx.origem, ''));
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // 20.2 Normas jurídicas municipais (leis, resoluções, decretos legislativos…) → Publicações oficiais.
    // Lei Orgânica e Regimento Interno vêm sempre (estão em vigor, de qualquer ano).
    // Portarias de concessão de diárias ficam de fora (Diárias segue no sistema de pessoal); a resolução que
    // regulamenta as diárias vem (é a norma da tabela de valores, PNTP 7.2).
    legislacao: {
      nome: 'Normas jurídicas (leis, resoluções, Lei Orgânica, Regimento…)', destino: 'Publicações oficiais', pntp: true, pasta: 'publicacoes',
      listas: [],
      async listar(ctx) {
        const caminho = '/institucional/legislacao/';
        const ini = await ctx.ler(ctx.origem + caminho);
        const sel = doc(ini.html).m.querySelector('select[name="tipo"]');
        const sempre = sel ? [...sel.options].filter((o) => o.value && /lei org[aâ]nica$|regimento interno/i.test(limpar(o.textContent)) && !/emenda/i.test(o.textContent)).map((o) => o.value) : [];
        const anosL = sel ? (await anosDaLista(ctx, caminho, 'ano')) : anos(ctx);
        const buscas = anosL.map((ano) => ({ ano, esfera_federacao: 'M' })).concat(sempre.map((tipo) => ({ tipo, esfera_federacao: 'M' })));
        const vistos = new Set();
        let diarias = 0;
        for (const params of buscas) {
          if (ctx.parar()) break;
          const links = [];
          await paginas(ctx, caminho, params, (m) => {
            const l = linksDe(m, /\/norma-juridica\/\d+\/detalhe\/?$/, ctx.origem).filter((u) => !links.includes(u));
            links.push(...l); return l.length > 0;
          });
          for (const url of links) {
            if (vistos.has(url)) continue; vistos.add(url);
            await detalhe(ctx, url, (html) => {
              const { m } = doc(html);
              const c = kv(m);
              const tipoT = pega(c, 'tipo') || titulo(m).replace(/\s*n[ºo°].*$/i, '');
              const nn = (pega(c, 'numero') || titulo(m)).match(/(?:n[ºo°]\s*)?(\S+?)\/(\d{4})/i);
              const ementa = limpar(pega(c, 'ementa')).replace(/^"|"$/g, '').slice(0, 4000);
              const ident = pega(c, 'identificador') || '';
              if (!tipoT) return { vazio: true };
              const tipo = tipoNorma(tipoT);
              if (tipo === 'portaria' && /di[aá]ria/i.test(ident + ' ' + ementa)) { diarias++; return { vazio: true }; }
              const dt = data(pega(c, 'data publicacao', 'data'));
              const ano = nn ? Number(nn[2]) : anoDe(dt);
              const arq = (() => { const e = elDe(c, 'texto integral'); const a = e && (e.matches('a') ? e : e.querySelector('a[href]')); return a ? abs(a.getAttribute('href'), url) : null; })()
                || [...m.querySelectorAll('a[href]')].map((a) => abs(a.getAttribute('href'), url)).find((u) => ehArquivo(u) && !/certidao/i.test(u));
              const anexos = [...m.querySelectorAll('a[href]')].map((a) => ({ url: abs(a.getAttribute('href'), url), titulo: limpar(a.textContent) || 'Anexo' }))
                .filter((a) => ehArquivo(a.url) && a.url !== arq).filter((a, i, l) => l.findIndex((b) => b.url === a.url) === i)
                .map((a) => ({ url: a.url, titulo: (/certid/i.test(a.titulo + a.url) ? 'Certidão de publicação' : a.titulo).slice(0, 200) }));
              const custom = tipo === 'x_regimento_interno';
              const numero = nn ? nn[1] : null;
              const obs = [tipo === 'outro' ? 'Tipo no site antigo: ' + tipoT : null, ident && !vazio(ident) ? 'Identificador no site antigo: ' + ident : null].filter(Boolean).join(' · ') || null;
              return { ano, data: dt, semPeriodo: tipo === 'lei_organica' || custom, chave: { tipo, numero, ano },
                tipoNovo: custom ? { codigo: 'x_regimento_interno', nome: 'Regimento Interno' } : null,
                registro: { tipo, numero, ano, data_publicacao: dt, ementa: ementa.length >= 5 ? ementa : (tipoT + ' ' + (numero || '') + '/' + (ano || '')).trim(), vigencia: 'vigente', observacao: obs },
                arquivos: arq ? [{ url: arq, campo: 'arquivo_url' }] : [], anexos };
            }, 'norma ' + url.replace(ctx.origem, ''));
          }
        }
        if (diarias) ctx.log(diarias + ' portaria(s) de diárias deixada(s) de fora (Diárias segue no sistema de pessoal).');
        return [];
      }
    },
    // ---------------------------------------------------------------
    licitacao: {
      nome: 'Licitações e anexos', destino: 'Licitações', pntp: true, pasta: 'licitacoes',
      listas: [],
      async listar(ctx) {
        const caminho = '/transparencia/transparencia-administrativa/licitacoes/';
        for (const ano of anos(ctx)) {
          if (ctx.parar()) break;
          const links = [];
          await paginas(ctx, caminho, { exercicio: ano }, (m) => {
            const t = m.querySelector('table.table-listagem-conteudo-interno') || m;
            const l = linksDe(t, /\/licitacoes\/[0-9a-f-]{20,}\/detalhe\/?$/i, ctx.origem).filter((u) => !links.includes(u));
            links.push(...l); return l.length > 0;
          });
          for (const url of links) {
            await detalhe(ctx, url, async (html) => {
              const { m } = doc(html);
              const t = titulo(m);
              const c = kv(m);
              const mod = pega(c, 'modalidade');
              if (!/licita/i.test(t) || !mod) return { vazio: true };
              const nn = t.match(/n[ºo°]\s*(\S+?)\/(\d{4})/i);
              const numero = nn ? nn[1] : (t.match(/n[ºo°]\s*(\S+)/i) || [])[1] || null;
              const anoL = nn ? Number(nn[2]) : ano;
              const dt = data(pega(c, 'data'));
              const st = sem(pega(c, 'situacao'));
              const objeto = (pega(c, 'descricao', 'objeto') || '').slice(0, 4000);
              const andamento = /cancel|anulad/.test(st) ? 'anulada' : /revog/.test(st) ? 'revogada' : /suspens/.test(st) ? 'suspensa' : /desert/.test(st) ? 'deserta'
                : /fracass/.test(st) ? 'fracassada' : /homolog/.test(st) ? 'homologada' : /encerr|finaliz|conclu/.test(st) ? 'encerrada'
                : /abert/.test(st) && (!dt || dt >= HOJE()) ? 'aberta' : 'em_andamento';
              const docs = [];
              const anexos = elDe(c, 'anexos');
              for (const a of (anexos || m).querySelectorAll('a[href]')) {
                const u = await resolver(ctx, abs(a.getAttribute('href'), url));
                if (!u || !ehArquivo(u) || docs.some((x) => x.url === u)) continue;
                const tit = limpar(a.textContent) || 'Documento';
                docs.push({ url: u, titulo: tit.slice(0, 200), data: null, tipo: tipoDoc(tit, DOC_LIC, 'outro') });
              }
              return { ano: anoL, data: dt, chave: { modalidade: modalidadeDe(mod), numero, ano: anoL },
                registro: { origem: 'portal', modalidade: modalidadeDe(mod), numero, ano: anoL, processo: util(pega(c, 'processo')),
                  objeto: objeto.length >= 5 ? objeto : 'Licitação ' + mod + ' ' + (numero || '') + '/' + anoL, srp: /registro de preco/.test(sem(objeto)),
                  valor_estimado: valor(pega(c, 'valor estimado', 'valor')), data_publicacao: dt, data_abertura: dt ? dt + 'T00:00:00-03:00' : null, andamento },
                documentos: docs };
            }, 'licitação ' + url.replace(ctx.origem, ''));
          }
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // Contratos (o original; termos aditivos ficam para cadastrar dentro do contrato). Liga à licitação já migrada.
    contrato: {
      nome: 'Contratos', destino: 'Contratos', pntp: true, pasta: 'contratos',
      listas: [],
      async listar(ctx) {
        const caminho = '/transparencia/transparencia-administrativa/contratos/';
        for (const ano of await anosDaLista(ctx, caminho, 'ano', true)) {
          if (ctx.parar()) break;
          const links = [];
          await paginas(ctx, caminho, { ano }, (m) => {
            const l = linksDe(m.querySelector('table') || m, /\/contratos\/\d+\/resumo\/?$/, ctx.origem).filter((u) => !links.includes(u));
            links.push(...l); return l.length > 0;
          });
          for (const url of links) {
            await detalhe(ctx, url, async (html) => {
              const { m } = doc(html);
              const t = titulo(m);
              const c = kv(m);
              if (!/contrato|ata/i.test(t)) return { vazio: true };
              const numero = (t.match(/n[ºo°]\s*(\S+)/i) || [])[1] || null;
              const ini = data(pega(c, 'inicio da vigencia')), fim = data(pega(c, 'fim da vigencia')), dc = data(pega(c, 'data do contrato'));
              const anoC = anoDe(dc || ini) || ano;
              const mod = sem(pega(c, 'modalidade'));
              if (/aditiv|apostil/.test(mod)) return { ignorar: 'Termo aditivo/apostilamento: cadastre dentro do contrato original em Contratos', ano: anoC };
              const objeto = (pega(c, 'descricao', 'objeto') || '').slice(0, 4000);
              const contratado = (pega(c, 'contratado', 'fornecedor') || '').slice(0, 200);
              const lic = elDe(c, 'licitacao vinculada');
              const licA = lic && (lic.matches('a') ? lic : lic.querySelector('a[href]'));
              const docs = [];
              for (const a of (elDe(c, 'anexos') || m).querySelectorAll('a[href]')) {
                const u = await resolver(ctx, abs(a.getAttribute('href'), url));
                if (u && ehArquivo(u) && !docs.some((x) => x.url === u)) docs.push({ url: u, titulo: limpar(a.textContent) || 'Contrato' });
              }
              const prin = docs.find((d) => /contrato/i.test(d.titulo)) || docs[0];
              const nd = (contratado.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/) || [])[1];
              return { ano: anoC, data: dc || ini, chave: { numero, ano: anoC, contratado_nome: contratado },
                licitacaoUrl: licA ? abs(licA.getAttribute('href'), url) : null,
                registro: { origem: 'portal', tipo: /\bata\b/.test(sem(t + ' ' + mod)) ? 'ata_registro_precos' : 'contrato', numero, ano: anoC, processo: util(pega(c, 'processo')),
                  objeto: objeto.length >= 5 ? objeto : 'Contrato ' + (numero || ''), contratado_nome: contratado.length >= 2 ? contratado : 'Não informado no site antigo',
                  contratado_doc: nd ? nd.replace(/\D/g, '') : null,
                  valor_inicial: valor(pega(c, 'valor total', 'valor inicial', 'valor atualizado', 'valor')), data_assinatura: dc || ini || anoC + '-01-01',
                  vigencia_inicio: ini, vigencia_fim: fim && ini && fim >= ini ? fim : null },
                arquivos: prin ? [{ url: prin.url, campo: 'arquivo_url' }] : [], extras: docs.filter((d) => d !== prin) };
            }, 'contrato ' + url.replace(ctx.origem, ''));
          }
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // PPA, LDO, LOA e RGF pela exportação JSON de cada página (filtrada por exercício).
    conta: {
      nome: 'Planejamento e RGF (PPA, LDO, LOA, RGF)', destino: 'Planejamento e prestação de contas', pntp: true, pasta: 'contas',
      listas: [],
      async listar(ctx) {
        const PAG = [['ppa', 'ppa'], ['ldo', 'ldo'], ['loa', 'loa'], ['rgf', 'rgf']];
        const vistos = new Set();
        for (const [cam, tipo] of PAG) {
          const base = ctx.origem + '/transparencia/transparencia-administrativa/' + cam + '/';
          for (const ex of await anosDaLista(ctx, '/transparencia/transparencia-administrativa/' + cam + '/', 'exercicio', true)) {
            if (ctx.parar()) break;
            let linhas = null;
            try { const r = await ctx.ler(base + 'export/?format=json&exercicio=' + ex); linhas = JSON.parse(r.html); } catch (_) { linhas = null; }
            if (!Array.isArray(linhas)) { ctx.log(cam.toUpperCase() + ' ' + ex + ': exportação JSON não respondeu.'); continue; }
            for (const l of linhas) {
              const arq = abs(l['Arquivo'] || l['arquivo'], base);
              const exercicio = Number(l['Exercício'] || l['Exercicio']) || ex;
              if (!arq || vistos.has(arq)) continue; vistos.add(arq);
              const url = base + '#' + encodeURIComponent(arq.split('/').pop()) + '-' + exercicio;
              const per = sem(l['Período'] || l['Periodo']);
              const n = Number(l['Valor do período'] || l['Valor do periodo']) || null;
              const dt = data(l['Data publicação'] || l['Data publicacao']);
              let periodicidade = null, periodo = null;
              if (tipo === 'rgf') {
                periodicidade = /semestr/.test(per) ? 'semestral' : /quadrimestr/.test(per) ? 'quadrimestral' : null;
                periodo = n;
                if (!periodicidade || !periodo || periodo > (periodicidade === 'semestral' ? 2 : 3)) {
                  await ctx.emitir(url, { ignorar: 'RGF sem período reconhecível no site antigo (' + (l['Período'] || '?') + ' ' + (n || '') + ')', ano: exercicio }); continue;
                }
              }
              if (ctx.jaFeito && await ctx.jaFeito(url)) continue;
              await ctx.emitir(url, { ano: exercicio, data: dt, chave: { tipo, exercicio, periodo },
                registro: { tipo, exercicio, exercicio_fim: tipo === 'ppa' ? exercicio + 3 : null, periodicidade, periodo, descricao: null, data_publicacao: dt || HOJE() },
                arquivos: [{ url: arq, campo: 'arquivo_url' }] });
            }
          }
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    // 7.2 Diárias: só a tabela de valores (por nível/cargo e destino) com a norma. As portarias de concessão não vêm.
    diaria: {
      nome: 'Diárias — tabela de valores (sem as portarias)', destino: 'Diárias › Valores das diárias', semPeriodo: true, pasta: 'diarias',
      listas: [],
      async listar(ctx) {
        const url = ctx.origem + '/transparencia/transparencia-administrativa/diarias/';
        const r = await ctx.ler(url);
        const { m } = doc(r.html);
        const itens = [];
        const tab = [...m.querySelectorAll('table')].find((t) => /valor no estado/i.test(t.textContent));
        let ordem = 10;
        for (const tr of tab ? tab.querySelectorAll('tbody tr') : []) {
          const cel = [...tr.children];
          if (cel.length < 3) continue;
          const nivel = limpar((cel[0].querySelector('p') || {}).textContent);
          const a = cel[0].querySelector('a[href]');
          const norma = limpar(a ? a.textContent : cel[0].textContent).replace(/^regulament\S*:\s*/i, '');
          const vig = data((cel[0].textContent.match(/per[ií]odo:\s*([\d/]+)/i) || [])[1]);
          const cargo = limpar(cel[1].textContent);
          const grupo = (cargo + (nivel ? ' — nível ' + nivel : '')).slice(0, 200);
          [['estado', cel[2]], ['fora_estado', cel[3]], ['exterior', cel[4]]].forEach(([abr, td]) => {
            const v = td ? valor(td.textContent) : null;
            if (v == null) return;
            itens.push({ url: url + '#' + encodeURIComponent(sem(grupo) + '-' + abr + '-' + sem(norma)),
              x: { ano: null, chave: { grupo, abrangencia: abr, norma }, normaUrl: a ? abs(a.getAttribute('href'), url) : null,
                registro: { grupo, abrangencia: abr, valor: v, moeda: 'BRL', norma: (norma.length >= 3 ? norma : 'Norma do site antigo').slice(0, 300), vigencia_inicio: vig, ordem: ordem } } });
          });
          ordem += 10;
        }
        const total = (m.textContent.match(/Total de\s*(\d+)\s*registros/i) || [])[1];
        if (total) ctx.log(total + ' portaria(s) de concessão de diárias deixada(s) de fora (Diárias segue no sistema de pessoal).');
        return itens;
      }
    },
    // ---------------------------------------------------------------
    // 5.1 a 5.3 Convênios e transferências (recebidas, realizadas, acordos sem repasse) + a lista antiga "Convênios".
    convenio: {
      nome: 'Convênios e transferências', destino: 'Convênios e transferências', pntp: true, pasta: 'convenios',
      listas: [],
      async listar(ctx) {
        const FONTES = [['/transparencia/convenios/recebidos/', 'recebida'], ['/transparencia/convenios/transferencias-realizadas/', 'realizada'],
          ['/transparencia/convenios/acordos-sem-transferencia/', 'sem_repasse']];
        const instrumento = (t) => { const s = sem(t); return /fomento/.test(s) ? 'termo_fomento' : /colabora/.test(s) ? 'termo_colaboracao' : /cooperac/.test(s) ? 'acordo_cooperacao'
          : /repasse/.test(s) && /contrato/.test(s) ? 'contrato_repasse' : /especial|pix/.test(s) ? 'transferencia_especial' : /fundo a fundo/.test(s) ? 'fundo_a_fundo'
          : /duodecimo/.test(s) ? 'outro' : /conveni/.test(s) ? 'convenio' : 'outro'; };
        const andamento = (t) => { const s = sem(t); return /conclu|encerr|finaliz/.test(s) ? 'concluido' : /presta/.test(s) ? 'prestacao_contas' : /rescind/.test(s) ? 'rescindido'
          : /cancel/.test(s) ? 'cancelado' : /aprovad/.test(s) ? 'contas_aprovadas' : /rejeit|reprov/.test(s) ? 'contas_rejeitadas' : 'em_execucao'; };
        for (const [cam, tipo] of FONTES) {
          if (ctx.parar()) break;
          const links = [];
          await paginas(ctx, cam, {}, (m) => {
            const l = linksDe(m.querySelector('table') || m, /\/transparencia\/convenios\/\d+\/?$/, ctx.origem).filter((u) => !links.includes(u));
            links.push(...l); return l.length > 0;
          });
          for (const url of links) {
            await detalhe(ctx, url, (html) => {
              const { m } = doc(html);
              const c = kv(m);
              const objeto = (pega(c, 'objeto detalhado', 'objeto') || '').slice(0, 2000);
              if (!objeto) return { vazio: true };
              const ass = data(pega(c, 'data de assinatura')), ini = data(pega(c, 'inicio da vigencia')), fim = data(pega(c, 'fim da vigencia'));
              const ano = anoDe(ass || ini) || Number((pega(c, 'numero') || '').match(/(\d{4})/) ? pega(c, 'numero').match(/(\d{4})/)[1] : 0) || null;
              const conc = pega(c, 'orgao concedente', 'concedente'), conv = pega(c, 'orgao convenente', 'convenente');
              const parte = (tipo === 'recebida' ? conc : tipo === 'realizada' ? conv : [conc, conv].filter(Boolean).join('; ')) || conc || conv || '';
              const arq = [...m.querySelectorAll('a[href]')].map((a) => abs(a.getAttribute('href'), url)).find(ehArquivo);
              const semValor = tipo === 'sem_repasse';
              return { ano, data: ass || ini, chave: { tipo, numero: pega(c, 'numero'), ano, objeto: objeto.slice(0, 120) },
                registro: { tipo, instrumento: instrumento(titulo(m) + ' ' + objeto + ' ' + (pega(c, 'natureza') || '')), numero: (pega(c, 'numero') || '').slice(0, 40) || null,
                  processo: null, objeto: objeto.length >= 5 ? objeto : 'Convênio ' + (pega(c, 'numero') || ''), parte_nome: (parte.length >= 2 ? parte : 'Não informado no site antigo').slice(0, 500),
                  valor_previsto: semValor ? null : valor(pega(c, 'valor total')), valor_contrapartida: semValor ? null : valor(pega(c, 'contrapartida')),
                  valor_repassado: semValor ? null : valor(pega(c, 'ja repassado')), data_assinatura: ass, vigencia_inicio: ini, vigencia_fim: fim && ini && fim >= ini ? fim : null,
                  andamento: andamento(pega(c, 'situacao atual', 'situacao')) },
                arquivos: arq ? [{ url: arq, campo: 'arquivo_url' }] : [] };
            }, 'convênio ' + url.replace(ctx.origem, ''));
          }
        }
        // Lista antiga "Convênios" (uma linha por convênio, sem página de detalhe)
        await paginas(ctx, '/transparencia/convenios-arquivo/', {}, async (m) => {
          const tab = [...m.querySelectorAll('table')].find((t) => /inteiro teor/i.test(t.textContent));
          if (!tab) return false;
          const cab = [...tab.querySelectorAll('thead th')].map((th) => sem(th.textContent));
          const col = (tr, re) => { const i = cab.findIndex((h) => re.test(h)); return i >= 0 && tr.children[i] ? limpar(tr.children[i].textContent) : ''; };
          let n = 0;
          for (const tr of tab.querySelectorAll('tbody tr')) {
            const objeto = col(tr, /objeto/); if (!objeto || /nenhum registro/i.test(objeto)) continue;
            n++;
            const num = col(tr, /numero/);
            const vig = col(tr, /vigencia/).match(/\d{2}\/\d{2}\/\d{4}/g) || [];
            const ini = data(vig[0]), fim = data(vig[1]);
            const ano = Number((num.match(/(\d{4})/) || [])[1]) || anoDe(ini);
            const a = [...tr.querySelectorAll('a[href]')].map((x) => abs(x.getAttribute('href'), ctx.origem)).find(ehArquivo);
            const url = ctx.origem + '/transparencia/convenios-arquivo/#' + encodeURIComponent(num + '-' + sem(objeto).slice(0, 60));
            if (ctx.jaFeito && await ctx.jaFeito(url)) continue;
            await ctx.emitir(url, { ano, data: ini, chave: { tipo: 'recebida', numero: num, ano, objeto: objeto.slice(0, 120) },
              registro: { tipo: 'recebida', instrumento: instrumento(col(tr, /categoria/) + ' ' + objeto), numero: num.slice(0, 40) || null, processo: null, objeto: objeto.slice(0, 2000),
                parte_nome: (col(tr, /repassador|concedente/) || 'Não informado no site antigo').slice(0, 500), valor_previsto: valor(col(tr, /valor total/)),
                valor_repassado: valor(col(tr, /repassad/)), data_assinatura: null, vigencia_inicio: ini, vigencia_fim: fim && ini && fim >= ini ? fim : null, andamento: 'em_execucao' },
              arquivos: a ? [{ url: a, campo: 'arquivo_url' }] : [] });
          }
          return n > 0;
        });
        return [];
      }
    },
    // ---------------------------------------------------------------
    // Obras públicas (lista + detalhe). Leitura pelos rótulos comuns do modelo.
    obra: {
      nome: 'Obras públicas', destino: 'Obras', pntp: true, pasta: 'obras',
      listas: [],
      async listar(ctx) {
        const links = [];
        await paginas(ctx, '/institucional/obras-publicas/', {}, (m) => {
          const t = [...m.querySelectorAll('table')].find((x) => /contratada/i.test(x.textContent)) || m;
          const l = [...t.querySelectorAll('tbody a[href]')].map((a) => abs(a.getAttribute('href'), ctx.origem)).filter((u) => u && /obras?-publicas?\/.+/.test(u) && !/export|paralisadas\/?$/.test(u) && !links.includes(u));
          links.push(...new Set(l)); return l.length > 0;
        });
        for (const url of links) {
          await detalhe(ctx, url, (html) => {
            const { m } = doc(html);
            const c = kv(m);
            const tit = (pega(c, 'obra', 'descricao', 'titulo', 'objeto') || titulo(m) || '').slice(0, 300);
            if (tit.length < 3) return { vazio: true };
            const ini = data(pega(c, 'data de inicio', 'inicio da obra', 'inicio')), prev = data(pega(c, 'previsao', 'data prevista', 'termino previsto'));
            const conc = data(pega(c, 'data de conclusao', 'conclusao', 'termino'));
            const st = sem(pega(c, 'situacao', 'status') || '');
            const sit = /paralis/.test(st) ? 'paralisada' : /conclu|finaliz/.test(st) ? 'concluida' : /cancel/.test(st) ? 'cancelada' : /nao inic/.test(st) ? 'nao_iniciada' : 'em_andamento';
            const ano = anoDe(ini || prev) || anoDe(data(m.textContent));
            const pct = Number(String(pega(c, 'percentual', 'execucao') || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*%/) ? String(pega(c, 'percentual', 'execucao')).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*%/)[1] : 0);
            const docs = [...m.querySelectorAll('a[href]')].map((a) => ({ url: abs(a.getAttribute('href'), url), titulo: limpar(a.textContent) || 'Documento' })).filter((d) => ehArquivo(d.url));
            const medicoes = docs.filter((d) => /medi[cç][aã]o/i.test(d.titulo)).map((d, i) => ({ url: d.url, numero: Number((d.titulo.match(/(\d+)/) || [])[1]) || i + 1, descricao: d.titulo, data: null }));
            const fim = sit === 'concluida' ? (conc || prev || ini) : null;
            return { ano, data: ini, chave: { titulo: tit },
              registro: { titulo: (tit.length >= 5 ? tit : 'Obra ' + tit), descricao: null, local: (pega(c, 'localizacao', 'local', 'endereco') || '').slice(0, 300) || null,
                contratada_nome: (pega(c, 'contratada', 'empresa') || '').slice(0, 200) || null, valor_contratado: valor(pega(c, 'investimento', 'valor')),
                situacao_obra: sit, percentual: sit === 'concluida' ? 100 : Math.min(100, pct || 0), data_inicio: ini,
                previsao_conclusao: prev && ini && prev >= ini ? prev : null, data_conclusao: fim && ini && fim < ini ? ini : fim },
              medicoes, outros: docs.filter((d) => !medicoes.some((x) => x.url === d.url)) };
          }, 'obra ' + url.replace(ctx.origem, ''));
        }
        return [];
      }
    },
    // ---------------------------------------------------------------
    faq: {
      nome: 'Perguntas frequentes', destino: 'Perguntas frequentes', semPeriodo: true, pasta: 'faq',
      listas: [],
      async listar(ctx) {
        const r = await ctx.ler(ctx.origem + '/institucional/faq/');
        const { m } = doc(r.html);
        const itens = []; let ordem = 10;
        for (const it of m.querySelectorAll('.accordion-item')) {
          const pergunta = limpar((it.querySelector('.accordion-header, button') || {}).textContent);
          const corpo = it.querySelector('.accordion-collapse, .item-dropdown-content');
          const resposta = corpo ? ([...corpo.querySelectorAll('p, li')].map((p) => limpar(p.textContent)).filter(Boolean).join('\n\n') || limpar(corpo.textContent)) : '';
          if (pergunta.length < 5 || !resposta) continue;
          const p = pergunta.charAt(0) + pergunta.slice(1).toLowerCase();   // "COMO UTILIZAR…?" → "Como utilizar…?"
          itens.push({ url: ctx.origem + '/institucional/faq/#' + encodeURIComponent(sem(pergunta).slice(0, 80)),
            x: { ano: null, chave: { pergunta: p }, registro: { pergunta: (pergunta === pergunta.toUpperCase() ? p : pergunta).slice(0, 300), resposta, categoria: null, ordem: ordem++ } } });
        }
        return itens;
      }
    }
  };

  window.MIGRACAO_ADAPTADORES = window.MIGRACAO_ADAPTADORES || {};
  window.MIGRACAO_ADAPTADORES.plataforma_b = {
    nome: 'Plataforma B (IntGest)',
    descricao: 'Câmaras com site da IntGest: /parlamentares, /atividade-legislativa, /institucional/legislacao, /transparencia/transparencia-administrativa…',
    reconhece: (html) => /intgest\.com\.br|intellgest-sigl-media/i.test(html) && /\/parlamentares\/|\/atividade-legislativa\/|\/transparencia\//.test(html),
    // Os arquivos ficam num armazenamento de fora do site (não no endereço do órgão).
    hostsArquivos: ['intellgest-sigl-media.s3.amazonaws.com'],
    secoes: SECOES,
    maiorId: () => 0,
    util: { data, dataExtenso, valor, kv, limpar }
  };
})();
