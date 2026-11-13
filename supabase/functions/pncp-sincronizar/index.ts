// =====================================================================
// PORTAL PNTP · SOFT+
// Função de servidor (Supabase Edge Function): pncp-sincronizar
//
// Por que existe: atualizar as licitações a partir do PNCP sem ninguém
// precisar clicar em "Importar". Um agendamento do próprio banco (pg_cron,
// script 13) chama esta função uma vez por dia, de madrugada.
//
// O que faz, para cada órgão com a importação automática ligada no painel
// (configuracoes.pncp_auto = true):
//   1. consulta no PNCP os processos PUBLICADOS nos últimos dias (desde a
//      última sincronização, com 3 dias de folga; 120 dias na primeira vez)
//      e os ATUALIZADOS no período (homologação, revogação…), quando o PNCP
//      oferece essa consulta;
//   2. grava os novos (publicados ou rascunho, conforme escolhido) e
//      atualiza os existentes só nos campos que vêm do PNCP;
//   3. troca a lista de arquivos do PNCP dos processos novos/alterados;
//   4. registra o resultado em configuracoes.pncp_sinc (aparece no painel).
//
// Segurança:
//   - Só roda com o cabeçalho x-chave-sinc igual ao segredo PNCP_SINC_CHAVE
//     (guardado nos "Secrets" das Edge Functions e no cofre do banco).
//   - Usa a chave secreta do projeto (precisa gravar sem um login), por isso
//     NÃO aceita parâmetros de quem chama: o que importar vem só do banco.
//
// O mapeamento PNCP → licitacoes é o mesmo de painel/modulo-licitacoes.js
// (função mapear). Mudou um, mude o outro.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

function chave(nova: string, antiga: string): string {
  try {
    const mapa = JSON.parse(Deno.env.get(nova) ?? '{}');
    if (mapa.default) return mapa.default;
  } catch (_) { /* segue para a antiga */ }
  return Deno.env.get(antiga) ?? '';
}
const URL_PROJETO = Deno.env.get('SUPABASE_URL')!;
const CHAVE_SECRETA = chave('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const CHAVE_SINC = Deno.env.get('PNCP_SINC_CHAVE') ?? '';
const LIMITE_MS = 120_000;   // para antes do limite de tempo da função; o resto fica para o dia seguinte

const PNCP_MOD: Record<number, string> = { 1: 'leilao_eletronico', 2: 'dialogo_competitivo', 3: 'concurso', 4: 'concorrencia_eletronica',
  5: 'concorrencia_presencial', 6: 'pregao_eletronico', 7: 'pregao_presencial', 8: 'dispensa', 9: 'inexigibilidade',
  10: 'manifestacao_interesse', 11: 'pre_qualificacao', 12: 'credenciamento', 13: 'leilao_presencial' };

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const aaaammdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function pncp(caminho: string): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 40000);
  try {
    const r = await fetch('https://pncp.gov.br' + caminho, { headers: { accept: 'application/json' }, signal: c.signal });
    if (r.status === 204) return null;
    if (!r.ok) throw new Error('PNCP ' + r.status);
    const texto = await r.text();
    return texto ? JSON.parse(texto) : null;
  } finally { clearTimeout(t); }
}

