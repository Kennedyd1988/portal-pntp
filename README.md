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
- Todo direcionamento para sistema externo fica num lugar só: Aparência › Destinos das páginas. Saúde,
  educação e renúncias têm ali uma linha por parte (lista de espera, estoque, creches, beneficiários…),
  com a mesma chave da seção do módulo. No módulo fica só o texto da parte e a declaração "não há dados"
  (com a data). Parte com link externo ou "não há" não gera aviso de prazo.
- Página ou parte com link externo em Destinos das páginas fica com o cadastro manual desativado no painel:
  a aba aparece em itálico com ↗ e mostra só o aviso (com o link e o atalho para a Aparência); módulo que é
  uma página inteira (licitações, contratos, obras…) mostra só o aviso. Os dados já cadastrados ficam guardados.
  Regra no núcleo (`P.externo`, 5º item de cada aba em `P.abas`, `DESTINO_MODULO` em `app.js`).
- Declaração de que não há dados vale para todo item do PNTP com lista: situação atual (substitui a lista no
  site) ou período (mês, bimestre, trimestre, quadrimestre, semestre, ano ou datas). No site, o ano declarado vira
  aba própria com a declaração no lugar da lista; com um mês filtrado, aparece a declaração daquele mês; partes
  sem abas de ano mostram "Períodos sem ocorrência". O texto é sugerido por item e período
  (`DECLARACOES_PNTP` em `site/destinos.js`) e pode ser reescrito; depois de editado, a sugestão não o troca.
- Mais de um endereço por página (0.20.0): além do destino principal, cada página aceita "outros endereços"
  (`configuracoes.destinos_links`), cada um com a explicação (mínimo de 10 letras) e os exercícios que cobre (portal
  da empresa anterior, sistema antigo, sistema complementar). Com outros endereços, nenhum botão abre direto um deles:
  vai para a página do portal, que mostra o quadro padrão "Onde consultar" (`S.caixaExterna`) ou, se os dados atuais
  estão no portal, "Períodos anteriores em outros sistemas" abaixo do título. A parte soma os endereços da página
  inteira. Na autoavaliação, os exercícios informados contam na série histórica (`pntp_anos_outros_links`).
- Endereço externo: o portal não lê o conteúdo de sistema de outra empresa (isso fica com o órgão e com o Tribunal);
  confere todo dia se cada endereço responde (pg_net, 05:10/05:25). Respondeu = 200 a 399 ou 401/403/405/429; 404,
  410, 5xx, erro de conexão ou 20 s sem resposta contam falha. Com 2 falhas seguidas o Início avisa. A situação de cada
  endereço aparece em Aparência › Destinos, com o botão "Verificar agora" (uma vez por minuto).
- Órgãos: todos no mesmo banco (um registro em `orgaos`); não existe banco por cliente. O Suporte SOFT+ cadastra pelo
  módulo "Órgãos da plataforma" (`criar_orgao`: CNPJ conferido, identidade inicial e menu padrão); depois abre o órgão,
  convida o administrador e segue as pendências da lista (`orgaos_plataforma`). Desativar o órgão tira site e painel do ar.
- Padrão visual (0.20.0): painel e site usam as mesmas cores de situação (`--info-*`, `--ok-*`, `--falta-*`,
  `--erro-*`) e as mesmas mensagens `.msg-info`, `.msg-ok`, `.msg-falta`, `.msg-erro`; espaços pelas classes
  `.mt-05` a `.mt-4`, `.mb-1` a `.mb-3`, `.pre`, `.bloco`, `.linha-botoes` (nada de `style` solto para espaçamento).
- Abas do painel seguem as abas da página do site quando o módulo corresponde a ela (mesmos nomes e ordem).
- e-SIC e Ouvidoria: o formulário é o do sistema próprio do portal (ligado em "Como pedir" / "Como se manifestar")
  ou o de um sistema externo (link em Destinos, partes "e-SIC: pedidos" e "Ouvidoria: manifestações"). Com link
  externo, a fila fica desativada e os relatórios continuam manuais; ligar o sistema próprio exige tirar o link,
  ter unidade ou setor e, no e-SIC, a autoridade do recurso.
- Sistema próprio: sem cadastro do cidadão; protocolo `SIC-AAAA-000001`/`OUV-AAAA-000001` + código de acesso de 10
  caracteres (mostrado uma vez; o banco guarda só o resumo; 5 erros bloqueiam o protocolo por 15 min). e-SIC exige nome
  e CPF/CNPJ (LAI, art. 10), nunca o motivo; "identidade preservada" é opcional. Ouvidoria: só a denúncia pode ser
  anônima, e recebe protocolo para acompanhar. Limite de 5 envios por hora da mesma origem.
- Prazos pelo banco, em dias corridos, no próximo dia útil se cair em fim de semana, feriado nacional (com a Sexta-feira
  Santa) ou dia cadastrado em "Feriados e dias sem expediente". LAI: 20 + 10 (uma prorrogação, antes do vencimento, com
  justificativa ao cidadão), recurso em 10 dias e decisão em 5, nas duas instâncias; Lei 13.460: 30 + 30. Prazos
  diferentes da norma local em "Contagem dos prazos". Na Ouvidoria o pedido de complemento para o prazo.
- Quem vê o quê: a equipe central (órgão todo + "editar" no módulo) vê a fila inteira, encaminha, prorroga, responde e
  decide recursos; usuário com alcance numa unidade vê só o que foi encaminhado a ela e devolve com a proposta. Os dados
  pessoais ficam em `atendimentos_solicitantes`, sem leitura direta: só a equipe central, pela função
  `atendimento_identificacao`, que grava cada acesso (aba "Acessos"). O histórico dessas tabelas guarda só quais campos
  mudaram. Nada pessoal no site, na lista, no CSV/JSON nem nas estatísticas.
- Relatórios estatísticos do sistema próprio: gerados e publicados pelo banco (mês, trimestre, semestre, ano), todo dia
  e pelo botão "Atualizar agora"; números travados (só observação e PDF mudam). No período da troca, a equipe informa a
  "parte do sistema anterior", que é somada. Período sem registros mostra "Não houve…" no site.
- E-mails do atendimento entram numa fila e só saem com o SMTP próprio ligado; o código de acesso nunca vai por e-mail.
- Bloco "Gestão" da página inicial: todos os gestores, 4 por vez, rolando um cartão por vez e emendando o
  fim no começo; "destaque na capa" só põe o gestor entre os primeiros.
- Faixa do Radar, rodapé e página da Transparência usam o link definido em Aparência › Selos e Radar
  (`radar_url`) ou, em branco, o painel geral do Radar.
- Listas de espera (regulação e creches) nunca levam nome: paciente e criança são identificados pelo
  protocolo (LGPD/ECA). CPF de beneficiário de renúncia ou de incentivo sai mascarado no site
  (***.456.789-**): o visitante não tem permissão de ler a coluna com o CPF inteiro.
- Listas grandes (espera, estoque, creches, beneficiários) entram por importação (colar da planilha ou
  CSV), trocando a lista anterior; o histórico guarda uma linha por importação, não uma por registro.
- Receitas, despesas, ordem cronológica, pessoal e diárias não têm rascunho: entram no ar ao salvar (dado
  contábil e de folha). A importação de arquivos dos sistemas contábil e de pessoal será definida na próxima
  etapa; até lá, digitação e correção pelo painel.
- Empenho: os totais (empenhado, liquidado, pago) e a data do último movimento são mantidos pelo banco a partir
  dos movimentos (reforço, anulação, liquidação, pagamento e estornos). O banco recusa liquidado acima do
  empenhado e pago acima do liquidado. Todo empenho informa o procedimento de origem (ou "Não se aplica").
- CPF/CNPJ de credor, inscrito em dívida ativa, terceirizado e beneficiário de diária: o visitante só lê a
  versão mascarada (CNPJ inteiro, CPF ***.456.789-**) e um resumo para busca; a coluna com o número fica
  fechada para o site. O número da nota/ordem de pagamento (movimentos do empenho) é público.
- Ordem cronológica (art. 141 da Lei 14.133/2021): fila por exercício, categoria (bens, locações, serviços,
  obras) e fonte, na ordem da data de exigibilidade. Pagamento fora da ordem exige a hipótese legal do § 1º e
  a justificativa (mínimo de 20 letras), publicadas junto.
