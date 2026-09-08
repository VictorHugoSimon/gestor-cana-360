# MVP 5 — Máquinas e Estoque

## Objetivo
Integrar ativos, consumo de insumos, ordens de serviço e custos agrícolas sem lançamento duplicado.

## Máquinas
- cadastro por organização e fazenda;
- código, tipo, marca, modelo e ano;
- status ativo/manutenção/inativo;
- horímetro e odômetro;
- custo por hora;
- combustível;
- manutenção realizada e próxima manutenção por horímetro;
- apontamentos de operação, manutenção, abastecimento e quebra;
- vínculo opcional com OS, talhão e safra;
- custo de uso alimenta `cost_entries` quando existe safra.

## Estoque
- catálogo de itens e SKU;
- categoria e unidade;
- saldo atual e estoque mínimo;
- custo médio ponderado nas entradas;
- entradas, saídas e ajustes;
- bloqueio de saldo negativo no banco;
- vínculo opcional com OS, talhão e safra;
- saída com safra gera custo agrícola automaticamente.

## Consistência transacional
O trigger `trg_gc360_inventory_movement` atualiza o saldo dentro da mesma transação da movimentação. O trigger `trg_gc360_inventory_cost` cria o custo agrícola da saída na mesma transação. Se alguma parte falhar, a movimentação inteira falha.

## API
- `GET /api/v1/machines`
- `POST /api/v1/machines`
- `PATCH /api/v1/machines/:id`
- `GET /api/v1/machine-usages`
- `POST /api/v1/machine-usages`
- `GET /api/v1/inventory/items`
- `POST /api/v1/inventory/items`
- `GET /api/v1/inventory/movements`
- `POST /api/v1/inventory/movements`
- `GET /api/v1/assets/summary`

## Frontend
Os itens `Máquinas` e `Estoque` do menu principal abrem páginas funcionais com indicadores, formulários e histórico.

## Segurança
- gestão de cadastros: owner/admin/manager;
- apontamentos e movimentos: owner/admin/manager/agronomist/operator;
- leitura: usuário autenticado com membership.

## Ambiente
Migration `0006_machines_inventory.sql` aplicada somente no Neon development.

Validação antes do PR: 0 máquinas, 0 apontamentos, 0 itens e 0 movimentos fictícios; os dois triggers de estoque estão ativos.
