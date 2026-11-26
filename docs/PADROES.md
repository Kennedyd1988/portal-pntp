# SOFT+ GOV — Manual de padrões reutilizáveis

Versão do sistema: 0.51.0 · Atualizado em 25/11/2026 · Documento editável: https://claude.ai/artifact/8d3P4o1ADXNVEMDsbDV1Za

> Cópia do manual mantida no repositório. A cada publicação no ar, o manual (documento e esta cópia) é atualizado junto com as notas da versão. Veja o "Histórico de atualizações" no fim.

## 1. Visão geral e arquitetura

O SOFT+ GOV é um site institucional + Portal da Transparência para órgãos públicos, com painel de gestão, todos servidos como páginas estáticas e um único banco Supabase para todos os clientes. Este manual reúne os padrões que podem ser reaproveitados em qualquer app novo da SOFT+, inclusive de finalidade totalmente diferente.

| Camada | Tecnologia | Onde fica | Observação |
| --- | --- | --- | --- |
| Site público | HTML + CSS + JavaScript puro, sem framework | `site/` (index.html, site.css, site.js, paginas.js e módulos por assunto) | Rotas por hash (`#/pagina`), carregadas sob demanda |
| Painel de gestão | HTML + CSS + JavaScript puro, PWA instalável | `painel/` (app.js = núcleo, `modulo-*.js` = telas) | Botão "Instalar app" fixo no canto inferior esquerdo |
| Banco, login e regras | Supabase (PostgreSQL + Auth + Storage + Edge Functions) | `supabase/NN_nome.sql`, rodados em ordem | RLS ligado em todas as tabelas; nada exposto sem `grant` |
| Arquivos | Storage da Supabase (bucket `arquivos`), limite de 200 MB | Envio por um ponto único no código | Troca de provedor só por configuração |
| Hospedagem | Cloudflare Pages (vários domínios) | `portal-pntp.pages.dev`; GitHub Pages redireciona | Cada ramo do Git gera um endereço de teste |
| E-mail | SMTP próprio (Brevo) | Authentication › SMTP e segredos das funções | Convites, "Esqueci minha senha", e-SIC/Ouvidoria |

**Princípios que valem para qualquer app novo:**

- **Um banco para todos os clientes:** cada órgão é uma linha em `orgaos`; subsites usam `orgao_pai_id`. Nunca um banco por cliente.
- **Qual órgão abrir:** pelo domínio cadastrado no órgão ou, enquanto o domínio não aponta, por `?orgao=CNPJ` (só números).
- **Regras no banco, não só na tela:** permissões, travas de exclusão, rascunho → publicado e histórico ficam em gatilhos e políticas do PostgreSQL. O painel apenas reflete.
- **Controle de versões:** um único `painel/versao.json` (`versao`, `data`, `notas`) serve site e painel. O número entra como `?v=` em todos os CSS/JS, forçando o navegador a baixar a versão nova. As notas aparecem para o usuário.
- **Carregamento sem tela crua:** até o CSS da versão chegar, a página mostra só "Carregando…"; se algo travar, libera em 6 segundos.
- **Texto sem HTML:** conteúdo digitado usa marcação simples (`## título`, `**negrito**`, `*itálico*`, listas, `[link](https://…)`) e é desenhado elemento a elemento, nunca com HTML colado (segurança).
- **Configurações mescladas:** cada tela grava só as chaves que mudou em `orgaos.configuracoes` (função `mesclar_configuracoes`), sem apagar o que outra tela gravou.

## 2. Identidade visual do site

Visual sério e institucional: azul-marinho calculado da cor de cada órgão, verde só nos detalhes e amarelo-ouro reservado ao botão principal de ação (Portal da Transparência). A cor do órgão vem do painel (Aparência) e todo o resto é derivado dela.

**Tokens de cor (CSS)**

| Token | Valor | Uso |
| --- | --- | --- |
| `--cor` | cor do órgão (padrão `#0d4fc4`) | Links, anéis das fotos, detalhes; vem de Aparência |
| `--cor-escura` / `--cor-clara` | 22% mais escura / 90% mais clara | Hover de links / fundos suaves (calculadas pelo site) |
| `--navy` | `color-mix(in srgb, var(--cor) 42%, #061629)` | Barra de acessibilidade, menu, rodapé, títulos, botões |
| `--navy-2` | `color-mix(in srgb, var(--cor) 58%, #061629)` | Hover de botões e final dos degradês |
| `--tom` | `color-mix(in srgb, var(--cor) 7%, #fff)` | Fundo de etiquetas, faixa atrás do banner, cabeçalho de tabela |
| `--acento` | `#0a9668` | Traço dos títulos, sublinhado do menu, filete da aba aberta |
| `--acento-escuro` | `#06704d` | Verde com texto branco (contraste ~6:1) e cargos |
| `--acento-claro` / `--acento-texto` | `#e7f6ef` / `#066a4a` | Etiquetas verdes (categoria, chips) |
| Botão principal | degradê `#ffc94d` → `#f4b223`, borda `#e2a114`, texto `--navy` | Portal da Transparência, botão de busca (contraste ~9:1) |
| `--texto` / `--texto-suave` | `#1a2433` / `#536173` | Texto corrido / texto secundário |
| `--linha` / `--fundo` | `#dde5ee` / `#f5f8fb` | Bordas / fundos cinza-azulados |

**Cores por grupo (ícones, abas e indicadores):** azul `#1d5fd1` (Transparência), roxo `#6a4fc9` (contratações), verde `#0a8a62` (serviços, decretos), âmbar `#b26d06` (atos oficiais, portarias), rosa `#c2416b` (atendimento), cinza-azulado `#4f6378` (outros). O ícone usa fundo com 10–12% da cor e, ao passar o mouse, fica cheio com o ícone branco.

**Cores de situação (iguais no site e no painel):** `--info-*` (azul), `--ok-*` (verde), `--falta-*` (amarelo) e `--erro-*` (vermelho), com as mensagens `.msg-info`, `.msg-ok`, `.msg-falta` e `.msg-erro`.

**Tipografia e medidas**

- Fonte: **Public Sans** (400 a 800), com reserva para system-ui. Títulos em 800, espaçamento entre letras de -0,025em a -0,04em.
- Tamanhos: H1 de página `clamp(1.7rem, 3.2vw, 2.15rem)`; título de seção 1,65rem (1,35rem no celular); texto 1rem com altura de linha 1,55.
- Rótulos pequenos (cargo, "Mais recente", tipo de ato): 0,72rem, peso 700, maiúsculas, espaçamento 0,06–0,1em.
- Largura máxima do conteúdo (`.limite`): 1280 px, com 24 px de margem lateral (18 px no celular).
- Raios: 10 px (botões, campos), 14 px (cartões, tabelas), 18 px (cartões de destaque), 20–22 px (painéis e faixas de destaque), 99 px (pílulas e etiquetas).
- Sombras: leve `0 6px 18px rgba(12,38,64,.05)`; destaque `0 16px 36px rgba(6,22,41,.16)`; ao passar o mouse o cartão sobe 2–3 px.
- Espaçamento entre seções: 60 px (34 px no celular). Espaços por classes utilitárias (`.mt-05` a `.mt-4`, `.mb-1` a `.mb-3`), nunca `style` solto.

## 3. Componentes do site

Cada componente existe pronto em `site/site.css` (blocos "REDESENHO 0.46" no fim do arquivo) e pode ser copiado para outro app com as mesmas classes.

