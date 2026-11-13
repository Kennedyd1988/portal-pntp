// =====================================================================
// PORTAL PNTP · SOFT+
// Função de servidor (Supabase Edge Function): pncp
//
// Por que existe: o navegador não consegue consultar o PNCP direto (o site
// do PNCP não libera chamadas vindas de outros domínios — CORS). Esta função
// apenas repassa a consulta e devolve a resposta. Quem grava no banco é o
// próprio painel, com o login de quem importou, então todas as regras de
// permissão do banco continuam valendo.
//
// Segurança:
//   - Só atende quem está logado no painel e é membro do órgão informado.
//   - Só repassa endereços de CONSULTA pública do PNCP (lista fixa abaixo);
//     não serve de "ponte" para qualquer outro site.
//   - Não usa chave secreta: lê o banco com o login de quem pediu.
//
// Corpo do pedido (POST, JSON): { orgao_id, caminho }
//   caminho = parte do endereço depois de https://pncp.gov.br, por exemplo
//   /api/consulta/v1/contratacoes/publicacao?dataInicial=20260101&...
// Resposta: { ok, status, dados } — status 204 do PNCP (nada encontrado)
// volta como dados: null.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function chave(nova: string, antiga: string): string {
  try {
    const mapa = JSON.parse(Deno.env.get(nova) ?? '{}');
    if (mapa.default) return mapa.default;
  } catch (_) { /* segue para a antiga */ }
  return Deno.env.get(antiga) ?? '';
}
const URL_PROJETO = Deno.env.get('SUPABASE_URL')!;
const CHAVE_PUBLICA = chave('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');

// Endereços permitidos (somente leitura, dados públicos).
const PERMITIDOS = [
  /^\/api\/consulta\/v1\/(contratacoes\/publicacao|contratacoes\/atualizacao|contratos|contratos\/atualizacao|atas|atas\/atualizacao)\?[A-Za-z0-9=&%._-]+$/,
  /^\/api\/pncp\/v1\/orgaos\/\d{14}\/(compras|contratos)\/\d{4}\/\d{1,9}\/arquivos(\?[A-Za-z0-9=&%._-]+)?$/,
  /^\/api\/pncp\/v1\/orgaos\/\d{14}\/atas\/\d{4}\/\d{1,9}\/\d{1,9}\/arquivos(\?[A-Za-z0-9=&%._-]+)?$/,
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ ok: false, erro: 'Método não permitido.' }, 405);
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const banco = createClient(URL_PROJETO, CHAVE_PUBLICA, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: 'Bearer ' + token } },
    });
    const { data: quem } = await banco.auth.getUser(token);
    if (!quem?.user) return resposta({ ok: false, erro: 'Sua sessão expirou. Entre novamente.' }, 401);

    const corpo = await req.json().catch(() => ({}));
    const orgao = String(corpo.orgao_id ?? '');
    const caminho = String(corpo.caminho ?? '');
    if (!PERMITIDOS.some((r) => r.test(caminho))) return resposta({ ok: false, erro: 'Consulta não permitida.' });

    // Membro do órgão? (mesma regra do banco)
    const { data: membro, error: erroMembro } = await banco.rpc('e_membro', { p_orgao: orgao });
    if (erroMembro || membro !== true) return resposta({ ok: false, erro: 'Você não tem acesso a este órgão.' });

    // O PNCP às vezes demora: até 40 s por consulta.
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 40000);
    let r: Response;
    try {
      r = await fetch('https://pncp.gov.br' + caminho, { headers: { accept: 'application/json' }, signal: controle.signal });
    } catch (_) {
      return resposta({ ok: false, erro: 'O PNCP não respondeu a tempo. Tente de novo em alguns minutos.' });
    } finally { clearTimeout(prazo); }

    if (r.status === 204) return resposta({ ok: true, status: 204, dados: null });
    const texto = await r.text();
    if (!r.ok) return resposta({ ok: false, status: r.status, erro: 'O PNCP recusou a consulta (código ' + r.status + ').', detalhe: texto.slice(0, 500) });
    let dados: unknown = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch (_) { return resposta({ ok: false, erro: 'Resposta inesperada do PNCP.' }); }
    return resposta({ ok: true, status: r.status, dados });
  } catch (e) {
    return resposta({ ok: false, erro: 'Erro na consulta ao PNCP: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
