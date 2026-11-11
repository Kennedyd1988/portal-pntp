// =====================================================================
// Módulo "Aparência, menu e links" — identidade e contatos do órgão
// (Lote 1). O menu e os links do site entram no próximo lote.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, traduzirErro, emailValido } = P;

  // Razão de contraste (WCAG) entre a cor e o branco: o texto dos botões e do menu é branco.
  function contrasteComBranco(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const canal = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
    return 1.05 / (L + 0.05);
  }

  function campo(id, rotulo, input, ajuda) {
    input.id = id;
    return el('div', { class: 'campo' },
      el('label', { for: id }, rotulo),
      input,
      ajuda ? el('span', { class: 'ajuda' }, ajuda) : null,
      el('span', { class: 'erro-campo', id: id + '-erro' })
    );
  }
  const texto = (valor, extra) => el('input', Object.assign({ type: 'text', value: valor || '' }, extra || {}));

  P.telas.aparencia = async function (c, mod, perm) {
    c.replaceChildren(el('h1', null, mod.nome), el('p', { class: 'sub' }, 'Carregando…'));
    const { data: org, error } = await sb.from('orgaos')
      .select('id, nome, dominio, configuracoes').eq('id', P.estado.orgao.id).maybeSingle();
    if (error || !org) { c.querySelector('.sub').textContent = traduzirErro(error || 'Órgão não encontrado.'); return; }

    const cfg = org.configuracoes || {};
    const podeEditar = !!perm.editar;
    let brasaoUrl = cfg.brasao_url || null;
    let brasaoNovo = null;   // { blob, ext } escolhido e ainda não enviado

    // ----- Identidade -----
    const preview = el('div', { class: 'brasao-preview' });
    function mostrarBrasao(src) {
      preview.replaceChildren(src
        ? el('img', { src, alt: 'Brasão atual' })
        : el('span', null, 'Sem brasão'));
    }
    mostrarBrasao(brasaoUrl);

    const inputArquivo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr', id: 'brasao-arquivo' });
    inputArquivo.addEventListener('change', async () => {
      const f = inputArquivo.files[0];
      if (!f) return;
      if (f.size > 10 * 1024 * 1024) { toast('A imagem passa de 10 MB. Escolha um arquivo menor.', true); return; }
      try {
        brasaoNovo = await P.reduzirImagem(f, 600);
        mostrarBrasao(URL.createObjectURL(brasaoNovo.blob));
        toast('Brasão pronto. Clique em "Salvar alterações" para gravar.');
      } catch (e) { toast(e.message, true); }
    });

    const cor = el('input', { type: 'color', value: cfg.cor_principal || '#0d4fc4', class: 'cor-amostra', 'aria-label': 'Escolher cor' });
    const corTexto = texto(cfg.cor_principal || '#0d4fc4', { maxlength: 7, class: 'cor-texto' });
    const corAviso = el('span', { class: 'ajuda' });
    function conferirCor() {
      const r = contrasteComBranco(corTexto.value);
      if (!r) { corAviso.textContent = 'Use o formato #RRGGBB.'; corAviso.className = 'ajuda ajuda-erro'; return; }
      const ok = r >= 4.5;
      corAviso.textContent = (ok ? '✓ Contraste aprovado com texto branco (' : '⚠ Contraste baixo com texto branco (') +
        r.toFixed(1).replace('.', ',') + ':1). ' + (ok ? '' : 'Para a acessibilidade, o mínimo é 4,5:1. Escolha uma cor mais escura.');
      corAviso.className = 'ajuda ' + (ok ? 'ajuda-ok' : 'ajuda-erro');
    }
    cor.addEventListener('input', () => { corTexto.value = cor.value; conferirCor(); });
    corTexto.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(corTexto.value)) cor.value = corTexto.value; conferirCor(); });
    conferirCor();

    const f = {
      nome_exibicao: texto(cfg.nome_exibicao || org.nome),
      endereco: texto(cfg.endereco),
      cep: texto(cfg.cep, { inputmode: 'numeric', maxlength: 10 }),
      telefone: texto(cfg.telefone, { inputmode: 'tel' }),
      email: texto(cfg.email, { type: 'email' }),
      horario: texto(cfg.horario),
      instagram: texto(cfg.instagram, { type: 'url', placeholder: 'https://instagram.com/…' }),
      facebook: texto(cfg.facebook, { type: 'url', placeholder: 'https://facebook.com/…' }),
      youtube: texto(cfg.youtube, { type: 'url', placeholder: 'https://youtube.com/…' }),
      whatsapp: texto(cfg.whatsapp, { inputmode: 'tel', placeholder: '(84) 90000-0000' }),
      dominio: texto(org.dominio, { placeholder: 'riachodacruz.rn.gov.br' })
    };

    const btnSalvar = el('button', { type: 'submit', class: 'btn btn-primario' }, 'Salvar alterações');
    const form = el('form', { class: 'form-aparencia', novalidate: true },
      el('div', { class: 'grade grade-2' },
        el('section', { class: 'cartao' },
          el('h2', null, 'Identidade'),
          el('div', { class: 'brasao-linha' },
            preview,
            el('div', { class: 'brasao-acoes' },
              inputArquivo,
              el('label', { for: 'brasao-arquivo', class: 'btn btn-claro' + (podeEditar ? '' : ' desativado') }, 'Escolher brasão ou logotipo'),
              el('button', { type: 'button', class: 'link', hidden: !brasaoUrl || !podeEditar, onclick: (ev) => {
                brasaoNovo = null; brasaoUrl = null; mostrarBrasao(null); ev.target.hidden = true;
              } }, 'Remover brasão'),
              el('span', { class: 'ajuda' }, 'PNG, JPG ou WebP. A imagem é reduzida automaticamente.')
            )
          ),
          campo('ap-nome', 'Nome exibido no site', f.nome_exibicao, 'Nome oficial cadastrado: ' + org.nome),
          el('div', { class: 'campo' },
            el('label', { for: 'ap-cor' }, 'Cor principal'),
            el('div', { class: 'cor-linha' }, cor, corTexto),
            corAviso
          )
        ),
        el('section', { class: 'cartao' },
          el('h2', null, 'Contato e atendimento'),
          el('p', { class: 'ajuda' }, 'Aparece no rodapé de todas as páginas (PNTP 2.4 e 2.5).'),
          campo('ap-endereco', 'Endereço da sede', f.endereco),
          el('div', { class: 'grade-campos' },
            campo('ap-cep', 'CEP', f.cep),
            campo('ap-telefone', 'Telefone', f.telefone)
          ),
          campo('ap-email', 'E-mail institucional', f.email),
          campo('ap-horario', 'Horário de atendimento', f.horario, 'Ex.: Segunda a sexta, das 8h às 12h e das 13h às 17h')
        ),
        el('section', { class: 'cartao' },
          el('h2', null, 'Redes sociais e WhatsApp'),
          el('p', { class: 'ajuda' }, 'Links exibidos no site (PNTP 2.8). Deixe em branco o que o órgão não usa.'),
          campo('ap-instagram', 'Instagram', f.instagram),
          campo('ap-facebook', 'Facebook', f.facebook),
          campo('ap-youtube', 'YouTube', f.youtube),
          campo('ap-whatsapp', 'WhatsApp de atendimento', f.whatsapp)
        ),
        el('section', { class: 'cartao' },
          el('h2', null, 'Endereço do site'),
          campo('ap-dominio', 'Domínio', f.dominio, 'Usado quando o site público entrar no ar (Lote 5).')
        )
      ),
      podeEditar ? el('div', { class: 'barra-salvar' }, btnSalvar) : el('p', { class: 'msg msg-info' }, 'Seu perfil pode ver, mas não alterar a aparência.')
    );
    corTexto.id = 'ap-cor';

    if (!podeEditar) for (const i of form.querySelectorAll('input')) i.disabled = true;

    const urlValida = (v) => !v || /^https?:\/\/\S+\.\S+/.test(v);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (k) => f[k].value.trim();
      // Validação campo a campo, com destaque em vermelho.
      if (!erroCampo('ap-nome', v('nome_exibicao') ? '' : 'Informe o nome exibido no site.')) return;
      if (!erroCampo('ap-cor', contrasteComBranco(corTexto.value) ? '' : 'Use o formato #RRGGBB.')) return;
      if (!erroCampo('ap-email', !v('email') || emailValido(v('email')) ? '' : 'E-mail inválido.')) return;
      for (const r of ['instagram', 'facebook', 'youtube']) {
        if (!erroCampo('ap-' + r, urlValida(v(r)) ? '' : 'Informe o endereço completo, começando com https://')) return;
      }
      const dominio = v('dominio').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!erroCampo('ap-dominio', !dominio || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio) ? '' : 'Domínio inválido. Ex.: riachodacruz.rn.gov.br')) return;

      ocupado(btnSalvar, 'Salvando…');
      try {
        const antigo = cfg.brasao_url || null;
        if (brasaoNovo) brasaoUrl = await P.enviarArquivo('aparencia', brasaoNovo.blob, brasaoNovo.ext);
        const novaCfg = Object.assign({}, cfg, {
          nome_exibicao: v('nome_exibicao'), cor_principal: corTexto.value.toLowerCase(),
          brasao_url: brasaoUrl, endereco: v('endereco'), cep: v('cep'), telefone: v('telefone'),
          email: v('email'), horario: v('horario'), instagram: v('instagram'), facebook: v('facebook'),
          youtube: v('youtube'), whatsapp: v('whatsapp')
        });
        const { data, error: e2 } = await sb.from('orgaos')
          .update({ configuracoes: novaCfg, dominio: dominio || null })
          .eq('id', org.id).select('id');
        if (e2) throw e2;
        if (!data || !data.length) throw Object.assign(new Error('Seu perfil não tem permissão para alterar a aparência deste órgão.'), { amigavel: true });
        if (antigo && antigo !== brasaoUrl) P.apagarArquivo(antigo);
        Object.assign(cfg, novaCfg);
        brasaoNovo = null;
        toast('Aparência salva.');
      } catch (e) {
        toast(/duplicate key.*dominio/i.test(e.message || '') ? 'Este domínio já está cadastrado para outro órgão.' : (e.amigavel ? e.message : traduzirErro(e)), true);
      } finally {
        ocupado(btnSalvar);
      }
    });

    c.replaceChildren(
      el('h1', null, 'Aparência e contatos'),
      el('p', { class: 'sub' }, 'Identidade visual e dados de contato usados no site e no Portal da Transparência.'),
      form
    );
  };
})();