| Componente | Classes principais | Padrão |
| --- | --- | --- |
| Barra de acessibilidade | `.barra-acess`, `.atalhos`, `.acess-ferramentas` | Fundo `--navy`; atalhos e-MAG [1] a [4], Acessibilidade, Alto contraste, A+ A A−, Mapa do site, Entrar no painel |
| Cabeçalho | `.cabecalho`, `.marca`, `.busca-topo`, `.btn-transparencia` | Brasão de 68 px, esfera em maiúsculas pequenas, nome em `--navy` 800; busca com botão marinho; botão amarelo-ouro |
| Faixa de redes e selos | `.faixa-topo`, `.redes-topo`, `.selos` | Exclusiva, abaixo do cabeçalho; fundo `--tom`; rótulos "Siga-nos" e "Selos e certificações"; selos 42 px que quebram linha (sem rolagem) |
| Menu | `.menu`, `.menu-lista`, `li.ativo` | Fixo no topo ao rolar; fundo `--navy`; item da página atual com sublinhado verde de 3 px; submenu com cantos de 12 px |
| Trilha | `.trilha` | "Início › Seção › Página", 0,86rem |
| Título de página | `.pagina > h1`, `.sub` | Traço verde 40×4 px acima do título; subtítulo 1,05rem em `--texto-suave` |
| Título de seção | `.secao-titulo` | Título com traço verde 34×4 px; "Ver todos →" como botão pílula contornado |
| Banner + atalhos | `.hero-faixa`, `.secao-acessos.sobre-banner` | Banner sobre faixa `--tom`; painel branco dos atalhos sobe 64 px sem cobrir a arte |
| Cartão de atalho | `.acessos a.cartao[data-grupo]` | Ícone redondo 50 px na cor do grupo; seta → aparece ao passar o mouse; no celular ícone acima do texto |
| Faixa de destaque | `.faixa-radar`, `.transp-topo`, `.perfil-vereador` | Degradê `--navy` → `--navy-2`, círculos decorativos com 4–5% de branco, botão branco que fica verde ou amarelo no hover |
| Abas | `.abas-guia`, `.aba-guia`, `.painel-guia` | Formato de aba (cantos 12 px em cima); fechadas `#edf2f7`; aberta em `--navy` com texto branco e filete verde; linha marinho de 2 px embaixo; painel branco |
| Abas internas | `.abas-guia-interna`, `.aba-guia-p` | Mais leves (aberta em `--tom`), só quando há abas dentro de abas; se forem as únicas da página, usam o formato principal |
| Filtros | `form.filtros` | Cartão branco (ou `--tom` dentro de painel); campos de 44 px, raio 10, foco com borda verde e anel de 3 px |
| Lista e exportação | `.barra-lista`, `.exportar` | Total à esquerda; CSV, JSON, XML, XLSX, PDF e Imprimir como pílulas contornadas |
| Tabela | `.tabela-caixa`, `table.tabela` | Caixa raio 14; cabeçalho em `--tom` com texto marinho; linha destacada ao passar o mouse; vira cartões no celular (`data-rotulo`) |
| Paginação | `.paginacao`, `.pag-botao` | Botões redondos de 40 px; página atual em `--navy` |
| Etiqueta | `.etiqueta`, `-verde`, `-ambar`, `-vermelha` | Pílula 0,75rem 700 em fundo `--tom` |
| Cartão de pessoa | `.cartao.gestor`, `.cartao-vereador`, `.est-foto` | Foto redonda com borda branca + anel de 3 px na `--cor`; cargo verde em maiúsculas; unidade em etiqueta com ícone de prédio; sem foto = iniciais |
| Contatos | `.gestor-contatos`, `.perfil-contatos` | Botões redondos só em carrosséis; em páginas de consulta, e-mail e telefone por extenso (PNTP 2.3) |
| Notícia de destaque | `.noticia-h-grande` | Foto à esquerda; categoria em etiqueta verde + data; título 1,6rem; resumo em 5 linhas |
| Publicações | `.secao-publicacoes .pub-cartao[data-tipo]` | Mais recente em faixa marinho; demais em lista de 2 colunas com data colorida por tipo e botão ↗ |
| Indicadores | `.numeros-atividade`, `.resumo-pntp` | Cartão branco com faixa colorida de 4 px no topo e número grande na cor do grupo |
| Organograma | `.est-arvore` | Órgão em caixa marinho; unidades em caixas brancas ligadas por linhas; 1º nível com borda verde |
| Declaração "não há" e link externo | `.declaracao-atual`, `.caixa-externa` | Faixa lateral de 5 px (âmbar ou azul), cantos 14 |
| Aviso do topo | `.aviso-informativo`, `-importante`, `-urgente` | Faixa inteira com ícone, texto e ação; pode fechar |

**Comportamentos padrão**

- Entrada suave dos blocos ao rolar (`.revelar` → `.visto`), desligada com "reduzir movimento", alto contraste, impressão e no Kit de evidências; libera tudo após 4 s.
- Carrosséis (banner e gestores) pausam ao passar o mouse ou focar, têm botão de pausa e não andam com "reduzir movimento". Itens fora da tela ficam `inert`.
- Títulos vindos em CAIXA ALTA aparecem em formato normal só na exibição (`S.semCaixaAlta`), preservando siglas e o nome do município.
- Fundo das seções alterna branco e cinza-azulado (`.secao-cinza`) para dar ritmo.
- Página com um só destino externo abre direto; com vários, mostra o quadro "Onde consultar".

## 4. Padrões do painel

O painel é ferramenta de trabalho: tem a identidade da SOFT+ GOV (e não a do órgão), sem animações de entrada, e reaproveita as cores de situação e o acabamento do site. Tudo fica em `painel/estilos.css` e no núcleo `painel/app.js`, exposto como `window.PNTP` (no código, `P`).

**Identidade**

| Token | Valor | Uso |
| --- | --- | --- |
| `--brand` / `--brand-escuro` | `#0d4fc4` / `#0a3d99` | Botão principal, links, foco das abas |
| Lateral | `#0f2947`, itens `#d2deeb`, ativo `#24497a` | Menu lateral fixo de 256 px |
| `--text` / `--text-dim` / `--line` / `--ink` | `#0f2947` / `#5c7692` / `#d7e4f0` / `#eef4fb` | Texto, secundário, bordas, fundo da área de trabalho |
| `--green` / `--red` / `--amber` | `#16875a` / `#c73f3f` / `#b3790f` | Situação (atende, erro, pendência) |
| `--acento` | `#0a9668` | Traço dos títulos, foco verde dos campos |
| Fontes | Inter (texto), Source Serif 4 (títulos H1/H2), IBM Plex Mono (números, versão, contadores) | — |

**Estrutura das telas**

- Lateral escura com marca, pesquisa no menu, "Início" e grupos (CONTEÚDO DO SITE, TRANSPARÊNCIA, ATENDIMENTO, CONTROLE INTERNO, CONFIGURAÇÕES…). Cada grupo tem cor própria no filete e nos marcadores; o item aberto ganha barra lateral na cor do grupo. Versão no rodapé da lateral.
- Topo da área de trabalho: nome do órgão + perfil do usuário, botões "Trocar órgão", "Ver site" e "Sair".
- Cada módulo: `cabecalho-modulo` com título (traço verde acima), subtítulo e botão principal à direita ("+ Novo…"); depois o aviso amarelo de situação no PNTP, as abas e a lista.
- Abas no estilo **guia de navegador** (regra fixa do projeto): a aberta "cobre" a linha de baixo, filete de 3 px em cima, contador em `aba-qtd`. Nunca abas em forma de botão ou pílula. Janela com mais de um assunto = abas (`P.abas`).
- Abas do painel seguem as abas da página correspondente do site (mesmos nomes e ordem).
- Cartões raio 14 com sombra leve; título do cartão com filete verde à esquerda. Indicadores com faixa colorida de 4 px no topo.
- Tabelas em caixa raio 14, cabeçalho `#eef4fb`, ações alinhadas à direita (`td.acoes`), paginação numerada.
- Avisos amarelos padronizados em todas as telas para o que falta (com link "Corrigir" que abre a aba certa).