// deno-lint-ignore no-explicit-any
function mapear(c: any, orgaoId: string, cnpj: string) {
  const sit = c.situacaoCompraId;
  const enc = c.dataEncerramentoProposta ? new Date(c.dataEncerramentoProposta) : null;
  const andamento = sit === 2 ? 'revogada' : sit === 3 ? 'anulada' : sit === 4 ? 'suspensa'
    : Number(c.valorTotalHomologado) > 0 ? 'homologada' : enc && enc > new Date() ? 'aberta' : 'em_andamento';
  const num = c.numeroCompra ? String(c.numeroCompra) : null;
  return {
    orgao_id: orgaoId, origem: 'pncp', pncp_controle: c.numeroControlePNCP,
    modalidade: PNCP_MOD[c.modalidadeId] ?? 'outra',
    numero: num ? num + (num.includes('/') ? '' : '/' + c.anoCompra) : null,
    ano: c.anoCompra, processo: c.processo || null, objeto: String(c.objetoCompra || 'Objeto não informado no PNCP').slice(0, 4000), srp: !!c.srp,
    amparo_legal: c.amparoLegal ? (c.amparoLegal.nome || c.amparoLegal.descricao || null) : null,
    unidade_nome: c.unidadeOrgao?.nomeUnidade || null,
    valor_estimado: c.valorTotalEstimado ?? null, valor_homologado: Number(c.valorTotalHomologado) > 0 ? c.valorTotalHomologado : null,
    data_publicacao: String(c.dataPublicacaoPncp || c.dataInclusao || new Date().toISOString()).slice(0, 10),
    data_abertura: c.dataAberturaProposta ? new Date(c.dataAberturaProposta).toISOString() : null,
    andamento,
    link_externo: 'https://pncp.gov.br/app/editais/' + cnpj + '/' + c.anoCompra + '/' + c.sequencialCompra,
    pncp_atualizado: c.dataAtualizacao ? new Date(c.dataAtualizacao).toISOString() : null,
  };
}
const tipoDoc = (n: string) => /estudo t[eé]cnico/i.test(n) ? 'estudo_tecnico' : /parecer/i.test(n) ? 'parecer' : /aviso/i.test(n) ? 'aviso' : /edital/i.test(n) ? 'edital' : /termo de refer|projeto b/i.test(n) ? 'termo_referencia'
  : /ata/i.test(n) ? 'ata' : /contrato/i.test(n) ? 'contrato' : /anexo/i.test(n) ? 'anexo' : /homolog/i.test(n) ? 'homologacao' : /ratific/i.test(n) ? 'ratificacao' : 'outro';

