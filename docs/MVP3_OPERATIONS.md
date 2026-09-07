# MVP 3 — Operações / Ordens de Serviço

## Objetivo
Transformar o planejamento agrícola em execução rastreável de campo, conectada ao mapa e ao financeiro.

## Ciclo da OS
`planejada → agendada → em execução → concluída`

Fluxos alternativos:
- OS planejada/agendada vencida é exibida como `overdue` sem depender de cron;
- OS aberta pode ser cancelada por gestão;
- check-in GPS inicia a OS automaticamente quando necessário.

## Dados da OS
- safra e fazenda;
- talhão opcional;
- operação e título;
- prioridade;
- agenda;
- responsável;
- máquina;
- produto, dose e unidade;
- área-alvo;
- custo estimado;
- custo real;
- observações;
- check-in com latitude/longitude e horário;
- conclusão com usuário e observações.

## Eventos
A tabela `work_order_events` registra:
- criação;
- atualização;
- mudança de status;
- check-in;
- notas;
- atualização de custo;
- conclusão;
- cancelamento.

## Integração financeira
Ao concluir uma OS com custo real, a API cria/atualiza um `cost_entry` vinculado por `work_order_id`. Assim o custo passa automaticamente a compor o MVP 2 e a margem do talhão/safra.

## Permissões
Gestão/criação/edição/cancelamento:
- owner;
- admin;
- manager;
- agronomist.

Execução/start/check-in/conclusão/notas:
- owner;
- admin;
- manager;
- agronomist;
- operator.

Leitura:
- qualquer usuário autenticado com membership válido.

## Frontend
O item `Operações / OS` do menu abre a tela operacional com:
- KPIs de execução, atraso, conclusão e custos;
- filtros de status;
- nova OS;
- fila por prioridade;
- agenda;
- start;
- check-in GPS;
- conclusão com custo real;
- histórico de eventos;
- cancelamento controlado.

## Banco
Migration: `infra/sql/0004_operations_work_orders.sql`.

Aplicada somente no Neon `development` durante o MVP 3. Produção permanece sem a migration até homologação DEV.
