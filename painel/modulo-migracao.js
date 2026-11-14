// =====================================================================
// Módulo "Migração do site antigo" (0.23.0) — Suporte SOFT+
// Traz para o portal o conteúdo do site que o órgão já tinha: leis e decretos,
// licitações com documentos, contratos, concursos, contas públicas e notícias.
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
  const PARALELO = 3;

  let conteiner = null, cfg = {}, adaptador = null, resumo = {}, espaco = null;
  const estado = {};          // por seção: { itens, arquivos, bytes, rodando, parar, log }

  const org = () => P.estado.orgao.id;
  const periodo = (s) => ({ de: ANO - (s.pntp ? 2 : 1), ate: ANO });
  const mb = (b) => b == null ? '?' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  async function servidor(corpo) {
    const { data, error } = await sb.functions.invoke('migrar-site', { body: Object.assign({ orgao_id: org() }, corpo) });
    if (error) {
      const st = error.context && error.context.status;
      if (st === 404 || /Failed to send a request|not found/i.test(error.message)) throw new Error('A função "migrar-site" não está instalada na Supabase.');
      throw error;
    }
    if (!data || !data.ok) throw new Error((data && data.erro) || 'Falha na leitura do site antigo.');
    return data;
  }
  async function pagina(url, tentativas) {
    for (let i = 0; i < (tentativas || 3); i++) {
      try { return await servidor({ acao: 'pagina', url }); }
      catch (e) { if (i === (tentativas || 3) - 1 || /instalada|Cadastre|Só o Suporte/.test(e.message)) throw e; await espera(1500 * (i + 1)); }
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
      const atual = (await sb.from('orgaos').select('configuracoes').eq('id', org()).maybeSingle()).data.configuracoes || {};
      const novo = Object.assign({}, atual, { migracao: Object.assign({}, atual.migracao || {}, { origem: url }) });
      const { error } = await sb.from('orgaos').update({ configuracoes: novo }).eq('id', org());
      if (error) throw error;
      const p = await pagina(url + '/');
      const qual = Object.entries(window.MIGRACAO_ADAPTADORES).find(([, a]) => a.reconhece(p.html));
      novo.migracao.plataforma = qual ? qual[0] : null;
      await sb.from('orgaos').update({ configuracoes: novo }).eq('id', org());
      toast(qual ? 'Site antigo reconhecido: ' + qual[1].nome.split(' (')[0] + '.' : 'O site respondeu, mas o modelo dele ainda não é conhecido pela ferramenta.', !qual);
      await carregar(); desenhar();
    } catch (e) { toast(e.message || traduzirErro(e), true); }
    finally { ocupado(btn); }
  }

  // ---------------- varredura ----------------
  // Do maior id para baixo; para depois de PARAR_APOS ids seguidos fora do período.
  async function varrer(chave, s, aoItem) {
    const st = estado[chave];
    const origem = cfg.migracao.origem;
    let maior = 0;
    for (const l of s.listas) {
      try { const p = await pagina(origem + l); maior = Math.max(maior, adaptador.maiorId(p.html, new RegExp(s.reId.source, 'g'))); } catch (e) { /* tenta a próxima */ }
      if (maior) break;
    }
    if (!maior) throw new Error('Não achei itens desta seção no site antigo.');
    const { de } = periodo(s);
    let fora = 0, id = maior + 5;   // alguns ids acima do maior visível (itens recentes ainda não listados)
    while (id > 0 && fora < PARAR_APOS && !st.parar) {
      const lote = [];
      for (let k = 0; k < PARALELO && id > 0; k++, id--) lote.push(id);
      const res = await Promise.all(lote.map(async (n) => {
        const url = s.url(origem, n);
        try { const p = await pagina(url); return { n, url, x: p.status === 200 ? s.ler(p.html, url) : { vazio: true } }; }
        catch (e) { return { n, url, erro: e.message }; }
      }));
      for (const r of res.sort((a, b) => b.n - a.n)) {
        if (r.erro) { st.log.unshift('id ' + r.n + ': ' + r.erro); fora++; continue; }
        if (r.x.vazio) { fora++; continue; }
        if (!r.x.ano || r.x.ano < de) { fora++; continue; }
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
        for (const a of (x.arquivos || []).concat(x.documentos || [])) st.arquivos.push(a.url);
        st.texto = st.itens.length + ' itens encontrados até agora (' + st.arquivos.length + ' arquivos)…';
      });
      st.texto = 'Medindo o tamanho dos arquivos…'; atualizarCartao(chave);
      const unicos = [...new Set(st.arquivos)];
      let medidos = 0, semTamanho = 0;
      for (let i = 0; i < unicos.length && !st.parar; i += 30) {
        const r = await servidor({ acao: 'medir', urls: unicos.slice(i, i + 30) });
        for (const t of r.tamanhos) { if (t.bytes) st.bytes += t.bytes; else semTamanho++; }
        medidos += r.tamanhos.length;
        st.texto = 'Medindo arquivos: ' + medidos + ' de ' + unicos.length + '…'; atualizarCartao(chave);
      }
      if (semTamanho && medidos > semTamanho) st.bytes = Math.round(st.bytes * medidos / (medidos - semTamanho));
      const anos = {}; st.itens.forEach((i) => { anos[i.x.ano] = (anos[i.x.ano] || 0) + 1; });
      st.texto = st.itens.length + ' itens de ' + Object.keys(anos).sort().map((a) => a + ' (' + anos[a] + ')').join(', ') +
        ' · ' + unicos.length + ' arquivos · cerca de ' + mb(st.bytes) + (semTamanho ? ' (' + semTamanho + ' sem tamanho informado: estimado)' : '');
      st.analisado = true;
    } catch (e) { st.texto = 'Parou: ' + e.message; }
    st.rodando = null; atualizarCartao(chave); desenharEspaco();
  }

  // ---------------- importação ----------------
  async function jaMigrado(url) {
    const { data } = await sb.from('migracao_itens').select('situacao').eq('orgao_id', org()).eq('origem_url', url).maybeSingle();
    return data;
  }
  async function marcar(url, chave, tabela, id, x, situacao, detalhe, bytes) {
    await sb.from('migracao_itens').upsert({ orgao_id: org(), origem_url: url, secao: chave, tabela, registro_id: id || null, ano: x && x.ano || null,
      situacao, detalhe: detalhe ? String(detalhe).slice(0, 500) : null, bytes: bytes || null }, { onConflict: 'orgao_id,origem_url' });
  }
  async function copiar(url, pasta) {
    try { const r = await servidor({ acao: 'copiar', url, pasta }); return { url: r.url_publica, bytes: r.bytes || 0 }; }
    catch (e) { return { erro: e.message }; }
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
      const r = x.registro;
      if (r.numero && await existente('publicacoes', { tipo: r.tipo, numero: r.numero, ano: r.ano })) return { situacao: 'ja_existia' };
      const a = x.arquivos[0] ? await copiar(x.arquivos[0].url, s.pasta) : {};
      const reg = Object.assign({ orgao_id: org(), origem: 'importacao' }, r, { arquivo_url: a.url || null, situacao: a.url ? 'publicado' : 'rascunho' });
      const { data, error } = await sb.from('publicacoes').insert(reg).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'publicacoes', bytes: a.bytes, aviso: a.erro };
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
      if (r.numero && await existente('contratos', { numero: r.numero, ano: r.ano })) return { situacao: 'ja_existia' };
      const a = x.arquivos[0] ? await copiar(x.arquivos[0].url, s.pasta) : {};
      const { data, error } = await sb.from('contratos').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r, { arquivo_url: a.url || null })).select('id').single();
      if (error) throw error;
      return { situacao: 'importado', id: data.id, tabela: 'contratos', bytes: a.bytes, aviso: a.erro };
    },
    async concurso(x, s) {
      const r = x.registro;
      if (await existente('concursos', { tipo: r.tipo, numero: r.numero, ano: r.ano })) return { situacao: 'ja_existia' };
      const { data, error } = await sb.from('concursos').insert(Object.assign({ orgao_id: org(), situacao: 'publicado' }, r)).select('id').single();
      if (error) throw error;
      let bytes = 0, falhas = 0;
      for (const d of x.documentos || []) {
        const a = await copiar(d.url, s.pasta);
        if (!a.url) { falhas++; continue; }
        bytes += a.bytes || 0;
        const { error: e2 } = await sb.from('concursos_documentos').insert({ concurso_id: data.id, orgao_id: org(), tipo: d.tipo,
          titulo: d.titulo.length >= 2 ? d.titulo : 'Documento', data: d.data, arquivo_url: a.url });
        if (e2) falhas++;
      }
      return { situacao: 'importado', id: data.id, tabela: 'concursos', bytes, aviso: falhas ? falhas + ' documento(s) não copiado(s)' : null };
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

  async function importar(chave) {
    const s = adaptador.secoes[chave];
    const st = estado[chave] = Object.assign(estado[chave] || {}, { rodando: 'importacao', parar: false, log: [], feitos: 0, novos: 0, existentes: 0, erros: 0, bytesCopiados: 0 });
    atualizarCartao(chave);
    const tratar = async (url, x) => {
      const ja = await jaMigrado(url);
      if (ja && ja.situacao !== 'erro') { st.feitos++; return; }
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
    await carregar(); desenhar();
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
        el('span', { class: 'etiqueta' + (s.pntp ? ' etiqueta-ativo' : '') }, s.pntp ? 'PNTP · 3 anos' : '2 anos'),
        el('span', { class: 'ajuda' }, 'De ' + de + ' a ' + ate + ' → ' + s.destino)),
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
    conteiner.replaceChildren(
      el('div', { class: 'cabecalho-modulo' }, el('div', null, el('h1', null, 'Migração do site antigo'),
        el('p', { class: 'sub' }, 'Traz para o portal o que já está publicado no site atual do órgão, com os arquivos.'))),
      el('p', { class: 'msg msg-info' }, 'Período: exercício atual e os 2 anteriores (' + (ANO - 2) + ' a ' + ANO + ') no que pontua no PNTP; atual e o anterior no restante. ',
        'Primeiro use "Analisar e medir" (não grava nada) para ver quantos itens e quanto espaço; depois "Importar". Pode pausar e continuar: o que já veio não é repetido. ',
        'Mantenha esta tela aberta durante a importação.'),
      el('section', { class: 'cartao' }, el('h2', { class: 'm-0' }, 'Site de origem'),
        el('div', { class: 'linha-botoes mt-1' }, origem, btnO),
        el('p', { class: 'ajuda mt-05' }, ok ? 'Modelo reconhecido: ' + adaptador.nome + '.' : 'Informe o endereço do site antigo e clique em "Salvar e reconhecer".'),
        caixaEspaco),
      ok ? Object.entries(adaptador.secoes).map(([k, s]) => cartaoSecao(k, s)) : null,
      el('p', { class: 'ajuda mt-2' }, 'Receitas, despesas, folha, diárias, ordem cronológica, emendas e licitações/contratos dos sistemas de gestão continuam nos sistemas oficiais: ligue-os em Aparência › Destinos das páginas.'));
    desenharEspaco();
  }

  P.telas.migracao = async function (c) {
    conteiner = c;
    c.replaceChildren(el('h1', null, 'Migração do site antigo'), el('p', { class: 'sub' }, 'Carregando…'));
    if (!window.MIGRACAO_ADAPTADORES) { c.querySelector('.sub').textContent = 'Adaptadores de migração não carregados.'; return; }
    try { await carregar(); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = /migracao_resumo/.test(e.message || '') ? 'Falta rodar o script 31 no banco.' : traduzirErro(e); }
  };
})();