**Funções do núcleo para reaproveitar**

| Função | Para quê |
| --- | --- |
| `P.el(tag, atributos, ...filhos)` | Cria elementos sem HTML em texto (seguro) |
| `P.abas(itens, inicial)` | Abas de janela/módulo; 5º item da aba marca destino externo |
| `P.campo(id, rótulo, controle, ajuda)` + `P.erroCampo(id, texto)` | Campo com rótulo, ajuda e mensagem de erro (`id-erro`), abre a aba do campo com erro |
| `P.abrirDialogo`, `P.confirmar(título, texto, botão, perigo)`, `P.aviso` | Janelas e confirmações (exclusão sempre confirmada) |
| `P.toast(msg, erro)`, `P.msg`, `P.ocupado(botão, texto)` | Retorno rápido, mensagens fixas e botão "Gravando…" |
| `P.paginar`, `P.contar` | Listas paginadas (cursor ou número de página) |
| `P.gravarRegistro`, `P.excluirComPecas(tabela, id)` | Gravação padrão e exclusão junto com as peças internas (apaga arquivos) |
| `P.enviarArquivo`, `P.apagarArquivo`, `P.reduzirImagem`, `P.validarPdf` | Arquivos num ponto único; imagens reduzidas no navegador |
| `P.cpfValido`, `P.cnpjValido`, `P.formatarDoc`, `P.mascaraDoc` | Validação e máscara de CPF/CNPJ |
| `P.declaracoes(chave, opções)` | Bloco "Declarar que não há dados" (seção 9) |
| `P.externo`, `P.avisoExterno` | Parte com link externo: desativa o cadastro manual e mostra o aviso |
| `P.mesclarConfiguracoes(valores, órgão)` | Grava só as configurações alteradas |
| `P.editorTexto`, `P.renderTexto` | Editor e exibição da marcação simples |
| `P.loteDePdfs(opções)` | Envio em lote: botão contornado "Enviar vários PDFs" ao lado do "+ Novo…"; janela larga com zona para vários arquivos, leitura um por um e tabela de conferência editável (células lidas em verde; etiqueta por linha: Lido / Confira / Falta / Já cadastrado / Salvo); grava linha por linha como rascunho ou publicado (ou só "Salvar os completos" nas telas sem rascunho) |
| `P.copiaNova(registro)`, `P.botaoDuplicar(abrirCópia)` | "Duplicar" nas listas: cópia sem id, número, protocolo, arquivos, links, slug e ligações, sempre como rascunho; abre na mesma janela de cadastro como novo |
| `P.zonaPdf(opções)`, `P.preencherLido`, `P.lerAto` | "Preencher pelo PDF" (`painel/leitor-pdf.js`): zona no topo da janela de inclusão; lê o texto do PDF (ou OCR se escaneado, tudo no navegador) e preenche só os campos que o usuário não mexeu, marcando-os com "Lido do PDF"; digitar à mão continua possível |

**Preencher pelo PDF (padrão para cadastros que nascem de um documento):** a janela "+ Novo…" continua igual e ganha no topo a zona tracejada "Já tem o PDF? Envie primeiro" (ícone redondo âmbar de atos, botão principal "Escolher PDF", arrastar e soltar). Depois da leitura: mensagem verde com o que foi preenchido, amarela com o que faltou e os avisos (já cadastrado, arquivo de outro órgão), campos preenchidos com borda verde e etiqueta "Lido do PDF" (some quando o usuário edita). O PDF lido já vira o documento do registro. Nada é publicado sozinho; CPF nunca vai para campos de texto sugeridos. Nos módulos que usam o formulário comum (`P.setor.formulario`), basta passar `lerPdf: { titulo, texto, aoLer(arquivo, lido, api) }`; `api.preencher(campo, valor, rótulo, relatório)` só mexe no que o usuário não tocou e `api.anexar(campo, arquivo)` põe o PDF no campo. Campo `t: 'pdfurl'`: PDF enviado ou link, gravados na mesma coluna (ex.: `diarias.ato_url`).

**Cadastrar em sequência:** toda janela aberta por um botão "+ …" ganha no rodapé, à esquerda, a caixa "Incluir outro ao salvar" (feita no `P.abrirDialogo`, vale sozinha para todas as telas). Marcada, a janela reabre em branco depois de salvar (fechar, Cancelar e Esc não contam) e fica marcada na sessão. Nas listas, "Duplicar" fica ao lado de "Editar", com a mesma permissão; não vale para usuários, órgãos, menu, unidades e gestores, vereadores, comissões e listas de espera.

**Mensagens e textos:** frases curtas, em linguagem do usuário ("Seu perfil não pode excluir esta declaração."), sem jargão técnico; erros do banco traduzidos por `P.traduzirErro` / `P.erroGravacao`. Terminologia jurídica: "contratado", não "fornecedor".

## 5. Acessibilidade, responsividade, alto contraste e impressão

Todo app público segue o e-MAG e a WCAG AA; os itens abaixo são genéricos e valem para qualquer finalidade.

- **Atalhos e-MAG** na barra do topo: Alt+1 conteúdo, Alt+2 menu, Alt+3 busca, Alt+4 rodapé; link "Pular para o conteúdo" no painel.
- **Ferramentas:** Alto contraste (`html.contraste`: fundo preto, texto branco, links e foco amarelos `#ffe600`), tamanho do texto A+ / A / A−, página de Acessibilidade e Mapa do site, VLibras (Libras, governo federal).
- **Contraste mínimo:** 4,5:1 para texto (o verde com texto branco usa `#06704d`, cerca de 6:1; o botão amarelo com texto marinho, cerca de 9:1).
- **Foco visível:** contorno amarelo `#f2b33d` de 3 px em tudo que recebe foco; dentro das abas, contorno interno.
- **Abas acessíveis:** `role=tablist/tab/tabpanel`, setas ← →, Home e End trocam de aba; só a aba aberta recebe Tab.
- **Imagens:** `alt` descritivo nas fotos ("Foto de Fulano"); ícones decorativos com `aria-hidden`; textos só para leitor de tela com a classe `.sr`.
- **Links que abrem nova aba** avisam "(abre em nova aba)" em texto escondido e mostram ↗.
- **Movimento:** com `prefers-reduced-motion`, nada anima (carrosséis param, entrada suave desliga).
- **Pontos de quebra:** 420 px (grades viram 1 coluna), 600 px (celular: menos margem, atalhos com ícone em cima, tabelas viram cartões), 760 px (faixas e listas em coluna), 960 px (menu vira botão "Menu", botão da Transparência desce para linha própria), 1180 px (topo completo numa linha).
- **Impressão:** esconde barra, menu, busca, botões, rodapé e VLibras; mostra todo o conteúdo sem animação.
- **Dados pessoais na tela:** CPF sempre mascarado no site (`***.456.789-**`); listas de espera identificadas só por protocolo (LGPD/ECA).

