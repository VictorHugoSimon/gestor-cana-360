# MVP 9 — Simulador + IA agronômica

## Simulador
Endpoint `POST /api/v1/simulator`.

O cálculo é determinístico e não grava dados.

Premissas:
- área (ha);
- TCH;
- ATR kg/t;
- R$/kg ATR;
- custo/ha;
- custos fixos;
- arrendamento;
- perda de colheita (%).

Resultados:
- toneladas brutas e líquidas;
- massa de ATR;
- receita;
- custo variável e total;
- margem total e por hectare;
- margem percentual;
- TCH de equilíbrio;
- ATR de equilíbrio.

A tela tenta pré-preencher TCH, ATR e custo/ha usando dados atuais ou planejamento do talhão, mas todas as premissas continuam editáveis pelo usuário.

## IA agronômica contextual
Endpoint `POST /api/v1/ai/agronomy`.

Entrada:
- `fieldId`;
- `seasonId`;
- pergunta.

O contexto não é aceito do navegador. O Worker busca diretamente no banco, respeitando organização e membership autenticado.

Fontes consultadas quando disponíveis:
- cadastro do talhão e planejamento;
- produção, ATR, receita e custos;
- amostras de solo;
- pragas/doenças/plantas daninhas;
- leituras meteorológicas;
- índices de vegetação processados;
- ordens de serviço abertas;
- cargas/colheita.

## Guardrails
O prompt de sistema exige:
- usar somente o contexto recuperado do banco;
- não inventar dados ausentes;
- separar fato, inferência e recomendação;
- informar dados faltantes;
- não prescrever defensivos ou doses sem dados e validação profissional;
- resposta em português do Brasil;
- estrutura: Situação, Evidências, Riscos, Próximas ações e Dados faltantes.

A IA não grava nem altera registros neste MVP.

## Provedores
Prioridade inicial:
- Cloudflare Workers AI via binding `AI`;
- OpenAI Responses API opcional quando `AI_PROVIDER=openai` e os secrets estiverem configurados.

Nenhuma chave é incluída no frontend ou repositório.
