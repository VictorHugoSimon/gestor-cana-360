# Arquitetura — Gestor Cana 360

## Objetivo

Começar no plano gratuito sem sacrificar o caminho de escala. A aplicação é stateless na borda; o estado transacional fica no PostgreSQL.

## Componentes

1. Cloudflare Pages: SPA React.
2. Cloudflare Workers: API Hono, validação, autorização, rate limiting e integração de IA.
3. Neon PostgreSQL: dados transacionais e geoespaciais via PostGIS.
4. MapLibre: visualização cartográfica sem dependência de licença proprietária de mapa.
5. GitHub: versionamento, revisão por PR e CI/CD.

## Domínio inicial

`organization -> farm -> season -> field -> field_season`

Eventos operacionais entram como produção, custo e ordens de serviço. Novos módulos (CTT, máquinas, estoque, solo, pragas, clima, satélite, usina e arrendamentos) serão plugados sobre essa mesma chave de organização/safra/talhão.

## Escalabilidade

- API stateless e horizontal.
- Banco serverless com pooling.
- Índice GiST para geometria.
- Contratos com Zod.
- APIs versionadas em `/api/v1`.
- Multi-tenant desde o primeiro schema.
