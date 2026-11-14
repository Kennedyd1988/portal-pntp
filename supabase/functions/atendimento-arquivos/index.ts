// =====================================================================
// PORTAL PNTP · SOFT+
// Função de servidor (Supabase Edge Function): atendimento-arquivos
//
// Por que existe: os anexos do e-SIC e da Ouvidoria ficam num bucket
// PRIVADO ("atendimento"). O cidadão não tem login, então não pode gravar
// nem ler direto no Storage. Esta função confere o protocolo + código de
// acesso no banco e:
//   POST  (multipart: orgao, protocolo, codigo, arquivo) → grava o anexo
//         (PDF, JPG, PNG ou WEBP, até 10 MB; até 3 por envio e 9 por protocolo);
//   GET   ?orgao&protocolo&codigo&anexo → devolve um link temporário (2 min)
//         para baixar um anexo público do protocolo.
// A equipe (com login) grava e lê pelo próprio Storage, com as regras do
// script 25 — não passa por aqui.
//
// Publicar: supabase functions deploy atendimento-arquivos --no-verify-jwt
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

function chave(nova: string, antiga: string): string {
  try {
    const mapa = JSON.parse(Deno.env.get(nova) ?? '{}');
    if (mapa.default) return mapa.default;
  } catch (_) { /* segue para a antiga */ }
  return Deno.env.get(antiga) ?? '';
}
const sb = createClient(Deno.env.get('SUPABASE_URL')!, chave('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const TIPOS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const LIMITE = 10 * 1024 * 1024;

// Confere o começo do arquivo (não confia só no tipo informado pelo navegador).
function confere(bytes: Uint8Array, tipo: string): boolean {
  const ini = (n: number[]) => n.every((b, i) => bytes[i] === b);
  if (tipo === 'application/pdf') return ini([0x25, 0x50, 0x44, 0x46]);
  if (tipo === 'image/jpeg') return ini([0xff, 0xd8, 0xff]);
  if (tipo === 'image/png') return ini([0x89, 0x50, 0x4e, 0x47]);
  if (tipo === 'image/webp') return ini([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url);
      const { data, error } = await sb.rpc('anexo_caminho_cidadao', { p_orgao: u.searchParams.get('orgao'), p_protocolo: u.searchParams.get('protocolo'),
        p_codigo: u.searchParams.get('codigo'), p_anexo: u.searchParams.get('anexo') });
      if (error) return json({ erro: 'Não foi possível conferir o protocolo.' }, 400);
      if (data.erro) return json({ erro: data.erro }, 403);
      const { data: link, error: e2 } = await sb.storage.from('atendimento').createSignedUrl(data.caminho, 120, { download: data.nome });
      if (e2) return json({ erro: 'Arquivo indisponível.' }, 404);
      return json({ url: link.signedUrl });
    }
    if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405);
    const form = await req.formData();
    const arquivo = form.get('arquivo');
    if (!(arquivo instanceof File)) return json({ erro: 'Envie o arquivo.' }, 400);
    const ext = TIPOS[arquivo.type];
    if (!ext) return json({ erro: 'Envie PDF, JPG, PNG ou WEBP.' }, 400);
    if (arquivo.size > LIMITE) return json({ erro: 'O arquivo passa de 10 MB.' }, 400);
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (!confere(bytes, arquivo.type)) return json({ erro: 'O conteúdo do arquivo não corresponde ao tipo.' }, 400);
    const { data: ok, error } = await sb.rpc('anexo_cidadao_permitido', { p_orgao: form.get('orgao'), p_protocolo: form.get('protocolo'), p_codigo: form.get('codigo') });
    if (error) return json({ erro: 'Não foi possível conferir o protocolo.' }, 400);
    if (ok.erro) return json({ erro: ok.erro }, 403);
    const caminho = ok.orgao_id + '/' + ok.id + '/' + crypto.randomUUID() + '.' + ext;
    const { error: e3 } = await sb.storage.from('atendimento').upload(caminho, bytes, { contentType: arquivo.type, upsert: false });
    if (e3) return json({ erro: 'Não foi possível gravar o arquivo.' }, 500);
    const nome = String(arquivo.name || 'anexo.' + ext).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 200);
    const { error: e4 } = await sb.rpc('anexo_cidadao_registrar', { p_atendimento: ok.id, p_nome: nome, p_caminho: caminho, p_tamanho: arquivo.size, p_tipo: arquivo.type });
    if (e4) { await sb.storage.from('atendimento').remove([caminho]); return json({ erro: 'Não foi possível registrar o anexo.' }, 500); }
    return json({ ok: true, nome });
  } catch (_) {
    return json({ erro: 'Falha inesperada. Tente de novo.' }, 500);
  }
});
