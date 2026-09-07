# MVP 2 — Produção e Economia da Safra

## Objetivo
Transformar o mapa/cadastro do MVP 1 em gestão econômica por talhão e safra.

## Lançamentos de produção
Cada lançamento pode informar:
- talhão;
- safra;
- data;
- toneladas;
- ATR em kg/t;
- preço em R$/kg de ATR;
- receita real, quando já apurada;
- origem e observações.

Quando `revenue_amount` não é informado e existem ATR + preço do kg de ATR, a API estima a receita como:

`toneladas × ATR (kg/t) × preço (R$/kg ATR)`

A receita efetivamente informada sempre prevalece sobre a estimativa.

## Custos
Custos podem ser:
- alocados a um talhão; ou
- gerais da safra.

Custos gerais entram no total da safra, mas não entram no ranking individual por talhão enquanto não forem alocados.

## Indicadores por talhão
- toneladas produzidas;
- TCH = toneladas / hectares;
- ATR médio ponderado por toneladas;
- TAH = toneladas de ATR / hectare;
- receita;
- custo;
- custo/ha;
- margem;
- margem/ha;
- comparação futura com `expected_tch` e `expected_atr` de `field_seasons`.

## Permissões
Produção: owner, admin, manager, agronomist e operator.

Custos: owner, admin e manager.

Leitura: qualquer usuário autenticado com membership válido na organização.

## Banco
Migration: `infra/sql/0003_production_economics.sql`.

A migration foi aplicada somente no Neon `development` durante a construção do MVP 2. Produção permanece sem esta alteração até o gate de promoção.