Deno.serve(async (req) => {
  if (!CHAVE_SINC || req.headers.get('x-chave-sinc') !== CHAVE_SINC) return json({ ok: false, erro: 'Não autorizado.' }, 401);
  const inicio = Date.now();
  const db = createClient(URL_PROJETO, CHAVE_SECRETA, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: orgaos, error } = await db.from('orgaos').select('id, cnpj, configuracoes').eq('configuracoes->>pncp_auto', 'true');
  if (error) return json({ ok: false, erro: error.message }, 500);

  const relatorio: Record<string, unknown>[] = [];
  for (const o of orgaos ?? []) {
    if (Date.now() - inicio > LIMITE_MS) { relatorio.push({ orgao: o.id, adiado: true }); continue; }
    const cfg = o.configuracoes ?? {};
    const cnpjs: string[] = (Array.isArray(cfg.pncp_cnpjs) && cfg.pncp_cnpjs.length ? cfg.pncp_cnpjs : [String(o.cnpj ?? '')])
      .map((x: string) => String(x).replace(/\D/g, '')).filter((x: string) => x.length === 14);
    const ultima = cfg.pncp_sinc?.ate ? new Date(cfg.pncp_sinc.ate + 'T12:00:00') : null;
    const ate = new Date();
    const de = new Date(ate.getTime() - (ultima ? Math.max(3, Math.ceil((ate.getTime() - ultima.getTime()) / 864e5) + 3) : 120) * 864e5);
    const res = { quando: new Date().toISOString(), de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10), novos: 0, atualizados: 0, arquivos: 0, erro: null as string | null };
    try {
      // deno-lint-ignore no-explicit-any
      const achados = new Map<string, { c: any; cnpj: string }>();
      for (const cnpj of cnpjs) for (const cod of Object.keys(PNCP_MOD)) {
        for (const tipo of ['publicacao', 'atualizacao']) {
          for (let pg = 1; pg <= 50; pg++) {
            let r;
            try {
              r = await pncp('/api/consulta/v1/contratacoes/' + tipo + '?dataInicial=' + aaaammdd(de) + '&dataFinal=' + aaaammdd(ate)
                + '&codigoModalidadeContratacao=' + cod + '&cnpj=' + cnpj + '&pagina=' + pg + '&tamanhoPagina=50');
            } catch (e) {
              // A consulta por data de atualização pode não existir/estar fora do ar: segue só com a de publicação.
              if (tipo === 'atualizacao') break;
              throw e;
            }
            const lista = r?.data ?? [];
            for (const c of lista) achados.set(c.numeroControlePNCP, { c, cnpj: c.orgaoEntidade?.cnpj || cnpj });
            if (!r?.paginasRestantes || !lista.length) break;
          }
        }
      }
      const controles = [...achados.keys()];
      const existentes = new Map<string, { id: string; pncp_atualizado: string | null }>();
      for (let i = 0; i < controles.length; i += 100) {
        const { data } = await db.from('licitacoes').select('id, pncp_controle, pncp_atualizado').eq('orgao_id', o.id).in('pncp_controle', controles.slice(i, i + 100));
        for (const x of data ?? []) existentes.set(x.pncp_controle, x);
      }
      const novos = [], mudados = [];
      for (const { c, cnpj } of achados.values()) {
        const reg = mapear(c, o.id, cnpj);
        const ex = existentes.get(reg.pncp_controle);
        if (!ex) novos.push({ ...reg, situacao: cfg.pncp_publicar_auto ? 'publicado' : 'rascunho' });
        else if (!ex.pncp_atualizado || !reg.pncp_atualizado || new Date(reg.pncp_atualizado) > new Date(ex.pncp_atualizado)) mudados.push(reg);
      }
      const comArquivos: { id: string; pncp_controle: string }[] = [];
      for (let i = 0; i < novos.length; i += 50) {
        const { data, error: e } = await db.from('licitacoes').insert(novos.slice(i, i + 50)).select('id, pncp_controle');
        if (e) throw e;
        res.novos += data.length; comArquivos.push(...data);
      }
      for (let i = 0; i < mudados.length; i += 50) {
        const { data, error: e } = await db.from('licitacoes').upsert(mudados.slice(i, i + 50), { onConflict: 'orgao_id,pncp_controle' }).select('id, pncp_controle');
        if (e) throw e;
        res.atualizados += data.length; comArquivos.push(...data);
      }
      for (const x of comArquivos) {
        if (Date.now() - inicio > LIMITE_MS) break;
        const a = achados.get(x.pncp_controle);
        if (!a) continue;
        let lista;
        try { lista = await pncp('/api/pncp/v1/orgaos/' + a.cnpj + '/compras/' + a.c.anoCompra + '/' + a.c.sequencialCompra + '/arquivos'); }
        catch (_) { continue; }
        // deno-lint-ignore no-explicit-any
        const ativos = (Array.isArray(lista) ? lista : []).filter((d: any) => d.statusAtivo !== false && (d.url || d.uri));
        await db.from('licitacoes_documentos').delete().eq('licitacao_id', x.id).eq('origem', 'pncp');
        if (!ativos.length) continue;
        // deno-lint-ignore no-explicit-any
        const regs = ativos.map((d: any, n: number) => ({ licitacao_id: x.id, orgao_id: o.id, origem: 'pncp', tipo: tipoDoc(String(d.tipoDocumentoNome || d.titulo || '')),
          titulo: String(d.titulo || d.tipoDocumentoNome || 'Documento').slice(0, 200).padEnd(2, ' '),
          data: String(d.dataPublicacaoPncp || new Date().toISOString()).slice(0, 10), link_externo: d.url || d.uri, ordem: (n + 1) * 10 }));
        const { error: e } = await db.from('licitacoes_documentos').insert(regs);
        if (!e) res.arquivos += regs.length;
      }
    } catch (e) {
      res.erro = e instanceof Error ? e.message : String(e);
    }
    // Só avança a data se deu certo; com erro, a próxima execução cobre o mesmo período de novo.
    const sinc = res.erro ? { ...(cfg.pncp_sinc ?? {}), quando: res.quando, erro: res.erro } : res;
    await db.from('orgaos').update({ configuracoes: { ...cfg, pncp_sinc: sinc } }).eq('id', o.id);
    relatorio.push({ orgao: o.id, ...res });
  }
  return json({ ok: true, relatorio });
});
