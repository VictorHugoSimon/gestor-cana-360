# Segurança

- Nenhum secret deve entrar no repositório.
- `DATABASE_URL`, tokens Cloudflare e chave OpenAI ficam apenas em secrets do ambiente.
- Todas as tabelas de negócio carregam `organization_id` para isolamento lógico.
- API valida payloads com Zod e aplica headers seguros.
- Produção e desenvolvimento usam branches separadas no Neon.
- Auditoria registra ações críticas.
- Antes do go-live: autenticação Better Auth/Neon Auth, RBAC, rate limit, CSP estrita, RLS/defesa em profundidade, backups testados e testes de autorização entre tenants.
- Uploads futuros devem usar URLs assinadas e armazenamento privado.
