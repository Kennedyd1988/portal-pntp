// =====================================================================
// PORTAL PNTP · SOFT+
// Função de servidor (Supabase Edge Function): convidar-usuario
//
// Por que existe: criar o login de outra pessoa exige a chave secreta do
// projeto, que NUNCA pode ir para o navegador. Esta função roda no
// servidor da Supabase, confere se quem pediu tem permissão e só então
// cria o convite.
//
// Ações (campo "acao" no corpo do pedido):
//   convidar  → cria o login (ou reaproveita, se a pessoa já tiver conta)
//               e dá acesso ao órgão com o perfil e o alcance escolhidos.
//   novo_link → gera de novo o link de acesso de alguém do órgão.
//
// Modos de entrega (campo "modo"):
//   link  → devolve o link para o administrador enviar (WhatsApp, e-mail
//           próprio). Funciona sem configurar servidor de e-mail.
//   email → a Supabase envia o e-mail. Só funciona depois de configurar
//           um SMTP próprio (o envio padrão da Supabase só entrega para a
//           equipe do projeto, no máximo 2 por hora).
//
// Segurança:
//   - A verificação de permissão usa as MESMAS regras do banco
//     (motivo_bloqueio_acesso e RLS), chamadas com o login de quem pediu.
//   - Link só é entregue na mão do administrador para quem ainda não criou
//     senha E não tem acesso a outro órgão. Caso contrário, quem gerou o
//     link poderia entrar na conta de uma pessoa que tem acesso a outros
//     órgãos (sequestro de conta). Nesses casos, só por e-mail.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(corpo: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
// Erros de regra voltam com status 200 e ok:false para o painel mostrar a mensagem como está.
const falha = (erro: string) => resposta({ ok: false, erro });

