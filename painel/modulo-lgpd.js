// =====================================================================
// Módulo "LGPD e Governo Digital" (Lote 4) — PNTP 15.1 a 15.5
// Um único registro por órgão: encarregado de dados, política de
// privacidade, norma do Governo Digital e regras dos dados abertos.
// No topo, a situação de cada critério do PNTP desta dimensão.
// Os textos sugeridos são ponto de partida: devem ser revisados pela
// assessoria jurídica do órgão antes de publicar.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo, emailValido } = P;

  let perm = {};
  let conteiner = null;

  function modeloPolitica(o, l) {
    const nome = o.nome || 'o órgão';
    const enc = l.encarregado_nome ? l.encarregado_nome + (l.encarregado_email ? ' (' + l.encarregado_email + ')' : '') : '[nome e e-mail do encarregado]';
    return [
      '*Modelo inicial — revisar com a assessoria jurídica antes de publicar.*', '',
      '## Quem é o responsável pelos seus dados',
      'O controlador dos dados pessoais tratados neste site é ' + nome + (o.cnpj ? ', CNPJ ' + o.cnpj : '') +
        '. O encarregado pelo tratamento de dados pessoais é ' + enc + '.', '',
      '## Quais dados coletamos',
      '- Dados de navegação estritamente necessários ao funcionamento do site (endereço IP, tipo de navegador, páginas acessadas), sem uso para publicidade.',
      '- Dados informados por você em formulários (ouvidoria, pedido de informação, solicitação de serviço): nome, documento, e-mail, telefone e o conteúdo do pedido.', '',
      '## Para que usamos',
      'Os dados são usados apenas para executar políticas públicas e prestar os serviços solicitados, cumprir obrigações legais (como a Lei de Acesso à Informação e a Lei 13.460/2017) e responder às suas manifestações, conforme os artigos 7º e 23 da Lei 13.709/2018 (LGPD).', '',
      '## Com quem compartilhamos',
      'Somente com outros órgãos públicos ou de controle quando a lei exigir, ou quando necessário para prestar o serviço que você pediu. Não vendemos nem cedemos dados pessoais.', '',
      '## Por quanto tempo guardamos',
      'Pelo tempo necessário à finalidade e aos prazos legais de guarda de documentos públicos. Depois disso, os dados são eliminados ou anonimizados.', '',
      '## Segurança',
      'Adotamos medidas técnicas e administrativas para proteger os dados contra acessos não autorizados, perda ou alteração.', '',
      '## Seus direitos (art. 18 da LGPD)',
      '- Confirmar se tratamos seus dados e ter acesso a eles.',
      '- Corrigir dados incompletos, inexatos ou desatualizados.',
      '- Pedir anonimização, bloqueio ou eliminação de dados desnecessários.',
      '- Saber com quem seus dados foram compartilhados.',
      'Para exercer esses direitos, fale com o encarregado pelos contatos acima.', '',
      '## Cookies',
      'Este site usa apenas cookies essenciais ao seu funcionamento.', '',
      '## Atualizações',
      'Esta política pode ser atualizada. A data da última atualização aparece no fim da página.'
    ].join('\n');
  }

  function modeloDadosAbertos(o) {
    return [
      '## O que são',
      'Os dados publicados neste portal podem ser baixados e lidos por outros sistemas, em formatos abertos e legíveis por máquina, sem cadastro e sem custo.', '',
      '## Formatos disponíveis',
      '- **CSV**: planilha em texto, separada por ponto e vírgula, codificação UTF-8.',
      '- **JSON**: para uso direto por sistemas e aplicativos.', '',
      '## Como acessar',
      'Cada consulta do Portal da Transparência tem os botões de exportação. A lista completa de conjuntos de dados, com o endereço de acesso automatizado de cada um, fica na página "Dados abertos" do site.', '',
      '## Regras de uso',
      '- O uso é livre, inclusive comercial, desde que a fonte seja citada: "' + (o.nome || 'Órgão') + '".',
      '- Os dados são publicados como estão nos sistemas oficiais; a data de atualização acompanha cada conjunto.',
      '- O acesso automatizado deve respeitar um volume razoável de consultas, para não prejudicar o site.', '',
      '## Dúvidas',
      'Use o e-SIC ou a Ouvidoria, no menu Atendimento.'
    ].join('\n');
  }

  P.telas.lgpd = async function (c, mod, p) {
    perm = p; conteiner = c;
    c.replaceChildren(el('h1', null, 'LGPD e Governo Digital'), el('p', { class: 'sub' }, 'Carregando…'));
    const org = P.estado.orgao.id;
    const [lg, o, normas, sv] = await Promise.all([
      sb.from('lgpd').select('*').eq('orgao_id', org).maybeSingle(),
      sb.from('orgaos').select('nome, cnpj, configuracoes').eq('id', org).maybeSingle(),
      // Candidatas a norma do Governo Digital: busca sem acento na ementa.
      sb.from('publicacoes').select('id, tipo, numero, ano, ementa, situacao')
        .eq('orgao_id', org).or('busca.ilike.*14.129*,busca.ilike.*14129*,busca.ilike.*governo digital*')
        .order('data_publicacao', { ascending: false }).limit(50),
      sb.from('servicos').select('id', { count: 'exact', head: true }).eq('orgao_id', org).eq('situacao', 'publicado')
        .in('forma_prestacao', ['digital', 'presencial_digital'])
    ]);
    if (lg.error || o.error) { c.querySelector('.sub').textContent = P.erroGravacao(lg.error || o.error); return; }
    const l = lg.data || {};
    const orgao = o.data || {};
    const podeGravar = perm.editar && !P.estado.alcanceUnidade;
    const digitais = sv.count || 0;
    const listaNormas = normas.data || [];

    const txt = (v, extra) => el('input', Object.assign({ type: 'text', value: v || '' }, extra || {}));
    const f = {
      encNome: txt(l.encarregado_nome, { maxlength: 120 }),
      encCargo: txt(l.encarregado_cargo, { maxlength: 120 }),
      encEmail: txt(l.encarregado_email, { type: 'email', maxlength: 160 }),
      encTel: txt(l.encarregado_telefone, { inputmode: 'tel', maxlength: 40 }),
      encAto: txt(l.encarregado_ato, { maxlength: 120, placeholder: 'Ex.: Portaria nº 10/2026' }),
      encAtoUrl: txt(l.encarregado_ato_url, { type: 'url', placeholder: 'https://…' }),
      polUrl: txt(l.politica_url, { type: 'url', placeholder: 'https://… (opcional, se houver PDF)' }),
      polData: el('input', { type: 'date', value: l.politica_atualizada_em || '' }),
      gdSel: el('select', null, el('option', { value: '' }, listaNormas.length ? '— Escolha a norma cadastrada —' : 'Nenhuma publicação cita a Lei 14.129'),
        listaNormas.map((n) => el('option', { value: n.id, selected: l.gov_digital_publicacao === n.id },
          ({ decreto: 'Decreto', lei: 'Lei', lei_complementar: 'Lei Complementar', portaria: 'Portaria' }[n.tipo] || n.tipo) +
          (n.numero ? ' nº ' + n.numero : '') + '/' + n.ano + ' — ' + n.ementa.slice(0, 70) + (n.situacao === 'publicado' ? '' : ' (rascunho)')))),
      gdTexto: txt(l.gov_digital_texto, { maxlength: 160, placeholder: 'Ex.: Decreto nº 15/2025' }),
      gdUrl: txt(l.gov_digital_url, { type: 'url', placeholder: 'https://…' })
    };
    const politica = P.editorTexto('lg-politica', l.politica_texto, 14);
    const dados = P.editorTexto('lg-dados', l.dados_abertos_texto, 10);
    const btnModeloPol = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Usar modelo');
    btnModeloPol.addEventListener('click', () => {
      if (politica.area.value.trim() && !confirm('Substituir o texto atual pelo modelo?')) return;
      politica.area.value = modeloPolitica(orgao, { encarregado_nome: f.encNome.value.trim(), encarregado_email: f.encEmail.value.trim() });
      if (!f.polData.value) f.polData.value = new Date().toISOString().slice(0, 10);
    });
    const btnModeloDados = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Usar modelo');
    btnModeloDados.addEventListener('click', () => {
      if (dados.area.value.trim() && !confirm('Substituir o texto atual pelo modelo?')) return;
      dados.area.value = modeloDadosAbertos(orgao);
    });


    const btnSalvar = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const form = el('form', { class: 'form-aparencia', novalidate: true },
      el('div', { class: 'grade grade-2' },
        el('section', { class: 'cartao' },
          el('h2', null, 'Encarregado de dados (15.1)'),
          el('p', { class: 'ajuda' }, 'Servidor responsável por atender o cidadão sobre dados pessoais (art. 41 da LGPD). Nome e um canal de contato são obrigatórios no PNTP.'),
          campo('lg-enc-nome', 'Nome', f.encNome, null, true),
          campo('lg-enc-cargo', 'Cargo', f.encCargo),
          el('div', { class: 'grade-campos' }, campo('lg-enc-email', 'E-mail', f.encEmail), campo('lg-enc-tel', 'Telefone', f.encTel)),
          el('div', { class: 'grade-campos' }, campo('lg-enc-ato', 'Ato de designação', f.encAto), campo('lg-enc-ato-url', 'Link do ato', f.encAtoUrl))),
        el('section', { class: 'cartao' },
          el('h2', null, 'Governo Digital (15.5)'),
          el('p', { class: 'ajuda' }, 'Norma do órgão que regulamenta a Lei 14.129/2021. Se ela estiver em "Publicações oficiais", escolha na lista; senão, informe o nome e o link.'),
          campo('lg-gd-sel', 'Norma cadastrada', f.gdSel),
          el('div', { class: 'grade-campos' }, campo('lg-gd-texto', 'Ou: identificação', f.gdTexto), campo('lg-gd-url', 'Link', f.gdUrl)),
          listaNormas.length ? null : el('p', { class: 'msg msg-falta' }, 'Se o município ainda não regulamentou a Lei 14.129/2021, o critério 15.5 fica pendente. Ele é recomendado, não obrigatório.'))),
      el('section', { class: 'cartao', style: 'margin-top:16px' },
        el('h2', null, 'Política de privacidade e proteção de dados (15.2)'),
        el('div', { class: 'campo' }, el('label', { for: 'lg-politica' }, 'Texto exibido no site ', btnModeloPol), politica.elemento,
          el('span', { class: 'ajuda' }, 'O modelo é um ponto de partida: revise com a assessoria jurídica antes de salvar.')),
        el('div', { class: 'grade-campos' }, campo('lg-pol-url', 'PDF da política (opcional)', f.polUrl), campo('lg-pol-data', 'Atualizada em', f.polData))),
      el('section', { class: 'cartao', style: 'margin-top:16px' },
        el('h2', null, 'Dados abertos: regras de uso (15.4)'),
        el('p', { class: 'ajuda' }, 'O PNTP pede que a página de dados abertos tenha as regras de utilização. Os arquivos para download (CSV/JSON) entram com o site público e o Portal da Transparência.'),
        el('div', { class: 'campo' }, el('label', { for: 'lg-dados' }, 'Texto da página ', btnModeloDados), dados.elemento)),
      podeGravar ? el('div', { class: 'barra-salvar' }, btnSalvar)
        : el('p', { class: 'msg msg-info' }, perm.editar ? 'Só quem tem acesso ao órgão inteiro altera esta tela.' : 'Seu perfil pode ver, mas não alterar.'));
    if (!podeGravar) for (const i of form.querySelectorAll('input, select, textarea, .editor-barra button, .campo label button')) i.disabled = true;

    form.addEventListener('submit', (ev) => ev.preventDefault());
    btnSalvar.addEventListener('click', async () => {
      const v = (i) => i.value.trim();
      if (!erroCampo('lg-enc-nome', v(f.encNome) ? '' : 'Informe o nome do encarregado.')) return;
      if (!erroCampo('lg-enc-email', !v(f.encEmail) || emailValido(v(f.encEmail)) ? '' : 'E-mail inválido.')) return;
      if (!v(f.encEmail) && !v(f.encTel)) { erroCampo('lg-enc-email', 'Informe o e-mail ou o telefone do encarregado (exigido pelo PNTP).'); return; }
      for (const [id, i] of [['lg-enc-ato-url', f.encAtoUrl], ['lg-gd-url', f.gdUrl], ['lg-pol-url', f.polUrl]]) {
        if (!erroCampo(id, !v(i) || P.urlValida(v(i)) ? '' : 'Endereço completo, começando com https://')) return;
      }
      const reg = {
        orgao_id: P.estado.orgao.id,
        encarregado_nome: v(f.encNome), encarregado_cargo: v(f.encCargo) || null, encarregado_email: v(f.encEmail) || null,
        encarregado_telefone: v(f.encTel) || null, encarregado_ato: v(f.encAto) || null, encarregado_ato_url: v(f.encAtoUrl) || null,
        politica_texto: politica.area.value.trim() || null, politica_url: v(f.polUrl) || null, politica_atualizada_em: f.polData.value || null,
        gov_digital_publicacao: f.gdSel.value || null, gov_digital_texto: v(f.gdTexto) || null, gov_digital_url: v(f.gdUrl) || null,
        dados_abertos_texto: dados.area.value.trim() || null
      };
      if (reg.politica_texto && /Modelo inicial — revisar/.test(reg.politica_texto) &&
        !await P.confirmar('Texto ainda é o modelo', 'A política ainda contém o aviso "Modelo inicial — revisar com a assessoria jurídica". Salvar mesmo assim? (Ela aparecerá no site com esse aviso até ser revisada.)', 'Salvar assim', false)) return;
      ocupado(btnSalvar, 'Salvando…');
      try {
        const { data, error } = await sb.from('lgpd').upsert(reg, { onConflict: 'orgao_id' }).select('orgao_id');
        if (error) throw error;
        if (!data || !data.length) throw P.amigavel('Seu perfil não pode alterar esta tela.');
        P.atualizarAvisos();
        toast('LGPD e Governo Digital salvos.');
      } catch (e) { toast(P.erroGravacao(e), true); }
      finally { ocupado(btnSalvar); }
    });

    c.replaceChildren(
      el('h1', null, 'LGPD e Governo Digital'),
      el('p', { class: 'sub' }, 'Proteção de dados pessoais e serviços digitais (PNTP, dimensão 15).'),
      form);
  };
})();