- Páginas com filtro de mês (despesas, remuneração, diárias) abrem no último exercício; "Todos" fica na
  primeira aba. Tabela de cargos e de diárias em vigor mostra "vigente para o exercício de <ano>" (6.3/7.2).

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
| `supabase/18_lote9_obras.sql` | Fase 2 · Lote 9: tabelas `obras`, `obras_itens` (planilha contratada × executada), `obras_medicoes`, `obras_paralisacoes`; situação "paralisada" mantida pelo banco; visão `obras_resumo`; função `obras_anos` |
| `supabase/19_lote10_convenios_emendas.sql` | Fase 2 · Lote 10: módulo `convenios` renomeado para "Convênios e transferências" e módulo novo `emendas` (permissões copiadas); tabelas `convenios` (recebidas, realizadas e acordos sem repasse, inteiro teor obrigatório para publicar) e `emendas` (origem, tipo, forma de repasse, autoria, função de governo, valores previsto/realizado/empenhado/liquidado/pago, ligação opcional ao convênio); funções `convenios_anos` e `emendas_anos` |
| `supabase/teste_convenios_emendas_ficticios.sql` | opcional: 6 instrumentos (recebidos, realizados e acordo) e 8 emendas fictícias de todas as origens |
| `supabase/20_publicacoes_concursos_pendencias.sql` | tipos próprios de publicação (`publicacoes_tipos`, código `x_…`, aba de cada um); módulo `concursos` (permissões copiadas de "pessoal") com `concursos` e `concursos_documentos` (publicar exige o edital; edital de seleção publicada não pode ser excluído) e `concursos_anos`; função `pendencias_atualizacao` (avisos de dados desatualizados do painel) |
| `supabase/21_saude_educacao_renuncias.sql` | módulos `saude`, `educacao` e `renuncias` (o antigo `setoriais` sai, permissões copiadas); `secoes_setoriais` (texto e "não há" por seção; o link externo fica em `configuracoes.destinos`); `documentos_setoriais` (18.1, 19.1); `saude_estabelecimentos` + `saude_profissionais` (18.2), `saude_lista_espera` (18.3), `saude_medicamentos` + `saude_estoques` (18.4/18.5); `conselhos` + `conselhos_membros` + `conselhos_documentos` (18.6, 19.3, 19.4); `creches_espera` (19.2); `renuncias` + `renuncias_valores` + `renuncias_beneficiarios` + `incentivos_projetos` (16.1 a 16.4); visões de posição nas filas; `anos_setoriais`; `importar_lista`; avisos novos em `pendencias_atualizacao` |
| `supabase/22_receitas_despesas_pessoal_diarias.sql` | módulos `financeiro` ("Receitas, despesas e pagamentos"), `pessoal` ("Pessoal e folha de pagamento") e `diarias` (novo, permissões copiadas de pessoal); partes novas em `secoes_setoriais`; `receitas` + `receitas_naturezas` (3.1/3.2), `divida_ativa` (3.3), `despesas` + `despesas_movimentos` (4.1 a 4.3, totais pelo banco), `ordem_cronologica` + visão `ordem_cronologica_posicoes` (9.4), `pessoal_vinculos`, `pessoal_remuneracoes`, `pessoal_cargos`, `pessoal_estagiarios`, `pessoal_terceirizados` (6.1 a 6.5), `diarias` + `diarias_valores` (7.1/7.2); funções `receitas_niveis`, `receitas_mensal`, `despesas_resumo`, `despesas_opcoes`, `anos_financeiros`; avisos `pendencias_financeiras` |
| `supabase/23_declaracoes_inexistencia.sql` | declarações de que não há dados em todo item do PNTP com lista (`modulo_da_parte`: receitas, despesas, ordem cronológica, pessoal, diárias, concursos, convênios, emendas, licitações, PCA, sanções, contratos, fiscais, obras, planejamento por documento, renúncias, saúde, educação): `declaracoes_inexistencia` (situação atual, mês, bimestre, trimestre, quadrimestre, semestre, ano ou datas; o banco calcula início e fim), `secoes_setoriais.sem_ocorrencia` espelhada da declaração atual, migração das antigas, `partes_sem_dados` (avisos de prazo) |
| `supabase/24_esic_ouvidoria.sql` | Fase 3 · Atendimento: módulos `esic` e `ouvidoria` (o antigo `atendimento` sai, permissões copiadas); `atendimento_canais` (unidade e responsável, endereço, telefone, e-mail, horário, formulário eletrônico, instruções, prazos, autoridades e procedimento do recurso, norma da LAI; o `esic_url`/`ouvidoria_url` de Aparência é copiado para cá), `atendimento_relatorios` + `atendimento_relatorios_itens` (12.7 e relatório da ouvidoria: totais, recursos, prazo médio, perfil dos solicitantes, tipos de manifestação, outras distribuições), `informacoes_classificadas` (12.8/12.9, prazo máximo por grau conferido pelo banco); `atendimento_anos`; avisos `pendencias_atendimento`. Antes, rodar de novo o 21 e o 23 |
| `supabase/25_esic_ouvidoria_proprio.sql` | Fase 3 · Atendimento, parte 2: sistema próprio do e-SIC e da Ouvidoria. `atendimento_canais` ganha `sistema_proprio`, prazos em dias, anexos, pesquisa e avisos; o endereço do formulário externo (0.17.0) vai para Destinos (`esic_pedidos`, `ouvidoria_manifestacoes`); `feriados`; `atendimentos` (+ `_segredos`, `_solicitantes`, `_tramites`, `_recursos`, `_anexos`, `_acessos`, `_avaliacoes`, `_emails`, `_envios`, `_numeros`); bucket privado `atendimento`; funções do site (`registrar_atendimento`, `consultar_atendimento`, `recorrer_atendimento`, `complementar_atendimento`, `avaliar_atendimento`, `atendimento_satisfacao`), do painel (`atendimento_acao`, `atendimento_identificacao`, `atendimento_resumo`, `atendimento_emails_situacao`, `gerar_relatorios_atendimento`) e da rotina (`rotina_atendimento`, pg_cron 04:20 e e-mails a cada 15 min); `pendencias_atendimento` com a fila e o 15.6; `plataforma_config` (SMTP, endereço do site). Rodar depois do 24 |
| `supabase/26_vinculos_autoavaliacao_pntp.sql` | Vínculos protegidos: nenhum registro ligado a outro pode ser excluído (as ligações que apagavam junto ou deixavam em branco passam a "no action"; ficam como estavam só as que dependem do órgão, o login da pessoa e peças internas). Autoavaliação automática do PNTP 2026: `pntp_criterios` (96 critérios da prefeitura, classificação, peso da dimensão, itens de verificação, onde corrigir), `avaliacao_pntp(órgão)` (por critério: disponibilidade, atualidade, série histórica, gravação, filtro, nota, situação, externo e o que falta) e `avaliacao_pntp_resumo(órgão)` (índice estimado e nível). Rodar depois do 25; pode repetir |
| `supabase/27_links_externos_orgaos.sql` | Verificação diária dos endereços externos (`links_verificacao`, `verificar_links_externos`/`coletar_links_externos` no pg_cron, `verificar_links_orgao`, `situacao_links_orgao`) e cadastro de órgãos pelo Suporte SOFT+ (módulo `orgaos`, `criar_orgao`, `alterar_orgao`, `criar_menu_padrao`, `orgaos_plataforma`). Rodar o 26 de novo antes (série histórica com outros endereços); pode repetir |
| `supabase/28_usuarios_unificados.sql` | Página única de usuários: órgãos que cada um gerencia, lista unificada sem expor vínculos de outros órgãos, trava de perfil maior, `gerencia_todos_vinculos` para a função `convidar-usuario`. Rodar depois do 27 (e de novo se rodar o 05); pode repetir |
| `supabase/29_perfis_multiplos.sql` | Perfis adicionais por acesso (`perfis_extras`, permissões somadas, travas e gatilhos) e perfis do sistema editáveis pelo Suporte SOFT+. Rodar depois do 28 (e de novo se rodar o 01, 02, 05 ou 28); pode repetir |
| `supabase/teste_apagar_ficticios.sql` | apaga todos os dados fictícios de teste na ordem certa (desde o 26 os ligados não saem junto) e mostra o que sobrou. Para recarregar os testes: rodar este, depois licitações antes de contratos e de obras |
| `supabase/teste_esic_ouvidoria_ficticios.sql` | opcional: canais do SIC e da Ouvidoria, relatórios de 2023 a 2026 com distribuições, 6 informações classificadas (2 desclassificadas) |
| `supabase/teste_financeiro_pessoal_ficticios.sql` | opcional: receitas de 2025 e 2026, dívida ativa, 48 empenhos com movimentos, ordem cronológica (com um pagamento fora da ordem), 34 servidores com folha, cargos, estagiários, terceirizados e diárias |
| `supabase/teste_obras_ficticias.sql` | opcional: 4 obras fictícias (em andamento, paralisada, concluídas) com planilha, medições e paralisações |
| `supabase/teste_pca_sancoes_ficticios.sql` | opcional: PCA de 2024 a 2026 (com revisões) e 6 sanções fictícias de todos os tipos, vigentes e encerradas |
| `supabase/teste_licitacoes_ficticias.sql` | opcional: 19 processos fictícios (2022 a 2026) com documentos de teste |
| `supabase/05_lote2_usuarios.sql` | regras de convite e de perfis (`motivo_bloqueio_acesso`, `e_admin_do_orgao`), lista de pessoas com situação do convite (`usuarios_do_orgao`), histórico paginado (`historico_do_orgao`, `autores_historico`), histórico das permissões |

## Implantação do piloto (Riacho da Cruz) — roteiro do lote do piloto

Ordem decidida: piloto no ar primeiro (Supabase, SMTP, funções, dados reais); importações dos sistemas contábil e de
pessoal e o apontamento de riachodacruz.rn.gov.br ficam para depois. Passos, na ordem:

1. **Banco** (SQL Editor do projeto `softplus-portal`): rodar os scripts que faltarem até o 27 (o 26 de novo antes
   do 27). Não rodar nenhum `teste_*.sql` no projeto real; se já rodou, rodar `teste_apagar_ficticios.sql`.
2. **Funções** (Edge Functions › Via Editor, "Verify JWT" desligado em todas): `convidar-usuario`, `pncp`,
   `pncp-sincronizar` (+ segredo `PNCP_SINC_CHAVE`), `atendimento-arquivos` e, com o SMTP, `atendimento-emails`.
