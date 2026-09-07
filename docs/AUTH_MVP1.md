# AUTH-001 — MVP 1

## Decisão
- Managed Better Auth do Neon na branch `development`.
- Frontend React usa `@neondatabase/neon-js`.
- Worker recebe JWT Bearer e valida assinatura EdDSA via JWKS do Neon Auth.
- O `X-Organization-Id` não concede acesso por si só; quando enviado, apenas seleciona uma organização já presente em `organization_members` para o usuário autenticado.
- A organização é resolvida no backend e colocada no contexto da requisição.

## Papéis iniciais
- owner
- admin
- manager
- agronomist
- operator
- viewer

## Bootstrap DEV
O endpoint `POST /api/v1/onboarding/claim` existe somente quando `APP_ENV=development`. Ele permite que o primeiro usuário autenticado assuma a organização `gestor-cana-360-demo`, e somente se ela ainda não possuir membros.

## Produção
O fluxo de claim DEV não funciona em produção. Antes do primeiro release produtivo, usuários e organizações deverão ser provisionados por fluxo administrativo/invite, com verificação de e-mail e domínios confiáveis configurados.