## 6. Usuários, perfis e permissões (genérico)

A permissão é sempre **perfil (o que pode fazer) × módulo (onde)**, com quatro ações: ver, editar, publicar e excluir. Um usuário pode atender vários órgãos, com um vínculo (órgão + perfil + alcance) para cada um.

**Perfis padrão (criados para todo órgão, editáveis pelo Suporte SOFT+)**

| Perfil | Descrição |
| --- | --- |
| Administrador do órgão | Acesso total, inclusive usuários e aparência |
| Gestor de conteúdo | Revisa e publica o que os cadastradores enviam |
| Cadastrador setorial | Cria rascunhos só no seu setor; não publica |
| Comunicação | Notícias, banners, avisos e páginas |
| Atendimento (SIC e Ouvidoria) | Responde pedidos e manifestações |
| Controle interno | Vê tudo e emite relatórios; não altera |
| Suporte SOFT+ (marca, não perfil) | Equipe da SOFT+: cadastra órgãos, edita perfis do sistema, vê todos os órgãos, menos os de teste |
| Desenvolvedor (marca, não perfil) | Quem desenvolve o sistema: tudo do Suporte, mais os órgãos de teste e dar/tirar a marca Suporte SOFT+. Só muda pelo SQL Editor |

Um vínculo pode ter perfis adicionais (`perfis_extras`); as permissões se somam.

**Criação de usuário (padrão atual)**

1. Quem tem a permissão "Usuários" (padrão: Administrador e Suporte) abre a página única de usuários, que lista as pessoas de todos os órgãos que ele administra.
2. Informa nome, e-mail, senha inicial e os vínculos (órgão, perfil, alcance). Sem convite: a função `convidar-usuario` (Edge Function, chave secreta só no servidor) cria o login já confirmado.
3. No primeiro acesso, o painel exige que a pessoa troque a senha.
4. Modo antigo ainda aceito: link de acesso (para copiar ou mandar no WhatsApp) ou e-mail automático (precisa de SMTP próprio).

**Regras e travas (todas no banco)**

- O órgão nunca fica sem administrador ativo.
- Ninguém altera o próprio acesso (perfil, alcance, desativar).
- Ninguém dá a outro um perfil com mais poderes do que o seu ("trava de perfil maior"). Quem só tem "editar usuários" não dá mais poder do que tem.
- Só administrador do órgão cria perfis, mexe em permissões e dá o perfil de administrador.
- **Alcance setorial:** usuário limitado a uma unidade só vê e altera o que é dela; gestor de usuários setorial só dá acesso à própria unidade. Itens do órgão todo (banner, aviso, página, menu) não são alteráveis por alcance setorial.
- Administrador vê só os usuários dos órgãos que administra e nunca os vínculos da pessoa com outros órgãos. Cadastrador não acessa a página.
- Link de acesso entregue na mão só para quem nunca criou senha e não atende outro órgão; nos demais casos, só por e-mail.
- Quem já entrou no painel é desativado, nunca apagado (o histórico fica completo).
- E-mail de usuário e a marca Desenvolvedor só mudam pelo SQL Editor. A marca Suporte SOFT+ só muda pelo painel pelo Desenvolvedor, ninguém muda a própria e sempre sobra pelo menos um.
- **Órgão de teste** (`orgaos.somente_desenvolvedor`): invisível para todos, menos para o Desenvolvedor — some da lista de órgãos, das permissões (`orgao_liberado` dentro de `e_membro`, `tem_permissao`, `no_alcance`), da API (política RESTRICTIVE) e do site público; o site só o abre no navegador em que o Desenvolvedor entrou no painel, e mesmo assim lê só o publicado.

## 7. Criação de órgãos (entes) e configurações padrão (genérico)

O cliente (órgão, empresa, igreja…) é um registro na tabela `orgaos`, criado só pelo Suporte SOFT+ no módulo "Órgãos da plataforma". O mesmo modelo serve para qualquer app com vários clientes.

**Campos do cadastro:** nome, sigla, tipo (prefeitura, câmara, RPPS, consórcio, autarquia, outro), CNPJ (conferido), município, UF, domínio, órgão pai (subsite) e `configuracoes` (JSON).

**O que `criar_orgao` faz de uma vez**

1. Confere se quem pede é Suporte SOFT+ ("Só o Suporte SOFT+ cadastra órgãos").
2. Confere o CNPJ e grava o órgão com a identidade inicial (nome de exibição, cor padrão).
3. Cria o **menu padrão próprio do tipo** (`criar_menu_padrao`): prefeitura, câmara e consórcio têm menus diferentes. O módulo do tipo só aparece para o tipo certo.
4. A lista `orgaos_plataforma` mostra as pendências de cada órgão (sem administrador, sem brasão, sem domínio…).

**Depois de criar:** abrir o órgão, cadastrar o administrador em Usuários e permissões e seguir as pendências do Início. Desativar o órgão tira site e painel do ar de uma vez. Um órgão com subsites não pode virar subsite de outro (`alterar_orgao`).

**Configurações padrão de um órgão novo**

| Configuração | Padrão | Onde muda |
| --- | --- | --- |
| Cor principal | `#0d4fc4` (o marinho, o tom e os fundos são calculados dela) | Aparência › Identidade |
| Brasão, ícone, nome de exibição | Nome do cadastro; sem brasão, só o nome | Aparência › Identidade |
| Contatos e redes | Vazios (redes só aparecem se preenchidas) | Aparência › Contatos e redes |
| Selos | Nenhum (sem selos e redes, a faixa some) | Aparência › Selos e Radar |
| Faixa do Radar | "Faixa desenhada (padrão)"; link = painel geral do Radar | Aparência › Selos e Radar |
| Destinos das páginas | Todas as páginas do próprio portal | Aparência › Destinos das páginas |
| Páginas ocultas | Nenhuma | Aparência › Destinos |
| Menu | Menu padrão do tipo | Menu do site |
| Perfis | Os 6 perfis padrão | Usuários e permissões › Perfis |
| Arquivos | Limite de 200 MB por arquivo | Storage (plano Pro) |

**Site do órgão novo:** abre em `https://portal-pntp.pages.dev/site/?orgao=CNPJ` até o domínio próprio ser apontado (Cloudflare aceita vários domínios). Aponte o domínio só depois da migração do site antigo.

## 8. Regras de dados: publicação, histórico, exclusão e segurança (genérico)

As regras de dados ficam no PostgreSQL (gatilhos e políticas RLS), para valerem em qualquer tela, importação ou integração.

**Segurança (scripts 01, 03, 06)**

- RLS ligado em todas as tabelas; "Automatically expose new tables" desligada; cada tabela só aparece na API com `grant` explícito.
- Leitura pública só do que está publicado (`situacao = 'publicado'`); o membro do órgão vê também os rascunhos (`e_membro(orgao_id)`).
- Inclusão, edição e exclusão exigem `tem_permissao(orgao, módulo, ação)` e `no_alcance(orgao, unidade)`.
- Tabelas "filhas" herdam a leitura da tabela mãe e um gatilho confere que filho e mãe são do mesmo órgão.
- Funções que precisam de chave secreta (criar login, chamar sistemas externos) rodam em Edge Functions, nunca no navegador.
- Coluna com CPF inteiro fechada para o público; o site lê só a versão mascarada e um resumo para busca.

**Rascunho → publicado (gatilho `controlar_publicacao`)**

