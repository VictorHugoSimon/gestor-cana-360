# Gestor Cana 360

Base técnica do sistema de gestão agrícola para cana-de-açúcar, reconstruída a partir do protótipo funcional fornecido.

## Stack

- Frontend: React + TypeScript + Vite
- API: Hono + TypeScript em Cloudflare Workers
- Banco: PostgreSQL 18 no Neon (São Paulo)
- GIS: PostGIS + MapLibre GL
- Validação: Zod
- ORM: Drizzle ORM
- IA: adapter por provedor; Cloudflare Workers AI como opção gratuita de desenvolvimento e OpenAI opcional

## Estrutura

- `apps/web` — painel web
- `apps/api` — API serverless
- `packages/contracts` — contratos e schemas compartilhados
- `infra/sql` — migrações iniciais do banco
- `docs` — arquitetura, segurança e roadmap

## Desenvolvimento local

1. Instale Node 22+ e pnpm 10+.
2. Copie `.env.example` para os ambientes locais.
3. Instale as dependências: `pnpm install`.
4. Web: `pnpm dev:web`.
5. API: `pnpm dev:api`.

## Deploy alvo

- Web: Cloudflare Pages
- API: Cloudflare Workers
- Banco: Neon

O deploy de Cloudflare pode ser automatizado via GitHub Actions após cadastrar os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no repositório.
