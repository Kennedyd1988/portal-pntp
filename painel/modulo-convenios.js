// =====================================================================
// Módulos "Convênios e transferências" (PNTP 5.1 a 5.3) e "Emendas
// parlamentares" (PNTP 17.1 a 17.3).
//   Convênios: três abas, porque a Cartilha pede as transferências
//     recebidas separadas das realizadas: Recebidas (5.1), Realizadas
//     (5.2) e Acordos sem repasse de recursos (5.3). Publicar exige o
//     inteiro teor (PDF ou link, ex.: Transferegov).
//   Emendas: federais (17.1), estaduais e municipais (17.2, inclusive as
//     do próprio orçamento, emendas dos vereadores) e a execução de todas
//     (17.3: empenhado, liquidado e pago). Pode ligar ao convênio.
// Sem registros, o site declara expressamente que não há.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;
  const LOTE = 50;
  const LIMITE_MB = 50;
  const moeda = (v) => v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const docFormatado = (d) => !d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const etiquetaSituacao = (s) => el('span', { class: 'etiqueta etiqueta-' + (s === 'publicado' ? 'publicado' : 'rascunho') }, s === 'publicado' ? 'No ar' : 'Rascunho');
  const linkDoc = (r) => r.arquivo_url || r.link_externo
    ? el('a', { href: r.arquivo_url || r.link_externo, target: '_blank', rel: 'noopener' }, r.arquivo_url ? 'PDF' : 'Link')
    : el('span', { class: 'falta-leve' }, 'Sem documento');
  const num = (input) => input.value === '' ? null : Number(input.value);
  const valorOk = (input) => input.value === '' || Number(input.value) >= 0;
  const buscaLike = (t) => '%' + P.normalizar(t).replace(/[%_]/g, '') + '%';

  // Bloco "documento": PDF enviado aqui ou link externo.
  function blocoDocumento(prefixo, r, rotuloPdf, ajudaLink, exigir) {
    const pdf = el('input', { type: 'file', accept: 'application/pdf' });
    const link = el('input', { type: 'url', value: r.link_externo || '', placeholder: 'https://…' });
    return {
      pdf, link,
      elementos: [
        campo(prefixo + '-pdf', r.arquivo_url ? 'Trocar o PDF' : rotuloPdf, pdf, 'Até ' + LIMITE_MB + ' MB. Prefira PDF com texto pesquisável.'),
        r.arquivo_url ? el('a', { href: r.arquivo_url, target: '_blank', rel: 'noopener', class: 'ajuda' }, 'Ver PDF atual') : null,
        r.arquivo_url ? el('label', { class: 'checkbox' }, el('input', { type: 'checkbox', id: prefixo + '-tirar' }), ' Remover o PDF atual') : null,
        campo(prefixo + '-link', 'Link', link, ajudaLink)
      ],
      async gravar(modulo, situacao) {
        const l = link.value.trim();
        if (!erroCampo(prefixo + '-link', l && !P.urlValida(l) ? 'Endereço completo, começando com https://' : '')) return null;
        const arq = pdf.files[0];
        if (arq && !erroCampo(prefixo + '-pdf', arq.type !== 'application/pdf' ? 'Envie um PDF.' : arq.size > LIMITE_MB * 1048576 ? 'O arquivo passa de ' + LIMITE_MB + ' MB.' : '')) return null;
        const tirar = document.getElementById(prefixo + '-tirar');
        const ficaAntigo = r.arquivo_url && !(tirar && tirar.checked);
        if (exigir && situacao === 'publicado' && !arq && !ficaAntigo && !l
            && !erroCampo(prefixo + '-pdf', exigir)) return null;
        let url = ficaAntigo ? r.arquivo_url : null;
        if (arq) url = await P.enviarArquivo(modulo, arq, 'pdf', 'application/pdf');
        return { arquivo_url: url, link_externo: l || null };
      },
      limpar(novaUrl) { if (r.arquivo_url && r.arquivo_url !== novaUrl) P.apagarArquivo(r.arquivo_url); }
    };
  }

  function botoesDialogo(perm, publicado, travado, fechar) {
    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: fechar }, travado ? 'Fechar' : 'Cancelar')];
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    if (!travado) { if (!publicado || perm.publicar) acoes.push(btnR); if (perm.publicar) acoes.push(btnP); }
    return { acoes, btnR, btnP };
  }

  const opcoes = (obj, atual, vazio) => [vazio ? el('option', { value: '' }, vazio) : null]
    .concat(Object.entries(obj).map(([k, v]) => el('option', { value: k, selected: atual === k }, v))).filter(Boolean);

  // =====================================================================
  // CONVÊNIOS E TRANSFERÊNCIAS — PNTP 5.1, 5.2 e 5.3
  // =====================================================================
  const TIPOS = {
    recebida: ['Transferências recebidas', '5.1', 'Concedente / órgão repassador', 'Valor recebido até agora (R$)'],
    realizada: ['Transferências realizadas', '5.2', 'Beneficiário', 'Valor concedido até agora (R$)'],
    sem_repasse: ['Acordos sem repasse de recursos', '5.3', 'Demais partes (partícipes)', null]
  };
  const INSTRUMENTOS = {
    convenio: 'Convênio', contrato_repasse: 'Contrato de repasse', termo_fomento: 'Termo de fomento', termo_colaboracao: 'Termo de colaboração',
    acordo_cooperacao: 'Acordo de cooperação', termo_execucao_descentralizada: 'Termo de execução descentralizada', termo_compromisso: 'Termo de compromisso',
    transferencia_especial: 'Transferência especial', fundo_a_fundo: 'Transferência fundo a fundo', protocolo_intencoes: 'Protocolo de intenções', outro: 'Outro instrumento'
  };
  const ESFERAS = { federal: 'Federal (União)', estadual: 'Estadual', municipal: 'Municipal', privada: 'Entidade privada / OSC', internacional: 'Internacional' };
  const ANDAMENTOS = {
    em_execucao: 'Em execução', concluido: 'Concluído', prestacao_contas: 'Em prestação de contas', contas_aprovadas: 'Contas aprovadas',
    contas_rejeitadas: 'Contas rejeitadas', rescindido: 'Rescindido', cancelado: 'Cancelado'
  };
  const COR_ANDAMENTO = { em_execucao: 'agendado', concluido: 'publicado', prestacao_contas: 'agendado', contas_aprovadas: 'publicado', contas_rejeitadas: 'desativado', rescindido: 'desativado', cancelado: 'desativado' };
  const rotuloConvenio = (c) => (INSTRUMENTOS[c.instrumento] || 'Instrumento') + (c.numero ? ' nº ' + c.numero : ' s/nº');
  P.CONVENIOS = { TIPOS, INSTRUMENTOS, rotuloConvenio };

  (function () {
    let perm = {}, conteiner = null, tipo = 'recebida', ano = null, anos = [], itens = [], fim = false, total = 0;
    const filtros = { busca: '', andamento: '', vigencia: '', situacao: '' };
    const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
    const mostrarErro = (e) => {
      const t = (e && e.message) || '';
      if (/convenios_documento/.test(t)) return toast('Para publicar, anexe o inteiro teor (PDF) ou informe o link.', true);
      if (/convenios_vigencia/.test(t)) return toast('O fim da vigência não pode ser antes do início.', true);
      if (/convenios_numero_uk/.test(t)) return toast('Já existe este instrumento com o mesmo número e ano.', true);
      if (/emendas_convenio_id_fkey/.test(t)) return toast('Este convênio está ligado a uma emenda parlamentar: troque a emenda antes de excluir.', true);
      toast(P.erroGravacao(e), true);
    };

    function consulta(sel, op) {
      let q = sb.from('convenios').select(sel, op).eq('orgao_id', P.estado.orgao.id).eq('tipo', tipo);
      if (ano) q = q.eq('ano', ano);
      if (filtros.busca) q = q.ilike('busca', buscaLike(filtros.busca));
      if (filtros.andamento) q = q.eq('andamento', filtros.andamento);
      if (filtros.vigencia === 'vigente') q = q.or('vigencia_fim.is.null,vigencia_fim.gte.' + hoje());
      if (filtros.vigencia === 'encerrada') q = q.lt('vigencia_fim', hoje());
      if (filtros.situacao) q = q.eq('situacao', filtros.situacao);
      return q;
    }
    async function carregarAnos() {
      const { data, error } = await sb.rpc('convenios_anos', { p_orgao: P.estado.orgao.id, p_tipo: tipo });
      if (error) throw error;
      anos = data || [];
      if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
    }
    async function carregar(reiniciar) {
      if (!ano) { itens = []; fim = true; total = 0; return; }
      const ultimo = reiniciar ? null : itens[itens.length - 1];
      const [pag, t] = await Promise.all([P.paginar(consulta, 'atualizado_em', ultimo, LOTE), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
      itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
      fim = pag.fim; total = t;
    }

    function form(c) {
      c = c || {};
      const editando = !!c.id, publicado = c.situacao === 'publicado', travado = publicado && !perm.publicar;
      const f = {
        tipo: el('select', null, Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, selected: (c.tipo || tipo) === k }, v[0] + ' (' + v[1] + ')'))),
        instrumento: el('select', null, opcoes(INSTRUMENTOS, c.instrumento || 'convenio')),
        numero: el('input', { type: 'text', maxlength: 40, value: c.numero || '', placeholder: 'Ex.: 912345/2025' }),
        processo: el('input', { type: 'text', maxlength: 100, value: c.processo || '' }),
        objeto: el('textarea', { rows: 3, maxlength: 2000, placeholder: 'Ex.: Aquisição de patrulha mecanizada para a agricultura familiar.' }),
        parte: el('input', { type: 'text', maxlength: 500, value: c.parte_nome || '' }),
        doc: P.mascaraDoc(el('input', { type: 'text', maxlength: 18, value: docFormatado(c.parte_doc), placeholder: 'CNPJ ou CPF' })),
        esfera: el('select', null, opcoes(ESFERAS, c.esfera || '', '— Não informada —')),
        unidade: el('input', { type: 'text', maxlength: 150, value: c.unidade_nome || '', placeholder: 'Secretaria responsável pela execução' }),
        programa: el('input', { type: 'text', maxlength: 300, value: c.programa || '', placeholder: 'Ex.: Programa Nacional de Fortalecimento da Agricultura Familiar' }),
        assinatura: el('input', { type: 'date', value: c.data_assinatura || '' }),
        inicio: el('input', { type: 'date', value: c.vigencia_inicio || '' }),
        fimV: el('input', { type: 'date', value: c.vigencia_fim || '' }),
        previsto: el('input', { type: 'number', min: 0, step: '0.01', value: c.valor_previsto ?? '' }),
        contrapartida: el('input', { type: 'number', min: 0, step: '0.01', value: c.valor_contrapartida ?? '' }),
        repassado: el('input', { type: 'number', min: 0, step: '0.01', value: c.valor_repassado ?? '' }),
        posicao: el('input', { type: 'date', value: c.repasse_atualizado_em || '' }),
        andamento: el('select', null, opcoes(ANDAMENTOS, c.andamento || 'em_execucao')),
        obrigacoes: el('textarea', { rows: 5, maxlength: 4000, placeholder: 'O que cada parte se obrigou a fazer. Ex.: Município: ceder o espaço e o transporte. Universidade: supervisionar os estagiários.' }),
        acomp: el('input', { type: 'url', value: c.link_acompanhamento || '', placeholder: 'https://… (ex.: página do convênio no Transferegov)' })
      };
      f.objeto.value = c.objeto || '';
      f.obrigacoes.value = c.obrigacoes || '';
      const doc = blocoDocumento('cv', c, 'Inteiro teor (PDF do instrumento assinado)', 'Pode ser usado no lugar do PDF (ex.: Diário Oficial, Transferegov).',
        'Para publicar, anexe o inteiro teor (PDF) ou informe o link (PNTP 5.1 a 5.3).');
      const rotParte = el('span'), rotRepassado = el('span'), rotObrig = el('span');
      const cParte = campo('cv-parte', rotParte, f.parte, null, true);
      const bValores = el('div', null,
        el('div', { class: 'grade-campos' }, campo('cv-prev', 'Valor total previsto (R$)', f.previsto, 'Inclui todas as parcelas do repasse.'), campo('cv-contra', 'Contrapartida (R$)', f.contrapartida)),
        el('div', { class: 'grade-campos' }, campo('cv-rep', rotRepassado, f.repassado), campo('cv-pos', 'Posição em', f.posicao, 'Data em que o valor acima foi conferido.')));
      const cObrig = campo('cv-obr', rotObrig, f.obrigacoes, 'No acordo sem repasse, exigido no PNTP 5.3.');
      const ajustar = () => {
        const t = TIPOS[f.tipo.value];
        rotParte.textContent = t[2];
        bValores.hidden = f.tipo.value === 'sem_repasse';
        if (t[3]) rotRepassado.textContent = t[3];
        rotObrig.textContent = f.tipo.value === 'sem_repasse' ? 'Obrigações ajustadas' : 'Obrigações / metas (opcional)';
      };
      f.tipo.addEventListener('change', ajustar);
      const corpo = el('form', { class: 'form-dialogo', novalidate: true },
        travado ? el('p', { class: 'msg msg-info' }, 'Este instrumento está publicado. Só quem tem permissão de publicar pode alterá-lo.') : null,
        P.abas([
          ['ident', 'Identificação', [
            el('div', { class: 'grade-campos' }, campo('cv-tipo', 'Tipo', f.tipo, null, true), campo('cv-inst', 'Instrumento', f.instrumento, null, true)),
            el('div', { class: 'grade-campos' }, campo('cv-num', 'Número / ano', f.numero, 'Use o número do Transferegov, quando houver.'), campo('cv-proc', 'Processo', f.processo)),
            campo('cv-obj', 'Objeto', f.objeto, null, true),
            el('div', { class: 'grade-campos' }, cParte, campo('cv-doc', 'CNPJ ou CPF', f.doc, 'No site, CPF aparece mascarado (LGPD).')),
            el('div', { class: 'grade-campos' }, campo('cv-esf', 'Esfera da outra parte', f.esfera), campo('cv-uni', 'Unidade executora', f.unidade)),
            campo('cv-prog', 'Programa / ação', f.programa)]],
          ['valores', 'Valores e vigência', [
            el('div', { class: 'grade-campos' }, campo('cv-ass', 'Data de assinatura', f.assinatura, 'Define o ano em que aparece.'), campo('cv-ini', 'Início da vigência', f.inicio), campo('cv-fim', 'Fim da vigência', f.fimV)),
            campo('cv-and', 'Andamento', f.andamento),
            bValores, cObrig]],
          ['teor', 'Inteiro teor', doc.elementos.concat([campo('cv-acomp', 'Acompanhamento (opcional)', f.acomp, 'Endereço onde o cidadão acompanha a execução, parcelas e prestação de contas.')])]
        ]));
      ajustar();
      if (travado) for (const i of corpo.querySelectorAll('input, select, textarea')) i.disabled = true;
      const b = botoesDialogo(perm, publicado, travado, () => dlg.close());
      const dlg = P.abrirDialogo(editando ? 'Editar instrumento' : 'Novo convênio ou transferência', corpo, b.acoes);
      dlg.classList.add('dialogo-largo');

      async function salvar(situacao, btn) {
        const t = f.tipo.value, semValor = t === 'sem_repasse';
        if (!erroCampo('cv-obj', f.objeto.value.trim().length >= 5 ? '' : 'Descreva o objeto.')) return;
        if (!erroCampo('cv-parte', f.parte.value.trim().length >= 2 ? '' : 'Informe: ' + TIPOS[t][2].toLowerCase() + '.')) return;
        const d = f.doc.value.replace(/\D/g, '');
        if (!erroCampo('cv-doc', P.erroDoc(d))) return;
        if (!erroCampo('cv-fim', !f.inicio.value || !f.fimV.value || f.fimV.value >= f.inicio.value ? '' : 'O fim não pode ser antes do início.')) return;
        if (situacao === 'publicado' && !erroCampo('cv-fim', f.inicio.value && f.fimV.value ? '' : 'Para publicar, informe a vigência (início e fim).')) return;
        if (!semValor) {
          for (const [id, inp] of [['cv-prev', f.previsto], ['cv-contra', f.contrapartida], ['cv-rep', f.repassado]]) if (!erroCampo(id, valorOk(inp) ? '' : 'Valor inválido.')) return;
          if (situacao === 'publicado' && !erroCampo('cv-prev', f.previsto.value !== '' ? '' : 'Para publicar, informe o valor total previsto.')) return;
        }
        if (semValor && situacao === 'publicado' && !erroCampo('cv-obr', f.obrigacoes.value.trim() ? '' : 'Para publicar, descreva as obrigações de cada parte (PNTP 5.3).')) return;
        const ac = f.acomp.value.trim();
        if (!erroCampo('cv-acomp', ac && !P.urlValida(ac) ? 'Endereço completo, começando com https://' : '')) return;
        ocupado(btn, doc.pdf.files[0] ? 'Enviando…' : 'Salvando…');
        try {
          const dd = await doc.gravar('convenios', situacao);
          if (!dd) return;
          const dados = Object.assign({
            tipo: t, instrumento: f.instrumento.value, numero: f.numero.value.trim() || null, processo: f.processo.value.trim() || null,
            objeto: f.objeto.value.trim(), parte_nome: f.parte.value.trim(), parte_doc: d || null, esfera: f.esfera.value || null,
            unidade_nome: f.unidade.value.trim() || null, programa: f.programa.value.trim() || null,
            data_assinatura: f.assinatura.value || null, vigencia_inicio: f.inicio.value || null, vigencia_fim: f.fimV.value || null,
            valor_previsto: semValor ? null : num(f.previsto), valor_contrapartida: semValor ? null : num(f.contrapartida),
            valor_repassado: semValor ? null : num(f.repassado), repasse_atualizado_em: semValor ? null : f.posicao.value || null,
            andamento: f.andamento.value, obrigacoes: f.obrigacoes.value.trim() || null, link_acompanhamento: ac || null, situacao
          }, dd);
          await P.gravarRegistro('convenios', dados, c.id);
          doc.limpar(dd.arquivo_url);
          dlg.close();
          toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
          tipo = t; ano = Number((f.assinatura.value || f.inicio.value || String(c.ano || new Date().getFullYear())).slice(0, 4));
          await recarregar();
        } catch (e) { mostrarErro(e); }
        finally { ocupado(btn); }
      }
      b.btnR.addEventListener('click', () => salvar('rascunho', b.btnR));
      b.btnP.addEventListener('click', () => salvar('publicado', b.btnP));
    }

    async function excluir(c) {
      if (!await P.confirmar('Excluir instrumento', 'Excluir "' + rotuloConvenio(c) + '"? Instrumento encerrado continua na relação (série histórica); exclua só se foi lançado por engano.', 'Excluir', true)) return;
      const { data, error } = await sb.from('convenios').delete().eq('id', c.id).select('id');
      if (error) return mostrarErro(error);
      if (!data || !data.length) return toast('Seu perfil não pode excluir este instrumento.', true);
      P.apagarArquivo(c.arquivo_url);
      toast('Instrumento excluído.'); await recarregar();
    }

    function desenhar() {
      const semValor = tipo === 'sem_repasse';
      const botaoTipo = (id) => el('button', { type: 'button', role: 'tab', class: 'aba', 'aria-selected': tipo === id ? 'true' : 'false',
        onclick: async () => { if (tipo === id) return; tipo = id; ano = null; await recarregar(); } }, TIPOS[id][0]);
      const botaoAno = (x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': ano === x.ano ? 'true' : 'false',
        onclick: async () => { if (ano === x.ano) return; ano = x.ano; await recarregarLista(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total)));
      const fBusca = el('input', { type: 'search', placeholder: 'Número, objeto, ' + (tipo === 'realizada' ? 'beneficiário' : 'concedente') + ', processo', value: filtros.busca, 'aria-label': 'Buscar' });
      const fAnd = el('select', { 'aria-label': 'Andamento' }, opcoes(ANDAMENTOS, filtros.andamento, 'Andamento: todos'));
      const fVig = el('select', { 'aria-label': 'Vigência' }, el('option', { value: '' }, 'Vigência: todas'),
        [['vigente', 'Vigentes'], ['encerrada', 'Encerradas']].map(([k, v]) => el('option', { value: k, selected: filtros.vigencia === k }, v)));
      const fSit = el('select', { 'aria-label': 'Situação' }, el('option', { value: '' }, 'Situação: todas'),
        el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'No ar'), el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunho'));
      const lista = el('div');
      const aplicar = () => {
        Object.assign(filtros, { busca: fBusca.value.trim(), andamento: fAnd.value, vigencia: fVig.value, situacao: fSit.value });
        lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
        carregar(true).then(desenharLista).catch(mostrarErro);
      };
      [fAnd, fVig, fSit].forEach((x) => x.addEventListener('change', aplicar));
      let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });

      function desenharLista() {
        if (!itens.length) { lista.replaceChildren(el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhum instrumento com esses filtros.' : 'Nenhum instrumento neste ano.')); return; }
        const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
        btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); desenharLista(); } catch (e) { mostrarErro(e); ocupado(btnMais); } });
        const cab = ['Instrumento e objeto', TIPOS[tipo][2].split(' (')[0], 'Vigência'].concat(semValor ? [] : ['Previsto', tipo === 'recebida' ? 'Recebido' : 'Concedido'], ['Andamento', 'Teor', 'Situação']);
        lista.replaceChildren(
          el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
            el('thead', null, el('tr', null, cab.map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
            el('tbody', null, itens.map((c) => el('tr', null,
              el('td', { class: 'quebra' }, el('strong', null, rotuloConvenio(c)), el('span', { class: 'sub-linha' }, c.objeto.length > 140 ? c.objeto.slice(0, 140) + '…' : c.objeto)),
              el('td', { class: 'quebra' }, c.parte_nome, c.esfera ? el('span', { class: 'sub-linha' }, ESFERAS[c.esfera]) : null),
              el('td', { class: 'num' }, c.vigencia_inicio || c.vigencia_fim ? (P.dataBR(c.vigencia_inicio) || '…') + ' a ' + (P.dataBR(c.vigencia_fim) || '…') : el('span', { class: 'falta-leve' }, 'Não informada')),
              semValor ? null : el('td', { class: 'num' }, moeda(c.valor_previsto)),
              semValor ? null : el('td', { class: 'num' }, moeda(c.valor_repassado)),
              el('td', null, el('span', { class: 'etiqueta etiqueta-' + (COR_ANDAMENTO[c.andamento] || 'rascunho') }, ANDAMENTOS[c.andamento] || c.andamento)),
              el('td', null, linkDoc(c)),
              el('td', null, etiquetaSituacao(c.situacao)),
              el('td', { class: 'acoes' },
                podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(c) }, c.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
                perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(c) }, 'Excluir') : null)))))),
          el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
      }

      const declaracao = {
        recebida: 'Sem transferência recebida publicada, o site declara que o órgão não recebeu recursos por convênio ou instrumento congênere.',
        realizada: 'Sem transferência realizada publicada, o site declara que o órgão não repassou recursos por convênio ou instrumento congênere.',
        sem_repasse: 'Sem acordo publicado, o site declara que não há acordos sem transferência de recursos.'
      };
      conteiner.replaceChildren(...[
        el('div', { class: 'cabecalho-modulo' },
          el('div', null, el('h1', null, 'Convênios e transferências'),
            el('p', { class: 'sub' }, 'Convênios, contratos de repasse, termos de fomento e colaboração e acordos de cooperação (PNTP 5.1 a 5.3).')),
          podeGravar() ? el('div', { class: 'botoes-cabecalho' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Novo instrumento')) : null),
        P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Convênios são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
        el('div', { class: 'abas', role: 'tablist', 'aria-label': 'Tipo' }, Object.keys(TIPOS).map(botaoTipo)),
        el('div', { class: 'painel-guia' },
          el('p', { class: 'ajuda' }, 'PNTP ' + TIPOS[tipo][1] + '. ' + declaracao[tipo]),
          anos.length ? el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Ano' }, anos.map(botaoAno)) : null,
          anos.length ? el('div', { class: 'painel-guia painel-guia-interno' }, el('div', { class: 'filtros' }, fBusca, fAnd, fVig, fSit), lista)
            : el('p', { class: 'vazio' }, 'Nenhum instrumento cadastrado nesta aba.'))
      ].filter(Boolean));
      if (anos.length) desenharLista();
    }

    async function recarregarLista() { try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }
    async function recarregar() { try { await carregarAnos(); await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }

    P.telas.convenios = async function (c, mod, p) {
      perm = p; conteiner = c;
      c.replaceChildren(el('h1', null, 'Convênios e transferências'), el('p', { class: 'sub' }, 'Carregando…'));
      try { await carregarAnos(); await carregar(true); desenhar(); }
      catch (e) { c.querySelector('.sub').textContent = /convenios_anos|Could not find/i.test(e.message || '') ? 'Falta rodar o script 19 no banco.' : P.erroGravacao(e); }
    };
  })();

  // =====================================================================
  // EMENDAS PARLAMENTARES — PNTP 17.1, 17.2 e 17.3
  // =====================================================================
  const ORIGENS = { federal: 'Federal', estadual: 'Estadual', municipal: 'Municipal (própria)' };
  const TIPOS_EMENDA = { individual: 'Individual', bancada: 'De bancada', comissao: 'De comissão', relator: 'De relator', outra: 'Outra' };
  const FORMAS = {
    transferencia_especial: 'Transferência especial ("PIX")', finalidade_definida: 'Transferência com finalidade definida', fundo_a_fundo: 'Fundo a fundo',
    convenio: 'Convênio / contrato de repasse', execucao_propria: 'Execução direta pelo município', outra: 'Outra'
  };
  const ANDAMENTOS_EMENDA = { prevista: 'Prevista', em_execucao: 'Em execução', concluida: 'Concluída', impedida: 'Impedida', cancelada: 'Cancelada' };
  const COR_EMENDA = { prevista: 'rascunho', em_execucao: 'agendado', concluida: 'publicado', impedida: 'desativado', cancelada: 'desativado' };
  // Funções de governo (Portaria MOG nº 42/1999).
  const FUNCOES = {
    '01': 'Legislativa', '02': 'Judiciária', '03': 'Essencial à Justiça', '04': 'Administração', '05': 'Defesa Nacional', '06': 'Segurança Pública',
    '07': 'Relações Exteriores', '08': 'Assistência Social', '09': 'Previdência Social', '10': 'Saúde', '11': 'Trabalho', '12': 'Educação', '13': 'Cultura',
    '14': 'Direitos da Cidadania', '15': 'Urbanismo', '16': 'Habitação', '17': 'Saneamento', '18': 'Gestão Ambiental', '19': 'Ciência e Tecnologia',
    '20': 'Agricultura', '21': 'Organização Agrária', '22': 'Indústria', '23': 'Comércio e Serviços', '24': 'Comunicações', '25': 'Energia', '26': 'Transporte',
    '27': 'Desporto e Lazer', '28': 'Encargos Especiais', '99': 'Reserva de Contingência'
  };
  const rotuloFuncao = (k) => k ? k + ' – ' + (FUNCOES[k] || '') : '';

  (function () {
    let perm = {}, conteiner = null, ano = null, anos = [], itens = [], fim = false, total = 0;
    const filtros = { busca: '', origem: '', forma: '', andamento: '', situacao: '' };
    const podeGravar = () => perm.editar && !P.estado.alcanceUnidade;
    const mostrarErro = (e) => {
      const t = (e && e.message) || '';
      if (/emendas_numero_uk/.test(t)) return toast('Já existe emenda com este número, origem e exercício.', true);
      if (/emendas_liquidado/.test(t)) return toast('O liquidado não pode passar do empenhado.', true);
      if (/emendas_pago/.test(t)) return toast('O pago não pode passar do liquidado.', true);
      if (/emendas_impedida/.test(t)) return toast('Emenda impedida precisa do motivo do impedimento.', true);
      if (/emendas_pix_sem_convenio/.test(t)) return toast('Transferência especial ("PIX") não tem convênio: remova o vínculo.', true);
      if (/não é deste órgão|não pode receber emenda/.test(t)) return toast(t, true);
      toast(P.erroGravacao(e), true);
    };

    function consulta(sel, op) {
      let q = sb.from('emendas').select(sel, op).eq('orgao_id', P.estado.orgao.id);
      if (ano) q = q.eq('exercicio', ano);
      if (filtros.busca) q = q.ilike('busca', buscaLike(filtros.busca));
      for (const [k, col] of [['origem', 'origem'], ['forma', 'forma_repasse'], ['andamento', 'andamento'], ['situacao', 'situacao']]) if (filtros[k]) q = q.eq(col, filtros[k]);
      return q;
    }
    async function carregarAnos() {
      const { data, error } = await sb.rpc('emendas_anos', { p_orgao: P.estado.orgao.id });
      if (error) throw error;
      anos = data || [];
      if (!anos.some((x) => x.ano === ano)) ano = anos.length ? anos[0].ano : null;
    }
    async function carregar(reiniciar) {
      if (!ano) { itens = []; fim = true; total = 0; return; }
      const ultimo = reiniciar ? null : itens[itens.length - 1];
      const [pag, t] = await Promise.all([P.paginar(consulta, 'atualizado_em', ultimo, LOTE), reiniciar ? P.contar(consulta) : Promise.resolve(total)]);
      itens = reiniciar ? pag.linhas : itens.concat(pag.linhas);
      fim = pag.fim; total = t;
    }

    // Escolha do convênio (busca, sem datalist): só transferências recebidas ou realizadas.
    function escolhaConvenio(atualId, atualRotulo) {
      let escolhido = atualId || null;
      const atual = el('div', { class: 'escolha-atual' });
      const busca = el('input', { type: 'search', id: 'em-conv', placeholder: 'Digite o número, o objeto ou o concedente' });
      const lista = el('div', { class: 'escolha-noticias' });
      const mostrarAtual = (txt) => atual.replaceChildren(escolhido
        ? el('span', null, 'Ligada a: ', el('strong', null, txt || 'convênio selecionado'), ' ',
          el('button', { type: 'button', class: 'link', onclick: () => { escolhido = null; mostrarAtual(); } }, 'remover vínculo'))
        : el('span', { class: 'ajuda' }, 'Sem convênio ligado (opcional). Com o vínculo, o site mostra o instrumento, a vigência e o inteiro teor.'));
      mostrarAtual(atualRotulo);
      let espera;
      busca.addEventListener('input', () => {
        clearTimeout(espera);
        espera = setTimeout(async () => {
          const t = busca.value.trim();
          if (t.length < 2) { lista.replaceChildren(); return; }
          const { data } = await sb.from('convenios').select('id, tipo, instrumento, numero, objeto, parte_nome').eq('orgao_id', P.estado.orgao.id)
            .in('tipo', ['recebida', 'realizada']).ilike('busca', buscaLike(t)).order('ano', { ascending: false }).limit(8);
          lista.replaceChildren(...(data || []).map((c) => el('button', { type: 'button', class: 'escolha-item', onclick: () => {
            escolhido = c.id; mostrarAtual(rotuloConvenio(c) + ' — ' + c.parte_nome); lista.replaceChildren(); busca.value = '';
          } }, el('span', { class: 'escolha-textos' }, el('strong', null, rotuloConvenio(c) + ' · ' + c.parte_nome), el('span', { class: 'ajuda' }, (c.tipo === 'recebida' ? 'Recebida · ' : 'Realizada · ') + c.objeto.slice(0, 120))))),
          (data || []).length ? '' : el('p', { class: 'ajuda' }, 'Nenhum convênio encontrado.'));
        }, 350);
      });
      return { bloco: el('div', null, busca, lista, atual), valor: () => escolhido };
    }

    async function form(e) {
      e = e || {};
      const editando = !!e.id, publicado = e.situacao === 'publicado', travado = publicado && !perm.publicar;
      let convRotulo = null;
      if (e.convenio_id) {
        const { data } = await sb.from('convenios').select('instrumento, numero, parte_nome').eq('id', e.convenio_id).maybeSingle();
        if (data) convRotulo = rotuloConvenio(data) + ' — ' + data.parte_nome;
      }
      const f = {
        exercicio: el('input', { type: 'number', min: 2000, max: 2100, value: e.exercicio || ano || new Date().getFullYear() }),
        origem: el('select', null, opcoes(ORIGENS, e.origem || '', '— Escolha —')),
        tipo: el('select', null, opcoes(TIPOS_EMENDA, e.tipo || 'individual')),
        forma: el('select', null, opcoes(FORMAS, e.forma_repasse || 'finalidade_definida')),
        numero: el('input', { type: 'text', maxlength: 40, value: e.numero || '', placeholder: 'Ex.: 202541230001' }),
        autor: el('input', { type: 'text', maxlength: 200, value: e.autor || '', placeholder: 'Parlamentar, bancada ou comissão' }),
        objeto: el('textarea', { rows: 3, maxlength: 2000, placeholder: 'Ex.: Aquisição de ambulância para a Secretaria de Saúde.' }),
        funcao: el('select', null, el('option', { value: '' }, '— Escolha —'), Object.keys(FUNCOES).sort().map((k) => el('option', { value: k, selected: e.funcao === k }, rotuloFuncao(k)))),
        beneficiario: el('input', { type: 'text', maxlength: 300, value: e.beneficiario || '', placeholder: 'Quando o recurso vai para uma entidade (ex.: APAE)' }),
        unidade: el('input', { type: 'text', maxlength: 150, value: e.unidade_nome || '', placeholder: 'Secretaria que executa' }),
        andamento: el('select', null, opcoes(ANDAMENTOS_EMENDA, e.andamento || 'prevista')),
        impedimento: el('textarea', { rows: 2, maxlength: 1000, placeholder: 'Ex.: Impedimento técnico: projeto não aprovado pelo ministério.' }),
        previsto: el('input', { type: 'number', min: 0, step: '0.01', value: e.valor_previsto ?? '' }),
        realizado: el('input', { type: 'number', min: 0, step: '0.01', value: e.valor_realizado ?? '' }),
        empenhado: el('input', { type: 'number', min: 0, step: '0.01', value: e.valor_empenhado ?? '' }),
        liquidado: el('input', { type: 'number', min: 0, step: '0.01', value: e.valor_liquidado ?? '' }),
        pago: el('input', { type: 'number', min: 0, step: '0.01', value: e.valor_pago ?? '' }),
        posicao: el('input', { type: 'date', value: e.execucao_em || '' }),
        obs: el('textarea', { rows: 2, maxlength: 2000 })
      };
      f.objeto.value = e.objeto || '';
      f.impedimento.value = e.impedimento || '';
      f.obs.value = e.observacao || '';
      const conv = escolhaConvenio(e.convenio_id, convRotulo);
      const doc = blocoDocumento('em', e, 'Documento (opcional)', 'Ex.: página da emenda no Transferegov ou no portal do Legislativo.', null);
      const cImp = campo('em-imp', 'Motivo do impedimento', f.impedimento);
      const cConv = campo('em-conv', 'Convênio ou contrato de repasse', conv.bloco);
      const rotReal = el('span');
      const cReal = campo('em-real', rotReal, f.realizado);
      const ajustar = () => {
        cImp.hidden = f.andamento.value !== 'impedida';
        cConv.hidden = f.forma.value === 'transferencia_especial';
        rotReal.textContent = f.origem.value === 'municipal' ? 'Valor realizado (executado) (R$)' : 'Valor recebido (realizado) (R$)';
      };
      [f.andamento, f.forma, f.origem].forEach((x) => x.addEventListener('change', ajustar));
      const corpo = el('form', { class: 'form-dialogo', novalidate: true },
        travado ? el('p', { class: 'msg msg-info' }, 'Esta emenda está publicada. Só quem tem permissão de publicar pode alterá-la.') : null,
        P.abas([
          ['emenda', 'Emenda', [
            el('div', { class: 'grade-campos' }, campo('em-ex', 'Exercício', f.exercicio, 'Ano do orçamento da emenda.', true), campo('em-ori', 'Origem', f.origem, null, true), campo('em-tipo', 'Tipo', f.tipo, null, true)),
            el('div', { class: 'grade-campos' }, campo('em-num', 'Número da emenda', f.numero, null, true), campo('em-aut', 'Autoria', f.autor, null, true)),
            campo('em-obj', 'Objeto', f.objeto, null, true),
            el('div', { class: 'grade-campos' }, campo('em-fun', 'Função de governo', f.funcao, null, true), campo('em-forma', 'Forma de repasse', f.forma, null, true)),
            el('div', { class: 'grade-campos' }, campo('em-ben', 'Beneficiário (opcional)', f.beneficiario), campo('em-uni', 'Unidade executora', f.unidade)),
            campo('em-and', 'Andamento', f.andamento), cImp]],
          ['valores', 'Valores e execução', [
            el('div', { class: 'grade-campos' }, campo('em-prev', 'Valor previsto (R$)', f.previsto, null, true), cReal),
            el('p', { class: 'ajuda' }, 'Execução orçamentária e financeira (PNTP 17.3): valores acumulados da despesa paga com a emenda.'),
            el('div', { class: 'grade-campos' }, campo('em-emp', 'Empenhado (R$)', f.empenhado), campo('em-liq', 'Liquidado (R$)', f.liquidado), campo('em-pago', 'Pago (R$)', f.pago)),
            campo('em-pos', 'Posição em', f.posicao, 'Data em que os valores da execução foram conferidos.')]],
          ['vinculo', 'Convênio e documentos', [cConv].concat(doc.elementos, [campo('em-obs', 'Observação', f.obs)])]
        ]));
      ajustar();
      if (travado) for (const i of corpo.querySelectorAll('input, select, textarea')) i.disabled = true;
      const b = botoesDialogo(perm, publicado, travado, () => dlg.close());
      const dlg = P.abrirDialogo(editando ? 'Editar emenda parlamentar' : 'Nova emenda parlamentar', corpo, b.acoes);
      dlg.classList.add('dialogo-largo');

      async function salvar(situacao, btn) {
        const ex = parseInt(f.exercicio.value, 10);
        if (!erroCampo('em-ex', ex >= 2000 && ex <= 2100 ? '' : 'Exercício inválido.')) return;
        if (!erroCampo('em-ori', f.origem.value ? '' : 'Escolha a origem.')) return;
        if (!erroCampo('em-num', f.numero.value.trim() ? '' : 'Informe o número da emenda.')) return;
        if (!erroCampo('em-aut', f.autor.value.trim().length >= 2 ? '' : 'Informe a autoria.')) return;
        if (!erroCampo('em-obj', f.objeto.value.trim().length >= 5 ? '' : 'Descreva o objeto.')) return;
        if (!erroCampo('em-fun', f.funcao.value ? '' : 'Escolha a função de governo.')) return;
        if (!erroCampo('em-imp', f.andamento.value !== 'impedida' || f.impedimento.value.trim() ? '' : 'Informe o motivo do impedimento.')) return;
        if (!erroCampo('em-prev', f.previsto.value !== '' && valorOk(f.previsto) ? '' : 'Informe o valor previsto.')) return;
        for (const [id, inp] of [['em-real', f.realizado], ['em-emp', f.empenhado], ['em-liq', f.liquidado], ['em-pago', f.pago]]) if (!erroCampo(id, valorOk(inp) ? '' : 'Valor inválido.')) return;
        const E = num(f.empenhado), L = num(f.liquidado), G = num(f.pago);
        if (!erroCampo('em-liq', E === null || L === null || L <= E ? '' : 'O liquidado não pode passar do empenhado.')) return;
        if (!erroCampo('em-pago', L === null || G === null || G <= L ? '' : 'O pago não pode passar do liquidado.')) return;
        ocupado(btn, doc.pdf.files[0] ? 'Enviando…' : 'Salvando…');
        try {
          const dd = await doc.gravar('emendas', situacao);
          if (!dd) return;
          const dados = Object.assign({
            exercicio: ex, origem: f.origem.value, tipo: f.tipo.value, forma_repasse: f.forma.value, numero: f.numero.value.trim(), autor: f.autor.value.trim(),
            objeto: f.objeto.value.trim(), funcao: f.funcao.value, beneficiario: f.beneficiario.value.trim() || null, unidade_nome: f.unidade.value.trim() || null,
            andamento: f.andamento.value, impedimento: f.andamento.value === 'impedida' ? f.impedimento.value.trim() : null,
            valor_previsto: num(f.previsto), valor_realizado: num(f.realizado), valor_empenhado: E, valor_liquidado: L, valor_pago: G,
            execucao_em: f.posicao.value || null, convenio_id: f.forma.value === 'transferencia_especial' ? null : conv.valor(),
            observacao: f.obs.value.trim() || null, situacao
          }, dd);
          await P.gravarRegistro('emendas', dados, e.id);
          doc.limpar(dd.arquivo_url);
          dlg.close();
          toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.');
          ano = ex; await recarregar();
        } catch (er) { mostrarErro(er); }
        finally { ocupado(btn); }
      }
      b.btnR.addEventListener('click', () => salvar('rascunho', b.btnR));
      b.btnP.addEventListener('click', () => salvar('publicado', b.btnP));
    }

    async function excluir(e) {
      if (!await P.confirmar('Excluir emenda', 'Excluir a emenda nº ' + e.numero + ' (' + e.autor + ')? Emenda concluída continua na relação (série histórica); exclua só se foi lançada por engano.', 'Excluir', true)) return;
      const { data, error } = await sb.from('emendas').delete().eq('id', e.id).select('id');
      if (error) return mostrarErro(error);
      if (!data || !data.length) return toast('Seu perfil não pode excluir esta emenda.', true);
      P.apagarArquivo(e.arquivo_url);
      toast('Emenda excluída.'); await recarregar();
    }

    function desenhar() {
      const botaoAno = (x) => el('button', { type: 'button', role: 'tab', class: 'aba aba-p', 'aria-selected': ano === x.ano ? 'true' : 'false',
        onclick: async () => { if (ano === x.ano) return; ano = x.ano; await recarregarLista(); } }, String(x.ano), el('span', { class: 'aba-qtd' }, String(x.total)));
      const fBusca = el('input', { type: 'search', placeholder: 'Número, autor, objeto, beneficiário', value: filtros.busca, 'aria-label': 'Buscar' });
      const fOri = el('select', { 'aria-label': 'Origem' }, opcoes(ORIGENS, filtros.origem, 'Origem: todas'));
      const fForma = el('select', { 'aria-label': 'Forma de repasse' }, opcoes(FORMAS, filtros.forma, 'Repasse: todos'));
      const fAnd = el('select', { 'aria-label': 'Andamento' }, opcoes(ANDAMENTOS_EMENDA, filtros.andamento, 'Andamento: todos'));
      const fSit = el('select', { 'aria-label': 'Situação' }, el('option', { value: '' }, 'Situação: todas'),
        el('option', { value: 'publicado', selected: filtros.situacao === 'publicado' }, 'No ar'), el('option', { value: 'rascunho', selected: filtros.situacao === 'rascunho' }, 'Rascunho'));
      const lista = el('div');
      const aplicar = () => {
        Object.assign(filtros, { busca: fBusca.value.trim(), origem: fOri.value, forma: fForma.value, andamento: fAnd.value, situacao: fSit.value });
        lista.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…'));
        carregar(true).then(desenharLista).catch(mostrarErro);
      };
      [fOri, fForma, fAnd, fSit].forEach((x) => x.addEventListener('change', aplicar));
      let espera; fBusca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(aplicar, 400); });

      function desenharLista() {
        if (!itens.length) { lista.replaceChildren(el('p', { class: 'vazio' }, Object.values(filtros).some(Boolean) ? 'Nenhuma emenda com esses filtros.' : 'Nenhuma emenda neste exercício.')); return; }
        const btnMais = el('button', { type: 'button', class: 'btn btn-claro' }, 'Carregar mais');
        btnMais.addEventListener('click', async () => { ocupado(btnMais, 'Carregando…'); try { await carregar(false); desenharLista(); } catch (er) { mostrarErro(er); ocupado(btnMais); } });
        lista.replaceChildren(
          el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
            el('thead', null, el('tr', null, ['Emenda', 'Objeto', 'Previsto', 'Realizado', 'Pago', 'Andamento', 'Situação'].map((t) => el('th', { scope: 'col' }, t)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
            el('tbody', null, itens.map((x) => el('tr', null,
              el('td', { class: 'quebra' }, el('strong', null, 'Nº ' + x.numero), el('span', { class: 'sub-linha' }, ORIGENS[x.origem] + ' · ' + TIPOS_EMENDA[x.tipo] + ' · ' + x.autor)),
              el('td', { class: 'quebra' }, x.objeto.length > 120 ? x.objeto.slice(0, 120) + '…' : x.objeto, el('span', { class: 'sub-linha' }, rotuloFuncao(x.funcao) + ' · ' + (FORMAS[x.forma_repasse] || ''))),
              el('td', { class: 'num' }, moeda(x.valor_previsto)),
              el('td', { class: 'num' }, moeda(x.valor_realizado)),
              el('td', { class: 'num' }, moeda(x.valor_pago)),
              el('td', null, el('span', { class: 'etiqueta etiqueta-' + (COR_EMENDA[x.andamento] || 'rascunho') }, ANDAMENTOS_EMENDA[x.andamento] || x.andamento)),
              el('td', null, etiquetaSituacao(x.situacao)),
              el('td', { class: 'acoes' },
                podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(x) }, x.situacao === 'publicado' && !perm.publicar ? 'Ver' : 'Editar') : null,
                perm.excluir && podeGravar() ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(x) }, 'Excluir') : null)))))),
          el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, 'Mostrando ' + itens.length + ' de ' + total), fim ? '' : btnMais));
      }

      // Quadro do exercício (17.3): soma de todas as emendas do ano, publicadas ou não.
      const tot = anos.find((x) => x.ano === ano);
      const quadro = tot ? el('div', { class: 'grade-campos', style: 'margin:8px 0 12px' },
        [['Previsto', tot.previsto], ['Realizado', tot.realizado], ['Empenhado', tot.empenhado], ['Liquidado', tot.liquidado], ['Pago', tot.pago]]
          .map(([r, v]) => el('div', { class: 'cartao', style: 'padding:10px 12px' }, el('span', { class: 'ajuda' }, r + ' em ' + ano), el('strong', { style: 'display:block' }, moeda(v))))) : null;

      conteiner.replaceChildren(...[
        el('div', { class: 'cabecalho-modulo' },
          el('div', null, el('h1', null, 'Emendas parlamentares'),
            el('p', { class: 'sub' }, 'Emendas federais, estaduais e municipais (inclusive as do próprio orçamento) e a execução de cada uma (PNTP 17.1 a 17.3).')),
          podeGravar() ? el('div', { class: 'botoes-cabecalho' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => form() }, '+ Nova emenda')) : null),
        P.estado.alcanceUnidade && perm.editar ? el('p', { class: 'msg msg-info' }, 'Emendas são do órgão todo: só quem tem acesso ao órgão inteiro altera.') : null,
        el('p', { class: 'ajuda' }, 'O município divulga as emendas de todas as origens, inclusive as aprovadas no próprio orçamento (emendas dos vereadores). Sem emenda publicada, o site declara que não há emendas recebidas.'),
        el('div', { class: 'painel-guia' },
          anos.length ? el('div', { class: 'abas abas-internas', role: 'tablist', 'aria-label': 'Exercício' }, anos.map(botaoAno)) : null,
          anos.length ? el('div', { class: 'painel-guia painel-guia-interno' }, quadro, el('div', { class: 'filtros filtros-5' }, fBusca, fOri, fForma, fAnd, fSit), lista)
            : el('p', { class: 'vazio' }, 'Nenhuma emenda cadastrada.'))
      ].filter(Boolean));
      if (anos.length) desenharLista();
    }

    async function recarregarLista() { try { await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }
    async function recarregar() { try { await carregarAnos(); await carregar(true); desenhar(); } catch (e) { mostrarErro(e); } }

    P.telas.emendas = async function (c, mod, p) {
      perm = p; conteiner = c;
      c.replaceChildren(el('h1', null, 'Emendas parlamentares'), el('p', { class: 'sub' }, 'Carregando…'));
      try { await carregarAnos(); await carregar(true); desenhar(); }
      catch (e) { c.querySelector('.sub').textContent = /emendas_anos|Could not find/i.test(e.message || '') ? 'Falta rodar o script 19 no banco.' : P.erroGravacao(e); }
    };
  })();
})();