- Quem só tem "editar" cria e altera rascunhos. Publicar, tirar do ar ou mexer no que já está publicado exige "publicar".
- O gatilho não usa `security definer` de propósito: precisa enxergar o papel real de quem grava.
- Data futura = agendado (o site só mostra quando a data chega, sem tarefa agendada).
- Dados contábeis e de folha não têm rascunho: entram no ar ao salvar.

**Histórico (`registrar_historico`)**

- Toda inclusão, edição e exclusão é gravada na tabela `historico` por gatilho no próprio banco.
- `marcar_atualizacao` mantém `atualizado_em` e quem alterou. Tabelas com dados pessoais guardam só quais campos mudaram.
- Importação de lista grande grava uma linha por importação, não uma por registro.

**Exclusão de dados vinculados (scripts 26 e 37)**

- **Nenhum registro ligado a outro pode ser excluído.** As chaves estrangeiras usam `on delete no action`; o banco recusa e o painel explica o motivo. Exemplos: unidade com gestores, subunidades, notícias, publicações ou usuários; notícia usada em banner; edital de seleção publicada; página que está no menu; item de menu com subitens; publicação indicada como norma.
- Exceções que apagam junto (cascade): só o que depende do próprio órgão, o login da pessoa e as **peças internas** de um registro.
- Peças internas (documentos, aditivos, fiscais, medições, autores, presenças…) saem junto pela função `excluir_com_pecas(tabela, id)`, que devolve os arquivos para o painel apagar do armazenamento. Só aceita tabelas de uma lista permitida.
- Toda exclusão passa por confirmação com o nome do item e o aviso de que sai do site.
- Quem já entrou no painel e o órgão são **desativados**, nunca apagados.

**Outras regras genéricas**

- Busca sem acento: função `normalizar_texto` + coluna `busca` com índice.
- Listas paginadas no banco (cursor ou número de página); cada coluna exibida numa listagem pública vira filtro.
- Exportação padrão em CSV, JSON, XML, XLSX, PDF e Imprimir, sempre seguindo os filtros da tela.
- Totais calculados pelo banco a partir dos movimentos, com travas de coerência.
- Funções de consulta pesadas: preferir uma função por item (ex.: `atividade_vereador`) a uma que calcula todos e filtra, e criar índice pela coluna de busca (evita estouro de tempo).

**Vários clientes donos dos dados num mesmo schema (padrão da Gestão de Consórcio 0.12.0)**

- Quando um app atende vários clientes num schema próprio (ex.: `consorcio`), cada tabela tem `consorcio_id` (ou o id do cliente) e uma política RESTRICTIVE `isolar_<cliente>` comparando com uma função `atual()`, que lê o cliente escolhido na sessão, depois o salvo no usuário, depois o primeiro vínculo.
- Usuário em vários clientes: tabela de vínculo (usuário, cliente, perfil, ativo); escolhe no login e troca pelo topo ("Trocar consórcio"). Só o Suporte SOFT+ cria clientes.
- Funções `security definer` pertencem a um papel dono próprio (sem bypass de RLS), para continuarem presas ao cliente; ficam com postgres só as de permissão, as que resolvem o cliente e as cascas públicas.
- Acesso público: casca que fixa o cliente pela sigla do link (`?c=SIGLA`), pela IRP ou pelo protocolo e chama a função `_base`. Links sem sigla abrem o primeiro cliente, para não quebrar links antigos.
- Números e documentos únicos (ofício, IRP, CNPJ) são únicos por cliente; configurações têm uma linha por cliente.
- Migração: cópia de segurança num schema `<schema>_bkp_NN`, teste completo numa transação que se desfaz (cria um cliente de teste e confere o isolamento) e só então a execução real.

**Integração Gestão de Consórcio ↔ Portal (0.48.0)**

- Por item (entes, gestores, documentos, identidade com redes): item ligado é cadastrado só na Gestão e chega ao Portal já publicado; no Portal fica só para consulta, com o aviso "Controlado pela Gestão de Consórcio", e o "Corrigir" da autoavaliação abre a Gestão. Item desligado: cada sistema cadastra o seu. Integrações começam desligadas.

## 9. Configurações por órgão e recursos específicos da transparência

A tela Aparência é genérica; destinos externos, declarações, autoavaliação e Kit de evidências são próprios de portais públicos, mas a ideia pode ser adaptada.

**Aparência (genérico)** — abas: Identidade, Contatos e redes, Destinos das páginas, Diário Oficial e sistemas, Selos e Radar ("Faixa desenhada (padrão)" ou "Imagem oficial"; link do Radar). Tudo grava em `orgaos.configuracoes` por `mesclar_configuracoes`; imagens trocadas são apagadas do armazenamento.

**Destinos externos (específico, adaptável)**

- Todo direcionamento para sistema de outra empresa fica num lugar só (Aparência › Destinos das páginas), por chave de página ou parte.
- Com link externo, o cadastro manual da parte fica desativado no painel; os dados já cadastrados ficam guardados.
- Cada página aceita "outros endereços" com explicação (mínimo 10 letras) e os exercícios que cobrem; contam na série histórica.
- O banco confere todo dia se cada endereço responde; 2 falhas seguidas geram aviso no Início.
- Uma página pode ser ocultada do site (responde como inexistente).

**Declarar que não há dados (específico, 62 itens do PNTP)**

- Vale para a situação atual (substitui a lista no site) ou para um período: mês, bimestre, trimestre, quadrimestre, semestre, ano ou datas (`declaracoes_inexistencia`).
- Texto sugerido por item e período (`DECLARACOES_PNTP` em `site/destinos.js`), editável.
- No painel (`P.declaracoes`): faixa âmbar com a situação à vista, períodos em etiquetas coloridas por tipo, atalhos "Ano atual / Ano anterior / Mês passado / Situação atual", botão principal "Registrar declaração" e prévia "Como aparece no site".
- No site: o ano declarado vira aba com a declaração no lugar da lista; períodos sem abas aparecem em "Períodos sem ocorrência".
- A declaração conta para atualidade e série histórica na autoavaliação e não gera aviso de prazo.

**Autoavaliação e Kit de evidências (específico)**

- `avaliacao_pntp(órgão)` calcula cada critério, o índice estimado e o nível; o Início mostra o que falta com "Corrigir" que abre a aba exata.
- Série histórica segue a cartilha 2026: atualidade = último exercício encerrado; nos itens 11.1 a 11.4, se o mais recente é 2025, a série é 2024, 2023 e 2022.
- O Kit de evidências gera prints marcados (modo `?evidencia=1`), tabela única em Excel/Word e ZIP com uma pasta de prints por item.

**Ideia reaproveitável:** "avaliação automática no banco + lista do que falta com botão Corrigir" serve para qualquer checklist de conformidade.

## 10. Fluxo de trabalho, versões e implantação (genérico)

Toda mudança passa por sugestão → prévia → aval → publicação; nada vai para o ar sem a aprovação do dono do produto.

