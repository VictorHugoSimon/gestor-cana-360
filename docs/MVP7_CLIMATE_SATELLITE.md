# MVP 7 — Clima e Satélite

## Objetivo
Adicionar monitoramento climático de dados próprios/IoT e descoberta de imagens Sentinel-2 por talhão, mantendo custo de licença inicial em R$ 0 e sem inventar dados agronômicos.

## Clima
- cadastro de estações por fazenda e opcionalmente por talhão;
- ponto GPS, provedor e fuso horário;
- observações de temperatura, UR, chuva, vento/rajada, direção, radiação, pressão, molhamento foliar, temperatura/umidade de solo e evapotranspiração;
- atualização idempotente por estação + timestamp;
- resumo dos últimos dias e última leitura;
- estrutura preparada para estação própria, Terra Pulse ou outro gateway IoT.

### Decisão de provedor
O endpoint gratuito do Open-Meteo não é usado no produto comercial porque seus termos atuais limitam a Free API a uso não comercial. A arquitetura de clima permanece provider-neutral e prioriza dados próprios/licenciados.

## Satélite
- fonte inicial: Copernicus Data Space Ecosystem;
- coleção oficial STAC: `sentinel-2-l2a`;
- busca pelo polígono real do talhão;
- filtro por período e cobertura de nuvens;
- importação de cena revalidada no servidor pelo item oficial;
- checagem PostGIS de interseção cena x talhão;
- histórico de cenas importadas;
- armazenamento separado de índices NDVI, NDRE, EVI e NDWI.

### Regra de integridade
Pesquisar ou importar uma cena não cria NDVI automaticamente. Índices só são mostrados quando um processador real registra resultados raster/estatísticos em `vegetation_index_observations`.

## APIs
### Clima
- `GET /api/v1/climate/stations`
- `POST /api/v1/climate/stations`
- `GET /api/v1/climate/observations`
- `POST /api/v1/climate/observations`
- `GET /api/v1/climate/summary`

### Satélite
- `POST /api/v1/satellite/search`
- `POST /api/v1/satellite/scenes/import`
- `GET /api/v1/satellite/scenes`
- `POST /api/v1/satellite/indices`
- `GET /api/v1/satellite/indices`
- `GET /api/v1/satellite/summary`

## Fontes verificadas em setembro de 2026
- Copernicus Data Space Ecosystem: acesso aberto/gratuito aos dados Sentinel e serviços com quotas de uso justo.
- Sentinel-2: dados disponíveis gratuitamente inclusive para usuários comerciais.
- STAC atual: `https://stac.dataspace.copernicus.eu/v1/`.
- Coleção L2A: `sentinel-2-l2a`.

## Ambiente
Migration `0008_climate_satellite.sql` aplicada somente no Neon development.

Validação antes do PR: 0 estações, 0 observações, 0 cenas e 0 índices fictícios; índices geoespaciais de clima e satélite confirmados ativos.
