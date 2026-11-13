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
    const res = { quando: new Date().toISOString(), de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10), novos: 0, atualizados: 0, arquivos: 0, contratos_novos: 0, contratos_atualizados: 0, aditivos: 0, erro: null as string | null };
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
      // ---- Contratos (mesma lógica; mapeamento igual ao de painel/modulo-contratos.js) ----
      // deno-lint-ignore no-explicit-any
      const contratos = new Map<string, { x: any; cnpj: string }>();
      for (const cnpj of cnpjs) for (const tipo of ['', '/atualizacao']) {
        for (let pg = 1; pg <= 50; pg++) {
          let r;
          try {
            r = await pncp('/api/consulta/v1/contratos' + tipo + '?dataInicial=' + aaaammdd(de) + '&dataFinal=' + aaaammdd(ate) + '&cnpjOrgao=' + cnpj + '&pagina=' + pg + '&tamanhoPagina=50');
          } catch (e) { if (tipo) break; throw e; }
          const lista = r?.data ?? [];
          for (const x of lista) contratos.set(x.numeroControlePNCP, { x, cnpj: x.orgaoEntidade?.cnpj || cnpj });
          if (!r?.paginasRestantes || !lista.length) break;
        }
      }
      const ctrls = [...contratos.keys()];
      const exC = new Map<string, { id: string; pncp_atualizado: string | null }>();
      const licPorControle = new Map<string, string>();
      for (let i = 0; i < ctrls.length; i += 100) {
        const { data } = await db.from('contratos').select('id, pncp_controle, pncp_atualizado').eq('orgao_id', o.id).in('pncp_controle', ctrls.slice(i, i + 100));
        for (const x of data ?? []) exC.set(x.pncp_controle, x);
      }
      const compras = [...new Set([...contratos.values()].map((v) => v.x.numeroControlePncpCompra).filter(Boolean))] as string[];
      for (let i = 0; i < compras.length; i += 100) {
        const { data } = await db.from('licitacoes').select('id, pncp_controle').eq('orgao_id', o.id).in('pncp_controle', compras.slice(i, i + 100));
        for (const x of data ?? []) licPorControle.set(x.pncp_controle, x.id);
      }
      const hoje = new Date().toISOString().slice(0, 10);
      // deno-lint-ignore no-explicit-any
      const mapC = (x: any, cnpj: string) => {
        const num = x.numeroContratoEmpenho ? String(x.numeroContratoEmpenho) : null;
        const doc = String(x.niFornecedor || '').replace(/\D/g, '');
        const n = String(x.tipoContrato?.nome || '');
        return {
          orgao_id: o.id, origem: 'pncp', pncp_controle: x.numeroControlePNCP,
          tipo: /empenho/i.test(n) ? 'empenho' : /ata/i.test(n) ? 'ata_registro_precos' : /carta/i.test(n) ? 'carta_contrato' : /contrato/i.test(n) ? 'contrato' : 'outro',
          numero: num ? num + (num.includes('/') ? '' : '/' + x.anoContrato) : null, ano: x.anoContrato, processo: x.processo || null,
          objeto: String(x.objetoContrato || 'Objeto não informado no PNCP').slice(0, 4000).padEnd(5, ' '),
          contratado_nome: String(x.nomeRazaoSocialFornecedor || 'Não informado').slice(0, 200), contratado_doc: doc.length === 11 || doc.length === 14 ? doc : null,
          unidade_nome: x.unidadeOrgao?.nomeUnidade || null, valor_inicial: x.valorInicial ?? x.valorGlobal ?? null,
          data_assinatura: x.dataAssinatura || x.dataVigenciaInicio || String(x.dataPublicacaoPncp || hoje).slice(0, 10),
          vigencia_inicio: x.dataVigenciaInicio || null,
          vigencia_fim: x.dataVigenciaFim && (!x.dataVigenciaInicio || x.dataVigenciaFim >= x.dataVigenciaInicio) ? x.dataVigenciaFim : null,
          licitacao_id: licPorControle.get(x.numeroControlePncpCompra) ?? null,
          link_externo: 'https://pncp.gov.br/app/contratos/' + cnpj + '/' + x.anoContrato + '/' + x.sequencialContrato,
          pncp_atualizado: x.dataAtualizacao ? new Date(x.dataAtualizacao).toISOString() : null,
        };
      };
      const novosC = [], mudadosC = [];
      for (const { x, cnpj } of contratos.values()) {
        const reg = mapC(x, cnpj);
        const ex = exC.get(reg.pncp_controle);
        if (!ex) novosC.push({ ...reg, situacao: cfg.pncp_publicar_auto ? 'publicado' : 'rascunho' });
        else if (!ex.pncp_atualizado || !reg.pncp_atualizado || new Date(reg.pncp_atualizado) > new Date(ex.pncp_atualizado)) mudadosC.push(reg);
      }
      const comTermos: { id: string; pncp_controle: string }[] = [];
      for (let i = 0; i < novosC.length; i += 50) {
        const { data, error: e } = await db.from('contratos').insert(novosC.slice(i, i + 50)).select('id, pncp_controle');
        if (e) throw e;
        res.contratos_novos += data.length; comTermos.push(...data);
      }
      for (let i = 0; i < mudadosC.length; i += 50) {
        const { data, error: e } = await db.from('contratos').upsert(mudadosC.slice(i, i + 50), { onConflict: 'orgao_id,pncp_controle' }).select('id, pncp_controle');
        if (e) throw e;
        res.contratos_atualizados += data.length; comTermos.push(...data);
      }
      for (const c of comTermos) {
        if (Date.now() - inicio > LIMITE_MS) break;
        const a = contratos.get(c.pncp_controle);
        if (!a) continue;
        let lista;
        try { lista = await pncp('/api/pncp/v1/orgaos/' + a.cnpj + '/contratos/' + a.x.anoContrato + '/' + a.x.sequencialContrato + '/termos'); } catch (_) { continue; }
        await db.from('contratos_aditivos').delete().eq('contrato_id', c.id).eq('origem', 'pncp');
        // deno-lint-ignore no-explicit-any
        const regs = (Array.isArray(lista) ? lista : []).filter((t: any) => t.statusAtivo !== false).map((t: any) => ({
          contrato_id: c.id, orgao_id: o.id, origem: 'pncp', pncp_sequencial: t.sequencialTermoContrato || null,
          numero: t.numeroTermoContrato ? 'Termo ' + t.numeroTermoContrato : null,
          tipo: t.qualificacaoVigencia && t.qualificacaoAcrescimoSupressao ? 'prazo_valor' : t.qualificacaoVigencia ? 'prazo' : t.qualificacaoAcrescimoSupressao ? 'valor' : t.qualificacaoReajuste ? 'apostilamento' : 'outro',
          data_assinatura: t.dataAssinatura || hoje, descricao: t.objetoTermoContrato ? String(t.objetoTermoContrato).slice(0, 500) : null,
          valor: t.valorAcrescido ?? null, nova_vigencia_fim: t.qualificacaoVigencia ? (t.dataVigenciaFim || null) : null,
          link_externo: 'https://pncp.gov.br/app/contratos/' + a.cnpj + '/' + a.x.anoContrato + '/' + a.x.sequencialContrato }));
        if (regs.length) { const { error: e } = await db.from('contratos_aditivos').insert(regs); if (!e) res.aditivos += regs.length; }
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
