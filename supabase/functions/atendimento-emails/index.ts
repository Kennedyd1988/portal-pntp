// =====================================================================
// PORTAL PNTP · SOFT+
// Função de servidor (Supabase Edge Function): atendimento-emails
//
// Envia os e-mails da fila do e-SIC e da Ouvidoria (tabela
// atendimentos_emails, script 25). Chamada a cada 15 minutos pelo
// agendamento do banco, mas SÓ depois de ligar o SMTP próprio:
//   update public.plataforma_config set valor = '{"ativo": true}' where chave = 'smtp';
//
// Secrets necessários (Edge Functions › Secrets):
//   ATENDIMENTO_CHAVE  — a chave mostrada no fim do script 25
//   SMTP_HOST, SMTP_PORT (465 ou 587), SMTP_USUARIO, SMTP_SENHA, SMTP_REMETENTE
//   (ex.: Brevo: smtp-relay.brevo.com, 587; remetente "Portal <nao-responda@dominio>")
//
// Publicar: supabase functions deploy atendimento-emails --no-verify-jwt
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

function chave(nova: string, antiga: string): string {
  try {
    const mapa = JSON.parse(Deno.env.get(nova) ?? '{}');
    if (mapa.default) return mapa.default;
  } catch (_) { /* segue para a antiga */ }
  return Deno.env.get(antiga) ?? '';
}
const sb = createClient(Deno.env.get('SUPABASE_URL')!, chave('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.headers.get('x-chave-sinc') !== Deno.env.get('ATENDIMENTO_CHAVE')) return json({ erro: 'Chave inválida.' }, 401);
  const host = Deno.env.get('SMTP_HOST');
  if (!host) return json({ erro: 'SMTP não configurado (SMTP_HOST vazio).' }, 503);
  const porta = Number(Deno.env.get('SMTP_PORT') ?? '587');
  const envio = nodemailer.createTransport({ host, port: porta, secure: porta === 465,
    auth: { user: Deno.env.get('SMTP_USUARIO'), pass: Deno.env.get('SMTP_SENHA') } });
  const { data: fila, error } = await sb.from('atendimentos_emails').select('id, para, assunto, corpo, tentativas')
    .eq('situacao', 'pendente').order('criado_em').limit(50);
  if (error) return json({ erro: error.message }, 500);
  let enviados = 0, erros = 0;
  for (const m of fila ?? []) {
    try {
      await envio.sendMail({ from: Deno.env.get('SMTP_REMETENTE'), to: m.para, subject: m.assunto, text: m.corpo });
      await sb.from('atendimentos_emails').update({ situacao: 'enviado', enviado_em: new Date().toISOString(), tentativas: m.tentativas + 1, erro: null }).eq('id', m.id);
      enviados++;
    } catch (e) {
      // 3 tentativas; depois fica como "erro" (aparece no painel).
      await sb.from('atendimentos_emails').update({ situacao: m.tentativas + 1 >= 3 ? 'erro' : 'pendente', tentativas: m.tentativas + 1,
        erro: String((e as Error).message || e).slice(0, 500) }).eq('id', m.id);
      erros++;
    }
  }
  return json({ enviados, erros });
});
