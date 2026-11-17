// =====================================================================
// Kit de evidências PNTP (Avalia) — 0.45.0 (script 51)
// Para o controle interno preparar as respostas do questionário do PNTP no
// Avalia (avalia.atricon.org.br) sem montar nada à mão. Uma linha por item da
// matriz que vale para o órgão (autoavaliação, script 26), na ordem e com a
// numeração do questionário, com:
//   · resposta sugerida para cada critério (Disponibilidade, Atualidade, Série
//     Histórica, Relatórios e Filtros → Atende / Não atende / N/A);
//   · links prontos (página do portal e destinos externos) e texto de
//     esclarecimento (curto e completo), cada um com "Copiar";
//   · prints das páginas do próprio portal, com marcação em vermelho (modo
//     evidência do site, site/evidencia.js) e carimbo de endereço, data e hora.
//     Um mesmo print comprova todos os itens e critérios da mesma tela.
// "Gerar kit" monta tudo, guarda os prints no armazenamento do órgão (uma vez
// cada) com o histórico da geração e baixa um ZIP por item.
// NÃO preenche nem envia nada ao Avalia.
// Primeira versão: Câmara (o plano de prints abaixo cobre a matriz comum e a do
// Legislativo; Prefeitura e Consórcio entram depois).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado } = P;
  const BUCKET = 'arquivos';

  // Critérios do Avalia, na ordem do questionário. Letra = item de verificação da autoavaliação.
  const CRITERIOS = [['D', 'disponibilidade', 'Disponibilidade'], ['A', 'atualidade', 'Atualidade'], ['S', 'serie_historica', 'Série Histórica'],
    ['G', 'gravacao', 'Relatórios'], ['F', 'filtro', 'Filtros']];
  const NOME_LETRA = Object.fromEntries(CRITERIOS.map(([l, , n]) => [l, n]));
  const SLUG_LETRA = { D: 'disponibilidade', A: 'atualidade', S: 'serie-historica', G: 'relatorios', F: 'filtros' };
  const FORMATOS = ['CSV', 'JSON', 'XML', 'XLSX', 'PDF', 'Imprimir'];
  const CLASSIF = { essencial: 'Essencial', obrigatoria: 'Obrigatório', recomendada: 'Recomendado' };
  const SITUACAO = { atende: ['Atende', 'publicado'], parcial: ['Parcial', 'agendado'], nao_atende: ['Não atende', 'rascunho'] };
  const POR_PAGINA = 20;

  // ---------------------------------------------------------------------
  // Plano de cada item (Câmara: matriz comum + Legislativo).
  //   r: página do site; m: marcas (letras do critério ou {s: seletor, t: rótulo}, {x: texto, t}, {col: coluna, t});
  //      sem m, marca as letras que o critério cobra; fonte: chave de pntp_kit_fatos; un: [singular, plural];
  //   det: página de detalhe que também comprova (registro mais recente que serve); detM: marcas do detalhe.
  // Prints de páginas iguais são um só (com as marcas de todos os itens que a página comprova).
  // ---------------------------------------------------------------------
  const PLANO = {
    '1.1': { r: '/', m: [{ s: '#marca', t: 'Site oficial do órgão (endereço no carimbo)' }] },
    '1.2': { r: '/transparencia', m: ['D'] },
    '1.3': { r: '/', m: [{ s: '.btn-transparencia', t: 'Acesso ao Portal da Transparência' }] },
    '1.4': { r: '/', m: [{ s: '#form-busca', t: 'Ferramenta de pesquisa' }] },
    '2.1': { r: '/estrutura', m: ['D'], fonte: 'unidades', un: ['unidade', 'unidades'] },
    '2.2': { r: '/estrutura', m: ['D'], fonte: 'unidades', un: ['unidade', 'unidades'] },
    '2.3': { r: '/gestores', m: ['D'], fonte: 'gestores', un: ['responsável', 'responsáveis'] },
    '2.4': { r: '/contato', m: [{ x: 'Endereço', t: 'Endereço, telefone e e-mail' }] },
    '2.5': { r: '/contato', m: [{ x: 'Horário', t: 'Horário de atendimento' }] },
    '2.6': { r: '/publicacoes', fonte: 'publicacoes', un: ['ato publicado', 'atos publicados'], decl: ['publicacoes'] },
    '2.7': { r: '/faq', m: ['D'], fonte: 'faq', un: ['pergunta', 'perguntas'] },
    '2.8': { r: '/', m: [{ s: '.redes-topo, #rodape .redes', t: 'Redes sociais' }] },
    '2.9': { r: '/', m: [{ s: 'a[href*="radardatransparencia"]', t: 'Radar da Transparência Pública' }] },
    '3.1': { r: '/receitas/arrecadacao', fonte: 'receitas', un: ['lançamento de receita', 'lançamentos de receita'], decl: ['receitas_arrecadacao'] },
    '4.1': { r: '/despesas/empenhos', fonte: 'despesas', un: ['empenho', 'empenhos'], decl: ['despesas_empenhos'] },
    '4.2': { r: '/despesas/classificacao', fonte: 'despesas', un: ['empenho', 'empenhos'], decl: ['despesas_empenhos'] },
    '4.3': { r: '/despesas/empenhos', fonte: 'despesas', un: ['empenho', 'empenhos'], decl: ['despesas_empenhos'] },
    '5.1': { r: '/convenios/recebidas', fonte: 'convenios_recebida', un: ['transferência recebida', 'transferências recebidas'], decl: ['convenios_recebidas'] },
    '5.2': { r: '/convenios/realizadas', fonte: 'convenios_realizada', un: ['transferência realizada', 'transferências realizadas'], decl: ['convenios_realizadas'] },
    '5.3': { r: '/convenios/acordos', fonte: 'convenios_sem_repasse', un: ['acordo', 'acordos'], decl: ['convenios_acordos'] },
    '6.1': { r: '/pessoal/servidores', fonte: 'pessoal_servidores', un: ['servidor', 'servidores'], decl: ['pessoal_servidores'] },
    '6.2': { r: '/pessoal/remuneracao', fonte: 'pessoal_remuneracao', un: ['lançamento de folha', 'lançamentos de folha'], decl: ['pessoal_remuneracao'] },
    '6.3': { r: '/pessoal/cargos', fonte: 'pessoal_cargos', un: ['cargo', 'cargos'], decl: ['pessoal_cargos'] },
    '6.4': { r: '/pessoal/estagiarios', fonte: 'pessoal_estagiarios', un: ['estagiário', 'estagiários'], decl: ['pessoal_estagiarios'] },
    '6.5': { r: '/pessoal/terceirizados', fonte: 'pessoal_terceirizados', un: ['terceirizado', 'terceirizados'], decl: ['pessoal_terceirizados'] },
    '6.6': { r: '/concursos', fonte: 'concursos', un: ['seleção', 'seleções'], decl: ['concursos'] },
    '6.7': { r: '/concursos', fonte: 'concursos', un: ['seleção', 'seleções'], decl: ['concursos'], det: 'concurso', detM: ['D'] },
    '7.1': { r: '/diarias/concedidas', fonte: 'diarias_concedidas', un: ['diária concedida', 'diárias concedidas'], decl: ['diarias_concedidas'] },
    '7.2': { r: '/diarias/tabela', m: ['D'], fonte: 'diarias_tabela', un: ['valor na tabela', 'valores na tabela'], decl: ['diarias_tabela'] },
    '8.1': { r: '/licitacoes', fonte: 'licitacoes_todos', un: ['processo', 'processos'], decl: ['licitacoes_licitacoes', 'licitacoes_diretas', 'licitacoes_adesoes'] },
    '8.2': { r: '/licitacoes/licitacoes', m: ['S'], fonte: 'licitacoes_licitacoes', un: ['licitação', 'licitações'], decl: ['licitacoes_licitacoes'], det: 'licitacao_edital', detM: [{ s: '.partes-contas', t: 'Íntegra do edital' }] },
    '8.3': { r: '/licitacoes/licitacoes', m: ['S'], fonte: 'licitacoes_licitacoes', un: ['licitação', 'licitações'], decl: ['licitacoes_licitacoes'], det: 'licitacao_fases', detM: [{ s: '.partes-contas', t: 'Documentos das fases interna e externa' }] },
    '8.4': { r: '/licitacoes/diretas', fonte: 'licitacoes_diretas', un: ['dispensa ou inexigibilidade', 'dispensas e inexigibilidades'], decl: ['licitacoes_diretas'] },
    '8.5': { r: '/licitacoes/adesoes', fonte: 'licitacoes_adesoes', un: ['adesão a ata', 'adesões a atas'], decl: ['licitacoes_adesoes'] },
    '8.6': { r: '/licitacoes/pca', fonte: 'pca', un: ['plano', 'planos'], decl: ['pca'] },
    '8.7': { r: '/licitacoes/sancionados', fonte: 'sancionados', un: ['sanção', 'sanções'], decl: ['sancionados'] },
    '9.1': { r: '/contratos', fonte: 'contratos', un: ['contrato', 'contratos'], decl: ['contratos'] },
    '9.2': { r: '/contratos', m: ['S'], fonte: 'contratos_integra', un: ['contrato com a íntegra', 'contratos com a íntegra'], decl: ['contratos'], det: 'contrato', detM: ['D'] },
    '9.3': { r: '/contratos/fiscais', fonte: 'fiscais', un: ['fiscal designado', 'fiscais designados'], decl: ['fiscais'] },
    '9.4': { r: '/ordem-cronologica', fonte: 'ordem_cronologica', un: ['pagamento', 'pagamentos'], decl: ['ordem_cronologica'] },
    '10.1': { r: '/obras', fonte: 'obras', un: ['obra', 'obras'], decl: ['obras'] },
    '10.2': { r: '/obras', m: [], fonte: 'obras', un: ['obra', 'obras'], decl: ['obras'], det: 'obra', detM: [{ x: 'Planilha', t: 'Quantitativos e preços contratados' }] },
    '10.3': { r: '/obras', m: [], fonte: 'obras', un: ['obra', 'obras'], decl: ['obras'], det: 'obra', detM: [{ x: 'Medições', t: 'Quantitativos executados e valores pagos' }] },
    '10.4': { r: '/obras/paralisadas', fonte: 'obras_paralisadas', un: ['obra paralisada', 'obras paralisadas'], decl: ['obras_paralisadas', 'obras'] },
    '11.1': { r: '/planejamento/balanco', fonte: 'planejamento_balanco', un: ['documento', 'documentos'], decl: ['planejamento_balanco'] },
    '11.2': { r: '/planejamento/relatorio_gestao', fonte: 'planejamento_relatorio_gestao', un: ['documento', 'documentos'], decl: ['planejamento_relatorio_gestao'] },
    '11.3': { r: '/planejamento/parecer_tce', fonte: 'planejamento_parecer_tce', un: ['documento', 'documentos'], decl: ['planejamento_parecer_tce'] },
    '11.5': { r: '/planejamento/rgf', fonte: 'planejamento_rgf', un: ['relatório', 'relatórios'], decl: ['planejamento_rgf'] },
    '11.7': { r: '/planejamento/plano_estrategico', fonte: 'planejamento_plano_estrategico', un: ['documento', 'documentos'], decl: ['planejamento_plano_estrategico'] },
    '12.1': { r: '/esic/como-pedir', m: [{ x: 'Unidade responsável', t: 'Unidade e responsável pelo SIC' }] },
    '12.2': { r: '/esic/como-pedir', m: [{ x: 'Horário', t: 'Endereço, telefone, e-mail e horário' }] },
    '12.3': { r: '/esic/pedir', m: [{ s: '#conteudo form', t: 'Pedido pela internet (e-SIC)' }] },
    '12.4': { r: '/esic/pedir', m: [{ s: '#conteudo form', t: 'Sem exigências que dificultem o pedido' }] },
    '12.5': { r: '/esic/como-pedir', m: [{ x: 'Norma', t: 'Norma local da LAI' }] },
    '12.6': { r: '/esic/prazos', m: ['D'] },
    '12.7': { r: '/esic/relatorios', fonte: 'esic_relatorios', un: ['relatório', 'relatórios'], decl: ['esic_relatorios'] },
    '12.8': { r: '/esic/classificadas', fonte: 'esic_classificadas', un: ['informação classificada', 'informações classificadas'], decl: ['esic_classificadas'] },
    '12.9': { r: '/esic/desclassificadas', fonte: 'esic_desclassificadas', un: ['informação desclassificada', 'informações desclassificadas'], decl: ['esic_desclassificadas'] },
    '13.1': { r: '/', m: [{ s: '.acess-ferramentas a[href="#/acessibilidade"]', t: 'Acessibilidade em destaque' }] },
    '13.2': { r: '/transparencia', m: [{ s: '#trilha', t: 'Caminho de navegação' }] },
    '13.3': { r: '/', m: [{ s: '#btn-contraste', t: 'Alto contraste' }] },
    '13.4': { r: '/', m: [{ s: '.acess-ferramentas .fontes', t: 'Tamanho do texto' }] },
    '13.5': { r: '/mapa-do-site', m: ['D'] },
    '14.1': { r: '/ouvidoria/como-manifestar', m: [{ x: 'Atendimento presencial', t: 'Atendimento presencial da Ouvidoria' }] },
    '14.2': { r: '/ouvidoria/manifestar', m: [{ s: '#conteudo form', t: 'Canal eletrônico de manifestações' }] },
    '14.3': { r: '/servicos', m: ['D'], fonte: 'carta_servicos', un: ['serviço', 'serviços'] },
    '15.1': { r: '/lgpd', m: [{ x: 'Encarregado', t: 'Encarregado de dados e contato' }] },
    '15.2': { r: '/lgpd', m: [{ x: 'Política de privacidade', t: 'Política de privacidade' }] },
    '15.3': { r: '/servicos-online', m: ['D'], fonte: 'servicos_online', un: ['serviço on-line', 'serviços on-line'] },
    '15.4': { r: '/dados-abertos', m: ['D'] },
    '15.5': { r: '/lgpd', m: [{ x: 'Governo Digital', t: 'Norma do Governo Digital' }] },
    '15.6': { r: '/ouvidoria/satisfacao', m: ['D'], decl: ['ouvidoria_satisfacao'] },
    '20.1': { r: '/parlamentares', m: ['D'], fonte: 'parlamentares', un: ['vereador em exercício', 'vereadores em exercício'], det: 'parlamentar', detM: [{ x: 'Biografia', t: 'Biografia do parlamentar' }] },
    '20.2': { r: '/publicacoes', fonte: 'publicacoes_legislativo', un: ['lei ou ato legislativo', 'leis e atos legislativos'], decl: ['publicacoes'] },
    '20.3': { r: '/proposicoes', fonte: 'proposicoes', un: ['proposição', 'proposições'], decl: ['legislativo_proposicoes'], det: 'proposicao', detM: [{ x: 'Tramitação', t: 'Tramitação, autor e relator' }] },
    '20.4': { r: '/sessoes', m: ['D', 'A', 'G', 'F', { col: 'Pauta', t: 'Pauta das sessões' }], fonte: 'sessoes_pauta', un: ['sessão com pauta', 'sessões com pauta'], decl: ['legislativo_sessoes'] },
    '20.5': { r: '/comissoes', fonte: 'comissoes_reunioes', un: ['reunião de comissão', 'reuniões de comissões'], decl: ['legislativo_comissoes'] },
    '20.6': { r: '/sessoes', m: ['D', 'A', 'S', 'G', 'F', { col: 'Ata', t: 'Atas das sessões' }], fonte: 'sessoes_ata', un: ['sessão com ata', 'sessões com ata'], decl: ['legislativo_sessoes'], det: 'sessao', detM: [{ x: 'Lista de presença', t: 'Lista de presença dos vereadores' }] },
    '20.7': { r: '/votacoes', fonte: 'votacoes', un: ['votação', 'votações'], decl: ['legislativo_votacoes'] },
    '20.8': { r: '/planejamento/julgamento_camara', fonte: 'julgamento_contas', un: ['julgamento', 'julgamentos'], decl: ['planejamento_julgamento_camara'] },
    '20.9': { r: '/sessoes', m: [{ col: 'Vídeo', t: 'Transmissão / vídeo das sessões' }], fonte: 'sessoes_video', un: ['sessão com vídeo', 'sessões com vídeo'] },
    '20.10': { r: '/verba-indenizatoria', fonte: 'verba_indenizatoria', un: ['despesa da verba', 'despesas da verba'], decl: ['legislativo_verba'] },
    '20.11': { r: '/atividade-parlamentar', fonte: 'parlamentares', un: ['vereador', 'vereadores'] }
  };

  // Página de detalhe mais recente que serve de prova (null = não há).
  const DETALHES = {
    async licitacao_edital() {
      const { data } = await sb.from('licitacoes').select('id, numero, ano, licitacoes_documentos(tipo)').eq('orgao_id', org()).eq('situacao', 'publicado')
        .not('modalidade', 'in', '(dispensa,inexigibilidade,adesao_ata)').order('data_publicacao', { ascending: false, nullsFirst: false }).limit(40);
      const x = (data || []).find((l) => (l.licitacoes_documentos || []).some((d) => d.tipo === 'edital'));
      return x && { r: '/licitacao/' + x.id, nome: 'Licitação nº ' + x.numero + '/' + x.ano };
    },
    async licitacao_fases() {
      const { data } = await sb.from('licitacoes').select('id, numero, ano, licitacoes_documentos(tipo)').eq('orgao_id', org()).eq('situacao', 'publicado')
        .not('modalidade', 'in', '(dispensa,inexigibilidade,adesao_ata)').order('data_publicacao', { ascending: false, nullsFirst: false }).limit(40);
      const x = (data || []).find((l) => new Set((l.licitacoes_documentos || []).map((d) => d.tipo)).size >= 3);
      return x && { r: '/licitacao/' + x.id, nome: 'Licitação nº ' + x.numero + '/' + x.ano };
    },
    async contrato() {
      const { data } = await sb.from('contratos').select('id, numero, ano').eq('orgao_id', org()).eq('situacao', 'publicado').not('arquivo_url', 'is', null)
        .order('data_assinatura', { ascending: false, nullsFirst: false }).limit(1);
      const x = (data || [])[0];
      return x && { r: '/contrato/' + x.id, nome: 'Contrato nº ' + x.numero + '/' + x.ano };
    },
    async obra() {
      const { data } = await sb.from('obras').select('id, titulo').eq('orgao_id', org()).eq('situacao', 'publicado').order('atualizado_em', { ascending: false }).limit(1);
      const x = (data || [])[0];
      return x && { r: '/obra/' + x.id, nome: x.titulo };
    },
    async concurso() {
      const { data } = await sb.from('concursos').select('id, titulo, concursos_documentos(tipo)').eq('orgao_id', org()).eq('situacao', 'publicado').order('ano', { ascending: false }).limit(20);
      const x = (data || []).find((c) => (c.concursos_documentos || []).some((d) => !['edital', 'retificacao', 'anexo'].includes(d.tipo))) || (data || [])[0];
      return x && { r: '/concurso/' + x.id, nome: x.titulo };
    },
    async proposicao() {
      const { data } = await sb.from('proposicoes').select('id, numero, ano, proposicoes_tramites(id)').eq('orgao_id', org()).eq('situacao', 'publicado')
        .order('data_apresentacao', { ascending: false, nullsFirst: false }).limit(30);
      const x = (data || []).find((p) => (p.proposicoes_tramites || []).length) || (data || [])[0];
      return x && { r: '/proposicao/' + x.id, nome: 'Proposição nº ' + x.numero + '/' + x.ano };
    },
    async sessao() {
      const { data } = await sb.from('sessoes').select('id, numero, data, sessoes_presencas(presente)').eq('orgao_id', org()).eq('situacao', 'publicado').is('comissao_id', null)
        .order('data', { ascending: false }).limit(30);
      const x = (data || []).find((s) => (s.sessoes_presencas || []).length);
      return x && { r: '/sessao/' + x.id, nome: 'Sessão de ' + P.dataBR(x.data) };
    },
    async parlamentar() {
      const { data } = await sb.from('parlamentares').select('id, nome, nome_parlamentar').eq('orgao_id', org()).eq('situacao', 'publicado').eq('em_exercicio', true)
        .not('biografia', 'is', null).order('ordem').limit(1);
      const x = (data || [])[0];
      return x && { r: '/parlamentar/' + x.id, nome: x.nome_parlamentar || x.nome };
    }
  };

  // ---------- estado da tela ----------
  let perm = null, area = null, orgaoDados = null;
  let linhas = [], fatos = {}, decls = [], lancados = {}, ultimaGeracao = null, paginasInfo = {};
  let prints = [];        // prints da geração em uso: [{ id, rota, url, nome, itens: [{c, letras, rotulos}], png | publico, faltou }]
  let filtro = { busca: '', situacao: '', lancado: '' }, mostrar = POR_PAGINA, aba = 'itens';
  const org = () => P.estado.orgao.id;
  const cfgOrgao = () => (orgaoDados && orgaoDados.configuracoes) || P.estado.orgao.configuracoes || {};

  // ---------- utilidades ----------
  const dataBR = (d) => d ? new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '';
  const dataHora = (d) => d ? new Date(d).toLocaleDateString('pt-BR') + ' às ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const listaE = (l) => l.length <= 1 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
  const plural = (n, un) => n + ' ' + (n === 1 ? un[0] : un[1]);
  const codigoPasta = (c) => c.split('.').map((x, i) => i === 0 ? x.padStart(2, '0') : x).join('.');
  const limparNome = (t) => String(t || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const slug = (t) => P.normalizar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'inicio';
  const tituloCurto = (t) => limparNome(String(t).replace(/\s*\(.*?\)\s*/g, ' ').split(/[:;]/)[0]).slice(0, 60);

  async function copiar(texto, btn) {
    try { await navigator.clipboard.writeText(texto); }
    catch (_) {
      const t = el('textarea', { style: 'position:fixed;left:-9999px' }); t.value = texto; document.body.append(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    if (btn) { const o = btn.textContent; btn.textContent = 'Copiado ✓'; setTimeout(() => { btn.textContent = o; }, 1500); }
  }
  const botaoCopiar = (texto, rotulo) => { const b = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, rotulo || 'Copiar'); b.addEventListener('click', () => copiar(typeof texto === 'function' ? texto() : texto, b)); return b; };

  function carregarScript(src) {
    return new Promise((ok, erro) => {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar ' + src)); document.head.append(s);
    });
  }

  // Endereço público do site do órgão: domínio próprio ou o endereço provisório com ?orgao=CNPJ.
  function urlPublica(rota) {
    const o = orgaoDados || P.estado.orgao;
    if (o.dominio) return 'https://' + o.dominio + '/#' + rota;
    const chave = String(o.cnpj || '').replace(/\D/g, '') || o.id;
    return new URL('../site/', location.href).href + '?orgao=' + chave + '#' + rota;
  }

  // Destinos externos da página (Aparência › Destinos das páginas).
  function destinosDe(rota) {
    const chave = window.chaveDaRotaPNTP ? window.chaveDaRotaPNTP(rota) : null;
    if (!chave) return { chave: null, principal: null, outros: [] };
    const c = cfgOrgao();
    const principal = window.externoPNTP(c, chave);
    const outros = window.outrosLinksPNTP(c, chave);
    const extra = chave === 'licitacoes' && /^https?:\/\//.test(c.licitacoes_url || '') ? [{ url: c.licitacoes_url, descricao: 'Sistema de licitações' }] : [];
    return { chave, principal, outros: outros.concat(extra.filter((x) => !outros.some((o) => o.url === x.url))) };
  }
  const periodoLink = (l) => window.periodoLinkPNTP ? window.periodoLinkPNTP(l) : (l.de || l.ate ? (l.de || '') + (l.ate && l.ate !== l.de ? '–' + l.ate : '') : '');

  // Plano normalizado do item: prints que ele usa (página principal e detalhe).
  function planoDo(x) {
    const p = PLANO[x.codigo] || { r: x.pagina || '/', m: ['D'] };
    const letras = CRITERIOS.map(([l]) => l).filter((l) => x.itens.includes(l));
    return Object.assign({ m: letras, un: ['registro', 'registros'], decl: [] }, p, { letras });
  }

  // Declarações de inexistência do item, com o período escrito.
  function declaracoesDo(p) {
    return decls.filter((d) => p.decl.includes(d.secao)).map((d) => ({
      periodo: d.abrangencia === 'atual' ? 'situação atual' : window.periodoDeclaracaoPNTP ? window.periodoDeclaracaoPNTP(d) : String(d.exercicio || ''),
      texto: d.texto, registrada: d.criado_em, exercicio: d.exercicio, abrangencia: d.abrangencia }));
  }

  // ---------- respostas sugeridas ----------
  function respostas(x) {
    const r = {};
    for (const [l, campo] of CRITERIOS) {
      if (!x.itens.includes(l)) { r[l] = 'N/A'; continue; }
      const v = x[campo];
      r[l] = v === true ? 'Atende' : v === false ? 'Não atende' : 'N/A';
    }
    return r;
  }

  // ---------- textos de esclarecimento ----------
  function montarTextos(x) {
    const p = planoDo(x);
    const url = urlPublica(p.r);
    const dest = destinosDe(p.r);
    const f = p.fonte ? fatos[p.fonte] : null;
    const info = paginasInfo[p.r] || {};
    const ds = declaracoesDo(p);
    const resp = respostas(x);
    const cobra = (l) => x.itens.includes(l);
    const anos = f && f.anos && f.anos.length ? f.anos : null;
    const filtros = (info.filtros || []).filter((t) => !/^pesquisar$/i.test(t)).map((t) => t.replace(/^pesquisar\s*/i, 'pesquisa livre '));
    const formatos = info.exportar && info.exportar.length ? info.exportar : FORMATOS;
    const det = x._detalhe;

    const linhasCurto = [], completo = [];
    if (dest.principal) {
      linhasCurto.push('A informação é publicada no sistema externo indicado pelo órgão: ' + dest.principal + '. O portal leva a ele a partir de ' + url + '.');
    } else if (resp.D === 'Não atende') {
      linhasCurto.push('Ainda não há conteúdo publicado para este item em ' + url + '.');
    } else {
      linhasCurto.push('Publicado no portal do órgão: ' + url + (det ? ' (exemplo de detalhe: ' + urlPublica(det.r) + ')' : '') + '.');
    }
    if (f && f.total) {
      linhasCurto.push(plural(f.total, p.un) + (anos ? ' de ' + (anos.length > 1 ? anos[0] + ' a ' + anos[anos.length - 1] : anos[0]) : '')
        + (f.mais_recente ? '; o mais recente de ' + dataBR(f.mais_recente) : '') + (f.ultima_alteracao ? '; última atualização em ' + dataBR(f.ultima_alteracao) : '') + '.');
    }
    const semD = resp.D === 'Não atende' && !dest.principal;
    if (cobra('G') && !dest.principal && !semD) linhasCurto.push('Exportação em ' + listaE(formatos) + '.');
    if (cobra('F') && !dest.principal && !semD) linhasCurto.push(filtros.length ? 'Filtros: ' + listaE(filtros) + '.' : 'Com filtros de pesquisa.');
    if (ds.length) linhasCurto.push('Declaração de inexistência: ' + ds.slice(0, 3).map((d) => d.periodo).join('; ') + (ds.length > 3 ? ' e outros ' + (ds.length - 3) + ' períodos' : '') + '.');
    if (dest.outros.length) linhasCurto.push('Outros períodos/sistemas: ' + dest.outros.map((l) => (periodoLink(l) ? periodoLink(l) + ': ' : '') + l.url).join('; ') + '.');

    completo.push(x.codigo + ' – ' + x.titulo + ' (' + (CLASSIF[x.classificacao] || x.classificacao) + ').');
    if (dest.principal) {
      completo.push('Onde está: a informação é publicada no sistema externo indicado pelo órgão (' + dest.principal + '). A página do portal ' + url + ' explica e leva até ele (Aparência › Destinos das páginas).');
    } else {
      completo.push('Onde está: página "' + (info.titulo || tituloCurto(x.titulo)) + '" do portal, ' + url + '.' + (det ? ' Exemplo de página de detalhe: ' + det.nome + ', ' + urlPublica(det.r) + '.' : ''));
    }
    for (const [l, , nome] of CRITERIOS) {
      if (!cobra(l)) continue;
      let t = '';
      if (l === 'D') {
        t = dest.principal ? 'disponível no sistema externo indicado.' : f && f.total ? 'na página: ' + plural(f.total, p.un) + '.' : ds.length ? 'sem registros no período: o órgão publicou declaração de inexistência (' + ds.map((d) => d.periodo).join('; ') + ').' : 'conteúdo publicado na página.';
        if (ds.length && f && f.total) t += ' Períodos sem ocorrência declarados: ' + ds.map((d) => d.periodo + (d.texto ? ' — "' + d.texto + '"' : '')).join('; ') + '.';
      } else if (l === 'A') {
        t = f && (f.mais_recente || f.ultima_alteracao) ? (f.mais_recente ? 'registro mais recente de ' + dataBR(f.mais_recente) : '') + (f.mais_recente && f.ultima_alteracao ? '; ' : '') + (f.ultima_alteracao ? 'última inclusão ou alteração no portal em ' + dataBR(f.ultima_alteracao) : '') + '.'
          : info.atualizacao ? info.atualizacao + '.' : ds.length ? 'declaração de inexistência vigente para o período.' : 'conferir a data na página.';
      } else if (l === 'S') {
        const lista = info.anos && info.anos.length ? info.anos.map((a) => a.replace(/\s*\(.*$/, '')) : anos ? anos.map(String) : [];
        t = lista.length ? 'exercícios disponíveis em abas por ano: ' + listaE(lista) + '.' : 'conferir os exercícios na página.';
        const anosDecl = ds.filter((d) => d.exercicio).map((d) => d.exercicio);
        if (anosDecl.length) t += ' Exercícios sem ocorrência, com declaração: ' + listaE([...new Set(anosDecl)].sort().map(String)) + '.';
        if (dest.outros.length) t += ' Exercícios anteriores em outro endereço: ' + dest.outros.map((o) => (periodoLink(o) ? periodoLink(o) + ' — ' : '') + o.url).join('; ') + '.';
      } else if (l === 'G') {
        t = 'a lista pode ser baixada em ' + listaE(formatos) + ' (botões "Baixar" acima da lista).';
      } else if (l === 'F') {
        t = filtros.length ? 'pesquisa e filtros por ' + listaE(filtros.map((y) => y.toLowerCase())) + '.' : 'barra de pesquisa e filtros acima da lista.';
      }
      // Critério que não atende: diz o que falta, sem descrever como publicado o que não está.
      if (resp[l] === 'Não atende') t = (l === 'D' ? 'ainda não há conteúdo publicado para este item.' : 'não atende na autoavaliação.')
        + (l === 'D' && x.falta && x.falta.length ? ' ' + x.falta.join(' ') : '');
      completo.push(nome + ' (' + resp[l] + '): ' + t);
    }
    if (dest.outros.length && !cobra('S')) completo.push('Outros endereços indicados pelo órgão: ' + dest.outros.map((o) => (o.descricao ? o.descricao + ' ' : '') + (periodoLink(o) ? '(' + periodoLink(o) + ') ' : '') + o.url).join('; ') + '.');
    const ps = printsDo(x.codigo);
    if (ps.length) completo.push('Prints anexados: ' + ps.map((y) => y.nome).join(', ') + ' (marcações em vermelho, com endereço, data e hora no alto).');
    else if (dest.principal) completo.push('Sem print: o conteúdo está em sistema externo; vale o link acima.');
    return { curto: linhasCurto.join(' '), completo: completo.join('\n'), links: linksDo(x) };
  }

  function linksDo(x) {
    const p = planoDo(x);
    const dest = destinosDe(p.r);
    const l = [];
    if (dest.principal) l.push({ rotulo: 'Sistema externo (destino da página)', url: dest.principal });
    l.push({ rotulo: dest.principal ? 'Página do portal que leva ao sistema externo' : 'Página do portal', url: urlPublica(p.r) });
    if (x._detalhe && !dest.principal) l.push({ rotulo: 'Detalhe: ' + x._detalhe.nome, url: urlPublica(x._detalhe.r) });
    for (const o of dest.outros) l.push({ rotulo: (o.descricao || 'Outro endereço') + (periodoLink(o) ? ' (' + periodoLink(o) + ')' : ''), url: o.url });
    return l.filter((y, i) => l.findIndex((z) => z.url === y.url) === i);
  }

  const printsDo = (c) => prints.filter((p) => p.itens.some((i) => i.c === c));

  // ---------- carga ----------
  async function carregar() {
    const [o, av, ft, dc, lc, ger] = await Promise.all([
      sb.from('orgaos').select('id, nome, tipo, cnpj, dominio, configuracoes').eq('id', org()).maybeSingle(),
      P.avaliacaoPntp(true),
      sb.rpc('pntp_kit_fatos', { p_orgao: org() }),
      sb.from('declaracoes_inexistencia').select('secao, abrangencia, exercicio, numero, data_inicio, data_fim, texto, criado_em').eq('orgao_id', org()).order('data_fim', { ascending: false, nullsFirst: true }).limit(3000),
      sb.from('pntp_kit_lancamentos').select('codigo, lancado_em, lancado_por_nome, observacao').eq('orgao_id', org()),
      sb.from('pntp_kit_geracoes').select('id, gerado_em, gerado_por_nome, resumo, prints, paginas').eq('orgao_id', org()).order('gerado_em', { ascending: false }).limit(1)
    ]);
    for (const r of [ft, lc, ger]) if (r.error) throw r.error;
    orgaoDados = o.data || P.estado.orgao;
    linhas = (av.linhas || []).slice();
    fatos = Object.fromEntries((ft.data || []).map((x) => [x.fonte, x]));
    decls = dc.error ? [] : dc.data || [];
    lancados = Object.fromEntries((lc.data || []).map((x) => [x.codigo, x]));
    ultimaGeracao = (ger.data || [])[0] || null;
    paginasInfo = (ultimaGeracao && ultimaGeracao.paginas) || {};
    prints = ultimaGeracao ? (ultimaGeracao.prints || []).map((p) => Object.assign({}, p, { publico: urlArquivo(p.caminho) })) : [];
    // Página de detalhe usada na última geração (licitação, contrato, sessão…): volta para os links e textos.
    for (const p of prints) {
      if (!/^\/(licitacao|contrato|obra|concurso|proposicao|sessao|parlamentar)\/[0-9a-f-]{36}$/i.test(p.rota)) continue;
      for (const i of p.itens) { const x = linhas.find((y) => y.codigo === i.c); if (x) x._detalhe = { r: p.rota, nome: 'registro de exemplo' }; }
    }
  }
  const urlArquivo = (caminho) => caminho ? sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl : null;

  // ---------- desenho ----------
  function desenhar() {
    const botaoAba = (id, rotulo) => el('button', { type: 'button', role: 'tab', class: 'aba', 'aria-selected': aba === id ? 'true' : 'false',
      onclick: () => { aba = id; desenhar(); } }, rotulo);
    const btnGerar = el('button', { type: 'button', class: 'btn btn-primario' }, 'Gerar kit (ZIP)');
    btnGerar.addEventListener('click', () => preDiagnostico(btnGerar));
    area.replaceChildren(
      el('div', { class: 'cabecalho-modulo' },
        el('div', null, el('h1', null, 'Kit de evidências PNTP (Avalia)'),
          el('p', { class: 'sub' }, 'Respostas, links, esclarecimentos e prints de cada item do questionário do PNTP 2026 · ' + (orgaoDados.nome || ''))),
        el('div', { class: 'botoes-cabecalho' }, btnGerar)),
      el('p', { class: 'ajuda' }, 'Tudo aqui é calculado com o que está publicado no portal agora. O módulo não preenche nem envia nada ao Avalia (avalia.atricon.org.br): copie, cole e anexe em cada item. A resposta sugerida segue a autoavaliação automática; confira antes de lançar.'),
      avisoPendencias(),
      el('div', { class: 'abas', role: 'tablist' }, botaoAba('itens', 'Itens do questionário (' + linhas.length + ')'), botaoAba('historico', 'Histórico de gerações')),
      el('div', { class: 'painel-guia' }, aba === 'itens' ? telaItens() : telaHistorico()));
  }

  // Pré-diagnóstico: o que vai sair "Não atende" ou incompleto, com o link para corrigir (avisos da autoavaliação).
  function itensPendentes() {
    return linhas.filter((x) => x.situacao !== 'atende' || Object.values(respostas(x)).includes('Não atende'));
  }
  function avisoPendencias() {
    const pend = itensPendentes();
    const faltas = prints.flatMap((p) => (p.faltou || []).map((f) => f.c + ' · ' + f.marca)).filter((v, i, l) => l.indexOf(v) === i);
    if (!pend.length && !faltas.length) return el('div', { class: 'aviso-pntp aviso-pntp-ok' }, el('strong', null, '✓ Nenhum item vai sair "Não atende" pela autoavaliação.'));
    return el('details', { class: 'aviso-pntp' },
      el('summary', null, 'Pré-diagnóstico: ' + plural(pend.length, ['item vai sair "Não atende" ou incompleto', 'itens vão sair "Não atende" ou incompletos'])
        + (faltas.length ? ' · ' + plural(faltas.length, ['marcação não encontrada no último print', 'marcações não encontradas no último print']) : '')),
      pend.length ? el('ul', { class: 'lista-crit' }, pend.map((x) => P.linhaCriterio(x, true))) : null,
      faltas.length ? el('p', { class: 'ajuda' }, 'Não encontrado na página no último print (confira o item ou a página): ' + faltas.join('; ') + '.') : null,
      el('p', { class: 'ajuda' }, 'Corrija no painel e gere o kit de novo. Itens externos ("sistema externo: conferir lá") contam como atendidos: confira no sistema indicado.'));
  }

  function filtrados() {
    const t = P.normalizar(filtro.busca);
    return linhas.filter((x) => (!t || P.normalizar(x.codigo + ' ' + x.titulo + ' ' + x.dimensao).includes(t))
      && (!filtro.situacao || (filtro.situacao === 'nao_atende' ? x.situacao !== 'atende' : x.situacao === filtro.situacao))
      && (!filtro.lancado || (filtro.lancado === 'sim' ? !!lancados[x.codigo] : !lancados[x.codigo])));
  }

  function telaItens() {
    const fBusca = el('input', { type: 'search', placeholder: 'Código ou assunto (ex.: 8.1, diárias)', value: filtro.busca, 'aria-label': 'Buscar item' });
    const fSit = el('select', { 'aria-label': 'Situação' }, [['', 'Situação: todas'], ['atende', 'Atende'], ['parcial', 'Parcial'], ['nao_atende', 'Não atende ou parcial']]
      .map(([v, t]) => el('option', { value: v, selected: filtro.situacao === v }, t)));
    const fLan = el('select', { 'aria-label': 'Lançado no Avalia' }, [['', 'Avalia: todos'], ['sim', 'Lançados no Avalia'], ['nao', 'Ainda não lançados']]
      .map(([v, t]) => el('option', { value: v, selected: filtro.lancado === v }, t)));
    const lista = el('div', { class: 'kit-lista' });
    const aplicar = () => { Object.assign(filtro, { busca: fBusca.value.trim(), situacao: fSit.value, lancado: fLan.value }); mostrar = POR_PAGINA; desenharLista(); };
    let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 300); });
    fSit.addEventListener('change', aplicar); fLan.addEventListener('change', aplicar);
    function desenharLista() {
      const fx = filtrados();
      const nLanc = linhas.filter((x) => lancados[x.codigo]).length;
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro', onclick: () => { mostrar += POR_PAGINA; desenharLista(); } }, 'Mostrar mais');
      lista.replaceChildren(
        fx.length ? el('div', null, fx.slice(0, mostrar).map(cartaoItem)) : el('p', { class: 'vazio' }, 'Nenhum item com esses filtros.'),
        el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + Math.min(mostrar, fx.length) + ' de ' + fx.length + ' · ' + nLanc + ' de ' + linhas.length + ' lançados no Avalia'),
          fx.length > mostrar ? btnMais : ''));
    }
    desenharLista();
    return [
      prints.length && ultimaGeracao ? el('p', { class: 'ajuda' }, 'Prints da última geração: ' + dataHora(ultimaGeracao.gerado_em) + (ultimaGeracao.gerado_por_nome ? ', por ' + ultimaGeracao.gerado_por_nome : '') + '. Gere o kit de novo para atualizar.')
        : prints.length ? el('p', { class: 'ajuda' }, 'Prints gerados agora (ainda não guardados no histórico).')
        : el('p', { class: 'ajuda' }, 'Ainda não há prints: use "Gerar kit (ZIP)" para criar as imagens marcadas de cada página.'),
      el('div', { class: 'filtros' }, fBusca, fSit, fLan),
      lista];
  }

  function etiquetaResp(v) {
    return el('span', { class: 'etiqueta etiqueta-' + (v === 'Atende' ? 'publicado' : v === 'Não atende' ? 'rascunho kit-nao' : 'inativo') }, v);
  }

  function cartaoItem(x) {
    const sit = SITUACAO[x.situacao] || [x.situacao, 'rascunho'];
    const resp = respostas(x);
    const lan = lancados[x.codigo];
    const marca = el('input', { type: 'checkbox', checked: !!lan, disabled: !perm.editar, 'aria-label': 'Lançado no Avalia: ' + x.codigo });
    marca.addEventListener('click', (e) => e.stopPropagation());
    marca.addEventListener('change', () => marcarLancado(x, marca));
    const corpo = el('div', { class: 'kit-corpo' });
    const det = el('details', { class: 'cartao kit-item' + (x.situacao !== 'atende' ? ' kit-pendente' : '') },
      el('summary', null,
        el('span', { class: 'kit-cod' }, x.codigo),
        el('span', { class: 'kit-tit' }, x.titulo,
          el('span', { class: 'etiqueta etiqueta-classif-' + x.classificacao }, CLASSIF[x.classificacao] || x.classificacao),
          el('span', { class: 'etiqueta etiqueta-' + sit[1] }, 'Autoavaliação: ' + sit[0]),
          x.externo ? el('span', { class: 'etiqueta' }, 'sistema externo') : null,
          printsDo(x.codigo).length ? el('span', { class: 'etiqueta' }, printsDo(x.codigo).length + ' print(s)') : null),
        el('span', { class: 'kit-resp-curta' }, CRITERIOS.filter(([l]) => x.itens.includes(l)).map(([l]) => el('span', { class: 'kit-letra kit-' + (resp[l] === 'Atende' ? 'ok' : resp[l] === 'Não atende' ? 'nao' : 'na'), title: NOME_LETRA[l] + ': ' + resp[l] }, l))),
        el('label', { class: 'kit-lancado', onclick: (e) => e.stopPropagation() }, marca, ' Lançado no Avalia',
          lan ? el('span', { class: 'sub-linha' }, dataHora(lan.lancado_em) + (lan.lancado_por_nome ? ' · ' + lan.lancado_por_nome : '')) : null)));
    det.addEventListener('toggle', () => { if (det.open && !corpo.childNodes.length) corpo.replaceChildren(...corpoItem(x).filter(Boolean)); });
    det.append(corpo);
    return det;
  }

  function corpoItem(x) {
    const resp = respostas(x);
    const tx = montarTextos(x);
    const ps = printsDo(x.codigo);
    const caixaTexto = (valor, linhasN) => { const t = el('textarea', { rows: linhasN, readonly: true, class: 'kit-texto' }); t.value = valor; return t; };
    return [
      el('h3', null, 'Resposta sugerida por critério'),
      el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela tabela-compacta' },
        el('thead', null, el('tr', null, CRITERIOS.map(([, , n]) => el('th', { scope: 'col' }, n)))),
        el('tbody', null, el('tr', null, CRITERIOS.map(([l]) => el('td', null, etiquetaResp(resp[l]))))))),
      x.falta && x.falta.length ? el('div', { class: 'aviso-pntp' }, el('strong', null, 'O que falta: '), el('ul', null, x.falta.map((t) => el('li', null, t))),
        x.rota ? el('p', null, el('a', { class: 'btn btn-claro btn-p', href: x.rota }, 'Corrigir no painel')) : null) : null,
      el('h3', null, 'Links'),
      el('ul', { class: 'kit-links' }, tx.links.map((l) => el('li', null, el('span', { class: 'kit-link-rot' }, l.rotulo + ': '),
        el('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.url), ' ', botaoCopiar(l.url)))),
      tx.links.length > 1 ? el('p', null, botaoCopiar(tx.links.map((l) => l.url).join('\n'), 'Copiar todos os links')) : null,
      el('h3', null, 'Esclarecimento'),
      el('div', { class: 'kit-textos' },
        el('div', null, el('div', { class: 'kit-texto-cab' }, el('strong', null, 'Versão curta'), botaoCopiar(tx.curto)), caixaTexto(tx.curto, 4)),
        el('div', null, el('div', { class: 'kit-texto-cab' }, el('strong', null, 'Versão completa'), botaoCopiar(tx.completo)), caixaTexto(tx.completo, 9))),
      el('h3', null, 'Prints'),
      ps.length ? el('div', { class: 'kit-prints' }, ps.map((p) => miniatura(p, x.codigo)))
        : el('p', { class: 'vazio' }, destinosDe(planoDo(x).r).principal ? 'Sem print: o conteúdo está em sistema externo (vale o link e o texto).' : 'Ainda sem print. Use "Gerar kit (ZIP)".')
    ];
  }

  function miniatura(p, codigo) {
    const src = p.png || p.publico;
    const meu = p.itens.find((i) => i.c === codigo);
    const outros = p.itens.filter((i) => i.c !== codigo).map((i) => i.c);
    return el('figure', { class: 'kit-print' },
      el('button', { type: 'button', class: 'kit-mini', onclick: () => abrirPrint(p), 'aria-label': 'Abrir o print ' + p.nome + ' em tamanho grande' },
        el('img', { src, alt: 'Print de ' + p.rota, loading: 'lazy' })),
      el('figcaption', null,
        el('strong', null, p.nome),
        el('span', { class: 'sub-linha' }, 'Comprova aqui: ' + (meu ? meu.rotulos.join(', ') : '—')),
        outros.length ? el('span', { class: 'sub-linha' }, 'Compartilhado com: ' + outros.join(', ')) : null,
        el('span', null, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => abrirPrint(p) }, 'Abrir'), ' ',
          el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => baixarPrint(p) }, 'Baixar'))));
  }

  function abrirPrint(p) {
    const lista = p.itens.map((i) => i.c + ': ' + i.rotulos.join(', ')).join(' · ');
    const dlg = P.abrirDialogo(p.nome, el('div', { class: 'kit-print-grande' },
      el('p', { class: 'ajuda' }, 'Página: ', el('a', { href: p.url, target: '_blank', rel: 'noopener' }, p.url)),
      el('p', { class: 'ajuda' }, 'Comprova: ' + lista),
      (p.faltou || []).length ? el('p', { class: 'msg msg-falta' }, 'Não encontrado na página: ' + p.faltou.map((f) => f.c + ' · ' + f.marca).join('; ')) : null,
      el('img', { src: p.png || p.publico, alt: 'Print de ' + p.rota, style: 'max-width:100%;border:1px solid #ccd' })),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Fechar'), el('button', { type: 'button', class: 'btn btn-primario', onclick: () => baixarPrint(p) }, 'Baixar')]);
    dlg.classList.add('dialogo-largo');
  }
  async function blobDoPrint(p) {
    if (p.blob) return p.blob;
    const r = await fetch(p.png || p.publico);
    if (!r.ok) throw new Error('Não foi possível baixar o print ' + p.nome + '.');
    return (p.blob = await r.blob());
  }
  async function baixarPrint(p) {
    try { baixar(await blobDoPrint(p), p.nome); } catch (e) { toast(e.message, true); }
  }
  function baixar(blob, nome) {
    const a = el('a', { href: URL.createObjectURL(blob), download: nome }); document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  async function marcarLancado(x, caixa) {
    caixa.disabled = true;
    try {
      if (caixa.checked) {
        const { data, error } = await sb.from('pntp_kit_lancamentos').upsert({ orgao_id: org(), codigo: x.codigo }, { onConflict: 'orgao_id,codigo' }).select('codigo, lancado_em, lancado_por_nome, observacao');
        if (error) throw error;
        lancados[x.codigo] = (data || [])[0] || { codigo: x.codigo, lancado_em: new Date().toISOString() };
        toast(x.codigo + ' marcado como lançado no Avalia.');
      } else {
        const { error } = await sb.from('pntp_kit_lancamentos').delete().eq('orgao_id', org()).eq('codigo', x.codigo);
        if (error) throw error;
        delete lancados[x.codigo];
        toast(x.codigo + ': marcação de lançado retirada.');
      }
      const aberto = caixa.closest('details').open;
      const novo = cartaoItem(x); if (aberto) novo.open = true;
      caixa.closest('details').replaceWith(novo);
    } catch (e) { caixa.checked = !caixa.checked; toast(P.erroGravacao(e), true); }
    finally { caixa.disabled = !perm.editar; }
  }

  // ---------- geração ----------
  function preDiagnostico(btn) {
    const pend = itensPendentes();
    const corpo = el('div', null,
      el('p', null, 'O kit traz, por item, a resposta sugerida, os links, o esclarecimento e os prints marcados das páginas do portal. Leva alguns minutos: a página de cada item é aberta numa moldura escondida e fotografada.'),
      pend.length ? el('div', { class: 'aviso-pntp' }, el('strong', null, plural(pend.length, ['item vai sair "Não atende" ou incompleto', 'itens vão sair "Não atende" ou incompletos']) + ':'),
        el('ul', { class: 'lista-crit' }, pend.map((x) => P.linhaCriterio(x, true)))) : el('p', { class: 'msg msg-ok' }, '✓ Nenhum item pendente na autoavaliação.'),
      perm.editar ? el('p', { class: 'ajuda' }, 'Os prints ficam guardados no armazenamento do órgão (um arquivo por print) com o histórico desta geração: servem de prova do que estava publicado hoje, nas fases de Validação e Manifestação.')
        : el('p', { class: 'ajuda' }, 'Seu perfil só visualiza este módulo: o kit será baixado, mas não fica guardado no histórico.'));
    const ok = el('button', { type: 'button', class: 'btn btn-primario' }, pend.length ? 'Gerar assim mesmo' : 'Gerar kit');
    const dlg = P.abrirDialogo('Gerar kit de evidências', corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar'), ok]);
    ok.addEventListener('click', () => { dlg.close(); gerarKit(btn); });
  }

  // Monta a lista de prints: uma página = um print, com as marcas de todos os itens que ela comprova.
  async function planejarPrints(progresso) {
    const porRota = new Map();
    const juntar = (rota, c, marcas) => {
      if (!marcas || !marcas.length) return;
      let p = porRota.get(rota);
      if (!p) porRota.set(rota, p = { rota, itens: [] });
      let it = p.itens.find((i) => i.c === c);
      if (!it) p.itens.push(it = { c, m: [] });
      for (const m of marcas) if (!it.m.some((y) => JSON.stringify(y) === JSON.stringify(m))) it.m.push(m);
    };
    const cache = {};
    for (const x of linhas) {
      const p = planoDo(x);
      x._detalhe = null;
      if (destinosDe(p.r).principal) continue;   // conteúdo em sistema externo: sem print
      // Declaração por ano sem registros: abre a aba do ano declarado (a declaração aparece com o período).
      let rota = p.r;
      const ds = declaracoesDo(p);
      const f = p.fonte && fatos[p.fonte];
      if (ds.length && (!f || !f.total) && !ds.some((d) => d.abrangencia === 'atual')) {
        const ano = ds.map((d) => d.exercicio).filter(Boolean).sort().pop();
        if (ano) rota = p.r + '?ano=' + ano;
      }
      // Só marca o que atende: print de página vazia não é evidência. Item sem nada que atenda fica sem print.
      const resp = respostas(x);
      const atendeD = resp.D === 'Atende' || ds.length > 0;
      const marcas = atendeD ? (p.m || []).filter((m) => typeof m !== 'string' ? true : m === 'D' ? true : p.letras.includes(m) && resp[m] === 'Atende') : [];
      juntar(rota, x.codigo, marcas);
      if (!atendeD) continue;
      if (p.det && DETALHES[p.det]) {
        progresso('Procurando o registro de exemplo do item ' + x.codigo + '…');
        if (!(p.det in cache)) { try { cache[p.det] = await DETALHES[p.det](); } catch (_) { cache[p.det] = null; } }
        if (cache[p.det]) { x._detalhe = cache[p.det]; juntar(cache[p.det].r, x.codigo, p.detM || ['D']); }
      }
    }
    return [...porRota.values()];
  }

  function moldura() {
    const f = el('iframe', { title: 'Moldura do modo evidência', 'aria-hidden': 'true', tabindex: '-1',
      style: 'position:fixed;left:-20000px;top:0;width:1280px;height:2600px;border:0;background:#fff' });
    f.src = new URL('../site/', location.href).href + '?orgao=' + org() + '&evidencia=1#/';
    document.body.append(f);
    return new Promise((ok, erro) => {
      const inicio = Date.now();
      const ver = () => {
        let ev = null;
        try { ev = f.contentWindow && f.contentWindow.EVIDENCIA; } catch (_) { /* outra origem */ }
        if (ev && ev.pronto) return ok(f);
        if (Date.now() - inicio > 40000) { f.remove(); return erro(new Error('O site não abriu no modo evidência (confira a conexão e tente de novo).')); }
        setTimeout(ver, 300);
      };
      f.addEventListener('load', () => setTimeout(ver, 300));
    });
  }

  async function sha256(blob) {
    const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function rotulosDe(it) {
    return it.m.map((m) => typeof m === 'string' ? NOME_LETRA[m] : m.t || m.col || m.x || 'Marcação');
  }
  function nomeDoPrint(n, p) {
    const letras = new Set();
    p.itens.forEach((i) => i.m.forEach((m) => { if (typeof m === 'string') letras.add(m); }));
    const crit = CRITERIOS.map(([l]) => l).filter((l) => letras.has(l)).map((l) => SLUG_LETRA[l]);
    const base = slug(p.rota.split('?')[0].replace(/^\//, '').replace(/\/[0-9a-f-]{36}$/i, '-detalhe') || 'pagina-inicial');
    return String(n).padStart(2, '0') + '-' + base + (crit.length ? '-' + crit.join('-') : '-marcacoes') + '.png';
  }

  async function gerarKit(btn) {
    ocupado(btn, 'Gerando…');
    const barra = el('div', { class: 'barra-carregando', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('span', { class: 'barra-carregando-valor', style: 'width:0%' }));
    const texto = el('p', { class: 'ajuda' }, 'Preparando…');
    const caixa = el('div', { class: 'cartao kit-progresso' }, el('strong', null, 'Gerando o kit de evidências'), texto, barra,
      el('p', { class: 'ajuda' }, 'Não feche esta tela até terminar.'));
    area.querySelector('.cabecalho-modulo').after(caixa);
    const passo = (pct, t) => { barra.firstChild.style.width = pct + '%'; barra.setAttribute('aria-valuenow', String(Math.round(pct))); texto.textContent = t; };
    let f = null;
    try {
      await carregar();   // tudo como está publicado agora
      const plano = await planejarPrints((t) => passo(2, t));
      passo(4, 'Abrindo o site no modo evidência…');
      f = await moldura();
      const ev = f.contentWindow.EVIDENCIA;
      const novos = [];
      const paginas = {};
      for (let i = 0; i < plano.length; i++) {
        const p = plano[i];
        const url = urlPublica(p.rota);
        passo(5 + 80 * i / plano.length, 'Print ' + (i + 1) + ' de ' + plano.length + ': ' + url);
        try {
          const r = await ev.preparar({ rota: p.rota, url, itens: p.itens });
          const cap = await ev.capturar(r.fundo);
          const blob = await (await fetch(cap.png)).blob();
          paginas[p.rota.split('?')[0]] = r.info;
          novos.push({ rota: p.rota, url, nome: nomeDoPrint(i + 1, p), png: cap.png, blob, largura: cap.largura, altura: cap.altura,
            itens: p.itens.map((it) => ({ c: it.c, letras: it.m.filter((m) => typeof m === 'string'), rotulos: rotulosDe(it) })),
            faltou: r.faltou || [], capturado_em: new Date().toISOString() });
        } catch (e) {
          console.error(e);
          novos.push({ rota: p.rota, url, nome: nomeDoPrint(i + 1, p), erro: e.message || String(e), itens: p.itens.map((it) => ({ c: it.c, letras: [], rotulos: rotulosDe(it) })), faltou: [] });
        }
      }
      try { ev.limpar(); } catch (_) { /* ignora */ }
      f.remove(); f = null;
      prints = novos.filter((p) => p.blob);
      paginasInfo = Object.assign({}, paginasInfo, paginas);
      const falhas = novos.filter((p) => p.erro);

      // Guarda os prints (um arquivo por print) e o histórico.
      let guardado = false;
      if (perm.editar) {
        for (let i = 0; i < prints.length; i++) {
          const p = prints[i];
          passo(86 + 8 * i / Math.max(1, prints.length), 'Guardando os prints no armazenamento do órgão (' + (i + 1) + ' de ' + prints.length + ')…');
          p.hash = await sha256(p.blob);
          p.caminho = org() + '/kit_pntp/' + p.hash + '.png';
          const up = await sb.storage.from(BUCKET).upload(p.caminho, p.blob, { contentType: 'image/png', upsert: false });
          if (up.error && !/exists|duplicate/i.test(up.error.message || '')) throw up.error;
          p.publico = urlArquivo(p.caminho);
        }
      }
      const itensKit = linhas.map((x) => { const t = montarTextos(x); return { c: x.codigo, titulo: x.titulo, classificacao: x.classificacao, situacao: x.situacao,
        respostas: respostas(x), links: t.links, curto: t.curto, completo: t.completo, prints: printsDo(x.codigo).map((p) => p.hash || p.nome) }; });
      const resumo = { itens: linhas.length, atende: linhas.filter((x) => x.situacao === 'atende').length, parcial: linhas.filter((x) => x.situacao === 'parcial').length,
        nao_atende: linhas.filter((x) => x.situacao === 'nao_atende').length, prints: prints.length, falhas: falhas.length,
        marcas_faltando: prints.reduce((s, p) => s + (p.faltou || []).length, 0), tipo: orgaoDados.tipo };
      if (perm.editar) {
        passo(95, 'Gravando o histórico desta geração…');
        const { data, error } = await sb.from('pntp_kit_geracoes').insert({ orgao_id: org(), resumo, itens: itensKit, paginas: paginasInfo,
          prints: prints.map((p) => ({ hash: p.hash, caminho: p.caminho, rota: p.rota, url: p.url, nome: p.nome, itens: p.itens, faltou: p.faltou, capturado_em: p.capturado_em, largura: p.largura, altura: p.altura })) })
          .select('id, gerado_em, gerado_por_nome, resumo, prints, paginas');
        if (error) throw error;
        ultimaGeracao = (data || [])[0] || null;
        guardado = true;
      }
      passo(97, 'Montando o arquivo ZIP…');
      const zip = await montarZip(itensKit, prints, resumo, falhas, new Date());
      baixar(zip, 'Kit PNTP ' + limparNome(orgaoDados.nome) + ' ' + new Date().toISOString().slice(0, 10) + '.zip');
      passo(100, 'Pronto.');
      toast('Kit gerado: ' + prints.length + ' prints' + (guardado ? ', guardados no histórico.' : '.') + (falhas.length ? ' ' + falhas.length + ' página(s) não puderam ser fotografadas.' : ''), falhas.length > 0);
      desenhar();
    } catch (e) {
      console.error(e);
      toast(P.erroGravacao(e), true);
      caixa.remove();
    } finally {
      if (f) f.remove();
      ocupado(btn);
    }
  }

  // ZIP: uma pasta por item ("08.1 Relação das licitações…") com os prints que ele usa (o compartilhado vai,
  // com o mesmo nome, em cada pasta) e o esclarecimento.txt; na raiz, LEIA-ME.txt com o resumo e o pré-diagnóstico.
  async function montarZip(itensKit, lista, resumo, falhas, quando) {
    await carregarScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
    const zip = new window.JSZip();
    const porNome = Object.fromEntries(lista.map((p) => [p.hash || p.nome, p]));
    const pend = itensPendentes();
    zip.file('LEIA-ME.txt', [
      'KIT DE EVIDÊNCIAS PNTP 2026 — ' + orgaoDados.nome,
      'Gerado em ' + dataHora(quando) + ' pelo painel SOFT+ GOV, com o que estava publicado no portal nesse momento.',
      '',
      'Cada pasta é um item do questionário do Avalia (avalia.atricon.org.br), com o código e o título do item.',
      'Em cada pasta: os prints que comprovam o item (marcações em vermelho com o nome do critério e o código; endereço, data e hora no alto)',
      'e o arquivo esclarecimento.txt, com a resposta sugerida por critério, os links e o texto de esclarecimento (versão curta e completa).',
      'Um mesmo print pode comprovar vários itens: ele aparece, com o mesmo nome, na pasta de cada item.',
      'Nada foi lançado no Avalia: copie, cole e anexe em cada item. Confira a resposta sugerida antes de lançar.',
      '',
      'Resumo: ' + resumo.itens + ' itens · ' + resumo.atende + ' atendem · ' + resumo.parcial + ' parciais · ' + resumo.nao_atende + ' não atendem · ' + resumo.prints + ' prints.',
      pend.length ? '\nPRÉ-DIAGNÓSTICO — itens que vão sair "Não atende" ou incompletos:\n' + pend.map((x) => '  ' + x.codigo + ' ' + x.titulo + (x.falta && x.falta.length ? '\n     · ' + x.falta.join('\n     · ') : '')).join('\n') : '\nPré-diagnóstico: nenhum item pendente na autoavaliação.',
      falhas.length ? '\nPáginas que não puderam ser fotografadas: ' + falhas.map((p) => p.url + ' (' + p.erro + ')').join('; ') : ''
    ].join('\n'));
    for (const it of itensKit) {
      const pasta = zip.folder(codigoPasta(it.c) + ' ' + tituloCurto(it.titulo));
      const ps = it.prints.map((h) => porNome[h]).filter(Boolean);
      for (const p of ps) pasta.file(p.nome, await blobDoPrint(p));
      pasta.file('esclarecimento.txt', [
        it.c + ' — ' + it.titulo,
        'Classificação: ' + (CLASSIF[it.classificacao] || it.classificacao) + ' · Autoavaliação: ' + ((SITUACAO[it.situacao] || [it.situacao])[0]),
        '',
        'RESPOSTA SUGERIDA',
        CRITERIOS.map(([l, , n]) => '  ' + n + ': ' + it.respostas[l]).join('\n'),
        '',
        'LINKS',
        it.links.map((l) => '  ' + l.rotulo + ': ' + l.url).join('\n'),
        '',
        'ESCLARECIMENTO (VERSÃO CURTA)',
        it.curto,
        '',
        'ESCLARECIMENTO (VERSÃO COMPLETA)',
        it.completo,
        '',
        'PRINTS',
        ps.length ? ps.map((p) => '  ' + p.nome + ' — ' + p.url + (p.itens.length > 1 ? ' (comprova também: ' + p.itens.map((i) => i.c).filter((c) => c !== it.c).join(', ') + ')' : '')).join('\n') : '  (sem print)'
      ].join('\n'));
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  // ---------- histórico ----------
  let historico = { lista: [], fim: true, carregado: false };
  function telaHistorico() {
    const caixa = el('div', null, el('p', { class: 'vazio' }, 'Carregando…'));
    const desenharH = () => {
      if (!historico.lista.length) { caixa.replaceChildren(el('p', { class: 'vazio' }, 'Nenhuma geração guardada ainda.')); return; }
      const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
      btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); await buscarH(false); desenharH(); });
      caixa.replaceChildren(
        el('p', { class: 'ajuda' }, 'Cada geração guarda as respostas, os textos e os prints do dia: é a prova do que estava publicado, útil nas fases de Validação e Manifestação.'),
        el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Gerado em', 'Por', 'Resumo'].map((h) => el('th', { scope: 'col' }, h)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
          el('tbody', null, historico.lista.map((g) => el('tr', null,
            el('td', { class: 'num' }, dataHora(g.gerado_em)),
            el('td', null, g.gerado_por_nome || '—'),
            el('td', { class: 'quebra' }, (g.resumo.itens || 0) + ' itens · ' + (g.resumo.atende || 0) + ' atendem · ' + (g.resumo.parcial || 0) + ' parciais · ' + (g.resumo.nao_atende || 0) + ' não atendem · ' + (g.resumo.prints || 0) + ' prints'),
            el('td', { class: 'acoes' },
              el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => verGeracao(g) }, 'Ver prints'),
              el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: (e) => baixarGeracao(g, e.currentTarget) }, 'Baixar ZIP'),
              perm.excluir ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirGeracao(g) }, 'Excluir') : null)))))),
        historico.fim ? '' : el('div', { class: 'rodape-lista' }, el('span'), btnMais));
    };
    (historico.carregado ? Promise.resolve() : buscarH(true)).then(desenharH).catch((e) => caixa.replaceChildren(el('p', { class: 'msg msg-erro' }, P.erroGravacao(e))));
    return caixa;
  }
  async function buscarH(reiniciar) {
    const de = reiniciar ? 0 : historico.lista.length;
    const { data, error } = await sb.from('pntp_kit_geracoes').select('id, gerado_em, gerado_por_nome, resumo, itens, prints').eq('orgao_id', org())
      .order('gerado_em', { ascending: false }).order('id', { ascending: false }).range(de, de + 19);
    if (error) throw error;
    historico.lista = reiniciar ? data || [] : historico.lista.concat(data || []);
    historico.fim = !data || data.length < 20;
    historico.carregado = true;
  }
  const printsDaGeracao = (g) => (g.prints || []).map((p) => Object.assign({}, p, { publico: urlArquivo(p.caminho) }));
  function verGeracao(g) {
    const ps = printsDaGeracao(g);
    const dlg = P.abrirDialogo('Prints de ' + dataHora(g.gerado_em), el('div', { class: 'kit-prints' }, ps.length ? ps.map((p) => el('figure', { class: 'kit-print' },
      el('a', { class: 'kit-mini', href: p.publico, target: '_blank', rel: 'noopener' }, el('img', { src: p.publico, alt: 'Print de ' + p.rota, loading: 'lazy' })),
      el('figcaption', null, el('strong', null, p.nome), el('span', { class: 'sub-linha' }, 'Itens: ' + p.itens.map((i) => i.c).join(', ')),
        el('span', { class: 'sub-linha' }, p.url)))) : el('p', { class: 'vazio' }, 'Sem prints nesta geração.')),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Fechar')]);
    dlg.classList.add('dialogo-largo');
  }
  async function baixarGeracao(g, btn) {
    ocupado(btn, 'Montando…');
    try {
      const ps = printsDaGeracao(g);
      const zip = await montarZip(g.itens || [], ps, g.resumo || {}, [], new Date(g.gerado_em));
      baixar(zip, 'Kit PNTP ' + limparNome(orgaoDados.nome) + ' ' + String(g.gerado_em).slice(0, 10) + '.zip');
    } catch (e) { toast(P.erroGravacao(e), true); }
    finally { ocupado(btn); }
  }
  async function excluirGeracao(g) {
    if (!await P.confirmar('Excluir geração', 'Excluir a geração de ' + dataHora(g.gerado_em) + ' com os prints dela? O histórico serve de prova do que estava publicado no dia; exclua só se foi gerada por engano.', 'Excluir', true)) return;
    const { data, error } = await sb.from('pntp_kit_geracoes').delete().eq('id', g.id).select('id');
    if (error) return toast(P.erroGravacao(error), true);
    if (!data || !data.length) return toast('Seu perfil não pode excluir gerações.', true);
    const caminhos = (g.prints || []).map((p) => p.caminho).filter(Boolean);
    if (caminhos.length) await sb.storage.from(BUCKET).remove(caminhos).catch(() => {});
    historico.lista = historico.lista.filter((x) => x.id !== g.id);
    if (ultimaGeracao && ultimaGeracao.id === g.id) { await carregar(); }
    toast('Geração excluída.'); desenhar();
  }

  P.telas.kit_pntp = async function (c, mod, p) {
    perm = p; area = c; aba = 'itens'; mostrar = POR_PAGINA; historico = { lista: [], fim: true, carregado: false };
    c.replaceChildren(el('h1', null, 'Kit de evidências PNTP (Avalia)'), el('p', { class: 'sub' }, 'Carregando a autoavaliação e o que está publicado…'));
    try { await carregar(); desenhar(); }
    catch (e) {
      c.querySelector('.sub').textContent = /pntp_kit|Could not find|does not exist/i.test((e && e.message) || '') ? 'Falta rodar o script 51 no banco.'
        : /avaliacao_pntp/i.test((e && e.message) || '') ? 'Falta rodar o script 26 no banco.' : P.erroGravacao(e);
    }
  };
})();