1. **Sugestão:** descrever o que vai mudar, item por item, numerado para aprovação.
2. **Prévia sem publicar:** aplicar o visual por cima do site real só no navegador de quem revisa, ou publicar num ramo de teste do Git (ex.: `redesenho-046`), servido em `https://<ramo>.portal-pntp.pages.dev`.
2a. **Homologação (desde 0.50.0):** com usuários usando o sistema, todas as alterações se acumulam no ramo `homologacao` (`https://homologacao.portal-pntp.pages.dev`) e só vão para o `main` quando o dono autoriza. O banco é o mesmo: conferir no órgão de teste ("Câmara Municipal de Teste SOFT+ (homologação)"), nunca num órgão real. Scripts que só acrescentam podem rodar antes; scripts que mudam o comportamento do que está no ar rodam só no dia da publicação.
3. **Aval e publicação:** enviar o ramo para `main`; a Cloudflare publica em cerca de 1 minuto.
4. **Versão:** subir o número em `painel/versao.json` e escrever as notas em linguagem do usuário, a mais nova primeiro.
5. **Logo e ícones:** quando a logo mudar, os arquivos de ícone ganham **nome novo** (ex.: `softgov-icone-192.png` → `softgov-icone-v2-192.png`) e o `manifest.json`, o `favicon` e o `apple-touch-icon` passam a apontar para eles; os antigos ficam no servidor. Com o mesmo nome, o Chrome/Edge não percebe a troca e o app instalado (Windows, celular) continua com o ícone velho.
6. **Manual:** atualizar este manual (documento e `docs/PADROES.md`) e o histórico abaixo quando a entrega mudar algum padrão.
7. **Banco:** mudança de banco vira um script novo numerado (`supabase/NN_assunto.sql`), que pode rodar mais de uma vez, com cabeçalho explicando. A tela continua funcionando se o script ainda não foi rodado.
8. **Conferência:** computador (1366 px) e celular (375 px), em pelo menos dois tipos de cliente, e alto contraste.
9. **Varredura de conformidade** a cada entrega (no PNTP: Cartilha e Matriz do ano).

**Implantação de um projeto novo na Supabase**

- Criar o projeto na região São Paulo; desligar "Automatically expose new tables".
- Rodar os scripts em ordem no SQL Editor; nunca rodar `teste_*.sql` no projeto real.
- Edge Functions pelo editor, com "Verify JWT" desligado (a função confere o login sozinha).
- SMTP próprio (Brevo); "Email OTP Expiration" = 86400; URL do site em Authentication › URL Configuration.
- Tarefas agendadas com `pg_cron` e chaves no cofre (`vault`).

## 11. Checklist para um novo app no mesmo padrão

**Reaproveitar como está (genérico)**

- [ ] Estrutura de pastas `site/`, `painel/`, `supabase/` e o `versao.json` com `?v=` nos arquivos
- [ ] Tabelas e funções de órgãos/clientes (`orgaos`, `criar_orgao`, menu padrão por tipo, `mesclar_configuracoes`)
- [ ] Usuários, perfis × módulos, alcance, travas e a função `convidar-usuario`
- [ ] Gatilhos `controlar_publicacao`, `registrar_historico`, `marcar_atualizacao` e a exclusão protegida (`no action` + `excluir_com_pecas`)
- [ ] RLS com leitura pública só do publicado e permissão por `tem_permissao` / `no_alcance`
- [ ] Tokens de cor derivados da cor do cliente (`--navy`, `--navy-2`, `--tom`) e o acento verde
- [ ] Componentes do site (topo, menu, faixas de destaque, abas, cartões, tabelas, filtros, paginação, etiquetas, cartões de pessoa)
- [ ] Núcleo do painel (`P.el`, `P.abas`, `P.campo`, diálogos, toasts, paginação, arquivos, validação de CPF/CNPJ)
- [ ] Acessibilidade: atalhos e-MAG, alto contraste, A+/A−, VLibras, foco amarelo, reduzir movimento
- [ ] Fluxo sugestão → prévia → aval → publicação, ramos de teste e scripts numerados

**Adaptar ao novo domínio**

- [ ] Tipos de cliente e o menu padrão de cada um
- [ ] Lista de módulos e perfis padrão com as permissões de cada um
- [ ] Cores por grupo dos atalhos e do menu lateral conforme os grupos do novo app
- [ ] Checklist de conformidade próprio, se houver
- [ ] Textos legais e de privacidade (LGPD) do novo contexto

**Deixar de fora se não for portal público**

- [ ] Autoavaliação PNTP, Kit de evidências e Radar da Transparência
- [ ] Declarações de "não há dados" e destinos externos (a menos que o novo app também publique dados obrigatórios)
- [ ] e-SIC/Ouvidoria e prazos da LAI

## Códigos de referência (copiar e adaptar)

Trechos reais do SOFT+ GOV (kennedyd1988/portal-pntp), prontos para servir de ponto de partida num app novo. Troque nomes de tabela/módulo; mantenha a lógica.

### A. Carregador com controle de versão (index.html do painel e do site)

```html
<style>html:not(.estilo-ok) body{visibility:hidden}</style>
<script>
  setTimeout(function () { document.documentElement.classList.add('estilo-ok'); }, 6000); // nunca trava
  (function () {
    function lembrada() { try { return localStorage.getItem('app_versao') || '0'; } catch (e) { return '0'; } }
    fetch('versao.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { versao: lembrada(), notas: [] }; })
      .then(function (v) {
        window.VERSAO_APP = v.versao; window.NOTAS_VERSAO = v.notas || [];
        try { localStorage.setItem('app_versao', v.versao); } catch (e) {}
        var q = '?v=' + encodeURIComponent(v.versao);
        var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'estilos.css' + q;
        css.onload = css.onerror = function () { document.documentElement.classList.add('estilo-ok'); };
        document.head.appendChild(css);
        ['config.js', 'app.js', 'modulo-exemplo.js'].reduce(function (ant, arq) {
          return ant.then(function () { return new Promise(function (ok, erro) {
            var s = document.createElement('script'); s.src = arq + q; s.onload = ok; s.onerror = erro; document.body.appendChild(s);
          }); });
        }, Promise.resolve()).then(function () { window.APP.iniciar(); });
      });
  })();
</script>
```

`versao.json`:

```json
{ "versao": "1.0.0", "data": "2026-11-18", "notas": ["O que mudou, na linguagem do usuário (mais nova primeiro)."] }
```

### B. Tokens de cor do site (a cor do cliente gera o resto)

```css
:root {
  --cor: #0d4fc4;                                            /* vem de Aparência (por cliente) */
  --navy: color-mix(in srgb, var(--cor) 42%, #061629);
  --navy-2: color-mix(in srgb, var(--cor) 58%, #061629);
  --tom: color-mix(in srgb, var(--cor) 7%, #fff);
  --acento: #0a9668; --acento-escuro: #06704d; --acento-claro: #e7f6ef; --acento-texto: #066a4a;
  --texto: #1a2433; --texto-suave: #536173; --linha: #dde5ee; --fundo: #f5f8fb;
}
.limite { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
.barra-acess, .menu, .rodape { background: var(--navy); }
```

JS que aplica a cor do cliente (site):

```js
document.documentElement.style.setProperty('--cor', cfg.cor || '#0d4fc4');
```

### C. Botão principal (amarelo-ouro, contraste ~9:1) e título com traço verde

```css
.btn-principal { background: linear-gradient(180deg,#ffc94d 0%,#f4b223 100%); color: var(--navy) !important;
  border: 1px solid #e2a114; border-radius: 10px; padding: 11px 16px; font-weight: 800;
  box-shadow: 0 6px 16px rgba(226,161,20,.30), inset 0 1px 0 rgba(255,255,255,.45); }
.btn-principal:hover { background: var(--navy); border-color: var(--navy); color: #fff !important; }
.pagina > h1 { color: var(--navy); font-size: clamp(1.7rem,3.2vw,2.15rem); letter-spacing: -.035em; }
.pagina > h1::before, .secao-titulo h2::before { content: ""; display: block; width: 40px; height: 4px;
  margin: 0 0 14px; border-radius: 99px; background: var(--acento); }
```

