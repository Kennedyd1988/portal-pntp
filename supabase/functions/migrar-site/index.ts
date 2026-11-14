// =====================================================================
// PORTAL PNTP · SOFT+
// Função de servidor (Supabase Edge Function): migrar-site
//
// Lê o site antigo do órgão (páginas e arquivos) para o módulo "Migração do
// site antigo" do painel. O navegador não consegue ler outro site direto
// (CORS), por isso a leitura passa por aqui.
//
// Ações (campo "acao"):
//   pagina → devolve o HTML de uma página do site antigo.
//   medir  → tamanho de vários arquivos (sem baixar), para estimar o espaço.
//   copiar → baixa um arquivo do site antigo e grava no Storage (bucket
//            "arquivos", pasta <órgão>/migracao/<pasta>/); devolve o endereço novo.
//            O nome é fixo por endereço de origem: copiar de novo não duplica.
//
// Segurança: só Suporte SOFT+ ou administrador do órgão; só endereços do site
// de origem cadastrado no próprio órgão (configuracoes.migracao.origem).
// "Verify JWT" desligado: a função confere o login ela mesma.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (corpo: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const falha = (erro: string) => json({ ok: false, erro });

function chave(nova: string, antiga: string): string {
  try { const m = JSON.parse(Deno.env.get(nova) ?? '{}'); if (m.default) return m.default; } catch (_) { /* antiga */ }
  return Deno.env.get(antiga) ?? '';
}
const URL_PROJETO = Deno.env.get('SUPABASE_URL')!;
const CHAVE_SECRETA = chave('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const CHAVE_PUBLICA = chave('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const NAVEGADOR = 'Mozilla/5.0 (compatible; SOFT+ Migracao PNTP)';
const LIMITE = 50 * 1024 * 1024;   // 50 MB por arquivo (limite do bucket, script 31)

const TIPOS: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.text': 'odt', 'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/zip': 'zip', 'text/csv': 'csv',
};
const EXT_TIPO: Record<string, string> = Object.fromEntries(Object.entries(TIPOS).map(([t, e]) => [e, t]));

