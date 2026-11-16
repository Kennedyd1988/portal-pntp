// =====================================================================
// Módulo "Migração do site antigo" (0.23.0; leitura pelo navegador 0.23.3) — Suporte SOFT+
// Traz para o portal o conteúdo do site que o órgão já tinha: leis e decretos,
// licitações com documentos, contratos, concursos, contas públicas e notícias;
// nas Câmaras (Plataforma B, 0.39.0), também vereadores, Mesa, comissões,
// proposições, sessões, diárias (tabela de valores) e convênios.
// Período: 3 anos (exercício atual e os 2 anteriores) no que pontua no PNTP e
// 2 anos no restante. Os arquivos são copiados para o portal (o site antigo sai
// do ar quando o domínio muda). Rodar de novo não duplica (migracao_itens).
//
// Leitura do site antigo: função de servidor migrar-site. Gravação: com o login
// de quem está usando, pelas mesmas regras do banco das outras telas.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, traduzirErro } = P;
  const ANO = new Date().getFullYear();
  const PARAR_APOS = 30;      // ids seguidos fora do período (ou vazios) para encerrar a varredura
  const PARALELO = 2;

  let conteiner = null, cfg = {}, adaptador = null, resumo = {}, espaco = null, editandoOrigem = false;
  const estado = {};          // por seção: { itens, arquivos, bytes, rodando, parar, log }

  const org = () => P.estado.orgao.id;
  // Período escolhido na tela (configuracoes.migracao.periodo): { pntp, outros } = ano inicial ou 'todos'.
  // Padrão: 3 exercícios no que pontua no PNTP; todos os anos no restante (notícias).
  const TODOS_DESDE = 1990;
  const escolhaPeriodo = (s) => { const p = (cfg.migracao && cfg.migracao.periodo) || {}; return s.pntp ? (p.pntp || String(ANO - 2)) : (p.outros || 'todos'); };
  const periodo = (s) => {
    if (s.semPeriodo) return { de: 0, ate: ANO };
    const v = escolhaPeriodo(s);
    return { de: v === 'todos' ? TODOS_DESDE : Math.min(ANO, Number(v) || ANO - 2), ate: ANO };
  };
  const rotuloPeriodo = (s) => { if (s.semPeriodo) return 'Conteúdo fixo'; const { de } = periodo(s); return de <= TODOS_DESDE ? 'Todos os anos' : de === ANO ? 'Só ' + ANO : (ANO - de + 1) + ' anos'; };
  const mb = (b) => b == null ? '?' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  // Erros passageiros (banco ou função ocupados, rede) são repetidos com espera crescente;
  // só param a varredura os erros definitivos (função ausente, sem permissão, sem origem).
  async function servidorUmaVez(corpo) {
    const { data, error } = await sb.functions.invoke('migrar-site', { body: Object.assign({ orgao_id: org() }, corpo) });
    if (error) {
      const st = error.context && error.context.status;
      if (st === 404) throw new Error('A função "migrar-site" não está instalada na Supabase.');
      if (st === 401) throw new Error('Sua sessão expirou. Entre novamente.');
      let det = null;
      try { det = error.context && typeof error.context.json === 'function' ? await error.context.json() : null; } catch (_) { /* sem corpo */ }
      if (det && det.erro && !det.temporario) throw new Error(det.erro);
      const e = new Error((det && det.erro) || error.message || 'Falha passageira.'); e.passageiro = true; throw e;
    }
    if (!data || !data.ok) throw new Error((data && data.erro) || 'Falha na leitura do site antigo.');
    return data;
  }
  async function servidor(corpo) {
    for (let i = 0; ; i++) {
      try { return await servidorUmaVez(corpo); }
      catch (e) {
        if (!e.passageiro || i >= 5) throw e;
        await espera(2000 * (i + 1));
      }
    }
  }
  // ---------------- ponte pelo navegador (coletor.js) ----------------
  // Sites que bloqueiam servidores de nuvem são lidos pelo navegador de quem usa:
  // o painel abre o site antigo numa aba, a pessoa clica no favorito "Coletor SOFT+"
  // e o coletor atende os pedidos de página e arquivo por mensagens entre as abas.
  const COLETOR = new URL('coletor.js', location.href).href;
  const FAVORITO = "javascript:(function(){var s=document.createElement('script');s.src='" + COLETOR + "?'+Date.now();document.body.appendChild(s);})();";
  const ponte = { janela: null, origem: null, pronto: false, seq: 0, pend: new Map() };
  const semWww = (h) => String(h || '').replace(/^www\./, '').toLowerCase();
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || !d.softColetor || !cfg.migracao || !cfg.migracao.origem) return;
    let host = ''; try { host = semWww(new URL(ev.origin).host); } catch (_) { return; }
    if (host !== semWww(new URL(cfg.migracao.origem).host)) return;
    if (d.softColetor === 'pronto') {
      ponte.janela = ev.source; ponte.origem = ev.origin; ponte.pronto = true;
      toast('Coletor conectado: o site antigo será lido pelo navegador.');
      if (caixaPonte) desenharPonte();
      // Ainda sem modelo reconhecido (o servidor estava bloqueado): reconhece agora, sem precisar clicar de novo.
      if (!cfg.migracao.plataforma) reconhecer(false).then(() => carregar()).then(() => { if (conteiner && conteiner.isConnected) desenhar(); }).catch(() => {});
    } else if (d.softColetor === 'resposta' && ponte.pend.has(d.id)) {
      const { ok, falhou, t } = ponte.pend.get(d.id); ponte.pend.delete(d.id); clearTimeout(t);
      if (d.ok) ok(d);
      else { const e = new Error(d.erro || 'Falha no coletor.'); if (!/fora do site|desconhecido/.test(e.message)) e.passageiro = true; falhou(e); }
    }
  });
  function viaPonte(acao, dados) {
    if (!ponte.janela || ponte.janela.closed) {
      ponte.pronto = false; if (caixaPonte) desenharPonte();
      return Promise.reject(new Error('A aba do coletor foi fechada. Clique em "Ler pelo navegador" de novo.'));
    }
    return new Promise((ok, falhou) => {
      const id = ++ponte.seq;
      const t = setTimeout(() => { if (ponte.pend.delete(id)) { const e = new Error('O site antigo não respondeu.'); e.passageiro = true; falhou(e); } }, 90000);
      ponte.pend.set(id, { ok, falhou, t });
      ponte.janela.postMessage(Object.assign({ softColetor: 'pedido', id, acao }, dados), ponte.origem);
    });
  }
  async function viaPonteRepetindo(acao, dados) {
    for (let i = 0; ; i++) {
      try { return await viaPonte(acao, dados); }
      catch (e) { if (!e.passageiro || i >= 3) throw e; await espera(1500 * (i + 1)); }
    }
  }
  function abrirColetor() {
    if (!cfg.migracao || !cfg.migracao.origem) { toast('Salve antes o endereço do site antigo.', true); return; }
    ponte.pronto = false;
    ponte.janela = window.open(cfg.migracao.origem + '/', 'soft_coletor');
    if (!ponte.janela) { toast('O navegador bloqueou a nova aba. Permita janelas deste site e tente de novo.', true); return; }
    desenharPonte();
  }
  let caixaPonte = null;
  function desenharPonte() {
    if (!caixaPonte) return;
    // Painel embutido no site antigo (favorito clicado direto no site): pede ao coletor para se anunciar.
    if (!ponte.pronto && window.parent !== window) { try { window.parent.postMessage({ softColetor: 'ping' }, '*'); } catch (_) { /* ok */ } }
    const fav = el('a', { class: 'btn btn-claro', title: 'Arraste para a barra de favoritos' }, '⭐ Coletor SOFT+');
    fav.setAttribute('href', FAVORITO);
    fav.addEventListener('click', (e) => { e.preventDefault(); toast('Arraste este botão para a barra de favoritos (não clique aqui).'); });
    const btn = el('button', { type: 'button', class: 'btn btn-claro' }, ponte.pronto ? 'Reabrir site antigo' : 'Ler pelo navegador');
    btn.addEventListener('click', abrirColetor);
    caixaPonte.replaceChildren(
      el('p', { class: ponte.pronto ? 'msg msg-ok' : 'ajuda' }, ponte.pronto
        ? '✔ Lendo pelo navegador (coletor conectado). Deixe a aba do site antigo aberta.'
        : 'Leitura pelo servidor. Se o site antigo bloquear o servidor (análise para com "não respondeu" ou "Não achei itens"), leia pelo navegador: ' +
          '1) arraste o botão ⭐ Coletor SOFT+ para a barra de favoritos (só na primeira vez); 2) clique em "Ler pelo navegador"; 3) na aba do site antigo que abrir, clique no favorito.'),
      el('div', { class: 'linha-botoes mt-05' }, btn, fav));
  }

  // ---------------- ritmo gentil com o site antigo ----------------
  // Sites de prefeitura costumam ficar em servidores pequenos e bloqueiam quem pede rápido demais
  // (o bloqueio pode pegar o próprio computador de quem está migrando). Por isso: no máximo 2 leituras
  // ao mesmo tempo, um intervalo entre elas e, se o site parar de responder, uma pausa automática crescente.
  const RITMO = { maximo: 3, intervalo: 500, emUso: 0, ultimo: 0, descansoAte: 0, falhasSeguidas: 0, avisado: false };
  async function comRitmo(fn) {
    for (;;) {
      const agora = Date.now();
      if (agora < RITMO.descansoAte) { await espera(Math.min(5000, RITMO.descansoAte - agora)); continue; }
      if (RITMO.emUso >= RITMO.maximo || agora - RITMO.ultimo < RITMO.intervalo) { await espera(150); continue; }
      break;
    }
    RITMO.emUso++; RITMO.ultimo = Date.now();
    try {
      const r = await fn();
      RITMO.falhasSeguidas = 0;
      return r;
    } catch (e) {
      if (e.passageiro || /não respondeu|timed out|Failed to fetch/i.test(e.message || '')) {
        RITMO.falhasSeguidas++;
        if (RITMO.falhasSeguidas >= 3) {
          const minutos = Math.min(10, RITMO.falhasSeguidas - 1);
          RITMO.descansoAte = Date.now() + minutos * 60000;
          toast('O site antigo parou de responder: pausa automática de ' + minutos + ' min para não ser bloqueado. Depois continua sozinho.', true);
        }
      }
      throw e;
    } finally { RITMO.emUso--; }
  }

  // op: { metodo: 'POST', corpo: 'a=1&b=2' } para as seções que leem dados por formulário (ex.: obras)
  async function pagina(url, tentativas, op) {
    return comRitmo(() => paginaSemRitmo(url, tentativas, op));
  }
  async function paginaSemRitmo(url, tentativas, op) {
    const extra = op && op.metodo ? { metodo: op.metodo, corpo: op.corpo || '' } : {};
    if (ponte.pronto) return viaPonteRepetindo('pagina', Object.assign({ url }, extra));
    for (let i = 0; i < (tentativas || 3); i++) {
      try { return await servidor(Object.assign({ acao: 'pagina', url }, extra)); }
      catch (e) { if (i === (tentativas || 3) - 1 || /instalada|Cadastre|Só o Suporte|sessão expirou/.test(e.message)) throw e; await espera(1500 * (i + 1)); }
    }
  }

  async function carregar() {
    const [o, r, a] = await Promise.all([
      sb.from('orgaos').select('configuracoes, dominio').eq('id', org()).maybeSingle(),
      sb.rpc('migracao_resumo', { p_orgao: org() }),
      sb.rpc('armazenamento_orgao', { p_orgao: org() })
    ]);
    if (r.error) throw r.error;
    cfg = (o.data && o.data.configuracoes) || {};
    resumo = Object.fromEntries((r.data || []).map((x) => [x.secao, x]));
    espaco = a.error ? null : (a.data || []).reduce((t, x) => t + Number(x.bytes || 0), 0);
    adaptador = window.MIGRACAO_ADAPTADORES[(cfg.migracao && cfg.migracao.plataforma) || 'plataforma_a'] || null;
  }

  // ---------------- origem ----------------
  async function salvarOrigem(input, btn) {
    let url = input.value.trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//.test(url)) url = 'https://' + url;
    try { new URL(url); } catch (e) { toast('Informe o endereço completo do site antigo, ex.: https://www.municipio.rn.gov.br', true); return; }
    ocupado(btn, 'Conferindo…');
    try {
      // Grava o endereço antes de ler o site: mesmo que a leitura falhe, ele fica guardado.
      const mig = Object.assign({}, cfg.migracao || {}, { origem: url });
      if (((cfg.migracao || {}).origem || '') !== url) delete mig.plataforma;
      cfg = await P.mesclarConfiguracoes({ migracao: mig });
      editandoOrigem = false;
      await reconhecer(true);
      await carregar(); desenhar();
    } catch (e) {
      toast(e.message || traduzirErro(e), true);
      try { await carregar(); desenhar(); } catch (_) { /* fica a tela como está */ }
    }
    finally { ocupado(btn); }
  }
  // Lê a página inicial do site antigo e guarda qual modelo ele usa. Feito uma vez só:
  // ao abrir a tela de novo, o endereço e o modelo já vêm guardados.
  async function reconhecer(avisar) {
    const p = await pagina(cfg.migracao.origem + '/');
    const qual = Object.entries(window.MIGRACAO_ADAPTADORES).find(([, a]) => a.reconhece(p.html));
    cfg = await P.mesclarConfiguracoes({ migracao: Object.assign({}, cfg.migracao, { plataforma: qual ? qual[0] : null, reconhecido_em: new Date().toISOString() }) });
    if (avisar || qual) toast(qual ? 'Site antigo reconhecido: ' + qual[1].nome + '.' : 'O site respondeu, mas o modelo dele ainda não é conhecido pela ferramenta.', !qual);
    return qual;
  }

  // ---------------- varredura ----------------
  // Do maior id para baixo; para depois de PARAR_APOS ids seguidos fora do período.
  async function varrer(chave, s, aoItem) {
    const st = estado[chave];
    const origem = cfg.migracao.origem;
    // Seções que leem uma lista pronta (JSON, página única, páginas com subpáginas)
    if (s.listar) {
      const { de } = periodo(s);
      // emitir: a seção entrega item por item enquanto lê (importa sem esperar ler tudo).
      // Até 3 itens tratados ao mesmo tempo enquanto a leitura segue (o download de cada PDF é lento).
      const emCurso = new Set();
      const entregar = async (url, x) => {
        if (st.parar || !x || x.vazio || x.foraPeriodo) return;
        if (!s.semPeriodo && !x.semPeriodo && (!x.ano || x.ano < de) && !x.ignorar) return;
        while (emCurso.size >= 3) await Promise.race(emCurso);
        const p = Promise.resolve(aoItem(url, x)).catch((e) => { st.log.unshift(url.replace(origem, '') + ': ' + e.message); }).finally(() => emCurso.delete(p));
        emCurso.add(p);
      };
      // Na importação, o que já veio (e completo) nem é relido: retomar fica rápido.
      const jaFeito = st.rodando === 'importacao' ? async (url) => {
        const j = await jaMigrado(url);
        const ok = !!j && j.situacao !== 'erro' && !(j.situacao === 'importado' && FALTOU_ARQUIVO.test(j.detalhe || ''));
        if (ok) { st.feitos = (st.feitos || 0) + 1; st.texto = st.feitos + ' processados (já trazidos antes são pulados)…'; atualizarCartao(chave); }
        return ok;
      } : null;
      const itens = await s.listar({ origem, de, ler: (url, op) => pagina(url, 3, op), parar: () => st.parar, emitir: entregar, jaFeito,
        log: (t) => { st.log.unshift(t); atualizarCartao(chave); } });
      for (const it of itens || []) { if (st.parar) break; await entregar(it.url, it.x); }
      await Promise.all(emCurso);
      return;
    }
    let maior = 0;
    for (const l of s.listas) {
      try { const p = await pagina(origem + l); maior = Math.max(maior, adaptador.maiorId(p.html, new RegExp(s.reId.source, 'g'))); } catch (e) { /* tenta a próxima */ }
      if (maior) break;
    }
    if (!maior) throw new Error('Não achei itens desta seção no site antigo.' + (ponte.pronto ? '' : ' Se o site bloqueia o servidor, use "Ler pelo navegador".'));
    const { de } = periodo(s);
    let fora = 0, id = maior + 5;   // alguns ids acima do maior visível (itens recentes ainda não listados)
    while (id > 0 && fora < (s.pararApos || PARAR_APOS) && !st.parar) {
      const lote = [];
      for (let k = 0; k < PARALELO && id > 0; k++, id--) lote.push(id);
      const res = await Promise.all(lote.map(async (n) => {
        const url = s.url(origem, n);
        try { const p = await pagina(url); return { n, url, x: p.status === 200 ? s.ler(p.html, url) : { vazio: true } }; }
        catch (e) { return { n, url, erro: e.message }; }
      }));
      for (const r of res.sort((a, b) => b.n - a.n)) {
        if (r.erro) {
          if (/instalada|Cadastre|Só o Suporte|sessão expirou/.test(r.erro)) throw new Error(r.erro);
          st.log.unshift('id ' + r.n + ': ' + r.erro); continue;   // erro de leitura não conta como "fora do período"
        }
        if (r.x.vazio) { fora++; continue; }
        if (!s.semPeriodo && (!r.x.ano || r.x.ano < de)) { fora++; continue; }
        fora = 0;
        await aoItem(r.url, r.x, r.n);
      }
      st.ultimoId = id;
      atualizarCartao(chave);
    }
  }

  async function analisar(chave) {
    const s = adaptador.secoes[chave], st = estado[chave] = { itens: [], arquivos: [], bytes: 0, rodando: 'analise', parar: false, log: [] };
    atualizarCartao(chave);
    try {
      await varrer(chave, s, async (url, x) => {
        st.itens.push({ url, x });
        for (const a of [].concat(x.arquivos || [], x.documentos || [], x.medicoes || [], x.arquivosTexto || [], x.anexos || [])) st.arquivos.push(a.url);
        st.texto = st.itens.length + ' itens encontrados até agora (' + st.arquivos.length + ' arquivos)…';
      });
      st.texto = 'Medindo o tamanho dos arquivos…'; atualizarCartao(chave);
      const unicos = [...new Set(st.arquivos)];
      let medidos = 0, semTamanho = 0;
      for (let i = 0; i < unicos.length && !st.parar; i += 10) {
        const r = await comRitmo(() => ponte.pronto ? viaPonteRepetindo('medir', { urls: unicos.slice(i, i + 10) }) : servidor({ acao: 'medir', urls: unicos.slice(i, i + 10) }));
        for (const t of r.tamanhos) { if (t.bytes) st.bytes += t.bytes; else semTamanho++; }
        medidos += r.tamanhos.length;
        st.texto = 'Medindo arquivos: ' + medidos + ' de ' + unicos.length + '…'; atualizarCartao(chave);
      }
      if (semTamanho && medidos > semTamanho) st.bytes = Math.round(st.bytes * medidos / (medidos - semTamanho));
      const anos = {}; st.itens.forEach((i) => { anos[i.x.ano || 'sem ano'] = (anos[i.x.ano || 'sem ano'] || 0) + 1; });
      st.texto = st.itens.length + ' itens' + (s.semPeriodo ? '' : ' de ' + Object.keys(anos).sort().map((a) => a + ' (' + anos[a] + ')').join(', ')) +
        ' · ' + unicos.length + ' arquivos · cerca de ' + mb(st.bytes) + (semTamanho ? ' (' + semTamanho + ' sem tamanho informado: estimado)' : '');
      st.analisado = true;
    } catch (e) { st.texto = 'Parou: ' + e.message; }
    st.rodando = null; atualizarCartao(chave); desenharEspaco();
  }

  // Todas as seções, uma por vez (não sobrecarrega o site antigo nem o banco). Não grava nada.
  async function analisarTodas(btn) {
    ocupado(btn, 'Analisando…');
    try {
      const fila = Object.keys(adaptador.secoes).filter((k) => !(estado[k] && (estado[k].rodando || estado[k].analisado)));
      const trabalhar = async () => { while (fila.length) await analisar(fila.shift()); };
      await trabalhar();
      toast('Análise concluída. Confira cada seção antes de importar.');
    } finally { ocupado(btn); }
  }

  // ---------------- importação ----------------
  async function jaMigrado(url) {
    const { data } = await sb.from('migracao_itens').select('situacao, detalhe, tabela, registro_id').eq('orgao_id', org()).eq('origem_url', url).maybeSingle();
    return data;
  }
  async function marcar(url, chave, tabela, id, x, situacao, detalhe, bytes) {
    await sb.from('migracao_itens').upsert({ orgao_id: org(), origem_url: url, secao: chave, tabela, registro_id: id || null, ano: x && x.ano || null,
      situacao, detalhe: detalhe ? String(detalhe).slice(0, 500) : null, bytes: bytes || null }, { onConflict: 'orgao_id,origem_url' });
  }
  async function copiar(url, pasta) {
    try {
      if (ponte.pronto) return await copiarPeloNavegador(url, pasta);
      const r = await comRitmo(() => servidor({ acao: 'copiar', url, pasta })); return { url: r.url_publica, bytes: r.bytes || 0 };
    }
    catch (e) { return { erro: e.message }; }
  }
  // Mesmo nome de arquivo da função de servidor (sha1 do endereço sem protocolo/www): não duplica entre os dois modos.
  const TIPOS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.oasis.opendocument.text': 'odt',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods', 'application/zip': 'zip', 'text/csv': 'csv' };
  const EXT_TIPO = Object.fromEntries(Object.entries(TIPOS).map(([t, e]) => [e, t]));
  async function sha1(t) {
    const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function copiarPeloNavegador(url, pastaPedida) {
    const pasta = String(pastaPedida || 'geral').replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || 'geral';
    const dir = org() + '/migracao/' + pasta;
    const nome = await sha1(url.replace(/^https?:\/\/(www\.)?/, ''));
    const { data: ja } = await sb.storage.from('arquivos').list(dir, { search: nome });
    if (ja && ja.length) return { url: sb.storage.from('arquivos').getPublicUrl(dir + '/' + ja[0].name).data.publicUrl, bytes: (ja[0].metadata && ja[0].metadata.size) || 0 };
    const r = await comRitmo(() => viaPonteRepetindo('arquivo', { url }));
    const blob = r.blob;
    if (!blob || !blob.size) throw new Error('Arquivo vazio no site antigo.');
    if (blob.size > 50 * 1048576) throw new Error('Arquivo maior que 50 MB: fica só o link.');
    let tipo = r.tipo || '';
    let ext = TIPOS[tipo] || ((String(r.nome || '').match(/\.([a-z0-9]{2,4})$/i) || [])[1] || '').toLowerCase();
    if (!TIPOS[tipo] && EXT_TIPO[ext]) tipo = EXT_TIPO[ext];
    const ini = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (ini[0] === 0x25 && ini[1] === 0x50 && ini[2] === 0x44 && ini[3] === 0x46) { tipo = 'application/pdf'; ext = 'pdf'; }
    if (!EXT_TIPO[ext]) throw new Error('Tipo de arquivo não aceito (' + (tipo || ext || 'desconhecido') + ').');
    const caminho = dir + '/' + nome + '.' + ext;
    // Arquivo que o site antigo manda sem tipo (ex.: .docx): grava com o tipo certo, senão o armazenamento recusa.
    const corpo = blob.type === tipo ? blob : new Blob([blob], { type: tipo });
    const { error } = await sb.storage.from('arquivos').upload(caminho, corpo, { contentType: tipo, upsert: false });
    if (error && !/exist|duplicate/i.test(error.message || '')) throw new Error('Não foi possível gravar o arquivo: ' + error.message);
    return { url: sb.storage.from('arquivos').getPublicUrl(caminho).data.publicUrl, bytes: blob.size };
  }
  const FALTOU_ARQUIVO = /Failed to fetch|não copiad|Sem arquivo|não respondeu|timed out|tempo/i;
  // Registro que já existe mas ficou sem o arquivo (cópia falhou antes): copia agora e completa.
  async function completarArquivo(tabela, id, x, s, publicar) {
    const { data: r } = await sb.from(tabela).select('arquivo_url, situacao').eq('id', id).maybeSingle();
    if (!r || r.arquivo_url || !x.arquivos || !x.arquivos[0]) return { situacao: 'ja_existia' };
    const a = await copiar(x.arquivos[0].url, s.pasta);
    if (!a.url) return { situacao: 'importado', id, tabela, aviso: 'Arquivo ainda não copiado: ' + a.erro };
    const mud = { arquivo_url: a.url };
    if (publicar && r.situacao === 'rascunho') mud.situacao = 'publicado';
    const { error } = await sb.from(tabela).update(mud).eq('id', id);
    if (error) throw error;
    return { situacao: 'importado', id, tabela, bytes: a.bytes, aviso: null };
  }
  // Já existe no portal (cadastrado à mão, pelo PNCP ou numa migração anterior)?
  async function existente(tabela, filtros) {
    let q = sb.from(tabela).select('id').eq('orgao_id', org()).limit(1);
    for (const [k, v] of Object.entries(filtros)) q = v == null ? q.is(k, null) : q.eq(k, v);
    const { data } = await q;
    return data && data[0] ? data[0].id : null;
  }

  const GRAVAR = {
    async legislacao(x, s) {
      const r = Object.assign({}, x.registro);
      // Tipo que não é fixo do portal (ex.: Regimento Interno): criado em Publicações › Tipos na primeira vez.
      if (x.tipoNovo) r.tipo = await tipoPublicacao(x.tipoNovo.codigo, x.tipoNovo.nome);
      const jaId = (r.numero || x.tipoNovo) && await existente('publicacoes', { tipo: r.tipo, numero: r.numero, ano: r.ano });
      if (jaId) return completarArquivo('publicacoes', jaId, x, s, true);
      const a = x.arquivos[0] ? await copiar(x.arquivos[0].url, s.pasta) : {};
      const reg = Object.assign({ orgao_id: org(), origem: 'importacao' }, r, { arquivo_url: a.url || null, situacao: a.url ? 'publicado' : 'rascunho' });
      const { data, error } = await sb.from('publicacoes').insert(reg).select('id').single();
      if (error) throw error;
      // Anexos (ex.: certidão de publicação) — script 42
      let bytes = a.bytes || 0, falhas = 0, ordem = 0;
      for (const an of x.anexos || []) {
        const c = await copiar(an.url, s.pasta);
        if (!c.url) { falhas++; continue; }
        bytes += c.bytes || 0;
        const { error: e2 } = await sb.from('publicacoes_anexos').insert({ publicacao_id: data.id, orgao_id: org(), titulo: an.titulo.length >= 2 ? an.titulo : 'Anexo', arquivo_url: c.url, ordem: ordem++ });
        if (e2) falhas++;
      }
      return { situacao: 'importado', id: data.id, tabela: 'publicacoes', bytes, aviso: [a.erro, falhas ? falhas + ' anexo(s) não copiado(s)' : ''].filter(Boolean).join(' · ') || null };
    },
    async licitacao(x, s) {
      const r = x.registro;
      if (r.numero && await existente('licitacoes', { modalidade: r.modalidade, numero: r.numero, ano: r.ano })) return { situacao: 'ja_existia' };
      const { data, error } = await sb.from('licitacoes').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r)).select('id').single();
      if (error) throw error;
      let bytes = 0, falhas = 0, ordem = 0;
      for (const d of x.documentos || []) {
        const a = await copiar(d.url, s.pasta);
        if (!a.url) { falhas++; continue; }
        bytes += a.bytes || 0;
        const { error: e2 } = await sb.from('licitacoes_documentos').insert({ licitacao_id: data.id, orgao_id: org(), origem: 'portal', tipo: d.tipo,
          titulo: d.titulo.length >= 2 ? d.titulo : 'Documento', data: d.data, arquivo_url: a.url, ordem: ordem++ });
        if (e2) falhas++;
      }
      return { situacao: 'importado', id: data.id, tabela: 'licitacoes', bytes, aviso: falhas ? falhas + ' documento(s) não copiado(s)' : null };
    },
    async contrato(x, s) {
      const r = x.registro;
      const jaId = r.numero && await existente('contratos', { numero: r.numero, ano: r.ano });
      if (jaId) return completarArquivo('contratos', jaId, x, s, false);
      const a = x.arquivos[0] ? await copiar(x.arquivos[0].url, s.pasta) : {};
      // Plataforma B: o contrato aponta a licitação do site antigo; se ela já foi migrada, fica ligada.
      let licitacao_id = null;
      if (x.licitacaoUrl) { const l = await jaMigrado(x.licitacaoUrl); licitacao_id = l && l.registro_id && l.tabela === 'licitacoes' ? l.registro_id : null; }
      const { data, error } = await sb.from('contratos').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r, { arquivo_url: a.url || null }, licitacao_id ? { licitacao_id } : {})).select('id').single();
      if (error) throw error;
      const sobra = (x.extras || []).map((d) => d.titulo).filter(Boolean);
      return { situacao: 'importado', id: data.id, tabela: 'contratos', bytes: a.bytes,
        aviso: [a.erro, x.licitacaoUrl && !licitacao_id ? 'Licitação ainda não migrada: ligue o contrato à licitação depois' : '', sobra.length ? 'Outros anexos no site antigo (não trazidos): ' + sobra.join('; ') : ''].filter(Boolean).join(' · ') || null };
    },
    async concurso(x, s) {
      const r = x.registro;
      const jaId = await existente('concursos', { tipo: r.tipo, numero: r.numero, ano: r.ano, titulo: r.titulo });
      let data;
      if (jaId) {
        // Já existe: só completa os documentos que faltaram (cópia que falhou antes).
        const { count } = await sb.from('concursos_documentos').select('id', { count: 'exact', head: true }).eq('concurso_id', jaId);
        if (count || !(x.documentos || []).length) return { situacao: 'ja_existia' };
        data = { id: jaId };
      } else {
        // Entra como rascunho: o banco só deixa publicar depois que o edital está anexado.
        const ins = await sb.from('concursos').insert(Object.assign({ orgao_id: org() }, r, { situacao: 'rascunho' })).select('id').single();
        if (ins.error) throw ins.error;
        data = ins.data;
      }
      let bytes = 0, falhas = 0;
      for (const d of x.documentos || []) {
        const a = await copiar(d.url, s.pasta);
        if (!a.url) { falhas++; continue; }
        bytes += a.bytes || 0;
        const { error: e2 } = await sb.from('concursos_documentos').insert({ concurso_id: data.id, orgao_id: org(), tipo: d.tipo,
          titulo: d.titulo.length >= 2 ? d.titulo : 'Documento', data: d.data, arquivo_url: a.url });
        if (e2) falhas++;
      }
      const pub = await sb.from('concursos').update({ situacao: 'publicado' }).eq('id', data.id).select('id');
      const avisos = [falhas ? falhas + ' documento(s) não copiado(s)' : '',
        pub.error ? 'Ficou em rascunho: ' + (pub.error.message || 'falta o edital') : ''].filter(Boolean).join(' · ');
      return { situacao: 'importado', id: data.id, tabela: 'concursos', bytes, aviso: avisos || null };
    },
    async conta(x, s) {
      const r = x.registro;
      if (await existente('documentos_contas', { tipo: r.tipo, exercicio: r.exercicio, periodo: r.periodo })) return { situacao: 'ja_existia' };
      const a = x.arquivos[0] ? await copiar(x.arquivos[0].url, s.pasta) : {};
      if (!a.url) return { situacao: 'erro', aviso: 'Sem arquivo: ' + (a.erro || 'o site antigo não tem o documento') };
      const { data, error } = await sb.from('documentos_contas').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r, { arquivo_url: a.url })).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'documentos_contas', bytes: a.bytes };
    },
    async noticia(x, s) {
      const r = x.registro;
      if (await existente('noticias', { titulo: r.titulo, publicado_em: r.publicado_em })) return { situacao: 'ja_existia' };
      const a = x.arquivos[0] ? await copiar(x.arquivos[0].url, s.pasta) : {};
      const { data, error } = await sb.from('noticias').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r, { capa_url: a.url || null })).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'noticias', bytes: a.bytes };
    }
  };

  // Tipo próprio de publicação (Publicações › Tipos), criado na primeira importação que precisa dele
  async function tipoPublicacao(codigo, nome) {
    const { data } = await sb.from('publicacoes_tipos').select('codigo').eq('orgao_id', org()).eq('codigo', codigo).maybeSingle();
    if (data) return codigo;
    const { error } = await sb.from('publicacoes_tipos').insert({ orgao_id: org(), codigo, nome, grupo: 'outros' });
    if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
    return codigo;
  }
  Object.assign(GRAVAR, {
    async ata(x, s) {
      const r = x.registro;
      const jaId = r.numero && await existente('contratos', { tipo: 'ata_registro_precos', numero: r.numero, ano: r.ano });
      if (jaId) return completarArquivo('contratos', jaId, x, s, false);
      const a = x.arquivos[0] ? await copiar(x.arquivos[0].url, s.pasta) : {};
      const { data, error } = await sb.from('contratos').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r, { arquivo_url: a.url || null })).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'contratos', bytes: a.bytes, aviso: a.erro };
    },
    async audiencia(x, s) {
      const tipo = await tipoPublicacao('x_audiencia_publica', 'Audiência pública');
      const r = x.registro, ano = x.ano || ANO;
      let bytes = 0, novos = 0, falhas = 0, primeiro = null;
      for (const d of x.documentos) {
        const ementa = (r.assunto + ' — ' + d.titulo).slice(0, 1000);
        if (await existente('publicacoes', { tipo, ementa, ano })) continue;
        const a = await copiar(d.url, s.pasta);
        if (!a.url) { falhas++; continue; }
        const { data, error } = await sb.from('publicacoes').insert({ orgao_id: org(), origem: 'importacao', tipo, numero: null, ano,
          data_publicacao: x.data || ano + '-01-01', ementa, arquivo_url: a.url, situacao: 'publicado',
          observacao: r.descricao && r.descricao !== r.assunto ? r.descricao.slice(0, 1000) : null }).select('id').single();
        if (error) { falhas++; continue; }
        primeiro = primeiro || data.id; bytes += a.bytes || 0; novos++;
      }
      if (!novos && !falhas) return { situacao: 'ja_existia' };
      return { situacao: novos ? 'importado' : 'erro', id: primeiro, tabela: 'publicacoes', bytes, aviso: falhas ? falhas + ' documento(s) não copiado(s)' : null };
    },
    async obra(x, s) {
      const r = x.registro;
      if (await existente('obras', { titulo: r.titulo })) return { situacao: 'ja_existia' };
      const { data, error } = await sb.from('obras').insert(Object.assign({ orgao_id: org(), situacao: 'publicado', ano: x.ano }, r)).select('id').single();
      if (error) throw error;
      let bytes = 0, falhas = 0;
      const usados = new Set();
      for (const md of x.medicoes || []) {
        let n = md.numero; while (usados.has(n)) n++; usados.add(n);
        const a = await copiar(md.url, s.pasta);
        if (!a.url) { falhas++; continue; }
        bytes += a.bytes || 0;
        const { error: e2 } = await sb.from('obras_medicoes').insert({ obra_id: data.id, orgao_id: org(), numero: n, descricao: md.descricao.slice(0, 500),
          periodo_fim: md.data, arquivo_url: a.url });
        if (e2) falhas++;
      }
      const sobra = (x.outros || []).map((d) => d.titulo).filter(Boolean);
      return { situacao: 'importado', id: data.id, tabela: 'obras', bytes,
        aviso: [falhas ? falhas + ' medição(ões) não copiada(s)' : '', sobra.length ? 'Sem lugar no módulo Obras (ficam no contrato/licitação): ' + sobra.join('; ') : ''].filter(Boolean).join(' · ') || null };
    },
    async secretaria(x, s) {
      const r = x.registro;
      // Compara nomes sem acento, caixa e pontuação ("EDUCAÇÃO,CULTURA" = "Educação, Cultura")
      const chaveNome = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const { data: todas } = await sb.from('unidades').select('id, nome, endereco, telefone, email, horario_atendimento, competencias').eq('orgao_id', org());
      const ja = (todas || []).find((u) => chaveNome(u.nome) === chaveNome(r.nome));
      let id = ja && ja.id, novo = false;
      if (ja) {
        const completar = {};
        for (const k of ['endereco', 'telefone', 'email', 'horario_atendimento', 'competencias']) if (!ja[k] && r[k]) completar[k] = r[k];
        if (Object.keys(completar).length) { const { error } = await sb.from('unidades').update(completar).eq('id', id); if (error) throw error; }
      } else {
        const { data, error } = await sb.from('unidades').insert(Object.assign({ orgao_id: org(), ordem: 50 }, r)).select('id').single();
        if (error) throw error;
        id = data.id; novo = true;
      }
      let bytes = 0, aviso = null;
      // Gestor: compara o nome sem acento nem maiúsculas ("MARCOS AURÉLIO" = "Marcos Aurelio"); se já existe sem foto, só põe a foto.
      const { data: gs } = await sb.from('gestores').select('id, nome, foto_url').eq('orgao_id', org());
      const jaG = x.gestor && (gs || []).find((g) => chaveNome(g.nome) === chaveNome(x.gestor.nome));
      if (jaG && !jaG.foto_url && x.arquivos[0]) {
        const a = await copiar(x.arquivos[0].url, s.pasta);
        if (a.url) { await sb.from('gestores').update({ foto_url: a.url }).eq('id', jaG.id); bytes = a.bytes || 0; novo = true; }
      }
      if (x.gestor && !jaG && !/^n[aã]o informad/i.test(x.gestor.nome)) {
        const a = x.arquivos[0] ? await copiar(x.arquivos[0].url, s.pasta) : {};
        bytes = a.bytes || 0; aviso = a.erro || null;
        const { error } = await sb.from('gestores').insert({ orgao_id: org(), unidade_id: id, nome: x.gestor.nome, cargo: x.gestor.cargo, foto_url: a.url || null,
          telefone: r.telefone, email: r.email, ordem: x.gestor.cargo === 'Prefeito(a)' ? 1 : x.gestor.cargo === 'Vice-prefeito(a)' ? 2 : 10 });
        if (error) throw error;
        novo = true;
      }
      return { situacao: novo ? 'importado' : 'ja_existia', id, tabela: 'unidades', bytes, aviso };
    },
    async faq(x) {
      const r = x.registro;
      if (await existente('faq', { pergunta: r.pergunta })) return { situacao: 'ja_existia' };
      const { data, error } = await sb.from('faq').insert(Object.assign({ orgao_id: org(), ativo: true }, r)).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'faq' };
    },
    async pagina(x, s) {
      const r = Object.assign({}, x.registro);
      if (await existente('paginas', { slug: r.slug })) return { situacao: 'ja_existia' };
      let bytes = 0, falhas = 0;
      for (const a of x.arquivosTexto || []) {
        const c = await copiar(a.url, s.pasta);
        if (!c.url) { falhas++; continue; }
        bytes += c.bytes || 0;
        r.conteudo = r.conteudo.split('(' + a.url + ')').join('(' + c.url + ')');
      }
      const { data, error } = await sb.from('paginas').insert(Object.assign({ orgao_id: org(), situacao: 'rascunho' }, r)).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'paginas', bytes,
        aviso: 'Entrou como rascunho: revise e publique (ou leve o conteúdo para o módulo certo)' + (falhas ? ' · ' + falhas + ' arquivo(s) não copiado(s), o link ainda aponta para o site antigo' : '') };
    }
  });

  // Página inicial: um tipo de item por destino. Nada do que já está preenchido no portal é trocado.
  Object.assign(GRAVAR, {
    async inicio(x, s) {
      const r = x.registro;
      if (x.tipo === 'banner') {
        if (!/^Destaque \d+$/.test(r.titulo) && await existente('banners', { titulo: r.titulo })) return { situacao: 'ja_existia' };
        const a = await copiar(x.arquivos[0].url, s.pasta);
        if (!a.url) return { situacao: 'erro', aviso: 'Imagem do banner não copiada: ' + (a.erro || 'sem arquivo') };
        const { data, error } = await sb.from('banners').insert(Object.assign({ orgao_id: org() }, r, { imagem_url: a.url })).select('id').single();
        if (error) throw error;
        return { situacao: 'importado', id: data.id, tabela: 'banners', bytes: a.bytes,
          aviso: /^Destaque \d+$/.test(r.titulo) ? 'Banner sem texto alternativo no site antigo: troque o título "' + r.titulo + '" em Notícias › Banners' : null };
      }
      if (x.tipo === 'contatos') {
        const atual = (await sb.from('orgaos').select('configuracoes').eq('id', org()).maybeSingle()).data;
        const c = (atual && atual.configuracoes) || {};
        const mudar = {}, preenchidos = [];
        for (const [k, v] of Object.entries(r)) if (v && !c[k]) { mudar[k] = v; preenchidos.push(k); }
        let bytes = 0, aviso = null;
        if (x.arquivos[0] && !c.brasao_url) {
          const a = await copiar(x.arquivos[0].url, 'aparencia');
          if (a.url) { mudar.brasao_url = a.url; bytes = a.bytes || 0; preenchidos.push('brasão'); } else aviso = 'Brasão não copiado: ' + a.erro;
        }
        if (!preenchidos.length) return { situacao: 'ja_existia', aviso };
        cfg = await P.mesclarConfiguracoes(mudar);
        const nomes = { endereco: 'endereço', cep: 'CEP', telefone: 'telefone', email: 'e-mail', horario: 'horário', facebook: 'Facebook', instagram: 'Instagram',
          youtube: 'YouTube', whatsapp: 'WhatsApp', diario_oficial_url: 'Diário Oficial' };
        return { situacao: 'importado', tabela: 'orgaos', id: org(), bytes,
          aviso: [('Preenchidos em Aparência e contatos (confira): ' + preenchidos.map((k) => nomes[k] || k).join(', ')), aviso].filter(Boolean).join(' · ') };
      }
      if (x.tipo === 'video') {
        if (await existente('videos', { url: r.url })) return { situacao: 'ja_existia' };
        const reg = Object.assign({ orgao_id: org() }, r);
        const { data, error } = await sb.from('videos').insert(reg).select('id').single();
        if (error) throw error;
        return { situacao: 'importado', id: data.id, tabela: 'videos', aviso: r.situacao === 'rascunho' ? 'Vídeo sem título no site antigo: entrou como rascunho em Notícias › Vídeos' : null };
      }
      if (x.tipo === 'atalho') {
        if (await existente('servicos', { nome: r.nome })) return { situacao: 'ja_existia' };
        const { data, error } = await sb.from('servicos').insert(Object.assign({ orgao_id: org() }, r)).select('id').single();
        if (error) throw error;
        return { situacao: 'importado', id: data.id, tabela: 'servicos', aviso: 'Entrou como rascunho na Carta de Serviços: complete e publique' };
      }
      return { situacao: 'erro', aviso: 'Item da página inicial sem destino.' };
    }
  });

  // Câmara (Plataforma B): vereadores, Mesa, comissões, reuniões, proposições, sessões; e diárias (valores) e convênios.
  // Vereadores são achados pelo nome (sem acento, caixa ou pontuação), civil ou parlamentar.
  const chaveNome = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let cacheVereadores = null;
  async function vereadores(recarregar) {
    if (cacheVereadores && !recarregar) return cacheVereadores;
    const { data, error } = await sb.from('parlamentares').select('id, nome, nome_parlamentar, partido, cargo_mesa, foto_url, biografia, email, telefone, legislatura_inicio, legislatura_fim').eq('orgao_id', org());
    if (error) throw error;
    cacheVereadores = data || [];
    return cacheVereadores;
  }
  async function acharVereador(nome) {
    const k = chaveNome(nome);
    if (!k) return null;
    const l = await vereadores();
    const iguais = l.filter((p) => chaveNome(p.nome_parlamentar) === k || chaveNome(p.nome) === k);
    return iguais.length === 1 ? iguais[0] : null;
  }
  async function acharComissao(nome) {
    const { data } = await sb.from('comissoes').select('id, nome').eq('orgao_id', org());
    return (data || []).find((c) => chaveNome(c.nome) === chaveNome(nome)) || null;
  }
  // Copia o arquivo e devolve a url (ou guarda o erro na lista de avisos).
  async function arquivoDe(a, s, avisos) {
    if (!a) return { url: null, bytes: 0 };
    const c = await copiar(a.url, s.pasta);
    if (!c.url) avisos.push('Arquivo não copiado: ' + c.erro);
    return { url: c.url || null, bytes: c.bytes || 0 };
  }
  Object.assign(GRAVAR, {
    async vereador(x, s) {
      const r = x.registro, avisos = [];
      const ja = (await acharVereador(r.nome_parlamentar)) || (await acharVereador(r.nome));
      const foto = (x.arquivos || []).find((a) => a.campo === 'foto_url');
      if (ja) {
        const completar = {};
        for (const k of ['partido', 'biografia', 'email', 'telefone', 'legislatura_inicio', 'legislatura_fim']) if (ja[k] == null && r[k] != null) completar[k] = r[k];
        if (!ja.foto_url && foto) { const f = await arquivoDe(foto, s, avisos); if (f.url) completar.foto_url = f.url; }
        if (!Object.keys(completar).length) return { situacao: 'ja_existia', id: ja.id, tabela: 'parlamentares' };
        const { error } = await sb.from('parlamentares').update(completar).eq('id', ja.id);
        if (error) throw error;
        cacheVereadores = null;
        return { situacao: 'importado', id: ja.id, tabela: 'parlamentares', aviso: 'Já existia: completados ' + Object.keys(completar).join(', ') };
      }
      const f = await arquivoDe(foto, s, avisos);
      const { data, error } = await sb.from('parlamentares').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r, { foto_url: f.url })).select('id').single();
      if (error) throw error;
      cacheVereadores = null;
      return { situacao: 'importado', id: data.id, tabela: 'parlamentares', bytes: f.bytes, aviso: avisos.join(' · ') || null };
    },
    async mesa(x) {
      const p = await acharVereador(x.registro.nome_parlamentar);
      if (!p) return { situacao: 'erro', aviso: 'Vereador "' + x.registro.nome_parlamentar + '" não encontrado: importe antes a seção Vereadores' };
      if ((p.cargo_mesa || '') === x.registro.cargo_mesa) return { situacao: 'ja_existia', id: p.id, tabela: 'parlamentares' };
      const { error } = await sb.from('parlamentares').update({ cargo_mesa: x.registro.cargo_mesa }).eq('id', p.id);
      if (error) throw error;
      cacheVereadores = null;
      return { situacao: 'importado', id: p.id, tabela: 'parlamentares', aviso: x.sessao ? 'Mesa da ' + x.sessao : null };
    },
    async comissao(x) {
      const r = x.registro;
      let c = await acharComissao(r.nome), novo = false;
      if (!c) {
        const { data, error } = await sb.from('comissoes').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r)).select('id').single();
        if (error) throw error;
        c = data; novo = true;
      }
      const { data: atuais } = await sb.from('comissoes_membros').select('parlamentar_id').eq('comissao_id', c.id);
      const tem = new Set((atuais || []).map((m) => m.parlamentar_id));
      const faltam = [];
      let membros = 0;
      for (const m of x.membros || []) {
        const p = await acharVereador(m.nome);
        if (!p) { faltam.push(m.nome); continue; }
        if (tem.has(p.id)) continue;
        const { error } = await sb.from('comissoes_membros').insert({ orgao_id: org(), comissao_id: c.id, parlamentar_id: p.id, funcao: m.funcao });
        if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
        tem.add(p.id); membros++;
      }
      if (!novo && !membros) return { situacao: 'ja_existia', id: c.id, tabela: 'comissoes', aviso: faltam.length ? 'Membros não encontrados entre os vereadores: ' + faltam.join(', ') : null };
      return { situacao: 'importado', id: c.id, tabela: 'comissoes',
        aviso: faltam.length ? 'Membros não encontrados entre os vereadores (importe antes os Vereadores e rode de novo): ' + faltam.join(', ') : null };
    },
    async reuniao(x, s) {
      const c = await acharComissao(x.comissao);
      if (!c) return { situacao: 'erro', aviso: 'Comissão "' + x.comissao + '" não encontrada: importe antes a seção Comissões' };
      const r = x.registro, avisos = [];
      if (await existente('sessoes', { comissao_id: c.id, data: r.data, numero: r.numero })) return { situacao: 'ja_existia' };
      const reg = Object.assign({ orgao_id: org(), comissao_id: c.id, situacao: 'publicado' }, r);
      let bytes = 0;
      for (const a of x.arquivos || []) { const f = await arquivoDe(a, s, avisos); if (f.url) { reg[a.campo] = f.url; bytes += f.bytes; } }
      const { data, error } = await sb.from('sessoes').insert(reg).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'sessoes', bytes, aviso: avisos.join(' · ') || null };
    },
    async sessao(x, s) {
      const r = x.registro, avisos = [];
      const jaId = await existente('sessoes', { comissao_id: null, data: r.data, tipo: r.tipo, numero: r.numero });
      if (jaId) {
        // Já existe: só completa a ata, se agora o site antigo tem e o portal não.
        const ata = (x.arquivos || []).find((a) => a.campo === 'ata_url');
        if (!ata) return { situacao: 'ja_existia' };
        const { data: atual } = await sb.from('sessoes').select('ata_url').eq('id', jaId).maybeSingle();
        if (atual && atual.ata_url) return { situacao: 'ja_existia' };
        const f = await arquivoDe(ata, s, avisos);
        if (!f.url) return { situacao: 'ja_existia', aviso: avisos.join(' · ') };
        await sb.from('sessoes').update({ ata_url: f.url }).eq('id', jaId);
        return { situacao: 'importado', id: jaId, tabela: 'sessoes', bytes: f.bytes, aviso: 'Ata completada' };
      }
      const reg = Object.assign({ orgao_id: org(), situacao: 'publicado' }, r);
      let bytes = 0;
      for (const a of x.arquivos || []) { const f = await arquivoDe(a, s, avisos); if (f.url) { reg[a.campo] = f.url; bytes += f.bytes; } }
      const { data, error } = await sb.from('sessoes').insert(reg).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'sessoes', bytes, aviso: avisos.join(' · ') || null };
    },
    async proposicao(x, s) {
      const r = Object.assign({}, x.registro), avisos = [];
      const jaId = await existente('proposicoes', { tipo: r.tipo, numero: r.numero, ano: r.ano });
      if (jaId) return completarArquivo('proposicoes', jaId, x, s, false);
      const autor = x.autor ? await acharVereador(x.autor.nome) : null;
      if (x.autor && !autor) r.autoria_externa = x.autor.completo.slice(0, 200);
      const f = await arquivoDe((x.arquivos || [])[0], s, avisos);
      const { data, error } = await sb.from('proposicoes').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r, { arquivo_url: f.url })).select('id').single();
      if (error) throw error;
      let bytes = f.bytes;
      if (autor) {
        const { error: e1 } = await sb.from('proposicoes_autores').insert({ orgao_id: org(), proposicao_id: data.id, parlamentar_id: autor.id, papel: 'autor' });
        if (e1) avisos.push('Autor não ligado: ' + (e1.message || ''));
      }
      // Tramitação + anexos (o anexo vai no trâmite da mesma data, ou vira um trâmite "Anexo")
      const tramites = (x.tramites || []).map((t) => ({ orgao_id: org(), proposicao_id: data.id, data: t.data, descricao: t.descricao, arquivo_url: null }));
      for (const d of x.documentos || []) {
        const c = await arquivoDe(d, s, avisos);
        if (!c.url) continue;
        bytes += c.bytes;
        const t = tramites.find((y) => y.data === d.data && !y.arquivo_url && /tramita/i.test(d.titulo));
        if (t) t.arquivo_url = c.url;
        else tramites.push({ orgao_id: org(), proposicao_id: data.id, data: d.data || r.data_apresentacao, descricao: ('Anexo: ' + d.titulo).slice(0, 1000), arquivo_url: c.url });
      }
      if (tramites.length) {
        const { error: e2 } = await sb.from('proposicoes_tramites').insert(tramites);
        if (e2) avisos.push('Tramitação não gravada: ' + (e2.message || ''));
      }
      if (x.andamentoEstimado) avisos.push('Situação no site antigo: "' + x.andamentoEstimado + '", sem o resultado: entrou como Arquivada (confira)');
      if (r.tipo === 'outro' && x.tipoOriginal) avisos.push('Tipo no site antigo: ' + x.tipoOriginal + ' (entrou como "Outro")');
      return { situacao: 'importado', id: data.id, tabela: 'proposicoes', bytes, aviso: avisos.join(' · ') || null };
    },
    async diaria(x) {
      const r = Object.assign({}, x.registro);
      if (await existente('diarias_valores', { grupo: r.grupo, abrangencia: r.abrangencia, norma: r.norma })) return { situacao: 'ja_existia' };
      // A norma (resolução) migrada em "Normas jurídicas": usa o PDF dela já copiado para o portal.
      if (x.normaUrl) {
        const n = await jaMigrado(x.normaUrl);
        if (n && n.registro_id && n.tabela === 'publicacoes') {
          const { data: p } = await sb.from('publicacoes').select('arquivo_url').eq('id', n.registro_id).maybeSingle();
          if (p && p.arquivo_url) r.norma_url = p.arquivo_url;
        }
      }
      const { data, error } = await sb.from('diarias_valores').insert(Object.assign({ orgao_id: org() }, r)).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'diarias_valores', aviso: r.norma_url ? null : 'Sem o PDF da norma: importe antes as Normas jurídicas e rode de novo, ou ponha o link em Diárias › Valores' };
    },
    async convenio(x, s) {
      const r = x.registro, avisos = [];
      if (await existente('convenios', { tipo: r.tipo, numero: r.numero, objeto: r.objeto })) return { situacao: 'ja_existia' };
      const f = await arquivoDe((x.arquivos || [])[0], s, avisos);
      const { data, error } = await sb.from('convenios').insert(Object.assign({ orgao_id: org(), ano: x.ano || ANO }, r, { arquivo_url: f.url, situacao: f.url ? 'publicado' : 'rascunho' })).select('id').single();
      if (error) throw error;
      if (!f.url) avisos.push('Sem o inteiro teor no site antigo: entrou como rascunho');
      return { situacao: 'importado', id: data.id, tabela: 'convenios', bytes: f.bytes, aviso: avisos.join(' · ') || null };
    }
  });

  async function importar(chave) {
    const s = adaptador.secoes[chave];
    const st = estado[chave] = Object.assign(estado[chave] || {}, { rodando: 'importacao', parar: false, log: [], feitos: 0, novos: 0, existentes: 0, erros: 0, bytesCopiados: 0 });
    atualizarCartao(chave);
    const tratar = async (url, x) => {
      const ja = await jaMigrado(url);
      // Já veio, mas o arquivo não foi copiado (ex.: "Failed to fetch"): tenta de novo só o arquivo.
      const semArquivo = ja && ja.situacao === 'importado' && FALTOU_ARQUIVO.test(ja.detalhe || '');
      if (ja && ja.situacao !== 'erro' && !semArquivo) { st.feitos++; return; }
      if (x.ignorar) { await marcar(url, chave, null, null, x, 'ignorado', x.ignorar); st.feitos++; return; }
      try {
        const r = await GRAVAR[chave](x, s);
        await marcar(url, chave, r.tabela || null, r.id, x, r.situacao, r.aviso, r.bytes);
        if (r.situacao === 'importado') { st.novos++; st.bytesCopiados += r.bytes || 0; }
        else if (r.situacao === 'ja_existia') st.existentes++;
        else st.erros++;
        if (r.aviso) st.log.unshift(url.replace(cfg.migracao.origem, '') + ': ' + r.aviso);
      } catch (e) {
        st.erros++; st.log.unshift(url.replace(cfg.migracao.origem, '') + ': ' + (e.message || traduzirErro(e)));
        await marcar(url, chave, null, null, x, 'erro', e.message);
      }
      st.feitos++;
      st.texto = st.feitos + ' processados · ' + st.novos + ' novos · ' + st.existentes + ' já existiam · ' + st.erros + ' com erro · ' + mb(st.bytesCopiados) + ' copiados';
      atualizarCartao(chave);
    };
    try {
      if (st.analisado && st.itens && st.itens.length) {
        for (let i = 0; i < st.itens.length && !st.parar; i++) await tratar(st.itens[i].url, st.itens[i].x);
      } else {
        await varrer(chave, s, tratar);
      }
      st.texto = (st.parar ? 'Pausado: ' : 'Concluído: ') + (st.texto || 'nada novo para importar.');
    } catch (e) { st.texto = 'Parou: ' + e.message; }
    st.rodando = null;
    rascunhosPorSecao = null;
    await carregar(); desenhar();
  }

  // ---------------- publicar os rascunhos da migração ----------------
  // O que entrou como rascunho (lei sem arquivo, página avulsa, vídeo sem título, atalho de serviço…)
  // pode ser publicado de uma vez, por seção ou tudo. Quem não pode ir ao ar (ex.: lei sem documento)
  // continua em rascunho e é contado à parte.
  const TABELAS_PUBLICAVEIS = ['publicacoes', 'licitacoes', 'contratos', 'concursos', 'documentos_contas', 'noticias', 'obras', 'paginas', 'videos', 'servicos',
    'parlamentares', 'comissoes', 'proposicoes', 'sessoes', 'convenios'];
  const ONDE = { publicacoes: 'Publicações', licitacoes: 'Licitações', contratos: 'Contratos', concursos: 'Concursos e seletivos', documentos_contas: 'Planejamento e contas',
    noticias: 'Notícias', obras: 'Obras', paginas: 'Páginas', videos: 'Notícias › Vídeos', servicos: 'Carta de Serviços',
    parlamentares: 'Vereadores', comissoes: 'Comissões', proposicoes: 'Proposições', sessoes: 'Sessões', convenios: 'Convênios' };
  let caixaRascunhos = null, rascunhosPorSecao = null;
  const fatias = (l, n) => { const r = []; for (let i = 0; i < l.length; i += n) r.push(l.slice(i, i + n)); return r; };
  async function levantarRascunhos() {
    const vinculos = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from('migracao_itens').select('secao, tabela, registro_id').eq('orgao_id', org())
        .eq('situacao', 'importado').not('registro_id', 'is', null).in('tabela', TABELAS_PUBLICAVEIS).range(de, de + 999);
      if (error) throw error;
      vinculos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const secaoDe = {};   // tabela:id → seção
    for (const v of vinculos) secaoDe[v.tabela + ':' + v.registro_id] = v.secao;
    const porSecao = {};
    const somar = (secao, tabela, id) => { const g = porSecao[secao] = porSecao[secao] || {}; (g[tabela] = g[tabela] || []).push(id); };
    for (const t of TABELAS_PUBLICAVEIS) {
      const ids = vinculos.filter((v) => v.tabela === t).map((v) => v.registro_id);
      for (const lote of fatias(ids, 150)) {
        const { data, error } = await sb.from(t).select('id').eq('orgao_id', org()).eq('situacao', 'rascunho').in('id', lote);
        if (error) throw error;
        for (const r of data || []) somar(secaoDe[t + ':' + r.id], t, r.id);
      }
    }
    // Audiências públicas criam várias publicações por item: as que não ficaram anotadas vêm pela origem "importação".
    const { data: extras } = await sb.from('publicacoes').select('id, tipo').eq('orgao_id', org()).eq('origem', 'importacao').eq('situacao', 'rascunho').limit(5000);
    const ja = new Set(Object.values(porSecao).flatMap((g) => g.publicacoes || []));
    for (const r of extras || []) if (!ja.has(r.id)) somar(r.tipo === 'x_audiencia_publica' ? 'audiencia' : 'legislacao', 'publicacoes', r.id);
    return porSecao;
  }
  const totalDe = (g) => Object.values(g || {}).reduce((t, l) => t + l.length, 0);
  async function publicarRascunhos(secoes, btn) {
    const grupos = secoes.map((k) => rascunhosPorSecao[k]).filter(Boolean);
    const total = grupos.reduce((t, g) => t + totalDe(g), 0);
    if (!total) return;
    const paginas = grupos.reduce((t, g) => t + ((g.paginas || []).length), 0);
    if (!await P.confirmar('Publicar rascunhos da migração', 'Publicar ' + total + ' ' + (total === 1 ? 'item' : 'itens') + ' que vieram do site antigo como rascunho? ' +
      'Eles passam a aparecer no site.' + (paginas ? ' Atenção: ' + paginas + ' página(s) avulsa(s) entraram como rascunho para revisão; confira o conteúdo antes, se ainda não conferiu.' : '') +
      ' O que não puder ir ao ar (por exemplo, lei sem documento) continua em rascunho.', 'Publicar ' + total)) return;
    ocupado(btn, 'Publicando…');
    let ok = 0, falhas = 0; const motivos = new Set();
    try {
      for (const g of grupos) for (const [t, ids] of Object.entries(g)) for (const lote of fatias(ids, 100)) {
        const { data, error } = await sb.from(t).update({ situacao: 'publicado' }).eq('orgao_id', org()).eq('situacao', 'rascunho').in('id', lote).select('id');
        if (!error) { ok += (data || []).length; falhas += lote.length - (data || []).length; continue; }
        // Algum do lote não pode ir ao ar: tenta um por um para publicar os demais.
        for (const id of lote) {
          const r = await sb.from(t).update({ situacao: 'publicado' }).eq('id', id).eq('situacao', 'rascunho').select('id');
          if (!r.error && r.data && r.data.length) ok++;
          else { falhas++; motivos.add(ONDE[t] + ': ' + (r.error ? P.erroGravacao(r.error) : 'sem permissão para publicar')); }
        }
      }
      toast(ok + ' publicado(s).' + (falhas ? ' ' + falhas + ' continua(m) em rascunho: ' + [...motivos].slice(0, 3).join(' · ') : ''), !!falhas);
    } catch (e) { toast(P.erroGravacao(e), true); }
    finally { ocupado(btn); }
    await desenharRascunhos(true);
  }
  async function desenharRascunhos(recontar) {
    if (!caixaRascunhos) return;
    const caixa = caixaRascunhos;
    try { if (recontar || !rascunhosPorSecao) rascunhosPorSecao = await levantarRascunhos(); }
    catch (e) { caixa.replaceChildren(el('p', { class: 'msg msg-erro m-0' }, 'Não consegui contar os rascunhos: ' + P.erroGravacao(e))); return; }
    if (caixa !== caixaRascunhos) return;
    const chaves = Object.keys(rascunhosPorSecao).filter((k) => totalDe(rascunhosPorSecao[k]));
    if (!chaves.length) { caixa.replaceChildren(); caixa.hidden = true; return; }
    caixa.hidden = false;
    const total = chaves.reduce((t, k) => t + totalDe(rascunhosPorSecao[k]), 0);
    const nomeSecao = (k) => (adaptador && adaptador.secoes[k] ? adaptador.secoes[k].nome : k);
    const btnTudo = el('button', { type: 'button', class: 'btn btn-primario' }, 'Publicar todos (' + total + ')');
    btnTudo.addEventListener('click', () => publicarRascunhos(chaves, btnTudo));
    caixa.replaceChildren(
      el('div', { class: 'linha-botoes' }, el('h2', { class: 'm-0' }, 'Rascunhos trazidos do site antigo'), btnTudo),
      el('p', { class: 'ajuda' }, 'Itens que entraram como rascunho e ainda não aparecem no site. Publique de uma vez, por seção ou tudo.'),
      el('ul', { class: 'lista-rascunhos' }, chaves.map((k) => {
        const g = rascunhosPorSecao[k], n = totalDe(g);
        const b = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Publicar ' + n);
        b.addEventListener('click', () => publicarRascunhos([k], b));
        return el('li', { class: 'linha-botoes' }, el('span', null, el('strong', null, nomeSecao(k)), ' · ', n + ' em rascunho (' + Object.keys(g).map((t) => ONDE[t]).join(', ') + ')'), b);
      })));
  }

  // ---------------- período ----------------
  // Escolha do período a trazer, guardada no órgão. Mudar o período não apaga o que já veio:
  // ampliar traz os anos que faltam; reduzir só deixa de buscar os anos de fora.
  function cartaoPeriodo() {
    const opcoes = (padrao) => [el('option', { value: 'todos' }, 'Todos os anos')]
      .concat(Array.from({ length: ANO - 1999 }, (_, i) => String(ANO - i)).map((a) => el('option', { value: a }, a === String(ANO) ? 'Só ' + ANO : 'De ' + a + ' a ' + ANO + (a === padrao ? ' (padrão)' : ''))));
    const selP = el('select', { id: 'mig-per-pntp' }, opcoes(String(ANO - 2)));
    const selO = el('select', { id: 'mig-per-outros' }, opcoes(null));
    selP.value = escolhaPeriodo({ pntp: true }); selO.value = escolhaPeriodo({ pntp: false });
    const salvar = async () => {
      if (Object.values(estado).some((x) => x.rodando)) { toast('Pause as importações em andamento antes de mudar o período.', true); selP.value = escolhaPeriodo({ pntp: true }); selO.value = escolhaPeriodo({ pntp: false }); return; }
      try {
        cfg = await P.mesclarConfiguracoes({ migracao: Object.assign({}, cfg.migracao, { periodo: { pntp: selP.value, outros: selO.value } }) });
        for (const k of Object.keys(estado)) delete estado[k];   // análises feitas com o período anterior
        toast('Período da migração salvo.');
        desenhar();
      } catch (e) { toast(traduzirErro(e), true); }
    };
    selP.addEventListener('change', salvar); selO.addEventListener('change', salvar);
    return el('section', { class: 'cartao' }, el('h2', { class: 'm-0' }, 'Período da migração'),
      el('div', { class: 'grade grade-2 mt-1' },
        el('div', { class: 'campo' }, el('label', { for: 'mig-per-pntp' }, 'O que pontua no PNTP (leis, contas, licitações, contratos, concursos, obras, proposições, sessões…)'), selP),
        el('div', { class: 'campo' }, el('label', { for: 'mig-per-outros' }, 'O restante (notícias)'), selO)),
      el('p', { class: 'ajuda mt-05' }, 'O PNTP cobra o exercício atual e os 2 anteriores. Secretarias, perguntas frequentes, páginas avulsas, página inicial, Mesa Diretora, comissões, Lei Orgânica e Regimento Interno vêm sempre inteiros; vereadores, os com mandato no período. ',
        'Mudar o período não apaga o que já foi trazido: ampliar traz os anos que faltam ao importar de novo.'));
  }

  // ---------------- tela ----------------
  const cartoes = {};
  function cartaoSecao(chave, s) {
    const st = estado[chave] || {}, rs = resumo[chave];
    const { de, ate } = periodo(s);
    const rodando = !!st.rodando;
    const btnA = el('button', { type: 'button', class: 'btn btn-claro', disabled: rodando, onclick: () => analisar(chave) }, 'Analisar e medir');
    const btnI = el('button', { type: 'button', class: 'btn btn-primario', disabled: rodando, onclick: () => importar(chave) }, st.analisado ? 'Importar ' + (st.itens || []).length + ' itens' : 'Importar');
    const btnP = el('button', { type: 'button', class: 'btn btn-claro', hidden: !rodando, onclick: () => { st.parar = true; btnP.disabled = true; } }, 'Pausar');
    const c = el('section', { class: 'cartao migracao-secao' },
      el('div', { class: 'linha-botoes' }, el('h2', { class: 'm-0' }, s.nome),
        el('span', { class: 'etiqueta' + (s.pntp ? ' etiqueta-ativo' : '') }, (s.pntp ? 'PNTP · ' : '') + rotuloPeriodo(s)),
        el('span', { class: 'ajuda' }, (s.semPeriodo ? 'Tudo' : de <= TODOS_DESDE ? 'Todos os anos' : 'De ' + de + ' a ' + ate) + ' → ' + s.destino)),
      rs ? el('p', { class: 'msg msg-ok mt-1' }, 'Já migrados: ' + rs.importados + ' novos · ' + rs.ja_existiam + ' já existiam no portal' +
        (rs.erros ? ' · ' + rs.erros + ' com erro (rode de novo para tentar outra vez)' : '') + ' · ' + mb(rs.bytes) + ' de arquivos.') : null,
      st.texto ? el('p', { class: 'msg ' + (rodando ? 'msg-info' : /Parou/.test(st.texto) ? 'msg-erro' : 'msg-info') + ' mt-1', role: 'status' }, rodando ? '⏳ ' : '', st.texto) : null,
      el('div', { class: 'linha-botoes mt-1' }, btnA, btnI, btnP),
      st.log && st.log.length ? el('details', { class: 'mt-1' }, el('summary', null, 'Avisos (' + st.log.length + ')'),
        el('ul', { class: 'menor' }, st.log.slice(0, 50).map((l) => el('li', null, l)))) : null);
    cartoes[chave] = c;
    return c;
  }
  function atualizarCartao(chave) {
    const antigo = cartoes[chave];
    if (!antigo || !antigo.isConnected) return;
    antigo.replaceWith(cartaoSecao(chave, adaptador.secoes[chave]));
  }
  let caixaEspaco = null;
  function desenharEspaco() {
    if (!caixaEspaco) return;
    const previsto = Object.values(estado).reduce((t, s) => t + (s.analisado ? s.bytes || 0 : 0), 0);
    const usado = espaco || 0, limite = 1073741824;
    caixaEspaco.replaceChildren(el('p', { class: 'msg ' + (usado + previsto > limite * 0.9 ? 'msg-falta' : 'msg-info') + ' m-0' },
      'Arquivos deste órgão no portal: ', el('strong', null, mb(usado)),
      previsto ? [' · previsto pelas análises: ', el('strong', null, mb(previsto)), ' · total: ', el('strong', null, mb(usado + previsto))] : null,
      '. O plano gratuito da Supabase guarda 1 GB para todos os órgãos juntos' + (usado + previsto > limite * 0.9 ? ': vai passar do limite; antes de importar, contrate o plano Pro (100 GB).' : '.')));
  }

  function desenhar() {
    const origem = el('input', { type: 'url', value: (cfg.migracao && cfg.migracao.origem) || (P.estado.orgao.dominio ? 'https://www.' + P.estado.orgao.dominio : ''), placeholder: 'https://www.municipio.rn.gov.br' });
    const btnO = el('button', { type: 'button', class: 'btn btn-claro' }, 'Salvar e reconhecer');
    btnO.addEventListener('click', () => salvarOrigem(origem, btnO));
    caixaEspaco = el('div', { class: 'mt-1' });
    const ok = adaptador && cfg.migracao && cfg.migracao.origem;
    // Endereço já guardado: mostra só o resumo; o campo volta ao clicar em "Trocar endereço".
    const reconhecido = ok && cfg.migracao.plataforma;
    const btnTrocar = el('button', { type: 'button', class: 'link', onclick: () => { editandoOrigem = true; desenhar(); } }, 'Trocar endereço');
    const linhaOrigem = ok && !editandoOrigem
      ? el('p', { class: 'mt-05' }, el('a', { href: cfg.migracao.origem, target: '_blank', rel: 'noopener' }, cfg.migracao.origem), ' · ',
        reconhecido ? 'modelo ' + adaptador.nome : cfg.migracao.reconhecido_em ? 'modelo não reconhecido pela ferramenta' : 'modelo ainda não conferido (é conferido sozinho ao ligar o coletor)', ' · ', btnTrocar)
      : el('div', { class: 'linha-botoes mt-1' }, origem, btnO);
    conteiner.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' }, el('div', null, el('h1', null, 'Migração do site antigo'),
        el('p', { class: 'sub' }, 'Traz para o portal o que já está publicado no site atual do órgão, com os arquivos.'))),
      el('p', { class: 'msg msg-info' }, 'Escolha abaixo o período a trazer. ',
        'Primeiro use "Analisar e medir" (não grava nada) para ver quantos itens e quanto espaço; depois "Importar". Pode pausar e continuar: o que já veio não é repetido. ',
        'Mantenha esta tela aberta durante a importação.'),
      el('section', { class: 'cartao' }, el('h2', { class: 'm-0' }, 'Site de origem'),
        linhaOrigem,
        ok && !editandoOrigem ? null : el('p', { class: 'ajuda mt-05' }, 'Informe o endereço do site antigo e clique em "Salvar e reconhecer". Fica guardado: não precisa repetir ao abrir esta tela de novo.'),
        caixaPonte = el('div', { class: 'mt-1' }),
        ok ? (() => {
          const b = el('button', { type: 'button', class: 'btn btn-claro mt-1' }, 'Analisar e medir todas as seções');
          b.addEventListener('click', () => analisarTodas(b));
          return b;
        })() : null,
        caixaEspaco),
      ok ? cartaoPeriodo() : null,
      ok ? (caixaRascunhos = el('section', { class: 'cartao', hidden: true })) : null,
      ...(ok ? Object.entries(adaptador.secoes).map(([k, s]) => cartaoSecao(k, s)) : []),
      el('p', { class: 'ajuda mt-2' }, 'Receitas, despesas, folha, diárias, ordem cronológica, emendas e licitações/contratos dos sistemas de gestão continuam nos sistemas oficiais: ligue-os em Aparência › Destinos das páginas.')].filter(Boolean));
    desenharEspaco(); desenharPonte();
    if (ok) desenharRascunhos(false);
  }

  P.telas.migracao = async function (c) {
    conteiner = c;
    c.replaceChildren(el('h1', null, 'Migração do site antigo'), el('p', { class: 'sub' }, 'Carregando…'));
    if (!window.MIGRACAO_ADAPTADORES) { c.querySelector('.sub').textContent = 'Adaptadores de migração não carregados.'; return; }
    try { await carregar(); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = /migracao_resumo/.test(e.message || '') ? 'Falta rodar o script 31 no banco.' : traduzirErro(e); }
  };
})();