### D. Abas (formato de aba; aberta em marinho com filete verde)

```css
.abas-guia { display: flex; gap: 4px; border-bottom: 2px solid var(--navy); padding: 6px 4px 0; }
.aba-guia { position: relative; height: 42px; padding: 0 20px; border: 1px solid #d9e2eb; border-bottom: 0;
  border-radius: 12px 12px 0 0; background: #edf2f7; color: var(--texto-suave); font-weight: 600; cursor: pointer; }
.aba-guia:hover { background: #fff; color: var(--navy); }
.aba-guia[aria-selected="true"] { height: 46px; background: var(--navy); border-color: var(--navy); color: #fff; }
.aba-guia[aria-selected="true"]::after { content: ""; position: absolute; left: 14px; right: 14px; top: 5px;
  height: 3px; border-radius: 99px; background: var(--acento); }
.painel-guia { background: #fff; border: 1px solid #e3eaf1; border-top: 0; border-radius: 0 0 16px 16px; padding: 18px; }
```

Abas acessíveis (setas, Home, End):

```js
function faixaAbas(itens, atual, rotulo, aoTrocar) {
  const lista = el('div', { class: 'abas-guia', role: 'tablist', 'aria-label': rotulo });
  const botoes = itens.map(([id, texto]) => el('button', { type: 'button', role: 'tab', class: 'aba-guia',
    'aria-selected': String(id === atual), tabindex: id === atual ? '0' : '-1', onclick: () => abrir(id) }, texto));
  function abrir(id) { botoes.forEach((b, i) => { const s = itens[i][0] === id; b.setAttribute('aria-selected', String(s)); b.tabIndex = s ? 0 : -1; if (s) b.focus(); }); aoTrocar(id); }
  lista.addEventListener('keydown', (e) => {
    const i = botoes.indexOf(document.activeElement); if (i < 0) return;
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: botoes.length - 1 }[e.key];
    if (n === undefined) return; e.preventDefault(); abrir(itens[(n + botoes.length) % botoes.length][0]);
  });
  lista.append(...botoes); return { lista, abrir };
}
```

### E. Cartões com cor por grupo, cartão de pessoa com aro, indicadores

```css
.cartao { background: #fff; border: 1px solid #e5ebf1; border-radius: 14px; transition: transform .18s, box-shadow .18s; }
a.cartao:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(15,39,64,.10); }
.cartao[data-grupo] { --g: #1d5fd1; }
.cartao[data-grupo="contratacoes"] { --g: #6a4fc9; } .cartao[data-grupo="servicos"] { --g: #0a8a62; }
.cartao[data-grupo="atos"] { --g: #b26d06; } .cartao[data-grupo="atendimento"] { --g: #c2416b; }
.icone { width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center;
  background: color-mix(in srgb, var(--g) 12%, #fff); color: var(--g); }
a.cartao:hover .icone { background: var(--g); color: #fff; }
.foto-pessoa { width: 104px; height: 104px; border-radius: 50%; object-fit: cover;
  border: 3px solid #fff; box-shadow: 0 0 0 3px var(--cor), 0 8px 18px rgba(6,22,41,.14); }
.cargo { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--acento-escuro); }
.indicador { --k: #1d5fd1; background: #fff; border: 1px solid #e3eaf1; border-top: 4px solid var(--k); border-radius: 14px; padding: 14px 16px; }
.indicador strong { color: var(--k); font-size: 1.7rem; }
```

### F. Faixa de destaque (marinho com círculo decorativo)

```css
.faixa-destaque { position: relative; overflow: hidden; color: #fff; border-radius: 18px; padding: 22px 28px;
  background: linear-gradient(115deg, var(--navy) 0%, var(--navy-2) 100%); box-shadow: 0 12px 28px rgba(6,22,41,.12); }
.faixa-destaque::after { content: ""; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px;
  border-radius: 50%; border: 28px solid rgba(255,255,255,.05); pointer-events: none; }
```

### G. Filtros, tabela, paginação, foco e alto contraste

```css
.filtros { background: #fff; border: 1px solid #e3eaf1; border-radius: 14px; padding: 16px; display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.filtros input, .filtros select { min-height: 44px; border: 1px solid #d6e0ea; border-radius: 10px; padding: 0 12px; }
.filtros input:focus, .filtros select:focus { border-color: var(--acento); outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--acento) 20%, transparent); }
.tabela-caixa { border: 1px solid #e3eaf1; border-radius: 14px; overflow: auto; background: #fff; }
.tabela th { background: var(--tom); color: var(--navy); text-align: left; }
.tabela tbody tr:hover td { background: #f7fafc; }
.pag-botao { min-width: 40px; height: 40px; border-radius: 99px; border: 1px solid #d6e0ea; background: #fff; color: var(--navy); font-weight: 700; }
.pag-botao.pag-atual { background: var(--navy); color: #fff; border-color: var(--navy); }
:focus-visible { outline: 3px solid #f2b33d; outline-offset: 2px; }
html.contraste body { background: #000 !important; color: #fff !important; }
html.contraste a, html.contraste :focus-visible { color: #ffe600 !important; outline-color: #ffe600 !important; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

### H. Núcleo JS do painel/site (criar elementos sem HTML; entrada suave; menu ativo)

```js
function el(tag, attrs, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return e;
}

// Blocos aparecem ao rolar; desligado com reduzir movimento e alto contraste; libera tudo em 4 s.
function entradaSuave(main) {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.classList.contains('contraste')) return;
  const alvos = [...main.querySelectorAll(':scope > section > .limite')];
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); } }), { threshold: 0.05 });
  alvos.forEach((a) => { a.classList.add('revelar'); io.observe(a); });
  setTimeout(() => alvos.forEach((a) => a.classList.add('visto')), 4000);
}
// CSS: .revelar{opacity:0;transform:translateY(18px);transition:.6s} .revelar.visto{opacity:1;transform:none}

// Marca no menu o item da página atual (rota por hash).
function marcarMenuAtual(partes) {
  const atual = '#/' + partes.join('/');
  document.querySelectorAll('#menu-lista > li').forEach((li) => {
    const ok = [...li.querySelectorAll('a')].some((a) => { const h = a.getAttribute('href') || ''; return h === atual || (h.length > 2 && atual.startsWith(h + '/')); });
    li.classList.toggle('ativo', ok);
  });
}
```

### I. Banco: RLS padrão por tabela (leitura pública só do publicado)

```sql
alter table public.exemplo enable row level security;
create policy "exemplo: leitura" on public.exemplo for select to anon, authenticated
  using (situacao = 'publicado' or public.e_membro(orgao_id));
create policy "exemplo: inclusão" on public.exemplo for insert to authenticated
  with check (public.tem_permissao(orgao_id, 'exemplo', 'editar') and public.no_alcance(orgao_id, unidade_id));
create policy "exemplo: edição" on public.exemplo for update to authenticated
  using (public.tem_permissao(orgao_id, 'exemplo', 'editar') and public.no_alcance(orgao_id, unidade_id))
  with check (public.tem_permissao(orgao_id, 'exemplo', 'editar') and public.no_alcance(orgao_id, unidade_id));
create policy "exemplo: exclusão" on public.exemplo for delete to authenticated
  using (public.tem_permissao(orgao_id, 'exemplo', 'excluir') and public.no_alcance(orgao_id, unidade_id));
