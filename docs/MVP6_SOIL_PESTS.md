# MVP 6 — Solo e Pragas

## Objetivo
Criar inteligência agronômica básica e rastreável por talhão/safra, com georreferenciamento PostGIS e integração com Ordens de Serviço.

## Solo
- amostras por fazenda, talhão e safra;
- código, data, profundidade e laboratório;
- ponto GPS opcional;
- pH, matéria orgânica, P, K, Ca, Mg, S, B, Zn, Mn, Cu, Fe, CTC e V%;
- textura: argila, areia e silte;
- histórico por talhão;
- indicadores de média sem aplicar faixas agronômicas fixas.

## Pragas, doenças e plantas daninhas
- categoria e nome do agente;
- severidade de 1 a 5;
- infestação em % e/ou área afetada;
- ponto GPS e geometria afetada;
- estados: aberta, monitoramento, tratada e encerrada;
- ações de controle com produto/dose/resultado;
- geração automática de OS vinculada à ocorrência.

## Integração com OS
A rota `POST /api/v1/pests/:id/work-order` cria uma OS de controle no mesmo talhão/safra. Severidade 5 gera prioridade crítica; severidade 4 gera prioridade alta; demais geram prioridade normal. A criação também registra `work_order_events`.

## API
- `GET /api/v1/soil/samples`
- `POST /api/v1/soil/samples`
- `GET /api/v1/soil/summary`
- `GET /api/v1/pests`
- `POST /api/v1/pests`
- `PATCH /api/v1/pests/:id`
- `GET /api/v1/pests/summary`
- `GET /api/v1/pests/:id/actions`
- `POST /api/v1/pests/:id/actions`
- `POST /api/v1/pests/:id/work-order`

## Frontend
Os itens `Solo` e `Pragas` do menu principal agora possuem telas funcionais, cadastro georreferenciado e indicadores.

## Ambiente
Migration `0007_soil_pests.sql` aplicada somente no Neon development.

Validação antes do PR: 0 amostras, 0 ocorrências e 0 ações fictícias; índices geoespaciais confirmados ativos.