3. **SMTP próprio** (Brevo, 300 e-mails/dia grátis): Authentication › Emails › SMTP Settings (convites e "Esqueci minha
   senha") e os segredos `SMTP_*` + `ATENDIMENTO_CHAVE` das funções; depois ligar `plataforma_config.smtp`.
4. **Login**: Authentication › URL Configuration com o endereço do GitHub Pages; "Email OTP Expiration" = 86400.
5. **Órgão**: o piloto já existe (script 02). Para os próximos, módulo "Órgãos da plataforma". Convidar o administrador
   da Prefeitura em Usuários e permissões.
6. **Dados reais**: Aparência (brasão, contatos, redes, Destinos com os endereços atuais e os de anos anteriores),
   unidades e gestores, menu, LGPD, Carta de Serviços, e-SIC/Ouvidoria (sistema próprio ou Fala.BR), licitações pelo
   PNCP (importação automática ligada), e os módulos de transparência. O Início mostra o que falta, critério a critério.
7. **Conferir**: Início › autoavaliação; Aparência › Destinos › "Verificar os endereços agora"; abrir o site com
   `?orgao=08153454000104` no celular e no computador. Com o piloto no ar, a versão passa a `1.0.0`.

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

Para atualizar (0.21.0): Edge Functions › `convidar-usuario` › Code › colar o `index.ts` novo › Deploy.

Cadastro (0.21.0, o normal): o painel manda nome, e-mail, senha inicial e os órgãos; a função cria o login já
confirmado (sem e-mail) e grava os acessos. Com "trocar_senha", o painel exige senha própria no primeiro acesso.

Convite por link ou e-mail (modo antigo, ainda aceito pela função):
- **Gerar link**: a função devolve o link e o painel monta a mensagem para
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

## Funções do e-SIC e da Ouvidoria (Supabase Edge Functions)

- `supabase/functions/atendimento-arquivos/index.ts`: anexos do cidadão. O bucket `atendimento` é privado e o
  cidadão não tem login, então a função confere protocolo + código no banco, aceita só PDF, JPG, PNG ou WEBP de até
  10 MB (confere o começo do arquivo), grava e registra; também gera o link temporário (2 min) para baixar um anexo
  público do protocolo. A equipe grava e lê direto pelo Storage, com as regras do script 25.
- `supabase/functions/atendimento-emails/index.ts`: envia a fila de e-mails (`atendimentos_emails`), até 50 por vez,
  3 tentativas por mensagem.

Instalação (uma vez):
1. Edge Functions › Deploy a new function › Via Editor › nome `atendimento-arquivos`, colar `index.ts`, Deploy,
   **desligar "Verify JWT"**. Sem ela, o formulário funciona, mas os anexos do cidadão não são enviados (o site avisa).
2. Para os e-mails, só quando houver SMTP próprio (Brevo, Resend…): publicar `atendimento-emails` do mesmo jeito; em
   Edge Functions › Secrets incluir `ATENDIMENTO_CHAVE` (a chave mostrada no fim do script 25), `SMTP_HOST`,
   `SMTP_PORT`, `SMTP_USUARIO`, `SMTP_SENHA` e `SMTP_REMETENTE`; depois, no SQL Editor:
   `update public.plataforma_config set valor = '{"ativo": true}' where chave = 'smtp';`
   Até isso, o painel mostra "E-mails desativados" na fila e o cidadão acompanha pela consulta do protocolo.
3. Endereço do site nos e-mails: o domínio do órgão (`orgaos.dominio`) ou `plataforma_config.site_base` + `?orgao=CNPJ`.

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
  modulo-obras.js       → "Obras" (dados, andamento, planilha, medições, paralisações)
  modulo-concursos.js   → "Concursos e processos seletivos" (6.6 e 6.7: seleção + edital e atos)
  modulo-convenios.js   → "Convênios e transferências" (5.1 a 5.3) e "Emendas parlamentares" (17.1 a 17.3)
  modulo-setoriais-comum.js → peças comuns de Saúde, Educação e Renúncias (seção no site, janela de cadastro, importação, conselhos)
  modulo-saude.js       → "Saúde" (18.1 a 18.6)
  modulo-educacao.js    → "Educação, assistência social e conselhos" (19.1 a 19.4)
  modulo-renuncias.js   → "Renúncias de receita" (16.1 a 16.4)
  modulo-financeiro.js  → "Receitas, despesas e pagamentos" (3.1 a 3.3, 4.1 a 4.3, 9.4)
  modulo-pessoal.js     → "Pessoal e folha de pagamento" (6.1 a 6.5) e "Diárias" (7.1 e 7.2)
  modulo-atendimento.js → "e-SIC (acesso à informação)" (12.1 a 12.9) e "Ouvidoria" (14.1, 14.2 e 15.6)
  modulo-atendimento-fila.js → sistema próprio: fila, ficha do atendimento, registro no balcão, feriados e pesquisa de satisfação
  modulo-menu.js        → "Menu do site" (rotas do site público listadas em ROTAS)
  modulo-orgaos.js      → "Órgãos da plataforma" (só Suporte SOFT+: cadastro e situação da implantação)
  versao.json           → ÚNICA fonte da versão (ver abaixo)
  sw.js                 → service worker "rede primeiro"
  manifest.json         → instalação como aplicativo (PWA)
site/                   → site público (index.html, site.css, site.js = núcleo, paginas.js = páginas, setoriais.js = saúde, educação, renúncias e conselhos, financeiro.js = receitas, despesas, ordem cronológica, pessoal e diárias, atendimento.js = e-SIC e Ouvidoria, destinos.js = destinos das páginas, usado também pelo painel)
supabase/               → scripts SQL, rodar em ordem
supabase/functions/convidar-usuario/index.ts → função de servidor do convite
supabase/functions/pncp/index.ts → ponte de consulta ao PNCP (importação de licitações)
supabase/functions/pncp-sincronizar/index.ts → importação automática diária do PNCP
supabase/functions/atendimento-arquivos/index.ts → anexos do cidadão no e-SIC e na Ouvidoria (bucket privado)
supabase/functions/atendimento-emails/index.ts → envio da fila de e-mails do atendimento (com SMTP próprio)
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
  busca geral e páginas de sistemas externos (transparência, licitações); e-SIC (`#/esic/<aba>`) e
  Ouvidoria (`#/ouvidoria/<aba>`); saúde
  (`#/saude/<aba>`), educação e assistência social (`#/educacao/<aba>`), renúncias de receita
  (`#/renuncias/<aba>`) e conselhos (`#/conselhos`, `#/conselho/<id>`); receitas (`#/receitas/<aba>`), despesas
  (`#/despesas/<aba>`, detalhe `#/despesa/<id>`), ordem cronológica (`#/ordem-cronologica`), pessoal
  (`#/pessoal/<aba>`) e diárias (`#/diarias/<aba>`).
- Acessibilidade: atalhos Alt+1 a 4, alto contraste e tamanho do texto lembrados no navegador,
  VLibras, foco levado ao conteúdo a cada página, carrossel com pausa e sem rodar quando o
  sistema pede menos movimento, textos alternativos obrigatórios nas imagens.
- Hospedagem definitiva (domínio próprio de cada órgão): Cloudflare Pages, a decidir na entrada
  em produção. O domínio de Riacho da Cruz é administrado pela empresa do site atual.

## Limitações conhecidas

- Autoavaliação do PNTP (Início do painel e aviso no alto de cada módulo): é estimativa automática com o que está
  publicado. Confere existência, prazos (atualidade), série histórica (3 anos) e campos obrigatórios; não lê o conteúdo
  dos PDFs nem a qualidade dos textos, e conta como atendida a parte que leva a sistema externo (marcada "conferir lá").
  Fórmula: itens com peso 3 (disponibilidade e atualidade), 2 (série histórica) e 1 (gravação e filtro); critério
  essencial 2, obrigatório 1,5, recomendado 1; dimensões com peso 4 a 1; níveis da tabela do PNTP (Diamante, Ouro e
  Prata exigem 100% dos essenciais). A nota oficial é a do Tribunal de Contas.
- Exclusão: registro com outros ligados (documentos, aditivos, fiscais, itens da planilha, medições, membros, valores,
  empenhos, emendas…) não pode ser excluído; o painel diz o que está ligado. Exclua os ligados antes ou, para manter o
  histórico, mude a situação.

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
- Obras: a planilha de cada obra é lida inteira (até 2.000 itens) e filtrada no navegador.
- Importação de listas: até 2.000 linhas a troca é de uma vez só (tudo ou nada); acima disso vai em
  blocos e, se um bloco falhar, os anteriores ficam gravados (basta importar de novo).
- Medicamentos, estoque e creches são lidos inteiros no site (até 5.000/10.000 linhas) e filtrados no
  navegador; a lista de espera da regulação e os beneficiários são paginados no banco.
- Beneficiários de renúncia: o site pesquisa por nome, CNPJ, setor e produto, não por CPF (proteção).
- Receitas, despesas, pessoal e diárias: sem importação de arquivo até o layout ser definido (próxima etapa).
  Credor e inscrito são procurados pelo CPF/CNPJ inteiro por resumo (SHA-256), sem o site ler o número.

- e-SIC e Ouvidoria (sistema próprio): sem SMTP próprio, nenhum e-mail sai (ficam na fila). Os anexos do cidadão
  dependem da função `atendimento-arquivos` publicada. Sem captcha: a proteção contra robôs é o campo-isca e o
  limite de envios por origem. Os pedidos e as respostas não são publicados como dados abertos (só as estatísticas).
- Teste local sem o Storage da Supabase: o envio e o download de anexos foram testados com um simulador; conferir no
  projeto real depois de publicar a função.

- Excluir um órgão ou o login de uma pessoa apaga os vínculos em cascata, mesmo que
  seja o último administrador (é ação deliberada da SOFT+, feita pelo SQL).

## Histórico de mudanças

**0.24.4 — 14/11/2026 — Endereço oficial na Cloudflare Pages**
- Site e painel em https://portal-pntp.pages.dev (projeto Cloudflare Pages ligado ao `main`; aceita vários domínios de
  órgãos). O GitHub Pages redireciona para lá. Script 33 troca `site_base` dos e-mails. A raiz abre o site do órgão
  quando o endereço é um domínio de órgão e o painel nos endereços da plataforma.

