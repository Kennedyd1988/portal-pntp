// =====================================================================
// Módulo "Páginas institucionais, gestores e unidades" (Lote 1)
// Abas: Unidades (PNTP 2.1, 2.2, 2.4, 2.5) e Gestores (PNTP 2.3).
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, traduzirErro, emailValido, normalizar, ordemAlfabetica } = P;

  // Unidades e gestores são listas naturalmente pequenas (dezenas por órgão),
  // por isso carregam de uma vez, com um teto de segurança.
  const LIMITE = 500;

  let dados = { unidades: [], gestores: [] };
  let aba = 'unidades';
  let perm = {};

  async function carregar() {
    const org = P.estado.orgao.id;
    const [u, g] = await Promise.all([
      sb.from('unidades').select('*').eq('orgao_id', org).order('nome').limit(LIMITE),
      sb.from('gestores').select('*').eq('orgao_id', org).order('nome').limit(LIMITE)
    ]);
    if (u.error) throw u.error;
    if (g.error) throw g.error;
    dados = { unidades: u.data, gestores: g.data };
  }

  // Alcance setorial: quem é limitado a uma unidade vê tudo (é público), mas só altera
  // a própria unidade e os gestores dela. O banco bloqueia de qualquer forma;
  // aqui só escondemos os botões para não oferecer o que vai falhar.
  const alcance = () => P.estado.alcanceUnidade;
  const podeEditarUnidade = (u) => perm.editar && (!alcance() || u.id === alcance());
  const podeExcluirUnidade = () => perm.excluir && !alcance();
  const podeCriarUnidade = () => perm.editar && !alcance();
  const podeEditarGestor = (g) => perm.editar && (!alcance() || g.unidade_id === alcance());
  const podeExcluirGestor = (g) => perm.excluir && (!alcance() || g.unidade_id === alcance());

  const nomeUnidade = (id) => (dados.unidades.find((u) => u.id === id) || {}).nome || '';

  // ---------- campos de formulário ----------
  function campo(id, rotulo, input, ajuda, obrigatorio) {
    input.id = id;
    return el('div', { class: 'campo' },
      el('label', { for: id }, rotulo, obrigatorio ? el('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *') : null),
      input,
      ajuda ? el('span', { class: 'ajuda' }, ajuda) : null,
      el('span', { class: 'erro-campo', id: id + '-erro' })
    );
  }
  const entrada = (valor, extra) => el('input', Object.assign({ type: 'text', value: valor == null ? '' : valor }, extra || {}));
  const areaTexto = (valor, linhas) => { const t = el('textarea', { rows: linhas || 4 }); t.value = valor || ''; return t; };
  function seletorUnidade(valorAtual, excluirIds) {
    const s = el('select', null, el('option', { value: '' }, '— Nenhuma —'));
    for (const u of [...dados.unidades].sort((a, b) => ordemAlfabetica(a.nome, b.nome))) {
      if (excluirIds && excluirIds.has(u.id)) continue;
      s.append(el('option', { value: u.id, selected: u.id === valorAtual }, u.nome));
    }
    return s;
  }

  // Unidade e todas as que estão abaixo dela (para não deixar uma unidade ficar "dentro de si mesma").
  function descendentes(id) {
    const r = new Set([id]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const u of dados.unidades) if (u.unidade_pai_id && r.has(u.unidade_pai_id) && !r.has(u.id)) { r.add(u.id); mudou = true; }
    }
    return r;
  }

  // Envio de PDF (norma, currículo): até 10 MB.
  async function escolherPdf(input) {
    const f = input.files[0];
    if (!f) return null;
    if (f.type !== 'application/pdf') { toast('Escolha um arquivo PDF.', true); input.value = ''; return null; }
    if (f.size > 10 * 1024 * 1024) { toast('O PDF passa de 10 MB.', true); input.value = ''; return null; }
    return f;
  }

  // Erro com mensagem já pronta para o usuário (não passa pelo tradutor).
  const amigavel = (texto) => Object.assign(new Error(texto), { amigavel: true });
  const mostrarErro = (e) => toast(e && e.amigavel ? e.message : traduzirErro(e), true);

  // Grava e confere se a linha foi realmente alterada (o banco devolve 0 linhas quando
  // a regra de alcance não permite — sem isso o usuário acharia que salvou).
  async function gravar(tabela, registro, id) {
    const q = id
      ? sb.from(tabela).update(registro).eq('id', id).select('id')
      : sb.from(tabela).insert(Object.assign({ orgao_id: P.estado.orgao.id }, registro)).select('id');
    const { data, error } = await q;
    if (error) {
      if (/unidades_nome_unico|duplicate key/i.test(error.message)) throw amigavel('Já existe uma unidade com esse nome.');
      if (/row-level security/i.test(error.message)) throw amigavel('Seu perfil não tem permissão para gravar aqui (fora do seu alcance).');
      throw error;
    }
    if (!data || !data.length) throw amigavel('Nada foi alterado: este registro está fora do alcance do seu perfil.');
    return data[0].id;
  }

  // ================= UNIDADES =================
  function formUnidade(u) {
    u = u || {};
    const f = {
      nome: entrada(u.nome, { maxlength: 160 }),
      sigla: entrada(u.sigla, { maxlength: 20 }),
      pai: seletorUnidade(u.unidade_pai_id, u.id ? descendentes(u.id) : null),
      endereco: entrada(u.endereco),
      telefone: entrada(u.telefone, { inputmode: 'tel' }),
      email: entrada(u.email, { type: 'email' }),
      horario: entrada(u.horario_atendimento),
      competencias: areaTexto(u.competencias, 5),
      norma: entrada(u.norma_criacao, { placeholder: 'Ex.: Lei Complementar nº 001/2017' }),
      normaPdf: el('input', { type: 'file', accept: 'application/pdf' }),
      ativo: el('input', { type: 'checkbox', checked: u.id ? u.ativo : true })
    };
    let normaUrl = u.norma_url || null;
    const linkNorma = el('span', { class: 'ajuda' }, normaUrl ? el('a', { href: normaUrl, target: '_blank', rel: 'noopener' }, 'Ver PDF atual') : 'Nenhum PDF enviado.');

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      P.abas([
        ['unidade', 'Unidade', [
          campo('un-nome', 'Nome da unidade', f.nome, null, true),
          el('div', { class: 'grade-campos' },
            campo('un-sigla', 'Sigla', f.sigla),
            campo('un-pai', 'Fica dentro de', f.pai, 'Para montar o organograma')),
          el('label', { class: 'checkbox' }, f.ativo, ' Unidade ativa (aparece no site)')]],
        ['contato', 'Endereço e contato', [
          campo('un-endereco', 'Endereço', f.endereco),
          el('div', { class: 'grade-campos' },
            campo('un-telefone', 'Telefone', f.telefone),
            campo('un-email', 'E-mail', f.email)),
          campo('un-horario', 'Horário de atendimento', f.horario, 'Ex.: Segunda a sexta, das 8h às 12h e das 13h às 17h')]],
        ['competencias', 'Competências e norma', [
          campo('un-competencias', 'Competências e atribuições', f.competencias, 'O que a unidade faz (PNTP 2.2)'),
          el('div', { class: 'grade-campos' },
            campo('un-norma', 'Norma de criação', f.norma, 'Lei ou decreto que cria a unidade (PNTP 2.1)'),
            campo('un-normapdf', 'PDF da norma', f.normaPdf)),
          linkNorma]]
      ])
    );

    const btnSalvar = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = P.abrirDialogo(u.id ? 'Editar unidade' : 'Nova unidade', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btnSalvar
    ]);
    corpo.addEventListener('submit', (ev) => { ev.preventDefault(); btnSalvar.click(); });

    btnSalvar.addEventListener('click', async () => {
      const v = (k) => f[k].value.trim();
      if (!erroCampo('un-nome', v('nome') ? '' : 'Informe o nome da unidade.')) return;
      if (!erroCampo('un-email', !v('email') || emailValido(v('email')) ? '' : 'E-mail inválido.')) return;
      ocupado(btnSalvar, 'Salvando…');
      try {
        const pdf = await escolherPdf(f.normaPdf);
        const antigo = normaUrl;
        if (pdf) normaUrl = await P.enviarArquivo('institucional', pdf, 'pdf', 'application/pdf');
        await gravar('unidades', {
          nome: v('nome'), sigla: v('sigla') || null, unidade_pai_id: f.pai.value || null,
          endereco: v('endereco') || null, telefone: v('telefone') || null, email: v('email') || null,
          horario_atendimento: v('horario') || null, competencias: v('competencias') || null,
          norma_criacao: v('norma') || null, norma_url: normaUrl, ativo: f.ativo.checked
        }, u.id);
        if (pdf && antigo) P.apagarArquivo(antigo);
        d.close();
        toast(u.id ? 'Unidade atualizada.' : 'Unidade cadastrada.');
        await recarregar();
      } catch (e) {
        mostrarErro(e);
      } finally { ocupado(btnSalvar); }
    });
  }

  async function excluirUnidade(u) {
    // Checa vínculos antes (regra do projeto: nunca deixar registro órfão).
    const gest = dados.gestores.filter((g) => g.unidade_id === u.id);
    const filhas = dados.unidades.filter((x) => x.unidade_pai_id === u.id);
    // Vínculos em outros módulos: contados no servidor, sem baixar as listas.
    const contarEm = async (tabela, filtro) => {
      const { count } = await filtro(sb.from(tabela).select('id', { count: 'exact', head: true }));
      return count || 0;
    };
    const [qNot, qPub, qUsu, qSer] = await Promise.all([
      contarEm('noticias', (q) => q.or('unidade_id.eq.' + u.id + ',unidades_relacionadas.cs.{' + u.id + '}')),
      contarEm('publicacoes', (q) => q.eq('unidade_id', u.id)),
      contarEm('usuarios_orgaos', (q) => q.eq('unidade_id', u.id)),
      contarEm('servicos', (q) => q.eq('unidade_id', u.id))
    ]).catch(() => [0, 0, 0, 0]);
    if (gest.length || filhas.length || qNot || qPub || qUsu || qSer) {
      const motivos = [];
      if (qNot) motivos.push(qNot + (qNot === 1 ? ' notícia' : ' notícias'));
      if (qSer) motivos.push(qSer + (qSer === 1 ? ' serviço da Carta de Serviços' : ' serviços da Carta de Serviços'));
      if (qPub) motivos.push(qPub + (qPub === 1 ? ' publicação oficial' : ' publicações oficiais'));
      if (qUsu) motivos.push(qUsu + (qUsu === 1 ? ' usuário com acesso limitado a ela' : ' usuários com acesso limitado a ela'));
      if (gest.length) motivos.push(gest.length + (gest.length === 1 ? ' gestor vinculado (' : ' gestores vinculados (') + gest.map((g) => g.nome).join(', ') + ')');
      if (filhas.length) motivos.push(filhas.length + (filhas.length === 1 ? ' unidade dentro dela (' : ' unidades dentro dela (') + filhas.map((x) => x.nome).join(', ') + ')');
      P.aviso('Não é possível excluir', 'A unidade "' + u.nome + '" tem ' + motivos.join(' e ') + '. Mude esses vínculos antes, ou marque a unidade como inativa.');
      return;
    }
    if (!await P.confirmar('Excluir unidade', 'Excluir "' + u.nome + '"? A ação fica registrada no histórico.', 'Excluir', true)) return;
    const { data, error } = await sb.from('unidades').delete().eq('id', u.id).select('id');
    if (error) {
      const t = error.message || '';
      toast(/aparece como envolvida/.test(t) ? t : /foreign key/i.test(t) ? 'A unidade ainda tem vínculos e não pode ser excluída.' : traduzirErro(error), true);
      return;
    }
    if (!data || !data.length) { toast('Seu perfil não pode excluir esta unidade.', true); return; }
    if (u.norma_url) P.apagarArquivo(u.norma_url);
    toast('Unidade excluída.');
    await recarregar();
  }

  function tabelaUnidades(filtro) {
    const f = normalizar(filtro);
    const lista = [...dados.unidades]
      .filter((u) => !f || normalizar(u.nome + ' ' + (u.sigla || '')).includes(f))
      .sort((a, b) => ordemAlfabetica(a.nome, b.nome));   // cadastro: ordem alfabética
    if (!lista.length) return el('p', { class: 'vazio' }, filtro ? 'Nenhuma unidade encontrada.' : 'Nenhuma unidade cadastrada ainda.');

    const linhas = lista.map((u) => {
      const resp = dados.gestores.filter((g) => g.unidade_id === u.id && g.ativo).map((g) => g.nome).join(', ');
      return el('tr', null,
        el('td', null,
          el('strong', null, u.nome),
          u.unidade_pai_id ? el('span', { class: 'sub-linha' }, 'Dentro de: ' + nomeUnidade(u.unidade_pai_id)) : null,
          u.ativo ? null : el('span', { class: 'etiqueta etiqueta-inativo' }, 'Inativa')
        ),
        el('td', null, resp || el('span', { class: 'falta' }, 'Sem responsável')),
        el('td', null, u.telefone || '—', u.email ? el('span', { class: 'sub-linha' }, u.email) : null),
        el('td', null, u.horario_atendimento || el('span', { class: 'falta' }, 'Sem horário')),
        el('td', { class: 'acoes' },
          podeEditarUnidade(u) ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formUnidade(u) }, 'Editar') : null,
          podeExcluirUnidade() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirUnidade(u) }, 'Excluir') : null
        )
      );
    });
    return el('div', { class: 'tabela-caixa' },
      el('table', { class: 'tabela' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col' }, 'Unidade'), el('th', { scope: 'col' }, 'Responsável'),
          el('th', { scope: 'col' }, 'Contato'), el('th', { scope: 'col' }, 'Horário'),
          el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, linhas)
      )
    );
  }

  // ================= GESTORES =================
  function formGestor(g) {
    g = g || {};
    const f = {
      nome: entrada(g.nome, { maxlength: 160 }),
      cargo: entrada(g.cargo, { maxlength: 120, placeholder: 'Ex.: Secretária Municipal de Saúde' }),
      unidade: alcance()
        ? el('select', { disabled: true }, el('option', { value: alcance() }, nomeUnidade(alcance())))
        : seletorUnidade(g.unidade_id),
      email: entrada(g.email, { type: 'email' }),
      telefone: entrada(g.telefone, { inputmode: 'tel' }),
      foto: el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' }),
      curriculo: el('input', { type: 'file', accept: 'application/pdf' }),
      capa: el('input', { type: 'checkbox', checked: !!g.destaque_capa }),
      ordem: entrada(g.ordem == null ? 10 : g.ordem, { type: 'number', min: 0, max: 99 }),
      ativo: el('input', { type: 'checkbox', checked: g.id ? g.ativo : true })
    };
    let fotoUrl = g.foto_url || null;
    let curriculoUrl = g.curriculo_url || null;
    let fotoNova = null;

    const fotoPrev = el('div', { class: 'foto-prev' });
    const mostrarFoto = (src) => fotoPrev.replaceChildren(src ? el('img', { src, alt: '' }) : el('span', null, 'Sem foto'));
    mostrarFoto(fotoUrl);
    f.foto.addEventListener('change', async () => {
      const arq = f.foto.files[0];
      if (!arq) return;
      try { fotoNova = await P.reduzirImagem(arq, 400); mostrarFoto(URL.createObjectURL(fotoNova.blob)); }
      catch (e) { toast(e.message, true); }
    });

    const corpo = el('form', { class: 'form-dialogo', novalidate: true },
      el('div', { class: 'gestor-topo' },
        fotoPrev,
        el('div', { style: 'flex:1;min-width:0' },
          campo('ge-nome', 'Nome completo', f.nome, null, true),
          campo('ge-cargo', 'Cargo', f.cargo, null, true)
        )
      ),
      // A foto e o nome ficam acima das abas: identificam o gestor em qualquer aba aberta.
      P.abas([
        ['contato', 'Unidade e contato', [
          campo('ge-unidade', 'Unidade', f.unidade),
          el('div', { class: 'grade-campos' },
            campo('ge-email', 'E-mail institucional', f.email),
            campo('ge-telefone', 'Telefone', f.telefone))]],
        ['arquivos', 'Foto e currículo', [
          el('div', { class: 'grade-campos' },
            campo('ge-foto', 'Foto', f.foto, 'Reduzida automaticamente'),
            campo('ge-curriculo', 'Currículo (PDF)', f.curriculo, curriculoUrl ? null : 'Nenhum currículo enviado')),
          curriculoUrl ? el('a', { href: curriculoUrl, target: '_blank', rel: 'noopener', class: 'ajuda' }, 'Ver currículo atual') : null]],
        ['site', 'No site', [
          el('div', { class: 'grade-campos' },
            el('label', { class: 'checkbox' }, f.capa, ' Mostrar no bloco "Gestão" da página inicial'),
            campo('ge-ordem', 'Ordem no bloco', f.ordem, '1 = primeiro')),
          el('label', { class: 'checkbox' }, f.ativo, ' Gestor ativo (aparece no site)')]]
      ])
    );

    const btnSalvar = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = P.abrirDialogo(g.id ? 'Editar gestor' : 'Novo gestor', corpo, [
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btnSalvar
    ]);
    corpo.addEventListener('submit', (ev) => { ev.preventDefault(); btnSalvar.click(); });

    btnSalvar.addEventListener('click', async () => {
      const v = (k) => f[k].value.trim();
      if (!erroCampo('ge-nome', v('nome') ? '' : 'Informe o nome.')) return;
      if (!erroCampo('ge-cargo', v('cargo') ? '' : 'Informe o cargo.')) return;
      if (!erroCampo('ge-email', !v('email') || emailValido(v('email')) ? '' : 'E-mail inválido.')) return;
      ocupado(btnSalvar, 'Salvando…');
      try {
        const antigos = [];
        if (fotoNova) { antigos.push(fotoUrl); fotoUrl = await P.enviarArquivo('institucional', fotoNova.blob, fotoNova.ext); }
        const pdf = await escolherPdf(f.curriculo);
        if (pdf) { antigos.push(curriculoUrl); curriculoUrl = await P.enviarArquivo('institucional', pdf, 'pdf', 'application/pdf'); }
        await gravar('gestores', {
          nome: v('nome'), cargo: v('cargo'), unidade_id: f.unidade.value || null,
          email: v('email') || null, telefone: v('telefone') || null,
          foto_url: fotoUrl, curriculo_url: curriculoUrl,
          destaque_capa: f.capa.checked, ordem: parseInt(v('ordem'), 10) || 0, ativo: f.ativo.checked
        }, g.id);
        antigos.forEach((a) => P.apagarArquivo(a));
        d.close();
        toast(g.id ? 'Gestor atualizado.' : 'Gestor cadastrado.');
        await recarregar();
      } catch (e) {
        mostrarErro(e);
      } finally { ocupado(btnSalvar); }
    });
  }

  async function excluirGestor(g) {
    if (!await P.confirmar('Excluir gestor', 'Excluir "' + g.nome + '"? Se ele apenas deixou o cargo, prefira marcar como inativo para manter o registro.', 'Excluir', true)) return;
    const { data, error } = await sb.from('gestores').delete().eq('id', g.id).select('id');
    if (error) { toast(traduzirErro(error), true); return; }
    if (!data || !data.length) { toast('Seu perfil não pode excluir este gestor.', true); return; }
    P.apagarArquivo(g.foto_url); P.apagarArquivo(g.curriculo_url);
    toast('Gestor excluído.');
    await recarregar();
  }

  function tabelaGestores(filtro) {
    const f = normalizar(filtro);
    const lista = [...dados.gestores]
      .filter((g) => !f || normalizar(g.nome + ' ' + g.cargo + ' ' + nomeUnidade(g.unidade_id)).includes(f))
      .sort((a, b) => ordemAlfabetica(a.nome, b.nome));
    if (!lista.length) return el('p', { class: 'vazio' }, filtro ? 'Nenhum gestor encontrado.' : 'Nenhum gestor cadastrado ainda.');

    return el('div', { class: 'tabela-caixa' },
      el('table', { class: 'tabela' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col' }, 'Gestor'), el('th', { scope: 'col' }, 'Unidade'),
          el('th', { scope: 'col' }, 'Contato'), el('th', { scope: 'col' }, 'Na capa'),
          el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, lista.map((g) => el('tr', null,
          el('td', null,
            el('div', { class: 'pessoa' },
              g.foto_url ? el('img', { src: g.foto_url, alt: '', class: 'avatar' }) : el('span', { class: 'avatar avatar-vazio', 'aria-hidden': 'true' }, g.nome.slice(0, 1)),
              el('span', null, el('strong', null, g.nome), el('span', { class: 'sub-linha' }, g.cargo))
            ),
            g.ativo ? null : el('span', { class: 'etiqueta etiqueta-inativo' }, 'Inativo')
          ),
          el('td', null, nomeUnidade(g.unidade_id) || el('span', { class: 'falta' }, 'Sem unidade')),
          el('td', null, g.email || '—', g.telefone ? el('span', { class: 'sub-linha' }, g.telefone) : null),
          el('td', null, g.destaque_capa ? 'Sim (' + g.ordem + 'º)' : '—'),
          el('td', { class: 'acoes' },
            podeEditarGestor(g) ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formGestor(g) }, 'Editar') : null,
            podeExcluirGestor(g) ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluirGestor(g) }, 'Excluir') : null
          )
        )))
      )
    );
  }

  // ================= TELA =================
  let conteinerAtual = null;
  let buscaAtual = '';

  function desenhar() {
    const c = conteinerAtual;
    const busca = el('input', { type: 'search', class: 'busca', placeholder: aba === 'unidades' ? 'Buscar unidade' : 'Buscar por nome, cargo ou unidade', value: buscaAtual, 'aria-label': 'Buscar' });
    const area = el('div', null, aba === 'unidades' ? tabelaUnidades(buscaAtual) : tabelaGestores(buscaAtual));
    busca.addEventListener('input', () => {
      buscaAtual = busca.value;
      area.replaceChildren(aba === 'unidades' ? tabelaUnidades(buscaAtual) : tabelaGestores(buscaAtual));
    });
    const botaoAba = (id, rotulo, qtd) => el('button', {
      type: 'button', role: 'tab', class: 'aba', 'aria-selected': aba === id ? 'true' : 'false',
      onclick: () => { aba = id; buscaAtual = ''; desenhar(); }
    }, rotulo, el('span', { class: 'aba-qtd' }, String(qtd)));

    const semResp = dados.unidades.filter((u) => u.ativo && !dados.gestores.some((g) => g.unidade_id === u.id && g.ativo)).length;
    const semHorario = dados.unidades.filter((u) => u.ativo && !u.horario_atendimento).length;
    const pendencias = [];
    if (semResp) pendencias.push(semResp + (semResp === 1 ? ' unidade sem responsável' : ' unidades sem responsável') + ' (PNTP 2.3)');
    if (semHorario) pendencias.push(semHorario + (semHorario === 1 ? ' unidade sem horário' : ' unidades sem horário') + ' (PNTP 2.5)');

    // replaceChildren escreveria "null" na tela: filtra os itens vazios antes.
    c.replaceChildren(...[
      el('div', { class: 'cabecalho-modulo' },
        el('div', null,
          el('h1', null, 'Unidades e gestores'),
          el('p', { class: 'sub' }, 'Estrutura organizacional, contatos, horários e responsáveis. Tudo aparece no site.')
        ),
        (aba === 'unidades' ? podeCriarUnidade() : perm.editar)
          ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => aba === 'unidades' ? formUnidade() : formGestor() },
            aba === 'unidades' ? '+ Nova unidade' : '+ Novo gestor') : null
      ),
      alcance() && perm.editar ? el('p', { class: 'msg msg-info' }, 'Seu acesso é limitado a "' + nomeUnidade(alcance()) +
        '": você altera só essa unidade e os gestores dela. As demais aparecem apenas para consulta.') : null,
      pendencias.length ? el('p', { class: 'msg msg-info' }, 'Pendências: ' + pendencias.join(' · ') + '.') : null,
      el('div', { class: 'abas', role: 'tablist' },
        botaoAba('unidades', 'Unidades', dados.unidades.length),
        botaoAba('gestores', 'Gestores', dados.gestores.length)
      ),
      el('div', { class: 'painel-guia' }, busca, area)
    ].filter(Boolean));
  }

  async function recarregar() {
    try { await carregar(); desenhar(); }
    catch (e) { toast(traduzirErro(e), true); }
  }

  P.telas.institucional = async function (c, mod, p) {
    perm = p;
    conteinerAtual = c;
    c.replaceChildren(el('h1', null, 'Unidades e gestores'), el('p', { class: 'sub' }, 'Carregando…'));
    try { await carregar(); desenhar(); }
    catch (e) { c.querySelector('.sub').textContent = traduzirErro(e); }
  };
})();
