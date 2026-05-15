# FIIs Discovery

Scanner de Fundos Imobiliários que analisa o histórico de rendimentos no StatusInvest e calcula a sequência de meses sem queda nos dividendos.

## Como funciona

1. Lê a lista de tickers em `lista_fiis.txt`
2. Para cada FII, verifica se já tem cache atualizado no mês (`dados/TICKER.csv`)
3. Se tem cache → usa direto (instantâneo)
4. Se não tem → busca via Puppeteer no StatusInvest, salva no cache e para quando encontra dados já cacheados
5. Calcula meses consecutivos sem quebra de rendimento
6. Gera `resultado.html` com tabela ordenada e abre automaticamente no navegador

## Instalação

```bash
npm install
```

## Uso

```bash
npm start
```

Ou:

```bash
node discovery.js
```

## Cache

Os rendimentos são salvos em `dados/TICKER.csv` (um arquivo por FII).

- **Primeira execução**: busca todo o histórico (pode demorar)
- **Execuções seguintes no mesmo mês**: lê do cache instantaneamente
- **Mês seguinte**: busca apenas os rendimentos novos e mescla com o cache

Os segmentos dos FIIs são salvos em `dados/segmentos.csv` (buscados uma única vez).

## Histórico

O arquivo `historico.csv` salva uma fotografia mensal do ranking, permitindo comparar a evolução mês a mês.

## Configuração

Edite `lista_fiis.txt` com os tickers que deseja analisar (um por linha):

```
HGLG11
XPLG11
TRXF11
```

## Saída

O arquivo `resultado.html` é gerado com uma tabela contendo:

- **#** — Posição no ranking
- **FII** — Ticker do fundo
- **Meses sem quebra** — Meses consecutivos sem queda no rendimento
- **Data da quebra** — Quando ocorreu a última queda (se houver)
- **Rendimentos encontrados** — Total de registros históricos
- **Segmento** — Área de atuação do FII (Logístico, Shopping, etc.)

### Indicadores visuais

- 🟢 **Linhas em verde**: FIIs com 48+ meses sem queda (4+ anos de estabilidade)
- ↑ **Seta verde**: FII aumentou meses sem quebra em relação ao mês anterior
- ● **Bolinha azul**: FII entrou na lista de 48+ meses nos últimos 3 meses

## Dependências

- [Puppeteer](https://pptr.dev/) — automação de browser para scraping
