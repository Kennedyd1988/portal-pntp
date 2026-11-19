// =====================================================================
// Galeria de vídeos (0.26.0) — aba "Vídeos" de Notícias, banners e avisos.
// O site mostra a página #/videos e o bloco "Galeria multimídia" na página
// inicial: o vídeo marcado como destaque (ou o mais recente) e os 3 seguintes.
// =====================================================================
(function () {
  'use strict';
  const P = window.PNTP;
  const { sb, el, toast, ocupado, erroCampo, campo } = P;

  // Endereço do YouTube → id (miniatura automática e reprodução embutida).
  const idYoutube = (u) => { const m = String(u || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/); return m ? m[1] : null; };
  const miniatura = (v) => v.miniatura_url || (idYoutube(v.url) ? 'https://img.youtube.com/vi/' + idYoutube(v.url) + '/mqdefault.jpg' : null);

  let ctx = null;   // { area, perm, alcance }
  async function listar() {
    const { data, error } = await sb.from('videos').select('*').eq('orgao_id', P.estado.orgao.id).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(300);
    if (error) {
      ctx.area.replaceChildren(el('p', { class: 'msg msg-erro' }, /videos|does not exist|Could not find/i.test(error.message || '') ? 'Falta rodar o script 35 no banco.' : P.erroGravacao(error)));
      return;
    }
    const pode = ctx.perm.editar && !ctx.alcance;
    ctx.area.replaceChildren(
      el('p', { class: 'ajuda' }, 'Cole o endereço do vídeo no YouTube (ou outro site). A página inicial mostra o vídeo marcado como destaque (ou o mais recente) e os três seguintes; todos ficam na página Vídeos.'),
      (data || []).length ? el('div', { class: 'tabela-caixa' }, el('table', { class: 'tabela' },
        el('thead', null, el('tr', null, ['', 'Vídeo', 'Data', 'Situação'].map((h) => el('th', { scope: 'col' }, h)), el('th', { scope: 'col' }, el('span', { class: 'sr' }, 'Ações')))),
        el('tbody', null, data.map((v) => el('tr', null,
          el('td', null, miniatura(v) ? el('img', { src: miniatura(v), alt: '', width: 96, height: 54, style: 'object-fit:cover;border-radius:6px' }) : '—'),
          el('td', { class: 'quebra' }, el('strong', null, v.titulo), v.destaque ? el('span', { class: 'etiqueta etiqueta-agendado', style: 'margin-left:6px' }, 'Destaque') : null,
            el('span', { class: 'sub-linha' }, el('a', { href: v.url, target: '_blank', rel: 'noopener' }, v.url))),
          el('td', { class: 'num' }, P.dataBR(v.data)),
          el('td', null, el('span', { class: 'etiqueta etiqueta-' + (v.situacao === 'publicado' ? 'publicado' : 'rascunho') }, v.situacao === 'publicado' ? 'No ar' : 'Rascunho')),
          el('td', { class: 'acoes' }, pode ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => form(v) }, 'Editar') : null, pode ? P.botaoDuplicar(() => form(P.copiaNova(v))) : null,
            pode && ctx.perm.excluir ? el('button', { type: 'button', class: 'btn btn-claro btn-p btn-texto-perigo', onclick: () => excluir(v) }, 'Excluir') : null))))))
        : el('p', { class: 'vazio' }, 'Nenhum vídeo cadastrado.'));
  }
  async function excluir(v) {
    if (!await P.confirmar('Excluir vídeo', 'Excluir "' + v.titulo + '" da galeria? O vídeo continua no YouTube.', 'Excluir', true)) return;
    const { data, error } = await sb.from('videos').delete().eq('id', v.id).select('id');
    if (error) return toast(P.erroGravacao(error), true);
    if (!data || !data.length) return toast('Seu perfil não pode excluir este vídeo.', true);
    toast('Vídeo excluído.'); listar();
  }
  function form(v) {
    v = v || {};
    const f = { titulo: el('input', { type: 'text', maxlength: 200, value: v.titulo || '' }),
      url: el('input', { type: 'url', value: v.url || '', placeholder: 'https://www.youtube.com/watch?v=…' }),
      data: el('input', { type: 'date', value: v.data || new Date().toISOString().slice(0, 10) }),
      desc: el('textarea', { rows: 3, maxlength: 2000 }), mini: el('input', { type: 'url', value: v.miniatura_url || '', placeholder: 'Só para vídeos fora do YouTube' }),
      destaque: el('input', { type: 'checkbox' }) };
    f.desc.value = v.descricao || ''; f.destaque.checked = !!v.destaque;
    const previa = el('div', { class: 'mt-1' });
    const mostrar = () => { const m = miniatura({ url: f.url.value.trim(), miniatura_url: f.mini.value.trim() }); previa.replaceChildren(m ? el('img', { src: m, alt: 'Miniatura', style: 'max-width:240px;border-radius:8px' }) : ''); };
    f.url.addEventListener('input', mostrar); f.mini.addEventListener('input', mostrar); mostrar();
    const publicado = v.situacao === 'publicado', travado = publicado && !ctx.perm.publicar;
    const btnR = el('button', { type: 'button', class: 'btn btn-claro' }, publicado ? 'Tirar do ar (rascunho)' : 'Salvar rascunho');
    const btnP = el('button', { type: 'button', class: 'btn btn-primario' }, publicado ? 'Salvar' : 'Publicar');
    const acoes = [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => dlg.close() }, 'Cancelar')];
    if (!travado) { if (!publicado || ctx.perm.publicar) acoes.push(btnR); if (ctx.perm.publicar) acoes.push(btnP); }
    const dlg = P.abrirDialogo(v.id ? 'Editar vídeo' : 'Novo vídeo', el('form', { class: 'form-dialogo', novalidate: true },
      campo('vd-tit', 'Título', f.titulo, null, true), campo('vd-url', 'Endereço do vídeo', f.url, 'YouTube: a miniatura e a reprodução no site são automáticas.', true), previa,
      el('div', { class: 'grade-campos' }, campo('vd-data', 'Data', f.data), campo('vd-mini', 'Miniatura (opcional)', f.mini)),
      campo('vd-desc', 'Descrição (opcional)', f.desc), el('label', { class: 'checkbox' }, f.destaque, ' Destaque na página inicial (só um: marcar este tira o destaque dos outros)')), acoes);
    async function salvar(situacao, btn) {
      if (!erroCampo('vd-tit', f.titulo.value.trim().length >= 3 ? '' : 'Informe o título.')) return;
      if (!erroCampo('vd-url', P.urlValida(f.url.value.trim()) ? '' : 'Informe o endereço completo do vídeo, começando com https://')) return;
      if (!erroCampo('vd-mini', !f.mini.value.trim() || P.urlValida(f.mini.value.trim()) ? '' : 'Endereço completo, começando com https://')) return;
      ocupado(btn, 'Salvando…');
      try {
        const id = await P.gravarRegistro('videos', { titulo: f.titulo.value.trim(), url: f.url.value.trim(), data: f.data.value || null, descricao: f.desc.value.trim() || null,
          miniatura_url: f.mini.value.trim() || null, destaque: f.destaque.checked, situacao }, v.id);
        if (f.destaque.checked) await sb.from('videos').update({ destaque: false }).eq('orgao_id', P.estado.orgao.id).eq('destaque', true).neq('id', id);
        dlg.close(); toast(situacao === 'publicado' ? 'Publicado.' : 'Rascunho salvo.'); listar();
      } catch (e) { toast(P.erroGravacao(e), true); } finally { ocupado(btn); }
    }
    btnR.addEventListener('click', () => salvar('rascunho', btnR));
    btnP.addEventListener('click', () => salvar('publicado', btnP));
  }

  P.videos = {
    tela(area, perm, alcance) { ctx = { area, perm, alcance }; area.replaceChildren(el('p', { class: 'vazio' }, 'Carregando…')); listar(); },
    novo() { form(); }
  };
})();