grant select on public.exemplo to anon;
grant select, insert, update, delete on public.exemplo to authenticated;
```

### J. Banco: rascunho → publicado (sem security definer, de propósito)

```sql
create or replace function public.controlar_publicacao()
returns trigger language plpgsql set search_path = public as $$
declare v_modulo text := tg_argv[0];
begin
  if current_user not in ('anon', 'authenticated') then
    if new.situacao = 'publicado' and new.publicado_em is null then new.publicado_em := now(); end if;
    return new;
  end if;
  if (new.situacao = 'publicado' or (tg_op = 'UPDATE' and old.situacao = 'publicado'))
     and not public.tem_permissao(new.orgao_id, v_modulo, 'publicar') then
    raise exception 'Seu perfil não pode publicar nem alterar o que já está publicado. Salve como rascunho e peça a quem aprova.';
  end if;
  if new.situacao = 'publicado' and new.publicado_em is null then new.publicado_em := now(); end if;
  return new;
end; $$;
create trigger exemplo_publicacao before insert or update on public.exemplo
  for each row execute function public.controlar_publicacao('exemplo');
```

### K. Banco: histórico automático

```sql
create or replace function public.registrar_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  antes  jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  depois jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  base   jsonb := coalesce(depois, antes);
begin
  insert into public.historico (orgao_id, usuario_id, tabela, registro_id, acao, dados_antes, dados_depois)
  values ((base->>'orgao_id')::uuid, auth.uid(), tg_table_name, base->>'id',
          case tg_op when 'INSERT' then 'inserir' when 'UPDATE' then 'editar' else 'excluir' end::public.acao_historico,
          antes, depois);
  return coalesce(new, old);
end; $$;
create trigger exemplo_historico after insert or update or delete on public.exemplo
  for each row execute function public.registrar_historico();
```

### L. Banco: exclusão protegida + peças internas

```sql
-- Ligação a outro registro: nunca apaga junto.
alter table public.exemplo_itens
  add constraint exemplo_itens_mae_fk foreign key (exemplo_id) references public.exemplo(id) on delete no action;

-- Excluir junto só as peças internas (lista fechada), devolvendo os arquivos para o app apagar.
create or replace function public.excluir_com_pecas(p_tabela text, p_id uuid)
returns text[] language plpgsql security invoker set search_path = public as $$
declare pecas text[][]; p text[]; arquivos text[] := '{}'; a text[];
begin
  pecas := case p_tabela
    when 'exemplo' then array[array['exemplo_documentos', 'exemplo_id']]
    else null end;
  if pecas is null then raise exception 'Tabela não permitida: %', p_tabela; end if;
  foreach p slice 1 in array pecas loop
    execute format('select coalesce(array_agg(arquivo_url) filter (where arquivo_url is not null), ''{}'') from public.%I where %I = $1', p[1], p[2])
      into a using p_id;
    arquivos := arquivos || a;
    execute format('delete from public.%I where %I = $1', p[1], p[2]) using p_id;
  end loop;
  execute format('delete from public.%I where id = $1', p_tabela) using p_id;
  return arquivos;
end; $$;
```

### M. Banco: configurações mescladas por cliente

```sql
create or replace function public.mesclar_configuracoes(p_orgao uuid, p_valores jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  if p_valores is null or jsonb_typeof(p_valores) <> 'object' then raise exception 'Configurações inválidas.'; end if;
  update public.orgaos set configuracoes = coalesce(configuracoes, '{}'::jsonb) || p_valores
   where id = p_orgao returning configuracoes into v;
  if v is null then raise exception 'Seu perfil não pode alterar as configurações deste órgão.'; end if;
  return v;
end; $$;
```

### N. Banco: consulta pesada = função por item + índice

```sql
create index if not exists exemplo_itens_pessoa_idx on public.exemplo_itens (pessoa_id);
create or replace function public.resumo_da_pessoa(p_pessoa uuid)
returns table (total bigint) language sql stable security definer set search_path = public as $$
  select count(*) from public.exemplo_itens i join public.exemplo e on e.id = i.exemplo_id
   where i.pessoa_id = p_pessoa and e.situacao = 'publicado';   -- só o publicado
$$;
revoke all on function public.resumo_da_pessoa(uuid) from public;
grant execute on function public.resumo_da_pessoa(uuid) to anon, authenticated;
```

No app: chamar a função nova e, se ela ainda não existir no banco, cair na consulta antiga (o script pode ainda não ter sido rodado).

### O. PWA: manifesto com ícones de nome versionado

```json
{
  "name": "SOFT+ GOV · Portal PNTP", "short_name": "SOFT+ GOV",
  "start_url": "./", "scope": "./", "display": "standalone",
  "background_color": "#eef4fb", "theme_color": "#0d4fc4", "lang": "pt-BR",
  "icons": [
    { "src": "../softgov-icone-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "../softgov-icone-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "../softgov-icone-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Trocou a logo → arquivos com nome novo (`-v2`) e o manifesto apontando para eles.

## Histórico de atualizações

| Data | Versão | O que mudou nos padrões |
| --- | --- | --- |
| 25/11/2026 | 0.51.0 | Marca Desenvolvedor separada do Suporte SOFT+: só ele vê órgãos de teste (`somente_desenvolvedor`, `orgao_liberado`, política RESTRICTIVE) e dá/tira a marca Suporte (seção 6) |
| 25/11/2026 | 0.50.0 | Fluxo de homologação: alterações acumuladas no ramo `homologacao`, conferidas no órgão de teste e publicadas no `main` só com autorização; scripts que mudam o comportamento do que está no ar rodam no dia da publicação (seção 10). Situação derivada de período ("em exercício" pela legislatura, com exceção manual "afastado" e recálculo diário por `pg_cron`) |
| 19/11/2026 | 0.48.0 | Padrão de vários clientes donos dos dados num mesmo schema (isolamento por política RESTRICTIVE, papel dono, cascas públicas com `?c=SIGLA`, migração com cópia e teste desfeito) e integração Gestão de Consórcio ↔ Portal por item (seção 8) |
| 18/11/2026 | 0.47.2 | "Incluir outro ao salvar" em todas as janelas abertas por "+", botão "Duplicar" nas listas (`P.copiaNova`, `P.botaoDuplicar`) e ementa sugerida no formato de ementa e envio em lote de PDFs (`P.loteDePdfs`) em Publicações e Diárias (seção 4) |
| 18/11/2026 | 0.47.1 | "Preencher pelo PDF" no formulário comum (`lerPdf`) e campo `pdfurl` (PDF ou link na mesma coluna); primeiro uso em Diárias (seção 4) |
| 18/11/2026 | 0.47.0 | Novo componente "Preencher pelo PDF" (`P.zonaPdf`, `P.lerAto`) no núcleo do painel; primeiro uso em Publicações oficiais, onde o campo passou a se chamar "Data do ato" (seção 4) |
| 18/11/2026 | 0.46.6 | Códigos de referência (carregador, tokens, componentes, núcleo JS, RLS, gatilhos, exclusão, configurações, PWA) |
| 17/11/2026 | 0.46.6 | Regra de logo e ícones: nome novo nos arquivos a cada troca de logo, para o app instalado atualizar o ícone (seção 10) |
| 17/11/2026 | 0.46.5 | Primeira edição: arquitetura, visual do site e do painel, componentes, acessibilidade, usuários e perfis, criação de órgãos, regras de dados, configurações por órgão, fluxo de trabalho e checklist para novos apps |
