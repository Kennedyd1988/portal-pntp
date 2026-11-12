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
  modulo-menu.js        → "Menu do site" (rotas do site público listadas em ROTAS)
  versao.json           → ÚNICA fonte da versão (ver abaixo)
  sw.js                 → service worker "rede primeiro"
  manifest.json         → instalação como aplicativo (PWA)
site/                   → site público (index.html, site.css, site.js = núcleo, paginas.js = páginas)
supabase/               → scripts SQL, rodar em ordem
supabase/functions/convidar-usuario/index.ts → função de servidor do convite
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

- Excluir um órgão ou o login de uma pessoa apaga os vínculos em cascata, mesmo que
  seja o último administrador (é ação deliberada da SOFT+, feita pelo SQL).

## Histórico de mudanças

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