// Chaves: as novas (sb_secret / sb_publishable) com recuo para as antigas.
function chave(nova: string, antiga: string): string {
  try {
    const mapa = JSON.parse(Deno.env.get(nova) ?? '{}');
    if (mapa.default) return mapa.default;
  } catch (_) { /* segue para a antiga */ }
  return Deno.env.get(antiga) ?? '';
}
const URL_PROJETO = Deno.env.get('SUPABASE_URL')!;
const CHAVE_SECRETA = chave('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const CHAVE_PUBLICA = chave('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ ok: false, erro: 'Método não permitido.' }, 405);

  try {
    // ---------- quem está pedindo ----------
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const admin = createClient(URL_PROJETO, CHAVE_SECRETA, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
    if (erroQuem || !quem?.user) return resposta({ ok: false, erro: 'Sua sessão expirou. Entre novamente.' }, 401);

    // Cliente "com o login de quem pediu": tudo que ele grava passa pelas regras do banco.
    const comoQuemPediu = createClient(URL_PROJETO, CHAVE_PUBLICA, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: 'Bearer ' + token } },
    });

    const corpo = await req.json().catch(() => ({}));
    const acao = String(corpo.acao ?? 'convidar');
    const modo = corpo.modo === 'email' ? 'email' : 'link';
    const orgao = String(corpo.orgao_id ?? '');
    const redirecionar = typeof corpo.redirecionar === 'string' && /^https?:\/\//.test(corpo.redirecionar)
      ? corpo.redirecionar : undefined;
    if (!orgao) return falha('Órgão não informado.');

    // Pode receber link na mão? Só quem nunca entrou e não tem acesso a outro órgão.
    async function podeReceberLink(usuarioId: string): Promise<boolean> {
      const { data: u } = await admin.auth.admin.getUserById(usuarioId);
      const nuncaEntrou = !!u?.user && !u.user.email_confirmed_at && !u.user.last_sign_in_at;
      if (!nuncaEntrou) return false;
      const { data: ficha } = await admin.from('usuarios').select('suporte_softplus').eq('id', usuarioId).maybeSingle();
      if (ficha?.suporte_softplus) return false;
      const { count } = await admin.from('usuarios_orgaos').select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId).neq('orgao_id', orgao);
      return (count ?? 0) === 0;
    }

    // Link de "criar/redefinir senha" para quem já tem login.
    async function linkRecuperacao(email: string): Promise<string> {
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo: redirecionar },
      });
      if (error) throw error;
      return data.properties.action_link;
    }

    // E-mail de "criar/redefinir senha" (precisa de SMTP próprio configurado).
    async function emailRecuperacao(email: string) {
      const publico = createClient(URL_PROJETO, CHAVE_PUBLICA, { auth: { persistSession: false } });
      const { error } = await publico.auth.resetPasswordForEmail(email, { redirectTo: redirecionar });
      if (error) throw error;
    }

    // =================================================================
    if (acao === 'novo_link') {
      const usuarioId = String(corpo.usuario_id ?? '');
      // A pessoa precisa ser deste órgão e estar ao alcance de quem pede.
      const { data: v } = await admin.from('usuarios_orgaos')
        .select('id, perfil_id, unidade_id, usuarios(email)')
        .eq('orgao_id', orgao).eq('usuario_id', usuarioId).maybeSingle();
      if (!v) return falha('Esta pessoa não tem acesso a este órgão.');
      const { data: motivo, error: e1 } = await comoQuemPediu.rpc('motivo_bloqueio_acesso', {
        p_orgao: orgao, p_perfil: v.perfil_id, p_unidade: v.unidade_id, p_usuario: usuarioId,
      });
      if (e1) throw e1;
      if (motivo) return falha(motivo);

      // deno-lint-ignore no-explicit-any
      const email = (v as any).usuarios?.email as string;
      if (modo === 'link') {
        if (!(await podeReceberLink(usuarioId))) {
          return falha('Esta pessoa já criou a senha ou tem acesso a outro órgão. Por segurança, o link só pode ser enviado para o e-mail dela. Peça que ela use "Esqueci minha senha" na tela de entrada.');
        }
        return resposta({ ok: true, situacao: 'link', link: await linkRecuperacao(email), email });
      }
      await emailRecuperacao(email);
      return resposta({ ok: true, situacao: 'email_enviado', email });
    }

    // =================================================================
    if (acao !== 'convidar') return falha('Ação desconhecida.');

    const email = String(corpo.email ?? '').trim().toLowerCase();
    const nome = String(corpo.nome ?? '').trim();
    const perfil = String(corpo.perfil_id ?? '');
    const unidade = corpo.unidade_id ? String(corpo.unidade_id) : null;
    if (!emailValido(email)) return falha('Informe um e-mail válido.');
    if (nome.length < 3) return falha('Informe o nome completo.');

    // 1) Permissão ANTES de criar qualquer login (evita convite por quem não pode).
    const { data: motivo, error: e2 } = await comoQuemPediu.rpc('motivo_bloqueio_acesso', {
      p_orgao: orgao, p_perfil: perfil, p_unidade: unidade, p_usuario: null,
    });
    if (e2) throw e2;
    if (motivo) return falha(motivo);

    // 2) A pessoa já tem login?
    const { data: existente } = await admin.from('usuarios').select('id, nome').eq('email', email).maybeSingle();
    let usuarioId = existente?.id as string | undefined;
    let criadoAgora = false;
    let link: string | null = null;

    if (usuarioId) {
      const { data: jaTem } = await admin.from('usuarios_orgaos').select('ativo')
        .eq('orgao_id', orgao).eq('usuario_id', usuarioId).maybeSingle();
      if (jaTem) {
        return falha(jaTem.ativo
          ? 'Esta pessoa já tem acesso a este órgão.'
          : 'Esta pessoa já está cadastrada neste órgão, mas com o acesso desativado. Use "Reativar" na lista.');
      }
      if (usuarioId === quem.user.id) return falha('Você já tem acesso.');
    } else if (modo === 'link') {
      // Cria o login sem enviar e-mail e devolve o link de convite.
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'invite', email, options: { data: { nome }, redirectTo: redirecionar },
      });
      if (error) throw error;
      usuarioId = data.user.id;
      link = data.properties.action_link;
      criadoAgora = true;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo: redirecionar });
      if (error) throw error;
      usuarioId = data.user.id;
      criadoAgora = true;
    }

    // 3) Dá o acesso com o login de quem pediu (as regras do banco conferem tudo de novo).
    const { error: e3 } = await comoQuemPediu.from('usuarios_orgaos').insert({
      usuario_id: usuarioId, orgao_id: orgao, perfil_id: perfil, unidade_id: unidade,
    });
    if (e3) {
      // Não deixa login "solto" sem órgão se o acesso foi recusado.
      if (criadoAgora) await admin.auth.admin.deleteUser(usuarioId!);
      return falha('Não foi possível dar o acesso: ' + e3.message);
    }

    // Garante o nome na ficha (a ficha nasce pelo gatilho com o nome do convite).
    if (criadoAgora || !existente?.nome) {
      await admin.from('usuarios').update({ nome }).eq('id', usuarioId!);
    }

    if (!criadoAgora) {
      // Já tinha conta: quem já criou senha só precisa entrar; quem nunca entrou recebe novo link.
      if (modo === 'link' && (await podeReceberLink(usuarioId!))) {
        link = await linkRecuperacao(email);
        return resposta({ ok: true, situacao: 'link', link, email });
      }
      return resposta({ ok: true, situacao: 'ja_tinha_conta', email });
    }
    return resposta({ ok: true, situacao: link ? 'link' : 'email_enviado', link, email });
  } catch (e) {
    const t = e instanceof Error ? e.message : String(e);
    if (/already been registered|already registered/i.test(t)) return falha('Este e-mail já tem cadastro. Tente de novo em alguns segundos.');
    if (/not authorized|Email address not authorized/i.test(t)) {
      return falha('A Supabase recusou o envio do e-mail: o servidor de e-mail próprio (SMTP) ainda não foi configurado. Use a opção "Gerar link".');
    }
    if (/rate limit/i.test(t)) return falha('Limite de e-mails por hora atingido. Use a opção "Gerar link" ou tente mais tarde.');
    return falha('Erro no servidor: ' + t);
  }
});
