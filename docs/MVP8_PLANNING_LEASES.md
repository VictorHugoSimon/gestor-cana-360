# MVP 8 — Planejamento + Arrendamentos

## Objetivo
Conectar projeto agrícola, metas da safra, desenho técnico de cultivo e contratos de arrendamento ao mesmo núcleo econômico do Gestor Cana 360.

## Planejamento agrícola
A fonte oficial continua sendo `field_seasons`, evitando duplicação de talhão+safra.

Campos adicionados:
- plantio e colheita planejados;
- espaçamento de linhas;
- TCH e ATR esperados;
- toneladas previstas;
- orçamento;
- receita prevista;
- direção de plantio;
- observações.

Indicadores:
- talhões planejados;
- área planejada;
- toneladas previstas;
- TCH/ATR médios esperados;
- orçamento e receita;
- margem projetada.

## Projeto de cultivo georreferenciado
Tabela `cultivation_design_features` em PostGIS.

Tipos:
- linhas de plantio;
- linhas AB;
- curvas de nível;
- acessos;
- drenagem;
- outros.

As geometrias aceitas são LineString/MultiLineString em GeoJSON. O servidor converte para MultiLineString, calcula comprimento em metros e exige interseção com o polígono do talhão.

## Arrendamentos
Tabelas:
- `leases`;
- `lease_payments`.

Bases de cálculo previstas:
- valor fixo;
- R$/ha;
- participação na receita;
- toneladas equivalentes.

O contrato pode ser associado à fazenda inteira ou a um talhão específico.

## Integração financeira
`cost_entries.lease_payment_id` cria vínculo rastreável entre parcela e custo.

Quando uma parcela passa para `paid`, a trigger `trg_gc360_sync_paid_lease_cost` cria/atualiza o custo `Arrendamento` da mesma safra na mesma transação.

Uma parcela já quitada não pode voltar a outro status, preservando a trilha financeira.

## Segurança
Planejamento e desenho técnico:
- owner/admin/manager/agronomist.

Contratos e pagamentos:
- owner/admin/manager.

Leitura:
- qualquer usuário autenticado com membership da organização.

## Ambiente
Migration `0009_planning_leases.sql` aplicada somente no Neon `development`.

Validação antes do PR:
- 0 elementos de desenho fictícios;
- 0 contratos fictícios;
- 0 parcelas fictícias;
- trigger financeira ativa;
- índice geoespacial ativo.
