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
- Janelas do painel com mais de um assunto são divididas em abas (`P.abas`), no
  estilo guia de navegador; nada de abas em forma de botão ou pílula.
- A marca `suporte_softplus` e o e-mail de um usuário só mudam pelo SQL Editor.
- Ninguém altera o próprio acesso (perfil, alcance, desativar).
- Só administrador do órgão cria perfis, mexe em permissões e dá o perfil de
  administrador. Quem só tem "editar usuários" não pode dar mais poder do que tem.
- Gestor de usuários com alcance setorial só dá acesso à própria unidade.
- Link de acesso entregue na mão do administrador só para quem nunca criou senha e
  não tem acesso a outro órgão; nos demais casos, só por e-mail (evita que um
  administrador entre na conta de alguém que também atende outro órgão).
- Quem já entrou no painel é desativado, não apagado (o histórico fica completo).
- Rascunho → publicado: quem só tem "editar" cria e altera rascunhos; publicar, tirar do ar
  ou mexer no que já está publicado exige "publicar" (gatilho `controlar_publicacao`, sem
  security definer de propósito: precisa enxergar o papel real de quem grava).
- Notícia com data futura fica agendada: o site só mostra quando a data chega (regra de leitura
  pública), sem precisar de tarefa agendada.
- Publicação oficial publicada precisa ter PDF ou link; tipo + número + ano não se repete.
- Banner, aviso, página, pergunta frequente e menu valem para o órgão todo: usuário com alcance
  setorial não altera. Notícia e publicação aceitam alcance setorial (só na própria unidade).
