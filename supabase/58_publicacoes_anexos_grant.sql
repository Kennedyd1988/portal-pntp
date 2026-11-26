-- 58 · Correção: o script 42 criou as regras (RLS) de publicacoes_anexos,
-- mas não deu a permissão de tabela ao usuário logado. Sem ela, incluir,
-- editar, apagar e até ler anexos no painel dava "permission denied".
-- As regras de acesso (tem_permissao / no_alcance / e_membro) continuam valendo.

grant select, insert, update, delete on public.publicacoes_anexos to authenticated;

select 'anexos das publicações liberados para o painel' as situacao;
