# FIIs Discovery

Scanner de Fundos Imobiliários que analisa o histórico de rendimentos no StatusInvest e calcula a sequência de meses sem queda nos dividendos.

## Como funciona

1. Lê a lista de tickers em `lista_fiis.txt`
2. Para cada FII, verifica se já tem cache atualizado no mês (`dados/TICKER.csv`)
3. Se tem cache → usa direto (instantâneo)
4. Se não tem → busca via Puppeteer no StatusInvest, salva no cache e para quando encontra dados já cacheados
5. Calcula meses consecutivos sem quebra de rendimento
6. Gera `resultado.html` com tabela ordenada

## Instalação

```bash
npm install
```

## Uso

```bash
node discovery.js
```

Ou:

```bash
npm start
```

## Cache

Os rendimentos são salvos em `dados/TICKER.csv` (um arquivo por FII).

- **Primeira execução**: busca todo o histórico (pode demorar)
- **Execuções seguintes no mesmo mês**: lê do cache instantaneamente
- **Mês seguinte**: busca apenas os rendimentos novos e mescla com o cache

## Configuração

Edite `lista_fiis.txt` com os tickers que deseja analisar (um por linha):

```
HGLG11
XPLG11
TRXF11
```

## Saída

O arquivo `resultado.html` é gerado com uma tabela contendo:

- FII
- Meses sem quebra
- Data da quebra (se houver)
- Total de rendimentos encontrados

## Dependências

- [Puppeteer](https://pptr.dev/) — automação de browser para scraping