- Texto de notícias e páginas é guardado com marcação simples (## título, **negrito**, *itálico*,
  listas, [link](https://…)) e desenhado sem HTML — nunca aceita HTML colado (segurança do site).
- Notícia: uma unidade responsável (define quem edita) + outras envolvidas (só exibição).
- Unidade não pode ser excluída enquanto tiver gestores, unidades dentro dela, notícias,
  publicações ou usuários limitados a ela.
- Carta de Serviços: serviço "pela internet" exige o endereço onde é pedido (PNTP 15.3); a lista
  mostra em amarelo o que a Lei 13.460/2017 pede e ainda falta; publicar com lacuna é permitido
  com aviso. Lista em ordem alfabética (cadastro), paginada pelo nome.
- LGPD: nome do encarregado + e-mail ou telefone obrigatórios (15.1). Os textos sugeridos de
  política e de dados abertos são modelo: o painel avisa se o aviso "Modelo inicial" ainda estiver
  no texto. Publicação indicada como norma do Governo Digital não pode ser excluída sem trocar a
  indicação.
- Botão "Instalar app" fixo (canto inferior esquerdo) em todas as telas, some quando o app já está
  instalado. Usa o pedido de instalação do navegador quando existe; no iPhone/iPad (Safari não tem
  esse pedido) e nos demais casos mostra o passo a passo do aparelho.
- Página que está no menu não pode ser excluída nem mudar de endereço (link quebrado).
- Item de menu com subitens não pode ser excluído nem virar subitem (menu de dois níveis).

## Scripts do banco (rodar em ordem no SQL Editor)

| Script | Conteúdo |
| --- | --- |
| `supabase/01_fundacao.sql` | órgãos, unidades, usuários, perfis, permissões, histórico, regras de acesso e dados iniciais |
| `supabase/02_painel_e_piloto.sql` | funções `meus_orgaos()` e `minhas_permissoes()` usadas pelo painel + órgão piloto (Prefeitura de Riacho da Cruz/RN) |
| `supabase/03_lote1_estrutura.sql` | tabela `gestores`, norma de criação nas unidades, alcance setorial em unidades e gestores, bucket `arquivos` e suas regras |
| `supabase/04_dados_riacho_da_cruz.sql` | carga inicial do piloto: contatos gerais, 15 unidades e 14 responsáveis (fonte: site oficial, 11/11/2026) |
| `supabase/06_lote3_conteudo.sql` | módulos novos (`paginas`, `menu`, com as permissões copiadas de `institucional` e `aparencia`); tabelas `noticias`, `banners`, `avisos`, `publicacoes`, `paginas`, `faq`, `menu_itens`; busca sem acento (`normalizar_texto` + coluna `busca`); gatilho rascunho → publicado; leitura pública só do que está no ar; Diário Oficial do piloto (FEMURN) |
| `supabase/07_noticias_varias_unidades.sql` | notícia com "outras secretarias envolvidas" (`unidades_relacionadas`, índice GIN, validação e bloqueio de exclusão da unidade citada); correção: acesso limitado a uma unidade passa a impedir a exclusão dela (antes virava acesso ao órgão todo) |
| `supabase/08_lote4_servicos_lgpd.sql` | módulo `lgpd` (permissões copiadas de `aparencia`); tabelas `servicos` (Carta de Serviços, com rascunho → publicado e alcance setorial), `carta_servicos` e `lgpd` (um registro por órgão, histórico por `orgao_id`); leitura pública |
| `supabase/09_banner_noticia_visualizacoes.sql` | banner ligado a notícia (`banners.noticia_id`, mesma prefeitura, notícia usada em banner não pode ser excluída) e contador de visualizações (`noticias_visualizacoes` + `registrar_visualizacao`, que só soma em notícia publicada) |
| `supabase/10_lote6_planejamento_contas.sql` | Fase 2 · Lote 6: módulo `contas` (permissões copiadas de "financeiro"), tabela `documentos_contas` (PPA, LDO, LOA, RREO, RGF, Balanço, Relatório de Gestão, parecer do TCE, julgamento da Câmara, Plano Estratégico), limite do bucket em 50 MB e `rgf_periodicidade` em configurações |
| `supabase/11_avisos_titulo.sql` | avisos com `titulo` (até 60) e `link_rotulo` (texto do botão de ação, até 30), ambos opcionais |
| `supabase/12_lote7_licitacoes.sql` | Fase 2 · Lote 7: `licitacoes` (origem portal/link/pncp, todas as modalidades, andamento, valores), `licitacoes_documentos` (documentos de cada fase, arquivo ou link) e função `licitacoes_anos` |
| `supabase/13_pncp_automatico.sql` | importação automática do PNCP: função `definir_pncp_automatico` (liga/desliga pelo painel), chave no cofre (`vault`) e agendamento diário `pg_cron` 03:15 chamando a função `pncp-sincronizar` |
| `supabase/14_licitacoes_tipos_documento.sql` | novos tipos de documento das licitações (ETP, justificativa, orçamento, parecer, emergência), conforme Cartilha PNTP 2026 8.3/8.4 |
| `supabase/15_lote8_contratos.sql` | Fase 2 · Lote 8: módulo `contratos`, tabelas `contratos`, `contratos_aditivos`, `contratos_fiscais`, recálculo de valor/vigência pelos aditivos, função `contratos_anos` |
| `supabase/16_pca_sancoes.sql` | Lote 8.1: módulos `pca` e `sancoes` (permissões copiadas de licitações), tabela `pca` (plano do ano + atualizações, PDF ou link do PNCP, um plano por ano), tabela `sancoes` (sancionado, CNPJ/CPF, sanção do art. 156, prazo, multa, processo, ato), funções `pca_anos` e `sancoes_anos` |
| `supabase/17_licitacoes_ordem.sql` | coluna `chave_ordem` (modalidade + número, do maior para o menor) e índice: lista de licitações em ordem numérica sequencial por modalidade (PNTP 8.1) |
| `supabase/teste_contratos_ficticios.sql` | opcional: contratos fictícios ligados às licitações de teste, com fiscais e aditivos |
| `supabase/teste_pca_sancoes_ficticios.sql` | opcional: PCA de 2024 a 2026 (com revisões) e 6 sanções fictícias de todos os tipos, vigentes e encerradas |
| `supabase/teste_licitacoes_ficticias.sql` | opcional: 19 processos fictícios (2022 a 2026) com documentos de teste |
| `supabase/05_lote2_usuarios.sql` | regras de convite e de perfis (`motivo_bloqueio_acesso`, `e_admin_do_orgao`), lista de pessoas com situação do convite (`usuarios_do_orgao`), histórico paginado (`historico_do_orgao`, `autores_historico`), histórico das permissões |

## Função de convite (Supabase Edge Function)

`supabase/functions/convidar-usuario/index.ts` roda no servidor da Supabase porque
criar o login de outra pessoa exige a chave secreta, que nunca vai para o navegador.
Ela confere a permissão com as mesmas regras do banco (chamadas com o login de quem
pediu) antes de criar qualquer login, e desfaz o login criado se o acesso for recusado.

Instalação (uma vez, pelo painel da Supabase):
1. Edge Functions › Deploy a new function › **Via Editor**.
2. Nome: `convidar-usuario` (exatamente assim). Colar o conteúdo de `index.ts`. Deploy.
3. Nos detalhes da função, **desligar "Verify JWT"**: a própria função confere o login
   (necessário com as chaves novas `sb_publishable`/`sb_secret`).
4. A função lê as chaves do ambiente da Supabase; nada para configurar.

Entrega do convite:
- **Gerar link** (padrão): a função devolve o link e o painel monta a mensagem para
  copiar ou enviar pelo WhatsApp. Funciona sem servidor de e-mail.
- **E-mail automático**: só depois de configurar SMTP próprio em Authentication ›
  Emails › SMTP Settings. O envio padrão da Supabase só entrega para a equipe do
  projeto (no máximo 2 por hora). O mesmo vale para "Esqueci minha senha".
- Validade do link: Authentication › Providers › Email › "Email OTP Expiration"
  (padrão 1 hora; recomendado 86400 = 24 horas).

## Função pncp (Supabase Edge Function)

`supabase/functions/pncp/index.ts` repassa ao PNCP as consultas do botão "Importar do PNCP"
(o site do PNCP não aceita chamadas diretas do navegador de outro domínio — CORS). Só atende
quem está logado e é membro do órgão, e só repassa endereços de consulta pública do PNCP
(lista fixa na função). Não usa chave secreta: quem grava é o painel, com o login de quem
importou, então as regras de permissão do banco valem normalmente. Edge Functions entram
na cota gratuita da Supabase (500 mil chamadas/mês); uma importação de um ano faz dezenas.

Instalação (uma vez, igual à função de convite):
1. Edge Functions › Deploy a new function › **Via Editor**.
2. Nome: `pncp` (exatamente assim). Colar o conteúdo de `index.ts`. Deploy.
3. Nos detalhes da função, **desligar "Verify JWT"** (a própria função confere o login).

### Importação automática (todo dia de madrugada)

`supabase/functions/pncp-sincronizar/index.ts` faz a mesma importação sem ninguém clicar. O
agendamento fica no próprio banco (pg_cron + pg_net, gratuitos): todo dia às 03:15 (Brasília)
o banco chama a função, que busca, para cada órgão com a opção ligada no painel, o que foi
publicado ou alterado no PNCP desde a última vez (com 3 dias de folga; 120 dias na primeira).
Com erro, a data não avança e a próxima noite cobre o mesmo período. O resultado aparece no
módulo Licitações.

Esta função grava sem login (usa a chave secreta da Supabase, que fica só no servidor). Por isso
ela exige uma chave própria no cabeçalho e não aceita parâmetros: o que importar vem só do banco.

Instalação (uma vez):
1. Edge Functions › Deploy a new function › Via Editor › nome `pncp-sincronizar`, colar
   `index.ts`, Deploy, **desligar "Verify JWT"**.
2. SQL Editor: rodar `supabase/13_pncp_automatico.sql`. O resultado mostra uma chave.
3. Edge Functions › **Secrets** › Add new secret: nome `PNCP_SINC_CHAVE`, valor = a chave do
   passo 2. Salvar.
4. No painel, Licitações › Importar do PNCP › "Importação automática": marcar e salvar.
5. Para testar sem esperar a madrugada: o fim do script 13 tem o comando (comentado).

O mapeamento PNCP → licitações existe em dois lugares (painel `modulo-licitacoes.js` e esta
função). Mudou um, mude o outro.

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
  modulo-usuarios.js    → tela "Usuários e permissões" (pessoas, convites, perfis)
  modulo-historico.js   → tela "Histórico de alterações"
  modulo-noticias.js    → "Notícias, banners e avisos"
  modulo-publicacoes.js → "Publicações oficiais e atos normativos" (+ cartão do Diário Oficial)
  modulo-paginas.js     → "Páginas e perguntas frequentes"
  modulo-servicos.js    → "Carta de Serviços" (serviços + textos gerais da Carta)
  modulo-lgpd.js        → "LGPD e Governo Digital" (encarregado, política, norma 14.129, dados abertos)
  modulo-pca-sancoes.js → "Plano de Contratações Anual (PCA)" e "Sanções a licitantes e contratados"
  modulo-menu.js        → "Menu do site" (rotas do site público listadas em ROTAS)
  versao.json           → ÚNICA fonte da versão (ver abaixo)
  sw.js                 → service worker "rede primeiro"
  manifest.json         → instalação como aplicativo (PWA)
site/                   → site público (index.html, site.css, site.js = núcleo, paginas.js = páginas)
supabase/               → scripts SQL, rodar em ordem
supabase/functions/convidar-usuario/index.ts → função de servidor do convite
supabase/functions/pncp/index.ts → ponte de consulta ao PNCP (importação de licitações)
supabase/functions/pncp-sincronizar/index.ts → importação automática diária do PNCP
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

## Site público (site/)

- Um único site para todos os órgãos. O órgão é descoberto pelo domínio cadastrado em
  Aparência (`orgaos.dominio`) ou, enquanto o domínio não aponta para cá, por `?orgao=` com o
  CNPJ (só números) ou o id. Ex.: `…/portal-pntp/site/?orgao=08153454000104`.
- Navegação por `#/rota` (funciona em hospedagem estática sem configurar servidor).
- O site lê SEMPRE como visitante (`persistSession: false`): painel e site ficam no mesmo
  endereço, e usar a sessão de quem está logado mostraria rascunhos como se fossem públicos.
- Cor, brasão, nome, contatos, redes e links externos vêm de `orgaos.configuracoes`.
- Páginas: início, notícias (+ detalhe), publicações oficiais (filtros, total e CSV/JSON),
  Diário Oficial, estrutura organizacional (árvore + norma), unidade (+ notícias e serviços),
  gestores, Carta de Serviços (+ detalhe), perguntas frequentes, páginas livres, LGPD, dados
  abertos (download e endereço de API por conjunto), contato, acessibilidade, mapa do site,
  busca geral e páginas de sistemas externos (transparência, licitações, ouvidoria, e-SIC).
- Acessibilidade: atalhos Alt+1 a 4, alto contraste e tamanho do texto lembrados no navegador,
  VLibras, foco levado ao conteúdo a cada página, carrossel com pausa e sem rodar quando o
  sistema pede menos movimento, textos alternativos obrigatórios nas imagens.
- Hospedagem definitiva (domínio próprio de cada órgão): Cloudflare Pages, a decidir na entrada
  em produção. O domínio de Riacho da Cruz é administrado pela empresa do site atual.

## Limitações conhecidas

- Busca do site: notícias, publicações e serviços ignoram acentos (campo `busca`); páginas,
  perguntas e unidades ainda diferenciam acento.
- Sem domínio próprio, links de compartilhamento usam o endereço do GitHub com `?orgao=`.

- Importação de publicações por planilha: botão visível e desativado até o layout ser definido.
- Imagens dentro do texto de notícias/páginas ainda não são aceitas (só a foto de capa).

- **E-mails (convite automático e "Esqueci minha senha") só chegam para pessoas de
  fora da equipe da Supabase depois de configurar SMTP próprio.** Até lá, usar
  "Gerar link" e, para quem esqueceu a senha, o administrador desativa e convida de
  novo ou o suporte SOFT+ redefine. Opções gratuitas: Brevo (300 e-mails/dia) ou
  Resend (exige domínio próprio).
- A lista de pessoas do órgão carrega de uma vez (são dezenas); o histórico é paginado.

- Importação do PNCP: consulta as 13 modalidades em janelas de até 1 ano; um período longo
  pode levar alguns minutos (o PNCP é lento). A primeira vez de cada CNPJ conferir no PNCP se
  os processos batem. Se o PNCP mudar a resposta, os campos que mudarem de nome ficam em branco
  até a função/painel serem ajustados.
- Obras (10.1 a 10.4) ainda apontam para o sistema externo (próximo lote).

- Excluir um órgão ou o login de uma pessoa apaga os vínculos em cascata, mesmo que
  seja o último administrador (é ação deliberada da SOFT+, feita pelo SQL).

## Histórico de mudanças

**0.9.2 — 13/11/2026 — PCA e sancionados (PNTP 8.6 e 8.7)**
- Dois módulos novos no painel, com as permissões de quem já cuida de licitações:
  - **Plano de Contratações Anual (PCA)**: o plano de cada ano e as atualizações/revisões, com
    PDF ou link (ex.: o PCA no PNCP), ato e data de aprovação, valor total e quantidade de itens.
    Um só "plano" por ano (o resto entra como atualização). Sem o PCA do ano corrente, o módulo
    avisa em vermelho: o plano é obrigatório e declarar que não existe não pontua no 8.6.
  - **Sanções a licitantes e contratados**: sancionado (CNPJ/CPF), sanção do art. 156 da Lei
    14.133 (ou suspensão da 8.666, para a série histórica), fundamento sugerido pelo tipo,
    motivo, processo, licitação/contrato, data, prazo (início/fim), valor da multa e ato (PDF ou
    link). "Em vigor" × "encerrada" é calculado pela data, sem tarefa agendada.
- Site: duas abas novas na página Licitações, na mesma faixa dos processos:
  `#/licitacoes/pca` (abas de ano, tabela, CSV/JSON; sem PCA no ano diz que ainda não foi
  publicado) e `#/licitacoes/sancionados` (tabela, filtros por texto, sanção, vigência e ano,
  CSV/JSON; CPF mascarado; sem sanções publicadas, declara expressamente que não há
  sancionados). A capa da Transparência, o mapa do site, o menu e os dados abertos passaram
  a apontar para essas páginas (antes, 8.6 ia ao sistema externo e 8.7 ao CEIS).
- Licitações em ordem de modalidade e número (decisão de 13/11/2026): a Matriz 2026 pede a
  relação do 8.1 "em ordem numérica sequencial" com número e modalidade. No site, no painel, no
  CSV/JSON e nos dados abertos a lista vem por modalidade (pregão, concorrência, … dispensa,
  inexigibilidade, adesão) e, dentro dela, do maior número para o menor. Vale só o primeiro grupo
  de algarismos do número (3/2026 vem depois de 012/2026); sem número, fica no fim. A data de
  publicação continua como coluna e como filtro de mês.
- Banco: scripts 16 e 17 (rodar depois do 15).
- Varredura PNTP (Cartilha/Matriz 2026): 8.6 atende quando o PCA do ano está publicado (PDF ou
  link do PNCP); 8.7 atende com a relação própria ou com a declaração de que não há
  sancionados (o link do CEIS fica como complemento). Com isso, a dimensão Licitações (8.1 a
  8.7) fica toda no portal.

**0.9.1 — 13/11/2026 — Janelas do painel em abas**
- Toda janela de cadastro com mais de um assunto passou a ser dividida em abas no
  mesmo estilo de guia de navegador das telas. Os botões Salvar/Publicar ficam fixos
  no rodapé e gravam os campos de todas as abas de uma vez (as abas só escondem os
  campos; não são formulários separados).
- Quando um campo obrigatório falta ou está errado, a aba dele fica vermelha
  (sublinhado ondulado) e abre sozinha, com o cursor no campo. Isso é feito dentro de
  `erroCampo`, então qualquer validação nova já ganha esse comportamento.
- Contrato: uma só janela com Dados gerais | Valores e vigência | Inteiro teor |
  Aditivos | Fiscais e gestor. O botão "Aditivos e fiscais" da lista abre essa
  mesma janela na aba Aditivos. Num contrato novo, Aditivos e Fiscais ficam
  desativadas (com o motivo) até o primeiro salvamento; depois a janela reabre
  sozinha na aba Fiscais, porque o PNTP 9.3 cobra a relação de fiscais.
- Licitação: uma só janela com Dados do processo | Valores e datas | Documentos. O
  botão "Documentos" da lista abre a janela na aba Documentos; processo novo reabre
  nela depois de salvo.
- Também divididas: notícia, banner, aviso, página, pergunta frequente, publicação
  oficial, serviço (Carta de Serviços), unidade, gestor, documento de planejamento e
  contas e perfil de acesso (nome | permissões).
- Ficaram sem abas, de propósito, as janelas curtas (item de menu, convidar pessoa,
  alterar acesso, minha conta, confirmações e avisos): dividir só obrigaria a clicar
  mais.
- Novo auxiliar `P.abas(lista, inicial)` em app.js: aba com conteúdo em função é
  montada na primeira vez que abre (aditivos, fiscais e documentos só consultam o
  banco quando a aba é aberta); aba com motivo fica desativada.

**0.9.0 — 13/11/2026 — Fase 2 · Lote 8: contratos (PNTP 9.1 a 9.3)**
- Módulo novo "Contratos" no painel (o antigo "Licitações e contratos" passou a se chamar
  "Licitações"; quem tinha acesso a licitações recebeu o mesmo acesso a contratos).
- Contrato: instrumento (contrato, ata de registro de preços, empenho, carta-contrato), número,
  objeto, contratado com CNPJ/CPF, valor inicial, assinatura, vigência, rescisão, inteiro teor
  (PDF ou link) e a licitação de origem (escolha por busca, sem lista do navegador).
- Aditivos, apostilamentos e rescisão com valor (+/−), nova vigência e inteiro teor. O banco
  recalcula sozinho "valor atual" e "fim da vigência atual" (trigger `recalcular_contrato`).
- Fiscais e gestor de cada contrato, com ato de designação e período.
- Regras no banco: CPF/CNPJ só com 11 ou 14 números; fim da vigência não pode ser antes do
  início; licitação com contrato não pode ser excluída (FK RESTRICT, com mensagem no painel);
  em contrato publicado, aditivos e fiscais só com permissão de publicar.
- PNCP: botão "Importar do PNCP" em Contratos e importação automática noturna (a mesma ligada
  em Licitações) trazem contratos e termos aditivos, ligando à licitação quando ela também veio
  do PNCP. Fiscais não existem no PNCP: são informados no painel. A função `pncp` ganhou o
  endereço dos termos aditivos (refazer o Deploy) e a `pncp-sincronizar` passou a importar
  contratos (refazer o Deploy).
- Site `#/contratos`: abas "Contratos e aditivos" (abas de ano, tabela, filtro por período de
  vigência, situação e texto, CSV/JSON) e "Fiscais de contratos" (`#/contratos/fiscais`): a
  Cartilha 2026 diz que o 9.3 não é atendido se o fiscal só aparecer dentro de cada contrato.
  Página do contrato com aditivos e fiscais; página da licitação mostra os contratos decorrentes.
- CPF de pessoa física aparece mascarado no site e nos arquivos baixados (***.456.789-**).
- Varredura PNTP (Cartilha/Matriz 2026): 9.1 atende (resumo com contratado, valor, objeto,
  vigência e aditivos; filtro mínimo "período"); 9.2 atende quando o inteiro teor é anexado ou
  vem do PNCP; 9.3 atende com a relação de fiscais vigentes e encerrados; 9.4 (ordem
  cronológica de pagamentos) fica no Portal da Transparência externo, por ser dado financeiro.

**0.8.2 — 13/11/2026 — licitações conforme a Cartilha PNTP 2026**
- Varredura do módulo contra a Cartilha e a Matriz 2026 (8.1 a 8.7). Ajustes:
  - 8.1 exige "tabela estruturada em HTML" (a palavra "preferencialmente" saiu em 2026): a
    lista do site virou tabela com Nº/modalidade, objeto, data da sessão (ou de publicação,
    quando não há sessão), valor estimado/homologado e situação. No celular cada linha vira um
    bloco com o rótulo de cada coluna.
  - 8.1 pede que dispensas e inexigibilidades constem da mesma relação: nova primeira aba
    "Todos os processos". As abas por tipo continuam (8.2/8.3, 8.4 e 8.5).
  - 8.1 exige filtros mínimos por ano, mês, situação e modalidade: entrou o filtro de mês
    (pela data de publicação).
  - 8.1 pede declarar expressamente quando não houve licitação: o ano corrente aparece sempre;
    sem processos, a página diz "Não foram realizadas licitações em AAAA até esta data".
  - 8.3/8.4 listam os documentos esperados: novos tipos ETP, justificativa, orçamento/pesquisa
    de preços, parecer e caracterização de emergência (script 14), sugeridos pelo nome do PDF e
    reconhecidos na importação do PNCP.
- Pendências do PNTP nesta dimensão (próximo lote): 8.6 Plano de Contratações Anual
  (recomendada; declarar que não existe não vale) e 8.7 relação dos sancionados pelo próprio
  órgão (recomendada; o link do CEIS não substitui).

**0.8.1 — 12/11/2026 — importação automática do PNCP**
- As licitações podem vir do PNCP sozinhas: todo dia às 03:15 o banco chama a função
  `pncp-sincronizar`, que traz o que foi publicado ou alterado (homologação, revogação…) desde
  a última vez e atualiza a lista de arquivos. Liga-se em Licitações › Importar do PNCP ›
  "Importação automática", com a opção de publicar direto ou deixar como rascunho.
- Quem tem permissão de editar licitações liga/desliga (função `definir_pncp_automatico`, que
  mexe só nas chaves do PNCP dentro das configurações); publicar direto exige permissão de
  publicar.
- O módulo mostra no topo quando foi a última execução e o resultado (ou o erro).
- O botão "Importar" continua para trazer períodos antigos (série histórica).
- Instalação: seção "Importação automática" no README (script 13 + função + segredo).
- Correção (13/11/2026): o script 13 passou a liberar as tabelas para o papel `service_role`.
  Como o projeto não expõe tabelas novas automaticamente, a função falhava com "permission
  denied for table orgaos". Ao criar tabelas novas que uma função de servidor precise gravar,
  lembrar de dar `grant` também ao `service_role`.

**0.8.0 — 12/11/2026 — Fase 2 · Lote 7: licitações (PNTP 8.1 a 8.5)**
- Novo módulo "Licitações e contratos" no painel (a parte de contratos vem no Lote 8). Cada
  processo tem uma fonte, à escolha:
  - **Portal**: cadastrado aqui, com os documentos enviados aqui;
  - **Link**: só os dados básicos e o link do processo no sistema de outra empresa;
  - **PNCP**: importado pelo botão "Importar do PNCP".
- Importação do PNCP: escolhe-se o período e os CNPJs (o da Prefeitura vem preenchido; dá para
  incluir os fundos com CNPJ próprio). Busca as 13 modalidades, grava em lotes de 50, não cria
  repetidos (índice único por número de controle do PNCP) e, na reimportação, atualiza só os
  campos que vêm do PNCP. Vencedores, critério e documentos acrescentados aqui são mantidos.
  Os arquivos do PNCP entram como links (não ocupam o armazenamento). Processos novos entram
  publicados ou como rascunho para revisão, à escolha.
- Telas no padrão de abas: grupo (Licitações / Dispensas e inexigibilidades / Adesões a atas)
  e, dentro, o ano, com a quantidade de processos em cada aba. Filtros por texto, modalidade,
  andamento, origem e situação; lista paginada de 50 em 50.
- Documentos: vários PDFs de uma vez (até 50 MB cada), com o tipo sugerido pelo nome do arquivo
  (edital, ata, homologação, ratificação…), ou link. Num processo já publicado, só quem tem
  permissão de publicar mexe nos documentos (regra no banco, igual ao próprio processo).
- "Andamento" (aberta, homologada, revogada…) é separado de "situação" (rascunho/publicado no
  portal). Modalidades da Lei 14.133 (as mesmas do PNCP), chamada pública, adesão a ata e as
  antigas tomada de preços e convite (Lei 8.666), para a série histórica.
- Site: `#/licitacoes/<grupo>?ano=` com as duas faixas de abas, filtros, CSV/JSON e cartões; e
  a página de cada processo (`#/licitacao/<id>`) com todos os dados, documentos por data e o
  link para o PNCP ou o sistema de origem. Links para o PNCP e para o cadastro de empresas
  punidas (CEIS/CNEP, PNTP 8.7).
- A capa da Transparência, a busca geral e os dados abertos passaram a usar as licitações daqui.
- Função de servidor nova `pncp` (ver seção "Função pncp").

**0.7.5 — 12/11/2026 — selos só com o símbolo**
- A faixa de selos da página inicial mostra só o símbolo de cada selo, redondo e alinhado à
  direita (centralizado no celular). Ao passar o mouse, ou ao focar pelo teclado, aparece um balão
  com o nome e o detalhe; se o selo tiver link, o clique abre a página em nova aba. O leitor de tela
  lê o nome. Selo sem imagem mostra o ícone padrão dentro de um círculo branco.
- Painel (Aparência): orientação para enviar a imagem do selo em formato quadrado.

**0.7.4 — 12/11/2026 — avisos, selos e abas do painel**
- Padrões do projeto, a seguir em qualquer tela nova:
  - Abas: sempre no estilo de guia de navegador (`.abas-guia/.aba-guia/.painel-guia` no site,
    `.abas/.aba/.painel-guia` no painel), com abas dentro de abas quando houver subdivisão.
    Nada de abas em forma de botão ou pílula.
  - Faixa de aviso: o mesmo layout em todos os níveis (ícone · título em negrito + texto ·
    link de ação · fechar). O nível muda só as cores e o ícone (informativo, importante e urgente).
- Avisos: campos novos "Título" e "Texto do botão" (script 11). Sem título, aparece só o texto;
  sem texto do botão, o link aparece como "Saiba mais". O urgente deixou de ser uma faixa
  vermelha cheia e passou para o mesmo formato, em tom vermelho claro. No celular, o "×" fica
  no canto de cima e a ação vai para baixo do texto.
- O site lê os avisos com `select('*')`, então funciona antes e depois de rodar o script 11.
- Selos e certificações: cadastro em Aparência e contatos (até 6, cada um com nome, detalhe, link
  e imagem opcional, reduzida no navegador). Ficam em `configuracoes.selos`. Aparecem numa faixa
  compacta no alto da página inicial, antes do banner, e só quando houver algum selo. Imagens
  trocadas ou removidas são apagadas do armazenamento ao salvar.
- Painel: as abas de Notícias/Banners/Avisos, Unidades/Gestores, Páginas/Perguntas,
  Serviços/Textos e Pessoas/Perfis passaram a usar o estilo de guia, com o conteúdo num painel
  branco encaixado na aba aberta.
- Exportação: o PNTP pede, na "gravação de relatórios", pelo menos um formato editável (txt,
  csv, odt, ods, rtf, json…), e para alguns documentos aceita PDF pesquisável. CSV e JSON
  atendem, por isso os botões não mudaram.

**0.7.3 — 12/11/2026 — exercícios em abas (abas dentro de abas)**
- Em Planejamento e prestação de contas, dentro da aba de cada documento há uma segunda faixa
  de abas, uma por exercício publicado (PPA e Plano Estratégico mostram o período, ex.:
  "2026–2029"). Abre no exercício mais recente; cada exercício é buscado só quando a aba é aberta.
- As abas internas são menores e brancas, para não se confundirem com as de fora.
- O endereço guarda o exercício (`#/planejamento/rreo?ano=2025`): o link abre direto naquele ano
  e os resultados da busca geral levam ao ano certo.
- Saíram os filtros de exercício, período e pesquisa e o botão "Exercícios anteriores": as duas
  faixas de abas fazem esse papel. O "Baixar CSV/JSON" continua e traz a série completa do documento.
- A lista de exercícios vem de uma consulta só com a coluna `exercicio` daquele documento (a API
  não tem "distinct"; os anos repetidos são removidos no navegador).

**0.7.2 — 12/11/2026 — abas no estilo de navegador**
- As abas em forma de pílula (pareciam botões) viraram guias de navegador: a aba aberta tem
  cantos arredondados em cima, faixa colorida no topo e a mesma cor do painel de conteúdo,
  "encaixada" nele; as fechadas ficam recuadas, sem fundo, separadas por um traço fino.
  Estilo único (`.abas-guia`, `.aba-guia`, `.painel-guia`) usado em "Últimas publicações"
  (página inicial) e em Planejamento e prestação de contas.
- "Últimas publicações": o botão do Diário Oficial subiu para a linha do título, ao lado de
  "Todas as publicações", para as abas ficarem coladas no conteúdo.
- No alto contraste, a aba aberta fica com texto e faixa amarelos.

**0.7.1 — 12/11/2026 — capa da transparência e abas de planejamento**
- `#/transparencia` passa a ser a capa do Portal da Transparência no layout combinado: faixa azul
  com busca e "mais acessados", faixa de situação (última atualização, exercícios disponíveis,
  formatos, dados abertos) e cartões por grupo do PNTP, cada item com o número do critério.
  Os grupos mudam conforme o tipo de órgão (Prefeitura, Câmara, Consórcio). Itens que já existem
  no portal abrem a página interna; receitas, despesas, pessoal, diárias, convênios e obras abrem
  o sistema externo (`transparencia_url`); licitações e contratos usam `licitacoes_url`. Item sem
  endereço aparece sem link, para não levar a página quebrada.
- `#/planejamento` dividido em abas, uma por documento (PPA, LDO, LOA, Plano Estratégico, RREO,
  RGF, Balanço, Relatório de Gestão, Parecer TCE, Julgamento Câmara). A troca de aba acontece no
  lugar (sem voltar ao topo) e o endereço muda para `#/planejamento/<tipo>`, que continua valendo
  como link direto. Setas do teclado trocam de aba; no celular a faixa de abas rola de lado e a
  aba escolhida é trazida para a área visível.

**0.7.0 — 12/11/2026 — Fase 2 · Lote 6: planejamento e prestação de contas (PNTP 11.1 a 11.10)**
- Novo módulo no painel, com um cadastro só para os dez instrumentos. Cada linha é um arquivo: a
  lei e os anexos do mesmo instrumento são linhas com a mesma identificação e "parte" diferente, e
  o cadastro aceita vários PDFs de uma vez (cada um vira uma parte, com nome editável). Também
  aceita link externo (site do TCE, da Câmara, Diário Oficial).
- Regras no banco: RREO exige bimestre; RGF exige quadrimestre (1 a 3) ou semestre (1 a 2); só
  parecer e julgamento têm resultado; publicado precisa de PDF ou link, salvo resultado
  "pendente" (o PNTP 11.3 pede informar as contas ainda não apreciadas).
- Erro achado no teste e corrigido: regra CHECK cujo resultado é nulo conta como aprovada. Sem
  `coalesce(…, false)`, um RREO sem periodicidade e uma LOA publicada sem documento passavam.
  Mantenha o `coalesce` se mexer nessas regras.
- Quadro "Situação no PNTP" no topo do módulo: compara o que está publicado com os prazos legais
  (RREO e RGF até 30 dias após o período; Balanço a partir de 30/04 do ano seguinte; LOA/LDO do
  ano; PPA que cubra o ano; parecer e julgamento dos últimos 4 exercícios, anexados ou marcados
  "pendente") e diz o que falta. A periodicidade do RGF (quadrimestral ou semestral, para
  municípios com menos de 50 mil habitantes) é escolhida ali e fica nas configurações do órgão.
- Só quem tem acesso ao órgão inteiro altera estes documentos (usuário de uma secretaria vê, mas
  não grava).
- PDFs até 50 MB neste módulo (LOA e balanço com anexos passam fácil de 10 MB). O bucket foi
  ampliado para 50 MB; os outros módulos continuam limitados a 10 MB pelo painel. Prefira PDF com
  texto pesquisável, não escaneado.
- Site: `#/planejamento` com os três grupos (Planejamento, Gestão fiscal, Prestação de contas) e o
  documento mais recente de cada tipo; cada tipo tem seção própria (`#/planejamento/loa`, `/rreo`
  …), exigência do PNTP, com a série agrupada por exercício e por período, filtros, pesquisa e
  download CSV/JSON. A série carrega 4 exercícios por vez ("Exercícios anteriores").
- Site: `#/transparencia` deixou de ser só o link externo: mostra as seções que já estão no portal
  e, à parte, o Portal da Transparência externo (receitas, despesas e folha continuam lá).
- Busca geral, mapa do site e dados abertos incluem planejamento e contas. No painel, "Menu do
  site" ganhou o destino "Planejamento e prestação de contas" (menus já criados não mudam
  sozinhos: inclua o item pelo painel).
- `supabase/teste_contas_ficticias.sql`: 75 documentos fictícios (2022 a 2027) com duas faltas de
  propósito (RREO do 6º bimestre de 2024 e julgamento das contas de 2025) para ver o quadro do
  PNTP apontar. Apaga e reinsere a cada execução; comando de limpeza no fim.

**0.6.5 — 12/11/2026 — "Últimas publicações" na página inicial**
- Substitui a lista simples "Publicações oficiais": cartões com bloco de data (dia/mês/ano), tipo,
  situação do ato quando não está vigente, número/ano, ementa em duas linhas e "Ver documento".
- Abas Todas, Leis, Decretos, Portarias e Editais (só aparecem as que têm publicação), com troca
  pelas setas do teclado; uma consulta pequena (6 itens) por aba. Atalho para o Diário Oficial.
- "Gestão" passa a ter faixa própria logo abaixo.
- `supabase/teste_publicacoes_ficticias.sql`: 19 publicações fictícias para ver o layout (não faz
  parte da instalação; têm o link terminado em "?teste=1" e há um comando no fim para apagá-las).
- Licitações e contratos entram nesta seção como novas abas na Fase 2.

**0.6.4 — 12/11/2026 — escolha da notícia no banner**
- A notícia ligada ao banner era escolhida numa lista nativa de várias linhas, que ficava
  minúscula dentro da janela. Agora: campo de pesquisa + lista de cartões clicáveis (foto, título,
  data/situação), com a notícia escolhida em destaque no alto, marcada com "✓ Escolhida".

**0.6.3 — 12/11/2026 — ajuste da notícia em destaque**
- A foto de capa passava a definir a altura do cartão pela proporção original (fotos quadradas
  deixavam uma faixa branca grande embaixo do texto). Agora a foto fica sempre em 16:9, o texto
  fica centralizado ao lado e a notícia grande mostra um trecho do texto (só parágrafos, sem
  subtítulos e listas) para completar o espaço.

**0.6.2 — 12/11/2026 — ajustes do site pedidos no teste**
- Avisos do topo com botão "×": o cidadão fecha e o aviso não volta neste navegador, a não ser
  que o órgão altere o aviso.
- Banners dentro do limite da página, com espaçamento e cantos arredondados, deslizando para o
  lado na troca (e com o dedo no celular). Os banners fora da tela ficam inacessíveis ao teclado
  e ao leitor de tela, para não confundir.
- Banner pode abrir uma notícia já cadastrada (painel: "Ao clicar no banner" → notícia, com
  busca). A notícia usada em banner não pode ser excluída sem trocar o banner antes.
- Notícias da página inicial no layout de cartões horizontais (foto, data, visualizações,
  categoria, título, resumo e "Continuar lendo"); a mais recente aparece maior. Se uma das
  recentes estiver marcada como "Destacar na página inicial", ela ocupa o lugar maior.
- Contador de visualizações: conta uma vez por notícia em cada sessão do navegador, em tabela
  separada (somar na própria notícia mexeria na data de atualização e encheria o histórico).
- Página da notícia: "Notícias relacionadas" (mesma categoria ou secretaria, completando com as
  mais recentes) e total de visualizações.

**0.6.1 — 12/11/2026 — ajustes pedidos no teste do site**
- Botão "Portal da Transparência" do topo e a faixa de transparência da página inicial passam do
  azul para amarelo-destaque (#f2b33d) com texto escuro (contraste 9:1) e ícone de olho.
- Redes sociais (início e rodapé) com o logotipo de cada rede, incluindo o WhatsApp.
- Painel: aparecia a palavra "null" embaixo das listas de Banners e Avisos quando não havia mais
  itens para carregar (um valor vazio era desenhado como texto). Corrigido.

**0.6.0 — 12/11/2026 — Lote 5 da Fase 1 (site público)**
- Site público completo lendo os dados do painel (ver seção "Site público").
- Painel: botão "Ver site" funcionando; Aparência ganhou "Sistemas externos" (Portal da
  Transparência, licitações, e-SIC e ouvidoria atuais, enquanto não estão no SOFT+) e a norma da
  estrutura organizacional (PNTP 2.1).
- Testado em navegador automatizado com dados simulados: todas as páginas, filtros, "carregar
  mais", exportação CSV, busca, alto contraste, tamanho do texto, atalhos, celular (sem rolagem
  lateral) e endereço sem órgão. Corrigidos no teste: botão do Radar invisível na faixa azul e a
  notícia em destaque ocupando a largura toda.

**0.5.1 — 12/11/2026 — ajuste de interface**
- Os campos Categoria (notícias), Área (serviços) e Assunto (perguntas frequentes) deixam de usar a
  lista de sugestões do navegador (datalist), que abria uma lista escura sobreposta, fora do visual
  do painel e diferente em cada aparelho. Agora são listas de escolha normais, com a opção
  "Outra (digitar)…" para quando a categoria não existir. Regra: não usar datalist no projeto.

**0.5.0 — 12/11/2026 — Lote 4 da Fase 1**
- Carta de Serviços (PNTP 14.3 e 15.3): serviço com área, unidade, o que é, quem pode pedir,
  requisitos e documentos, etapas, prazo máximo, custo, forma (presencial, internet ou ambos, com o
  link), local, horário, atendimento prioritário, tempo de espera e onde se manifestar. Aba
  "Textos da Carta" com apresentação, compromissos de qualidade (texto sugerido) e canal padrão de
  manifestação montado com os contatos do órgão.
- LGPD e Governo Digital (PNTP 15.1 a 15.5): encarregado de dados e ato de designação, política de
  privacidade com modelo, norma da Lei 14.129/2021 (escolhida entre as publicações ou por link) e
  regras de uso dos dados abertos com modelo. Quadro no topo com a situação de cada critério.
- Botão "Instalar app" (Android, iPhone e computador).
- Exclusão de unidade passa a conferir também os serviços da Carta.
- Testado: script 08 no PostgreSQL local (duas execuções; cadastrador setorial, administrador e
  visitante anônimo); telas em navegador automatizado, incluindo instruções de instalação no iPhone.

**0.4.1 — 12/11/2026 — notícias de mais de uma secretaria**
- Campo "Outras secretarias envolvidas" na notícia (ex.: Saúde com Educação). A unidade
  responsável continua única e é ela quem define quem edita; as envolvidas só fazem a notícia
  aparecer também na página delas no site e no filtro do painel ("responsável OU envolvida").
- Exclusão de unidade passa a conferir antes notícias, publicações e usuários vinculados, com a
  explicação na tela; o banco também barra.
- Correção de segurança: o vínculo de um usuário a uma unidade era "on delete set null". Ao excluir
  a unidade, o alcance virava o órgão todo sem ninguém perceber. Agora a exclusão é barrada.
- Histórico mostra nomes legíveis para os campos e áreas do Lote 3.

**0.4.0 — 12/11/2026 — Lote 3 da Fase 1 (conteúdo do site)**
- Notícias: título, resumo, texto com editor simples (título, negrito, itálico, listas, link e
  pré-visualização), foto de capa reduzida no navegador com descrição obrigatória
  (acessibilidade), categoria, unidade, data (futura = agendada) e destaque. Rascunho →
  publicação conforme o perfil. Lista com 50 por vez, total contado no servidor e um filtro por
  coluna (texto sem acento, categoria, unidade, situação, período).
- Banners (imagem 1920 × 600, texto alternativo, link, período, ordem) e avisos de topo
  (informativo, importante, urgente; início e fim), que saem do ar sozinhos.
- Publicações oficiais: tipo, número, data, ano automático, ementa, PDF ou link externo,
  situação do ato (vigente, alterada, revogada, sem efeito), observação e unidade. Bloqueia
  duplicata e publicação sem documento. Cartão do Diário Oficial (FEMURN) no alto da tela;
  importação por planilha aparece como "em breve".
- Páginas institucionais (endereço automático, sugestões de páginas comuns) e perguntas
  frequentes por assunto.
- Menu do site: itens e subitens apontando para tela do site, página ou link externo; subir/
  descer, prévia da barra e botão "Criar menu padrão".
- Aparência: campos do Diário Oficial (nome e endereço).
- Testado: script 06 no PostgreSQL local (duas execuções; cadastrador setorial, administrador,
  administrador de outro órgão e visitante anônimo do site); telas em navegador automatizado
  (computador e celular).

**0.3.1 — 11/11/2026 — ajustes do teste do Lote 2**
- Usuário com alcance numa unidade continua vendo todas as unidades e gestores (dados
  públicos), mas os botões Editar/Excluir só aparecem na própria unidade e nos gestores
  dela; "+ Nova unidade" some; no cadastro de gestor a unidade vem travada na dele. Aviso
  no topo da tela explica o limite, e o topo do painel mostra a unidade ao lado do perfil.
- Correção: os avisos (toast) ficavam escondidos atrás do fundo escuro das janelas;
  agora aparecem por cima delas.

**0.3.0 — 11/11/2026 — Lote 2 da Fase 1**
- Tela "Usuários e permissões", aba Pessoas: lista com perfil, alcance, situação
  (ativo, convite pendente, desativado) e último acesso, com um filtro por coluna.
  Convite com nome, e-mail, perfil e alcance; entrega por link (mensagem pronta para
  copiar ou mandar no WhatsApp) ou e-mail automático. Alterar perfil/alcance, novo
  link para convite vencido, desativar/reativar, cancelar convite não aceito.
- Aba Perfis: perfis padrão (só leitura) e perfis próprios do órgão, criados do zero
  ou como cópia, com tabela módulo × ação (marcar qualquer ação marca "Ver").
  Exclusão bloqueada com explicação quando o perfil está em uso.
- Tela "Histórico de alterações": 50 por vez com "Carregar mais", filtros por período,
  pessoa, ação e área; detalhe mostra cada campo antes e depois, com nomes legíveis.
  Mudanças de permissão passam a entrar no histórico do órgão.
- "Minha conta" (clicar no nome, no topo): trocar o próprio nome e a senha.
- Link de convite abre a tela "Bem-vindo(a)! Crie sua senha"; link vencido mostra aviso.
  O tipo do link é lido antes da Supabase limpar o endereço (antes dependia de tempo).
- Correção: em telas estreitas a página toda rolava para o lado por causa do rótulo
  oculto da coluna "Ações"; agora só a tabela rola.
- Segurança reforçada no banco (script 05): ninguém altera o próprio acesso; quem não
  é administrador não dá perfil de administrador, não mexe em administrador, não cria
  perfis; perfil e unidade precisam ser do mesmo órgão; gestor setorial só cadastra
  na própria unidade.
- Testado: script 05 no PostgreSQL local (duas execuções; administrador, gerente sem
  ser administrador, gerente setorial, administrador de outro órgão e anônimo); função
  de convite com a Supabase simulada (19 situações, incluindo tentativas de pegar link
  de conta alheia); telas em navegador automatizado (computador e celular).

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
