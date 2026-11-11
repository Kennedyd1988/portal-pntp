# Portal PNTP · SOFT+

Plataforma de site institucional + Portal da Transparência para órgãos públicos,
construída para atender a matriz do PNTP 2026 (Atricon).

## Decisões técnicas

- **Banco e login:** Supabase (PostgreSQL), projeto `softplus-portal`, região São Paulo.
  Escolhido no lugar do Firebase porque o PNTP exige filtros combinados, totais e
  exportações, e porque a Supabase cobra por espaço (não por leitura), o que deixa o
  custo previsível num site público.
- **Arquivos (PDFs e imagens):** Cloudflare R2 na produção (download sem custo).
  Durante o desenvolvimento, Storage da própria Supabase. O envio de arquivos passa
  por um ponto único no código, para a troca ser só de configuração.
- **Vários órgãos numa base só:** cada cliente é uma linha em `orgaos`. Subsites
  (ex.: IPREV dentro do site da Prefeitura) usam `orgao_pai_id`.
- **Segurança:** RLS ligado em todas as tabelas; nenhuma tabela é exposta na API sem
  `grant` explícito (opção "Automatically expose new tables" desligada no projeto).
- **Permissões:** perfil (o que pode fazer) × módulo (onde), com 4 ações: ver,
  editar, publicar, excluir. "Alcance" limita o usuário a uma unidade (secretaria).
- **Histórico:** toda inclusão, edição e exclusão é gravada em `historico` por gatilho
  no próprio banco (não depende do painel lembrar de registrar).
- **Rastreabilidade PNTP:** planilha "Rastreabilidade PNTP 2026 — Portal SOFT+
  (Prefeitura)" liga cada um dos 96 critérios a módulo, página, filtros e fase.

## Regras de negócio fixadas

- Cada coluna exibida numa listagem pública vira um filtro (sempre incluindo os
  filtros mínimos da cartilha).
- Todo módulo aceita três formas de alimentar: digitação manual, importação de
  arquivo (layout a definir) e link externo verificado diariamente.
- O órgão nunca pode ficar sem administrador ativo (bloqueado no banco).
- A marca `suporte_softplus` e o e-mail de um usuário só mudam pelo SQL Editor.

## Scripts do banco (rodar em ordem no SQL Editor)

| Script | Conteúdo |
| --- | --- |
| `supabase/01_fundacao.sql` | órgãos, unidades, usuários, perfis, permissões, histórico, regras de acesso e dados iniciais |
| `supabase/02_painel_e_piloto.sql` | funções `meus_orgaos()` e `minhas_permissoes()` usadas pelo painel + órgão piloto (Prefeitura de Riacho da Cruz/RN) |
| `supabase/03_lote1_estrutura.sql` | tabela `gestores`, norma de criação nas unidades, alcance setorial em unidades e gestores, bucket `arquivos` e suas regras |
| `supabase/04_dados_riacho_da_cruz.sql` | carga inicial do piloto: contatos gerais, 15 unidades e 14 responsáveis (fonte: site oficial, 11/11/2026) |

## Estrutura de arquivos

```
index.html              → por enquanto, leva ao painel (o site público entra na Fase 1)
icon-192.png, icon-512.png, icon-512-maskable.png  → marca SOFT+ (arquivos reais, nunca base64)
painel/
  index.html            → telas: login, recuperar senha, nova senha, escolha do órgão, painel
  estilos.css           → design system SOFT+
  config.js             → URL e chave pública da Supabase
  app.js                → núcleo: login, órgãos, menu, rotas e utilidades comuns (window.PNTP)
  modulo-aparencia.js   → tela "Aparência e contatos"
  modulo-institucional.js → tela "Unidades e gestores"
  versao.json           → ÚNICA fonte da versão (ver abaixo)
  sw.js                 → service worker "rede primeiro"
  manifest.json         → instalação como aplicativo (PWA)
supabase/               → scripts SQL, rodar em ordem
```

## Controle de versões

- **Para publicar uma versão nova, muda-se um único arquivo: `painel/versao.json`**
  (campo `versao` e, de preferência, uma frase em `notas`).
- O `index.html` lê `versao.json` sem cache e carrega `estilos.css`, `config.js` e
  `app.js` com `?v=<versão>`, o que força o navegador a baixar os arquivos novos.
  Por isso não existe mais o risco de esquecer a versão em um dos arquivos.
- O service worker é "rede primeiro" (o cache só é usado sem internet) e não
  depende de número de versão.