**0.24.3 — 14/11/2026 — Usuários só para Administrador e Suporte**
- Script 32: tira a permissão de Usuários (e de Migração) dos perfis que não são de administrador — o "Gestor de
  conteúdo" vinha com "ver" em Usuários — e trava para não voltar.

**0.24.0 — 14/11/2026 — Migração: mais seções do site antigo**
- Atas de registro de preços (→ Contratos, tipo ata), audiências públicas (→ Publicações, tipo próprio "Audiência
  pública", um registro por documento), obras com medições (portal de obras em JSON), secretarias e responsáveis
  (→ Estrutura e Gestores, só completa o que falta), perguntas frequentes e páginas avulsas `/pagina/N` com
  subpáginas e arquivos (→ Páginas, como rascunho para revisar). Diário Oficial fica para o módulo próprio de diário.
- Seções podem ler listas prontas (`listar`) e pedir dados por formulário (POST), pelo servidor ou pelo coletor.

**0.23.3 — 14/11/2026 — Migração do site antigo (Plataforma A)**
- Módulo "Migração do site antigo" (Suporte SOFT+ e administrador do órgão): traz leis/decretos, licitações com
  documentos, contratos, concursos, contas públicas e notícias do site atual do órgão, com os arquivos copiados para
  o portal. Período: 3 anos no que pontua no PNTP, 2 anos no restante. "Analisar e medir" antes (não grava nada);
  "Importar" depois; não duplica (tabela `migracao_itens`).
- Leitura pelo servidor (função `migrar-site`) ou pelo navegador: muitos sites bloqueiam servidores de nuvem; aí o
  painel abre o site antigo numa aba e o favorito "Coletor SOFT+" (`painel/coletor.js`) lê páginas e arquivos como
  quem navega. Erros passageiros do banco/função são repetidos em vez de parar a análise.
- Script 31 (`31_migracao_site.sql`) e função `migrar-site` (Verify JWT desligado).

**0.22.0 — 14/11/2026 — Vários perfis por pessoa, perfis do sistema e barra de carregamento**
- Barra de carregamento na entrada do painel (conferindo acesso → órgãos → abrindo o órgão → menu), respeitando
  "reduzir movimento" do aparelho.
- Perfis adicionais: em cada órgão a pessoa tem o perfil principal e, se quiser, outros perfis (`perfis_extras`);
  as permissões somam (`tem_permissao`, `minhas_permissoes`). O de administrador só pode ser o principal (assim a
  regra do último administrador não muda). Perfis adicionais seguem as mesmas travas do principal
  (`motivo_bloqueio_extras`); perfil em uso como adicional não pode ser excluído. No painel: "Perfis adicionais" no
  cadastro, em "Alterar" e em "Dar acesso a outro órgão"; a lista mostra "Principal + Adicional".
- Perfis padrão do sistema: só o Suporte SOFT+ edita (aviso de que vale para todos os órgãos); o de Administrador
  do órgão nunca é editável. Administradores dos órgãos continuam com "Criar cópia" para ter versão própria.
- Banco: script 29. Função `convidar-usuario` atualizada (grava os perfis adicionais no cadastro).
- Testado no PostgreSQL local (banco novo 01 a 29) e no navegador: soma de permissões, bloqueio do administrador como
  adicional, trava de perfil maior nos adicionais, edição de perfil do sistema pelo Suporte e só "Ver permissões"
  para a administradora da Câmara.

**0.21.0 — 14/11/2026 — Usuários em página única e cadastro sem convite**
- "Usuários e permissões" virou uma página só para todos os órgãos que a pessoa gerencia: uma linha por pessoa,
  com os acessos (órgão, perfil, alcance, situação); "Abrir" mostra a ficha com Alterar, Desativar/Reativar,
  Remover (só quem nunca entrou), "+ Dar acesso a outro órgão" e "Definir nova senha". Filtros por órgão, perfil,
  situação e busca. A aba Perfis tem a escolha do órgão.
- Quem vê: Suporte SOFT+ (todos) e quem tem "Usuários" no perfil (padrão: só o Administrador do órgão), só as pessoas
  e os acessos dos órgãos que gerencia — nunca os vínculos com outros órgãos. Os demais perfis não veem a página.
- Cadastro sem convite: o administrador cadastra nome, e-mail, senha inicial (sugerida pelo painel) e marca os
  órgãos com perfil e alcance de cada um; a pessoa já sai vinculada e entra direto. "Pedir nova senha no primeiro
  acesso" vem marcado: na primeira entrada o painel exige a senha própria. Mensagem pronta com endereço, e-mail e
  senha inicial para copiar ou mandar pelo WhatsApp. E-mail que já tem login só recebe os novos acessos.
- "Definir nova senha": só quando quem pede gerencia todos os órgãos da pessoa (senão, "Esqueci minha senha" ou o
  Suporte); nunca para o Suporte SOFT+.
- Trava: quem não é administrador só dá (ou altera, desativa) perfis com permissões iguais ou menores que as suas.
- Banco: script 28 (`orgaos_que_gerencio`, `usuarios_unificados`, `pode_gerir_usuarios`, `perfil_cabe_no_meu`,
  `gerencia_todos_vinculos`, nova `motivo_bloqueio_acesso` e regras de edição/exclusão de vínculos). Função
  `convidar-usuario` atualizada (ações `cadastrar` e `definir_senha`; as de convite continuam funcionando).
- Testado no PostgreSQL local e no navegador: privacidade entre órgãos (administradora da Câmara vê só os acessos da
  Câmara), cadastrador sem a página, trava de perfil maior, cadastro em dois órgãos de uma vez, dar acesso a outro
  órgão e troca obrigatória de senha no primeiro acesso. A função de servidor foi testada por imitação local (a
  Supabase real só depois de publicada).

**0.20.0 — 14/11/2026 — Padronização visual, vários endereços por página, verificação de links e cadastro de órgãos**
- Padrão visual único: painel e site com as mesmas cores de situação e as mesmas mensagens (o site deixou de ter
  caixas próprias de erro e aviso); 162 espaçamentos soltos (`style`) viraram classes da escala comum; quadro único
  "Onde consultar" para sistema externo no site (página inteira, parte de página, formulário e acompanhamento do
  e-SIC/Ouvidoria).
- Aparência › Destinos das páginas: "+ Outro endereço (outro período ou sistema)" em cada página, com explicação,
  exercícios (de/até) e endereço, validados (sem repetir o principal). No site, a página mostra todos explicados, do
  mais recente para o mais antigo; menu, capa da Transparência e busca passam a levar à página do portal quando há
  mais de um endereço.
- Verificação diária dos endereços externos (destinos, outros endereços, Portal da Transparência geral, Diário Oficial,
  sistema de licitações), situação em cada linha de Destinos, botão "Verificar agora" e quadro no Início quando um
  endereço falha 2 vezes seguidas.
- Autoavaliação: a série histórica considera os exercícios cobertos por outros endereços.
- Módulo "Órgãos da plataforma" (Suporte SOFT+): cadastrar órgão ou subsite (tipo, CNPJ, município, domínio), já com o
  menu padrão; editar e ativar/desativar; lista com o que falta para cada órgão entrar no ar.
- Banco: rodar de novo o 26 e depois o 27. Testado no PostgreSQL local (banco novo 01 a 27, 27 repetido, respostas
  simuladas do pg_net: 200 e 404) e no navegador com PostgREST local (Aparência com outros endereços e validação,
  situação dos links, site com quadro de períodos anteriores e com vários endereços, cadastro de órgão e subsite,
  varredura de todas as telas do painel e de 41 rotas do site sem erros de script).
- Varredura PNTP: sem mudança de critério; 1.1 (domínio) continua dependendo do apontamento do domínio. Com os dados
  fictícios e um "outro endereço" de 2021-2024 nas receitas, 3.1/3.2 passam a atender a série histórica.

**0.19.0 — 14/11/2026 — Autoavaliação automática do PNTP, aviso padrão do que falta e vínculos protegidos**
- Início do painel: "Autoavaliação automática do PNTP 2026" com o índice estimado, o nível atual (Diamante a
  Inexistente), os essenciais atendidos, atendidos/parciais/não atendidos, o que falta para o próximo nível, a situação
  por dimensão e a lista do que falta, do que mais pesa para o que menos pesa, cada item com os 5 itens de verificação
  (✓ ou !), o que falta em palavras e o botão "Corrigir" que abre o módulo na aba certa. Todos veem o índice e o nível;
  cada pessoa vê as pendências dos módulos que acessa (Administrador e Controle interno veem todas). "Recalcular" refaz
  na hora; "Ver os 96 critérios" mostra a matriz inteira.
- Aviso padrão no alto de cada módulo (um só desenho em todo o painel): "Situação no PNTP" com os critérios do módulo e
  os lembretes de prazo que não são do PNTP (fila do e-SIC, notícias, aditivos). Some e volta recalculado depois de
  gravar. Saíram os três quadros diferentes que existiam (Planejamento, LGPD, e-SIC/Ouvidoria); a periodicidade do RGF
  continua em Planejamento, numa linha.
- Padronização: amarelo só para o que falta (aviso do PNTP, `.msg-falta` e `.falta` nas tabelas, com "!"); azul para
  informação (`.msg-info`); "Sem documento", "Sem arquivo" e "Falta" nas tabelas com o mesmo estilo. Links "Corrigir"
  abrem a aba pelo endereço (`#/m/modulo?aba=…`), em qualquer módulo.
- Vínculos: nenhum registro ligado a outro pode ser excluído (antes, excluir um contrato apagava aditivos e fiscais,
  excluir uma obra apagava planilha e medições, excluir uma licitação deixava empenhos sem a origem). O painel explica o
  que está ligado. Textos de confirmação de exclusão atualizados.
- Banco: script 26 (rodar depois do 25). Testado no PostgreSQL local (banco novo 01 a 26, 26 repetido, dados fictícios;
  exclusões recusadas com ligados e aceitas sem; exclusão do órgão inteiro continua funcionando) e no navegador com
  PostgREST local (Início, os 27 módulos com o aviso, link "Corrigir" abrindo a aba, sem erros de script). Dados de
  teste: novo `teste_apagar_ficticios.sql`; os scripts de teste apagam os ligados antes de recarregar.
- Varredura PNTP (Cartilha e Matriz 2026, prefeitura: 72 critérios comuns + 23 do Executivo + 11.6):
  - O portal tem página e cadastro para os 96 critérios, com filtro em cada coluna e exportação CSV/JSON nas listagens
    (gravação de relatórios e filtro de pesquisa), série histórica por ano e declarações de que não há dados por período.
  - Atendidos pelo próprio sistema: 1.2, 1.3, 1.4, 2.9, 13.1 a 13.5 e 15.4.
  - Dependem de configuração do órgão: 1.1 (domínio oficial apontado: fica para a entrada definitiva), 12.3/12.4, 14.2
    e 15.6 (ligar o formulário próprio ou informar o sistema externo).
  - Todos os demais dependem só dos dados do órgão; a autoavaliação mostra, critério a critério, o que falta. Com os
    dados fictícios do piloto: índice estimado 70,8%, nível Intermediário, 6 de 12 essenciais
    (para Prata faltam 4,2 pontos e os 6 essenciais: 1.1 domínio e a série histórica de 2023-2024 de receitas e despesas).
  - Atualidade conferida: dados de até 30 dias (receitas, despesas, ordem cronológica, servidores, folha, diárias,
    obras, convênios, emendas, listas de espera); 180 dias (estagiários e terceirizados); 15 dias (estoque das farmácias,
    Lei 14.654/2023); último exercício encerrado (Balanço, Relatório de Gestão, parecer, julgamento, relatório do SIC,
    renúncias); período vencido há 30 dias (RREO e RGF).
- Rodar o script 26.

**0.18.0 — 14/11/2026 — Fase 3 · Atendimento, parte 2: e-SIC e Ouvidoria próprios (12.1 a 12.9, 14.1, 14.2, 15.6)**
- Site: e-SIC com as abas Fazer pedido e Acompanhar pedido; Ouvidoria com Registrar manifestação, Acompanhar e
  Pesquisa de satisfação. Formulários sem cadastro, comprovante com protocolo e código de acesso (imprimir ou copiar),
  consulta com situação, prazo, resposta, recursos, anexos e andamento; recurso de 1ª e 2ª instância (inclusive por
  falta de resposta), resposta a pedido de complemento e avaliação, tudo pelo protocolo + código.
- Painel: abas Pedidos (e-SIC) e Manifestações (Ouvidoria) com resumo (em análise, a vencer, vencidos, recursos,
  aguardando), filtros (situação, prazo, tipo, unidade, ano, pesquisa) e CSV/JSON sem dados pessoais; ficha com
  Atendimento, Responder e encaminhar, Andamento, Recursos, Anexos, Identificação e Acessos; registro no balcão; aba
  Pesquisa de satisfação (resultados e comentários); cartão "Feriados e dias sem expediente".
- Escolha por órgão: "Receber pelo formulário do próprio portal" em Como pedir / Como se manifestar; quem usa o
  Fala.BR continua igual (o endereço foi para Aparência › Destinos das páginas, partes novas "e-SIC: pedidos",
  "Ouvidoria: manifestações" e "Ouvidoria: pesquisa de satisfação", que desativam a aba correspondente).
- Relatórios estatísticos automáticos (12.7 e Ouvidoria) com o sistema próprio; relatórios manuais continuam para
  quem fica no sistema externo e para os períodos anteriores.
- Avisos de prazo: pedidos/manifestações vencidos ou a vencer, recursos aguardando ou vencidos, 12.3/14.2 aceitam
  sistema próprio ou link externo, 15.6 (pesquisa de satisfação).
- Núcleo do painel: `el()` aceita listas aninhadas; `listaAno` aceita filtros iniciais (`inicial`) e consulta base (`base`).
- Banco: script 25 (rodar depois do 24; pode repetir) e duas funções novas (ver "Funções do e-SIC e da Ouvidoria").
  Testado no PostgreSQL local (banco novo com os dados fictícios + duas execuções; administrador, atendente do SIC,
  cadastrador com alcance numa unidade e visitante: visitante sem leitura de nenhuma tabela do atendimento; unidade sem
  identificação e só com o que foi encaminhado; bloqueio após 5 códigos errados; prorrogação única; motivo obrigatório
  na negativa; recursos nas duas instâncias; rotina diária com avisos de vencimento; relatório da troca somando a parte
  manual) e no navegador com PostgREST local (Fala.BR migrado, ligar o sistema, pedido com anexo, denúncia anônima,
  encaminhar, devolver pela unidade, responder, recorrer, avaliar, relatórios e pesquisa no site e no painel).
- Varredura PNTP (Cartilha/Matriz 2026):
  - 12.1, 12.2, 12.5 e 12.6 seguem como na 0.17.0. 12.3 atende com o formulário do portal (ou o link externo). 12.4:
    pedido simples, sem cadastro, sem documentos, firma, declaração, maioridade ou motivo; só nome e CPF/CNPJ (LAI,
    art. 10), com a opção de identidade preservada. 12.7 atende com o relatório anual automático (recebidos, atendidos,
    indeferidos e perfil genérico dos solicitantes), série histórica e CSV/JSON. 12.8 e 12.9 sem mudança.
  - 14.1 sem mudança; 14.2 atende com o canal do portal (ou link externo), com denúncia anônima e identidade protegida.
    14.3 (Carta de Serviços) sem mudança.
  - 15.6 (obrigatório: realiza e divulga pesquisas de satisfação): atende com a pesquisa depois da resposta e os
    resultados por ano no site (nota média, % resolvido, distribuição e CSV/JSON), ou com o link do sistema externo.
- Rodar o script 25 e publicar a função `atendimento-arquivos`.

**0.17.0 — 13/11/2026 — Fase 3 · Atendimento: e-SIC (12.1 a 12.9) e Ouvidoria (14.1 e 14.2)**
- e-SIC e Ouvidoria deixam de ser só um link: páginas próprias no site, com as mesmas abas no painel.
  e-SIC: Como pedir (unidade e responsável, endereço, telefone, e-mail, horário, botão do formulário eletrônico,
  outras formas, instruções, norma local da LAI) · Prazos e recursos (prazos de resposta e de recurso, autoridades
  de 1ª e 2ª instância, como recorrer) · Relatórios estatísticos · Informações classificadas · Informações
  desclassificadas. Ouvidoria: Como se manifestar (ouvidor, atendimento presencial, canal eletrônico, tipos de
  manifestação, prazo de resposta) · Relatórios estatísticos.
- Textos sugeridos (instruções, prazos da LAI e da Lei 13.460, procedimento do recurso) com "Usar o texto
  sugerido"; quadro "Situação no PNTP" na aba Como pedir/Como se manifestar mostra o que falta.
- Relatórios: anual (ou semestre, trimestre, mês) com recebidos, atendidos, parciais, indeferidos, em andamento,
  recursos, prazo médio, perfil dos solicitantes (pessoa física/jurídica, sexo) ou manifestações por tipo, e outras
  distribuições (faixa etária, escolaridade, assunto, motivo da negativa…). Para publicar no e-SIC é preciso ao
  menos um dado genérico dos solicitantes. No site, o ano abre no último relatório anual, com % e CSV/JSON.
- Informações classificadas: assunto, grau, fundamento (art. 23 da LAI), autoridade, datas, sigilo até (data ou
  evento) e desclassificação; o banco recusa prazo acima do máximo do grau. Site com abas de ano, filtros de grau,
  situação e "Últimos 12 meses" (12.9), pesquisa e CSV/JSON.
- Destinos das páginas: partes novas "e-SIC: relatórios", "classificadas", "desclassificadas" e "Ouvidoria:
  relatórios"; com link externo, o cadastro da parte fica desativado. Declarações de que não há dados nas 4 partes.
- Avisos de prazo: falta de unidade, contatos, formulário, norma ou recurso; relatório anual do ano anterior;
  rol de classificadas/desclassificadas; informação com prazo de sigilo vencido sem desclassificação.
- Aparência: os endereços do e-SIC e da Ouvidoria saem de "Diário Oficial e sistemas" (vão para os módulos).
- Rodar de novo os scripts 21 e 23 e depois o 24.

**0.16.4 — 13/11/2026 — declarações em todos os itens e dentro do período**
- O bloco "Declarar que não há dados" está em todo item com lista: Receitas, Dívida ativa, Despesas, Ordem
  cronológica, Servidores, Remuneração, Cargos, Estagiários, Terceirizados, Concursos, Diárias (e tabela),
  Licitações (por aba: licitações, dispensas e inexigibilidades, adesões), PCA, Sanções, Contratos, Fiscais, Obras,
  Obras paralisadas, Convênios (recebidos, realizados, acordos), Emendas (federais, estaduais e municipais),
  Planejamento e contas (um por documento), Renúncias, Saúde, Educação e conselhos.
- Texto sugerido automaticamente para cada item e período ("Não houve concessão de diárias em março de 2026",
  "Não houve estagiários no exercício de 2024"); o usuário pode reescrever, e "Usar o texto sugerido" volta à
  sugestão. O formulário já propõe o último período encerrado (ou o ano anterior, para "Ano").
- Site: o ano só declarado vira aba própria com a declaração; declarações do ano aparecem no alto da aba;
  com mês filtrado, as daquele mês. Sem registros e só com declarações, a página abre no ano declarado.
- Painel: os anos declarados aparecem nas abas de ano dos módulos, com a declaração no lugar da lista vazia.
- Banco: script 23 atualizado (`modulo_da_parte` com todas as chaves; permissão pelo módulo de cada item).

**0.16.3 — 13/11/2026 — declarações de que não há dados por período**
- A caixa única "não há dados" virou uma lista de declarações por parte, cada uma valendo para a situação
  atual ("O órgão não tem estagiários") ou para um período: mês, bimestre, trimestre, quadrimestre,
  semestre, ano ou intervalo de datas. O texto de cada declaração é editável (vem com a frase padrão da parte).
- Site: a declaração de situação atual substitui a lista (como antes); as de período aparecem no alto da
  aba, no quadro "Períodos sem ocorrência" (as 6 mais recentes e "Ver todas"), com a data do registro.
- Avisos de prazo: parte com declaração atual, ou de período terminado há no máximo 30 dias, não é cobrada.
- Banco: script 23 novo; scripts 21 e 22 atualizados (avisos leem `partes_sem_dados`). Rodar 21, 22 e 23,
  nessa ordem (todos podem repetir). As declarações antigas viram "situação atual" automaticamente.

**0.16.2 — 13/11/2026 — sai o cartão "Como esta parte aparece no site"**
- O cartão saiu de todas as abas (Saúde, Educação, Renúncias, Receitas e despesas, Pessoal, Diárias): o aviso
  sobre link externo ficou redundante desde que o destino externo desativa a aba (0.16.1).
- Ficaram só os campos que vão para o site, direto no alto da aba: a caixa "Não há dados a publicar nesta
  parte" (grava ao marcar; o site mostra a declaração com a data, exigida pelo PNTP quando não há dados) e,
  onde existe, o texto da parte (critérios das creches, como obter medicamentos, observação das tabelas de
  cargos e de diárias), com o botão Salvar. Partes sem nenhum dos dois não mostram nada.

**0.16.1 — 13/11/2026 — ajustes do painel antes do próximo lote**
- Aparência › Destinos das páginas: todas as tabelas com as mesmas larguras de coluna (ficam alinhadas).
- Destino com link externo desativa o cadastro manual da aba (ou do módulo inteiro) no painel, com aviso e
  atalho para `#/m/aparencia?aba=destinos`.
- Abas do painel como as do site: Licitações ganhou "Todos os processos" (abre nela); Contratos, "Contratos e
  aditivos" e "Fiscais de contratos" (todos os fiscais, com atalho para o contrato); Obras, "Obras" e "Obras
  paralisadas"; Emendas, "Todas", "Federais (17.1)" e "Estaduais e municipais (17.2)"; Planejamento e contas,
  uma aba por documento na ordem do site (o "+ Novo documento" já vem com o tipo da aba); Educação passa a ter
  "Conselho do Fundeb", "Assistência social" (conselho + planos) e "Outros conselhos"; Renúncias, "Cultura e
  esporte"; Receitas e despesas, "Previsão e arrecadação", "Dívida ativa", "Empenhos e pagamentos" e "Ordem
  cronológica"; Pessoal ganhou a aba "Concursos e seleções" (atalho para o módulo).
- Página inicial: o bloco "Gestão" mostra todos os gestores (antes só os marcados para a capa), rolando um por
  vez e recomeçando sem voltar de ré.
- Link da faixa do Radar definido manualmente em Aparência › Selos e Radar.
- Testado no navegador com PostgREST local: 25 módulos do painel abertos sem erro, abas bloqueadas por destino
  externo, aba de fiscais, obras paralisadas, gravação do link do Radar e o carrossel completo dos 14 gestores.

**0.16.0 — 13/11/2026 — Receitas, Despesas, Ordem cronológica, Pessoal e Diárias**
- Módulo **Receitas, despesas e pagamentos**, em abas: Receitas (lançamento mensal por natureza e fonte, com
  previsão inicial, atualizada e arrecadado; descrição de cada nível da classificação); Dívida ativa (inscrito,
  CPF/CNPJ, ano da inscrição, origem e valor, posição em 31/12); Despesas (empenho com unidade, função,
  subfunção, programa, ação, natureza, fonte, credor, objeto, procedimento de origem e processo; liquidações,
  pagamentos, reforços, anulações e estornos com data, totais pelo banco); Ordem cronológica (crédito por
  categoria e fonte, vencimento, pagamento e justificativa quando fora da ordem).
- Módulo **Pessoal e folha de pagamento**: servidores e agentes políticos (vínculo, cargo, função, lotação,
  admissão, desligamento, carga horária), remuneração mês a mês por folha (básica, vantagens, eventuais,
  indenizações, bruto, descontos, líquido), cargos e salários com a lei, estagiários e terceirizados.
- Módulo novo **Diárias**: concessões (beneficiário, cargo, destino, motivo, período, quantidade, valor, ato)
  e tabela de valores por grupo e destino (estado, fora do estado, exterior) com a norma.
- Site: `#/receitas` (níveis da classificação clicáveis, de categoria até o desdobramento, com totais e % da
  previsão), `#/despesas` (empenhos com filtros, detalhe do empenho com movimentos, totais por classificação em
  qualquer período), `#/ordem-cronologica` (posição na fila), `#/pessoal` e `#/diarias`, todos com CSV/JSON.
  Destinos das páginas apontam para as páginas internas e ganharam uma linha por parte (receitas, pessoal,
  diárias); capa da Transparência, menu padrão, busca geral, mapa do site e dados abertos atualizados.
- Avisos de prazo: receita, despesa, folha e servidores com mais de 30 dias, dívida ativa do exercício
  encerrado, ordem cronológica vazia, empenho de licitação sem número do processo.
- Banco: script 21 atualizado (gancho dos avisos novos: rodar de novo) e, depois dele, o script 22 (pode
  repetir). Testado no PostgreSQL local (banco novo + duas execuções seguidas,
  admin e visitante) e no navegador com PostgREST local: todas as páginas do site e abas do painel abertas,
  empenho incluído pelo painel com liquidação e pagamento (e o pagamento acima do liquidado recusado).
- Correções feitas no teste: lista de níveis da receita que aparecia como endereço solto; o número da nota
  nos movimentos do empenho estava fechado para o site; abas de estagiários iam até o ano do fim do estágio
  (2027); CNPJs inválidos nos dados fictícios; asterisco em "Procedimento de origem".
- Varredura PNTP (Cartilha 2026, filtros mínimos):
  - 3.1 atende: previsão e arrecadação por exercício e por período (mês inicial e final). 3.2 atende: código e
    descrição por extenso de categoria, origem, espécie e desdobramentos, por nível ou pesquisa. 3.3
    (Prefeitura) atende: nome e valor, filtro por nome e por ano da inscrição.
  - 4.1 atende: empenhado, liquidado e pago por exercício e mês. 4.2 atende: totais por categoria, grupo,
    modalidade, elemento, função, subfunção, programa, ação, unidade e fonte, por exercício e período. 4.3
    atende: empenho com credor, valor, objeto e procedimento de origem; filtro por número, nome, CPF/CNPJ do
    credor, mês e exercício.
  - 9.4 (recomendada) atende: fila por fonte e categoria, com as justificativas das alterações.
  - 6.1 atende (filtro por nome); 6.2 atende (nome, mês e ano); 6.3 atende com a frase de tabela vigente; 6.4
    atende (filtro por ano de contratação); 6.5 atende (por ano). 6.6/6.7 seguem no módulo de concursos.
  - 7.1 atende (nome, mês e ano); 7.2 atende (dentro e fora do estado e exterior, com a frase de vigência).
  - Série histórica (2023 a 2025) depende da carga dos dados: as abas de exercício já existem em todas as
    listas. Pendente: definir o layout de importação de cada parte.

**0.15.1 — 13/11/2026 — link externo só em Destinos das páginas**
- Na 0.15.0 cada parte de Saúde, Educação e Renúncias tinha o próprio campo de link externo, fora do
  cadastro único de destinos. Agora o link é informado só em Aparência › Destinos das páginas, que ganhou
  14 linhas (16.1 a 16.4, 18.1 a 18.6, 19.1 a 19.4) nos grupos "(por parte)". O cartão "Como esta parte
  aparece no site" mostra o link em vigor (com atalho para a Aparência) e guarda só a declaração "não
  há" e o texto da parte. Capa da Transparência, mapa do site, abas do site e avisos de prazo seguem a
  mesma tabela.
- Banco: script 21 atualizado (tira a coluna `secoes_setoriais.link_externo`; os avisos leem
  `configuracoes.destinos`). Quem já rodou a versão anterior roda de novo (pode repetir).

**0.15.0 — 13/11/2026 — Saúde, Educação e assistência social, Renúncias de receita e Conselhos**
- Módulo **Saúde** (PNTP 18.1 a 18.6), em abas: Planos e relatórios (Plano Municipal de Saúde, PAS,
  RAG, RDQA, com série histórica); Serviços e profissionais (estabelecimento com endereço, horário,
  CNES, especialidades e serviços; publicar exige local e horário; aba Profissionais com especialidade,
  registro e dias/horário); Lista de espera da regulação (protocolo sem nome, procedimento, prioridade,
  situação; posição calculada por procedimento; importação colando do relatório do SISREG ou CSV);
  Medicamentos (componente, inclusive alto custo, onde e como obter; "Colar vários"); Estoque das
  farmácias (importação por nome + apresentação, cadastra o medicamento que faltar, soma linhas
  repetidas do mesmo local); Conselho de Saúde.
- Módulo **Educação, assistência social e conselhos** (19.1 a 19.4): Plano Municipal de Educação e
  relatório de resultados; lista de espera das creches (protocolo e iniciais, creche, turma, pontuação,
  critério; posição por creche e turma) com o texto obrigatório dos critérios de prioridade; conselhos
  (Fundeb, Assistência Social, Educação, Alimentação Escolar, Criança e Adolescente, outros) com dados e
  funcionamento, composição (titular/suplente, segmento, entidade, mandato, ato) e atas, pautas e
  resoluções; planos e relatórios da assistência social.
- Módulo **Renúncias de receita** (16.1 a 16.4): desonerações (tributo, espécie, fundamento legal com
  link, requisitos, como pedir, vigência) com a aba Previsto × realizado por exercício (fonte da
  previsão e medidas de compensação do art. 14 da LRF); visão de todos os valores do exercício com
  totais; beneficiários por exercício (importação, CNPJ/CPF conferidos); projetos de incentivo à cultura
  e ao esporte.
- Toda parte tem "Como esta parte aparece no site": dados do portal ou declaração "não há" (com a data
  da informação no site); o link externo ficou em Destinos das páginas na 0.15.1.
- Site: páginas `#/saude`, `#/educacao`, `#/renuncias` (uma aba por critério, com filtros e CSV/JSON)
  e `#/conselhos` / `#/conselho/<id>`. Capa da Transparência, destinos das páginas, menu padrão,
  busca geral, mapa do site e dados abertos (14 conjuntos novos) apontam para elas.
- Avisos de prazo novos (só órgão do tipo Prefeitura): PAS do ano, Plano de Saúde vigente, RAG do ano
  anterior depois de 31/03, nenhum estabelecimento publicado, lista de espera e estoque com mais de 30
  dias, conselho de Saúde/Fundeb/Assistência ausente, com mandato vencido ou sem ata em 90 dias, PME
  vigente, lista e critérios das creches, nenhuma desoneração, realizado do ano anterior em branco,
  nenhum projeto de incentivo.
- Histórico: nomes legíveis das áreas e campos novos; importação aparece como "Importação em lote".
- Banco: script 21 (rodar depois do 20). Testado no PostgreSQL local (duas execuções em banco novo;
  admin, cadastrador sem publicar e visitante) e no navegador com PostgREST local (painel e site).
- Varredura PNTP (Cartilha/Matriz 2026) desta etapa:
  - 16.1 atende: cada desoneração com espécie e fundamento legal individualizado; sem benefícios,
    declaração. 16.2 atende: previsto e realizado por espécie de benefício e exercício (série
    histórica, filtro por ano, CSV/JSON). 16.3 (recomendada) atende: beneficiários com nome, CNPJ,
    setor, produto e valor. 16.4 (recomendada) atende, ou declara que não há projetos.
  - 18.1 atende com os três instrumentos e os anteriores; 18.2 com local, horário, especialidades e
    profissionais; 18.3 com a fila atualizada (data no alto) ou o link do sistema da regulação; 18.4 com
    a relação e como obter, destacando o alto custo; 18.5 com o estoque por farmácia e a data da
    posição; 18.6 com composição e funcionamento do Conselho.
  - 19.1 atende com o PME e o relatório de resultados; 19.2 com a lista e os critérios de prioridade
    (o painel avisa enquanto faltarem); 19.3 e 19.4 com os conselhos do Fundeb e da Assistência.
  - Da capa da Transparência, ficam em sistema externo só receitas (3), despesas (4), ordem
    cronológica (9.4), pessoal (6.1 a 6.5) e diárias (7).

**0.14.0 — 13/11/2026 — publicações com tipos próprios, concursos e seleções, avisos de prazo**
- Publicações: a tela do painel ganhou abas pelos principais tipos (Todas, Leis, Decretos,
  Portarias, Resoluções e instruções, Editais, Outros atos) e a aba **Tipos personalizados**, onde
  o órgão cria tipos próprios (ex.: "Ata do Conselho de Saúde", "Parecer jurídico") e escolhe em
  qual aba cada um aparece. O site mostra o nome do tipo próprio nas listas, filtros, busca e
  página inicial. Tipo em uso não pode ser excluído.
- Módulo novo **Concursos e processos seletivos** (PNTP 6.6 e 6.7): concurso público, processo
  seletivo simplificado, seleção de estágio, chamamento, credenciamento; número do edital, título,
  cargos/descrição, vagas, organizadora, inscrições, prova, validade e andamento. Aba Documentos com
  edital, retificações, inscritos, gabarito, resultados, recursos, homologação, convocação,
  nomeação e prorrogação (PDF ou link). Publicar exige o edital. Seleção nova reabre na aba
  Documentos. Site `#/concursos` (abas de ano, filtros, CSV/JSON; sem seleções, declara que não há)
  e `#/concurso/<id>` com o edital e todos os atos em ordem de data. Entrou nos destinos das
  páginas, no menu do painel, na busca, no mapa do site, na capa da Transparência e nos dados abertos.
- **Avisos de dados desatualizados**: cada módulo mostra no alto o que passou do prazo, e a tela
  inicial do painel reúne tudo ("Situação dos dados"), com link para o módulo. Regras (função
  `pendencias_atualizacao`): obra em andamento sem medição há mais de 30 dias (PNTP 10.1) ou com
  previsão vencida; convênio em execução sem conferência do repasse há mais de 30 dias ou com a
  vigência encerrada; emenda em execução sem atualizar empenhado/liquidado/pago há mais de 30 dias
  (17.3); licitação com a abertura já passada ainda "aberta"/"prevista"; contrato vencido há menos
  de 30 dias (lembrete do aditivo); contrato vigente sem fiscal vigente (9.3); falta do PCA do ano
  (8.6); seleção com inscrições encerradas ainda "inscrições abertas" (6.7); nenhuma notícia nos
  últimos 30 dias. Cada pessoa só vê os avisos dos módulos a que tem acesso.
- Banco: script 20 (rodar depois do 19). Testado no PostgreSQL local (duas execuções; admin,
  cadastrador sem publicar e visitante) e no navegador com PostgREST local.
- Varredura PNTP (Cartilha/Matriz 2026) desta etapa e das versões 0.12 e 0.13:
  - 6.6 atende com a íntegra do edital de cada seleção; 6.7 com os demais atos de cada fase, em
    página própria por seleção, com filtros e CSV/JSON; sem seleções, há a declaração.
  - 2.9 (botão do Radar) atende com a faixa do Radar na página inicial e o link no rodapé.
  - 15.3 ganha página própria "Serviços on-line", além da Carta de Serviços.
  - Atualidade (10.1, 17.3 e demais): os avisos do painel apontam o que está fora do prazo antes da
    avaliação.

**0.13.0 — 13/11/2026 — painel: menu lateral, paginação, largura e CPF/CNPJ**
- Menu lateral reformulado: grupos destacados (faixa com traço amarelo) e itens recuados com
  marcador; fica preso na tela ao rolar a página (computador).
- Campo "Pesquisar no menu" no alto do menu lateral: filtra os módulos pelo nome, sem acento;
  Enter abre o primeiro resultado, Esc limpa.
- Toda troca de tela pelo menu volta ao alto da página.
- Paginação automática: toda listagem do painel com mais de 25 linhas ganha páginas numeradas
  (25 por página, "Linhas x–y de z"), somando com o "Carregar mais".
- Telas largas: o conteúdo usa toda a largura disponível (antes ficava preso em 1.200 px e as
  tabelas largas criavam rolagem lateral).
- CPF e CNPJ conferidos pelos dígitos verificadores em todos os campos (contratos, obras,
  sanções, convênios e CNPJs da importação do PNCP), com máscara ao sair do campo e aviso na hora.
  Funções `P.cpfValido`, `P.cnpjValido`, `P.erroDoc`, `P.mascaraDoc` para os módulos novos.

**0.12.0 — 13/11/2026 — destinos únicos das páginas e ajustes do site**
- **Destinos das páginas** (Aparência › Destinos das páginas): para 24 páginas (receitas, despesas,
  ordem cronológica, pessoal, diárias, convênios, emendas, licitações, PCA, sancionados, contratos,
  fiscais, obras, planejamento, renúncias, saúde, educação, concursos e seletivos, e-SIC, ouvidoria,
  Carta de Serviços, serviços on-line, Diário Oficial e publicações) o órgão escolhe "Página do
  portal" ou "Link externo". Lista única em `site/destinos.js` (o painel carrega o mesmo arquivo).
  Menu, capa da Transparência, acessos rápidos da página inicial, mapa do site e busca seguem a
  tabela; quem abrir o endereço interno de uma página mandada para fora vê o botão para o sistema
  externo. Página que ainda não existe no portal usa o link próprio ou, sem ele, o Portal da
  Transparência externo geral. Gravado em `configuracoes.destinos`.
- Menu padrão: Serviços com "Carta de Serviços ao Usuário" e "Serviços on-line"; Transparência com
  Licitações e Contratos separados, mais Obras, Convênios e Emendas. Botão "Recriar menu padrão"
  (apaga e recria, com confirmação) para quem já tinha menu.
- Página nova `#/servicos-online` (PNTP 15.3): serviços da Carta pedidos pela internet, com
  pesquisa, categoria e botão para o endereço do pedido.
- Faixa acima do menu em todas as páginas: redes sociais oficiais à esquerda e selos à direita
  (saíram da página inicial). Menu principal fica preso no alto da tela ao rolar a página.
- Página inicial: a faixa amarela virou a faixa do Radar da Transparência Pública (link para o
  painel do Radar). Sem imagem, faixa padrão azul com o texto; com a imagem oficial enviada em
  Aparência › Selos e Radar, mostra a imagem. A seção "Redes sociais" saiu (está no topo).
- Gestão: todos os gestores marcados para a página inicial lado a lado, 4 por vez (menos no
  celular), rolando sozinhos e recomeçando no fim; pausa ao passar o mouse, botão de pausa e setas.
- Estrutura organizacional: aba "Unidades" com cartões (foto e nome do responsável, contatos,
  horário, competências, unidades vinculadas) e pesquisa; aba "Organograma" com a árvore.
- Busca: passa a achar as seções pelo nome (ex.: "contratos", "licitação", "diárias"), sem acento e
  sem plural, e inclui convênios, emendas e obras.
- Painel › Aparência e contatos dividido em abas: Identidade (brasão, nome, cor, **ícone da aba do
  navegador**, domínio), Contatos e redes, Destinos das páginas, Diário Oficial e sistemas, Selos
  e Radar. Sem ícone próprio, o site usa o brasão na aba do navegador.

**0.11.0 — 13/11/2026 — Fase 2 · Lote 10: convênios, transferências e emendas (PNTP 5.1 a 5.3 e 17.1 a 17.3)**
- Módulo "Convênios e transferências" no painel (já existia no menu como "em construção") com três
  abas, porque a Cartilha pede as transferências realizadas separadas das recebidas:
  **Recebidas** (5.1), **Realizadas** (5.2) e **Acordos sem repasse de recursos** (5.3). Cada
  instrumento: tipo de instrumento (convênio, contrato de repasse, termo de fomento/colaboração,
  acordo de cooperação, TED, termo de compromisso, transferência especial, fundo a fundo…),
  número/ano, processo, objeto, concedente/beneficiário/partes com CNPJ/CPF e esfera, programa,
  unidade executora, assinatura, vigência, valor total previsto, contrapartida, valor
  recebido/concedido (com a data da posição), andamento, obrigações ajustadas, inteiro teor (PDF
  ou link) e link de acompanhamento (ex.: Transferegov).
- Regras no banco: publicar exige o inteiro teor; acordo sem repasse não aceita valores; fim da
  vigência não pode ser antes do início; número repetido no mesmo tipo/instrumento/ano é
  bloqueado. No painel, publicar também exige vigência e valor previsto (e as obrigações, no 5.3).
- Módulo novo "Emendas parlamentares" (permissões copiadas de Convênios): exercício, origem
  (federal, estadual, municipal própria), tipo (individual, bancada, comissão, relator), forma de
  repasse (transferência especial "PIX", finalidade definida, fundo a fundo, convênio, execução
  direta), número, autoria, objeto, função de governo (Portaria 42/1999), beneficiário, valor
  previsto e realizado, e a execução (empenhado, liquidado, pago e data da posição). Emenda
  impedida exige o motivo. Pode ligar ao convênio (não vale para transferência especial).
  Quadro com os totais do exercício no topo da lista.
- Regras no banco: liquidado ≤ empenhado, pago ≤ liquidado; número único por origem e exercício;
  convênio ligado precisa ser do órgão e ter repasse; convênio com emenda não pode ser excluído.
- Site `#/convenios` (abas Recebidas, Realizadas, Acordos; abas de ano com "Todos"; filtros por
  texto, vigência, andamento e esfera; CSV/JSON) e página de cada instrumento (`#/convenio/<id>`)
  com inteiro teor, acompanhamento e emendas ligadas. Site `#/emendas` (abas Todas, Federais
  17.1, Estaduais e municipais 17.2, Execução 17.3 com totais previsto/realizado/empenhado/
  liquidado/pago; filtros por origem, forma, função e andamento; CSV/JSON) e `#/emenda/<id>`.
  Sem registros, cada aba declara que não há (com a data).
- Capa da Transparência, mapa do site, menu do painel e dados abertos passaram a apontar para
  essas páginas. CPF de pessoa física mascarado no site.
- Banco: script 19 (rodar depois do 18). Testado no PostgreSQL local (duas execuções; admin,
  cadastrador sem publicar, usuário limitado a uma unidade e visitante) e no navegador (site e
  painel) com PostgREST local.
- Varredura PNTP (Cartilha/Matriz 2026):
  - 5.1 atende com número/ano, valor total previsto, valor recebido, objeto, vigência, órgão
    repassador e inteiro teor; 5.2 com beneficiário, valor previsto e concedido, separado das
    recebidas; 5.3 com partes, objeto, vigência, obrigações e inteiro teor. Filtros e CSV/JSON.
  - 17.1 e 17.2 atendem com origem, forma de repasse, tipo, número, autoria, valor previsto e
    realizado, objeto e função de governo; no município, inclusive as emendas próprias.
  - 17.3 atende com empenhado, liquidado e pago de todas as emendas (recebidas e próprias).
  - Atualidade: valores repassados e execução das emendas trazem a data da posição; o órgão
    precisa atualizá-los ao menos uma vez por mês.

**0.10.0 — 13/11/2026 — Fase 2 · Lote 9: obras (PNTP 10.1 a 10.4)**
- Módulo "Obras" no painel (já existia no menu como "em construção"; as permissões são as que
  cada perfil já tinha). Janela da obra em abas:
  - **Dados da obra**: nome, descrição, local, unidade, contrato (busca no módulo Contratos;
    ao escolher, preenche contratada, CNPJ, valor e início), fonte do recurso, link externo.
  - **Andamento**: situação, % concluído, etapa atual, início, previsão e conclusão. O painel
    sugere o % pela planilha executada ("usar este valor").
  - **Planilha (quantitativos)**: itens com quantidade e preço unitário contratados (10.2) e
    quantidade executada com preço praticado (10.3); totais calculados pelo banco. Dá para
    **colar as linhas direto do Excel/LibreOffice/Google Planilhas** (cabeçalhos e títulos de
    grupo são ignorados) e salvar o executado de todos os itens de uma vez.
  - **Medições e pagamentos**: cada etapa medida, com período, valor medido, valor pago, data
    do pagamento, % acumulado e boletim (PDF ou link).
  - **Paralisações** (10.4): motivo, responsável pela inexecução, previsão de reinício e ato.
    Registrar uma paralisação deixa a obra "Paralisada"; informar o reinício a devolve para "Em
    andamento". A situação "Paralisada" não se escolhe à mão (o banco bloqueia), para nunca
    ficar obra paralisada sem motivo e responsável.
- Obra nova reabre na aba Planilha depois de salva (10.2 é obrigatório).
- Site `#/obras`: abas "Obras" (todas e por ano de início, tabela com situação, barra de %,
  início, previsão/conclusão e valor; filtros por texto e situação; CSV/JSON) e "Obras
  paralisadas" (`#/obras/paralisadas`: motivo, responsável e previsão de reinício, CSV/JSON).
  Página de cada obra (`#/obra/<id>`) com a planilha (filtro e CSV/JSON), medições,
  paralisações e o link para o contrato. CPF da contratada mascarado.
- Sem obras publicadas, o site declara "Não há obras públicas executadas ou em execução"; sem
  obras paralisadas, "Não há obras paralisadas neste órgão. Atualizado em …" (Cartilha).
- Capa da Transparência, mapa do site, menu e dados abertos (obras, planilhas e paralisações)
  passaram a apontar para essas páginas.
- Banco: script 18 (rodar depois do 17).
- Varredura PNTP (Cartilha/Matriz 2026):
  - 10.1 (recomendada) atende: início, etapas (etapa atual + medições), % concluído, situação e
    previsão de conclusão, com filtro e arquivo editável.
  - 10.2 (obrigatória) atende quando a planilha contratada é cadastrada (quantitativos, preços
    unitários e totais), na seção de obras, com filtro e CSV/JSON.
  - 10.3 (obrigatória) atende com as quantidades executadas, o preço praticado e os valores
    pagos nas medições.
  - 10.4 (obrigatória) atende com a relação das paralisadas (motivo, responsável e previsão de
    reinício) e com a declaração quando não há.
  - Atualidade: 10.1 pede dados de até 30 dias; o órgão precisa atualizar % e medições ao
    menos uma vez por mês.

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