// Sessão por site (cookies): algumas páginas (licitações, concursos) pedem um "continuar" antes.
const cookies = new Map<string, string>();
function guardarCookies(host: string, r: Response) {
  const novos = (r.headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_]+=)/).map((c) => c.split(';')[0].trim()).filter(Boolean);
  if (!novos.length) return;
  const mapa = new Map((cookies.get(host) ?? '').split('; ').filter(Boolean).map((c) => [c.split('=')[0], c]));
  for (const c of novos) mapa.set(c.split('=')[0], c);
  cookies.set(host, [...mapa.values()].join('; '));
}
async function buscar(url: string, extra: RequestInit = {}) {
  const u = new URL(url);
  const r = await fetch(url, { ...extra, redirect: 'follow',
    headers: { 'User-Agent': NAVEGADOR, 'Cookie': cookies.get(u.host) ?? '', ...(extra.headers ?? {}) },
    signal: AbortSignal.timeout(45000) });
  guardarCookies(u.host, r);
  return r;
}
const liberados = new Set<string>();
async function liberarSecao(url: URL) {
  const m = url.pathname.match(/^\/(licitacao|concurso)\//);
  if (!m || liberados.has(url.host + m[1])) return;
  try { const r = await buscar(url.origin + '/' + m[1] + '/continua-' + m[1] + '/'); await r.arrayBuffer(); } catch (_) { /* segue */ }
  liberados.add(url.host + m[1]);
}

async function sha1(t: string) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405);
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const admin = createClient(URL_PROJETO, CHAVE_SECRETA, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: quem, error: eQ } = await admin.auth.getUser(token);
    if (eQ || !quem?.user) return json({ ok: false, erro: 'Sua sessão expirou. Entre novamente.' }, 401);
    const comoQuemPediu = createClient(URL_PROJETO, CHAVE_PUBLICA, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } },
    });

    const corpo = await req.json().catch(() => ({}));
    const orgao = String(corpo.orgao_id ?? '');
    // Banco ocupado (muitas leituras em paralelo) devolve erro passageiro: tenta de novo
    // e, se persistir, avisa como "temporário" (o painel repete) em vez de negar o acesso.
    const tentar = async <T>(f: () => PromiseLike<{ data: T; error: unknown }>) => {
      let ult: unknown = null;
      for (let i = 0; i < 3; i++) {
        const r = await f();
        if (!r.error) return { data: r.data, error: null };
        ult = r.error; await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
      }
      return { data: null as T | null, error: ult };
    };
    const temporario = () => json({ ok: false, temporario: true, erro: 'Banco de dados ocupado. Tentando de novo.' }, 503);
    const { data: pode, error: eP } = await tentar(() => comoQuemPediu.rpc('e_admin_do_orgao', { p_orgao: orgao }));
    if (eP) return temporario();
    if (pode !== true) return falha('Só o Suporte SOFT+ ou o administrador do órgão usam a migração.');

    const { data: o, error: eO } = await tentar(() => admin.from('orgaos').select('configuracoes').eq('id', orgao).maybeSingle());
    if (eO) return temporario();
    const origem = String(o?.configuracoes?.migracao?.origem ?? '');
    if (!/^https?:\/\//.test(origem)) return falha('Cadastre antes o endereço do site antigo (Migração › Origem).');
    const hostOrigem = new URL(origem).host.replace(/^www\./, '');
    const permitido = (u: string) => {
      try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.host.replace(/^www\./, '') === hostOrigem; } catch (_) { return false; }
    };

    const acao = String(corpo.acao ?? '');
    // ------------------------------------------------------------------
    if (acao === 'pagina') {
      const url = String(corpo.url ?? '');
      if (!permitido(url)) return falha('Endereço fora do site de origem.');
      await liberarSecao(new URL(url));
      const r = await buscar(url);
      const html = await r.text();
      return json({ ok: true, status: r.status, url_final: r.url, html });
    }
    // ------------------------------------------------------------------
    if (acao === 'medir') {
      const urls = (Array.isArray(corpo.urls) ? corpo.urls : []).map(String).filter(permitido).slice(0, 40);
      const tamanhos = await Promise.all(urls.map(async (url: string) => {
        try {
          let r = await buscar(url, { method: 'HEAD' });
          let n = Number(r.headers.get('content-length') ?? 0);
          if (!n) {
            r = await buscar(url, { headers: { Range: 'bytes=0-0' } });
            const cr = r.headers.get('content-range') ?? '';
            n = Number(cr.split('/')[1] ?? 0) || Number(r.headers.get('content-length') ?? 0);
            try { await r.body?.cancel(); } catch (_) { /* ok */ }
          }
          return { url, bytes: n || null };
        } catch (_) { return { url, bytes: null }; }
      }));
      return json({ ok: true, tamanhos });
    }
    // ------------------------------------------------------------------
    if (acao === 'copiar') {
      const url = String(corpo.url ?? '');
      if (!permitido(url)) return falha('Endereço fora do site de origem.');
      const pasta = String(corpo.pasta ?? 'geral').replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || 'geral';
      const base = orgao + '/migracao/' + pasta + '/' + (await sha1(url.replace(/^https?:\/\/(www\.)?/, '')));
      // Já copiado antes? (qualquer extensão)
      const { data: ja } = await admin.storage.from('arquivos').list(orgao + '/migracao/' + pasta, { search: base.split('/').pop() });
      if (ja && ja.length) {
        const caminho = orgao + '/migracao/' + pasta + '/' + ja[0].name;
        return json({ ok: true, existia: true, url_publica: admin.storage.from('arquivos').getPublicUrl(caminho).data.publicUrl, bytes: ja[0].metadata?.size ?? null });
      }
      const r = await buscar(url);
      if (!r.ok) return falha('O site antigo respondeu ' + r.status + ' para o arquivo.');
      const tamanho = Number(r.headers.get('content-length') ?? 0);
      if (tamanho > LIMITE) { try { await r.body?.cancel(); } catch (_) { /* ok */ } return falha('Arquivo maior que 50 MB: fica só o link.'); }
      const dados = new Uint8Array(await r.arrayBuffer());
      if (dados.byteLength > LIMITE) return falha('Arquivo maior que 50 MB: fica só o link.');
      if (!dados.byteLength) return falha('Arquivo vazio no site antigo.');
      let tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      const nomeFinal = (r.headers.get('content-disposition') ?? '').match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] ?? new URL(r.url).pathname;
      let ext = TIPOS[tipo] ?? (nomeFinal.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? '').toLowerCase();
      if (!TIPOS[tipo] && EXT_TIPO[ext]) tipo = EXT_TIPO[ext];
      if (dados[0] === 0x25 && dados[1] === 0x50 && dados[2] === 0x44 && dados[3] === 0x46) { tipo = 'application/pdf'; ext = 'pdf'; }
      if (!EXT_TIPO[ext]) return falha('Tipo de arquivo não aceito (' + (tipo || ext || 'desconhecido') + ').');
      const caminho = base + '.' + ext;
      const { error: eU } = await admin.storage.from('arquivos').upload(caminho, dados, { contentType: tipo, upsert: true });
      if (eU) return falha('Não foi possível gravar o arquivo: ' + eU.message);
      return json({ ok: true, existia: false, url_publica: admin.storage.from('arquivos').getPublicUrl(caminho).data.publicUrl, bytes: dados.byteLength });
    }
    return falha('Ação desconhecida.');
  } catch (e) {
    return falha('Erro no servidor: ' + (e instanceof Error ? e.message : String(e)));
  }
});