- Quem estiver com o painel aberto recebe o aviso "Nova versão disponível ·
  Atualizar agora" (conferência a cada 5 minutos e sempre que volta para a aba).
- A versão aparece no rodapé da tela de login e no menu lateral.
- Numeração: `0.FASE.AJUSTE` durante a construção (ex.: 0.1.0, 0.1.1…);
  `1.0.0` quando o piloto entrar no ar.

## Publicação (GitHub Pages)

1. Repositório `portal-pntp` com o conteúdo desta pasta na raiz.
2. Settings › Pages › Deploy from a branch › `main` / `(root)`.
3. Na Supabase, Authentication › URL Configuration: colocar o endereço do
   GitHub Pages em **Site URL** e `https://<usuário>.github.io/portal-pntp/painel/`
   em **Redirect URLs** (necessário para o link de recuperação de senha).

## Arquivos (brasão, fotos, PDFs)

- Bucket público `arquivos` na Supabase, caminho `<órgão>/<módulo>/<aleatório>.<ext>`.
  O banco confere a permissão pelo caminho: só grava quem pode editar aquele módulo
  naquele órgão. SVG não é aceito (pode conter código).
- Imagens são reduzidas no navegador antes do envio (brasão 600 px, fotos 400 px) e
  convertidas para WebP. PDFs até 10 MB.
- Todo envio passa por `PNTP.enviarArquivo()` em `app.js`: é o único ponto a trocar
  quando os arquivos forem para o Cloudflare R2.
- Ao substituir um arquivo, o antigo é apagado.

## Limitações conhecidas

- Excluir um órgão ou o login de uma pessoa apaga os vínculos em cascata, mesmo que
  seja o último administrador (é ação deliberada da SOFT+, feita pelo SQL).

## Histórico de mudanças

**0.2.0 — 11/11/2026 — Lote 1 da Fase 1**
- Tela "Aparência e contatos": brasão (reduzido automaticamente), nome exibido, cor
  principal com verificação de contraste (mínimo 4,5:1), endereço, CEP, telefone,
  e-mail, horário, Instagram/Facebook/YouTube (validação de endereço) e WhatsApp, domínio.
- Tela "Unidades e gestores" com abas: cadastro de unidades (organograma "fica dentro
  de", competências, norma de criação com PDF, contatos, horário) e de gestores (foto,
  cargo, unidade, currículo PDF, destaque e ordem no bloco "Gestão" da capa).
  Listas em ordem alfabética, busca sem diferenciar acento, aviso de pendências do PNTP
  (unidade sem responsável ou sem horário).
- Exclusão de unidade bloqueada com explicação quando há gestores ou unidades dentro
  dela (também bloqueado no banco). Exclusão de gestor sugere "inativar".
- Alcance setorial aplicado no banco: o usuário de uma secretaria só altera a própria
  unidade e os gestores dela; criar e excluir unidades exige alcance total. O painel
  avisa quando uma gravação não alterou nada por falta de alcance.
- Campo em vermelho volta ao normal assim que o usuário digita. Avisos (toast) passam
  para o canto inferior.
- Carga inicial de Riacho da Cruz (script 04).
- Testado: scripts no PostgreSQL local (duas execuções, sem duplicar; permissões de
  administrador, setorial e anônimo; envio de arquivo por caminho) e telas em
  navegador automatizado com a Supabase simulada.

**0.1.0 — 11/11/2026** — Primeira versão do painel: login com e-mail e senha,
recuperação de senha por e-mail, escolha do órgão (com subsites abaixo do
órgão-pai e reabertura do último órgão usado), menu montado só com os módulos
que o perfil pode ver, telas "em construção" mostrando o que o perfil pode fazer
em cada módulo, controle de versões com aviso de atualização. Script 02 cria as
funções do painel e cadastra a Prefeitura de Riacho da Cruz/RN como piloto.
Testado em navegador automatizado (computador e celular) com a Supabase simulada:
validação de campos, senha errada, login, escolha de órgão, menu por permissão,
bloqueio de módulo sem acesso e aviso de versão nova.

**11/11/2026** — Fase 0 iniciada. Script 01 criado e testado num PostgreSQL local
com simulação dos papéis da Supabase (anon, authenticated): leitura pública só de
órgãos ativos, cadastrador setorial sem acesso à aparência nem a outros órgãos,
bloqueio do último administrador e da autopromoção a suporte, exclusão em cascata
liberada.
