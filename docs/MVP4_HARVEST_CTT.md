# MVP 4 — Colheita, CTT e Usinas

## Objetivo
Transformar a programação de colheita em um fluxo rastreável do talhão até a usina, eliminando lançamento duplicado de toneladas e ATR.

## Planejamento de colheita
Cada plano pode informar:
- fazenda, talhão e safra;
- usina de destino;
- início e fim previstos;
- prioridade;
- toneladas previstas;
- status e observações.

Status do plano:
`planned → ready → harvesting → completed`

Também é possível cancelar um plano.

## Cargas / CTT
Cada carga registra:
- plano de colheita opcional;
- talhão;
- usina;
- ticket;
- placa;
- motorista;
- horário de corte;
- carregamento;
- saída;
- chegada à usina;
- pesagem;
- moagem;
- toneladas líquidas;
- ATR;
- preço do kg de ATR;
- receita efetiva;
- impurezas;
- fibra.

Fluxo da carga:
`cutting → loaded → in_transit → arrived → delivered`

## Indicadores CTT
A API calcula:
- corte → carga;
- carga → usina;
- corte → moagem/chegada;
- tempo médio CTT;
- alertas de cargas abertas acima de 180 minutos.

O limite de 180 minutos é inicialmente um parâmetro operacional fixo do MVP e deverá ser configurável em evolução futura.

## Integração automática com Produção
Ao confirmar uma carga como entregue, a API cria ou atualiza um `production_entry` com:
- talhão;
- safra;
- data de pesagem;
- toneladas;
- ATR;
- preço do kg de ATR;
- receita.

O vínculo é feito por `production_entries.harvest_load_id`, com índice único para impedir duplicidade da mesma carga.

Consequência: uma entrega atualiza automaticamente TCH, ATR, TAH, receita e margem dos indicadores do MVP 2.

## Usinas
Cadastro de usina:
- nome;
- município/UF;
- distância;
- preço padrão do kg de ATR;
- observações.

Comparação por usina:
- cargas entregues;
- toneladas;
- ATR médio ponderado;
- CTT médio;
- receita;
- distância cadastrada.

## Permissões
Gestão de usinas e planos:
- owner;
- admin;
- manager;
- agronomist.

Execução de cargas:
- owner;
- admin;
- manager;
- agronomist;
- operator.

Leitura:
- qualquer usuário autenticado com membership válido.

## Frontend
Os itens do menu principal `Colheita`, `CTT` e `Usinas` usam o mesmo núcleo de dados.

### Colheita
- KPIs;
- fila de talhões;
- progresso entregue x previsto;
- abertura de carga;
- corte;
- carregamento;
- trânsito;
- chegada;
- pesagem/entrega.

### CTT
- tabela temporal por carga;
- corte→carga;
- carga→usina;
- total CTT;
- alerta visual acima de 180 minutos.

### Usinas
- cadastro;
- comparação de toneladas, ATR, CTT, receita e distância.

## Banco
Migration: `infra/sql/0005_harvest_ctt_mills.sql`.

Aplicada somente no Neon `development` durante a construção do MVP 4. Produção permanece sem a migration até homologação DEV.

## Estado DEV durante construção
Nenhuma usina, plano, carga ou lançamento de produção fictício foi inserido para validar o módulo. O schema e as consultas foram testados mantendo os indicadores limpos.
