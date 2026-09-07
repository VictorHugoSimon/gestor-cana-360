# Deploy DEV — Gestor Cana 360

## Estratégia
O ambiente DEV usa um único Cloudflare Worker chamado `gestor-cana-360-dev`.

- React/Vite é compilado para `apps/web/dist`.
- Static Assets do Cloudflare serve a SPA.
- `/api/*` e `/health` executam o Hono Worker primeiro.
- Neon PostgreSQL/PostGIS continua como banco de dados.
- Neon Managed Better Auth continua como provedor de identidade.
- Workers AI fica disponível no binding `AI`.

Essa arquitetura reduz recursos, URLs, CORS e pontos de falha comparada a Pages + Worker separados.

## GitHub Secrets obrigatórios

### `CLOUDFLARE_API_TOKEN`
Token exclusivo para este projeto. Use o menor escopo possível. Para deploy de Worker, a base deve permitir Workers Scripts Edit; para o binding de IA, considere Workers AI Read/Edit quando requerido pela conta/configuração. Não reutilize tokens de outros projetos quando puder criar um token dedicado.

### `CLOUDFLARE_ACCOUNT_ID`
ID da conta Cloudflare onde o Worker exclusivo será criado.

### `NEON_DATABASE_URL_DEV`
Connection string da branch Neon `development`, banco `gestor_cana_360`. É segredo e nunca deve entrar no repositório, issue, log ou documentação pública.

## Valores públicos já configurados
- `APP_ENV=development`
- Neon Auth Base URL da branch DEV
- Neon Auth JWKS URL da branch DEV
- Workers AI provider/model
- `VITE_API_URL=''`, portanto o frontend chama `/api/*` no mesmo domínio do Worker.

## Automação
`.github/workflows/deploy-dev.yml` roda em pushes para `develop` e também manualmente.

Se os três secrets não existirem, o workflow faz apenas preflight e termina sem tentar deploy. Depois que os secrets forem configurados, o fluxo será:

1. checkout;
2. pnpm/Node;
3. install;
4. typecheck;
5. build do React;
6. upload de `DATABASE_URL` como Worker secret;
7. deploy `wrangler deploy --env dev`;
8. registro da URL de deploy no summary do GitHub Actions.

## Produção
Produção está intencionalmente bloqueada. O workflow de produção não faz deploy enquanto o DEV não estiver homologado e enquanto Neon Auth PROD, banco PROD, domínio e CORS de produção não estiverem definidos.

## Smoke test obrigatório após primeiro deploy
1. `GET /health` retorna 200.
2. Criar/entrar em conta DEV via Neon Auth.
3. Executar claim da organização DEV.
4. Carregar fazendas e safra.
5. Criar uma fazenda de teste, se necessário.
6. Desenhar Polygon no mapa.
7. Salvar talhão.
8. Confirmar `area_ha` calculada pelo PostGIS.
9. Recarregar a aplicação e confirmar persistência.
10. Editar vértice, salvar e confirmar novo cálculo de área.
11. Confirmar que usuário sem membership recebe 403.
12. Confirmar que produção não recebeu dados DEV.
