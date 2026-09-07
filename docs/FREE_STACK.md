# Estratégia R$ 0 inicial

O desenho foi feito para operar dentro das cotas gratuitas enquanto o produto está em desenvolvimento e no início de validação.

- Cloudflare Pages: frontend estático.
- Cloudflare Workers Free: API serverless.
- Cloudflare Workers AI: cota gratuita diária para IA de desenvolvimento.
- Neon Free: PostgreSQL serverless e PostGIS.
- MapLibre GL: biblioteca open source.
- OpenStreetMap/demotiles durante desenvolvimento; antes de produção deve-se adotar provedor de tiles com política adequada ao volume.
- GitHub: código e CI/CD.

A meta é R$ 0 na fase inicial, não a promessa de custo zero em qualquer escala. Ao ultrapassar as cotas dos provedores, o sistema deve degradar de forma controlada ou migrar para plano pago deliberadamente, nunca gerar cobrança surpresa por configuração automática.
