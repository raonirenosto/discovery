const fs = require("fs")
const path = require("path")
const puppeteer = require("puppeteer")
const { exec } = require("child_process")

const PASTA_CACHE = path.resolve(__dirname, "dados")
const HISTORICO_FILE = path.resolve(__dirname, "historico.csv")
const SEGMENTOS_FILE = path.resolve(__dirname, "dados", "segmentos.csv")

// ===============================
// 📥 LER FIIs
// ===============================

function lerFiis() {

    if (!fs.existsSync("lista_fiis.txt")) {

        console.log("⚠️ Arquivo lista_fiis.txt não encontrado")
        return []
    }

    return fs
        .readFileSync("lista_fiis.txt", "utf-8")
        .split(/[\r\n\s,]+/)
        .map(l => l.trim().toUpperCase())
        .filter(Boolean)
}

// ===============================
// 💾 CACHE
// ===============================

function lerCache(ticker) {

    const arquivo = path.join(PASTA_CACHE, ticker.toUpperCase() + ".csv")

    if (!fs.existsSync(arquivo)) return []

    return fs.readFileSync(arquivo, "utf-8")
        .split(/\r?\n/)
        .filter(l => l.trim())
        .map(linha => {

            const [dataCom, pagamento, valor] = linha.split(";")
            return { dataCom, pagamento, valor }
        })
}

function salvarCache(ticker, rendimentos) {

    if (!fs.existsSync(PASTA_CACHE)) {
        fs.mkdirSync(PASTA_CACHE)
    }

    const arquivo = path.join(PASTA_CACHE, ticker.toUpperCase() + ".csv")

    const conteudo = rendimentos
        .map(r => r.dataCom + ";" + r.pagamento + ";" + r.valor)
        .join("\n")

    fs.writeFileSync(arquivo, conteudo)
}

function mesAtualNoCache(ticker) {

    const arquivo = path.join(PASTA_CACHE, ticker.toUpperCase() + ".csv")

    if (!fs.existsSync(arquivo)) return false

    // Se o arquivo existe, checa a data de modificação
    const stat = fs.statSync(arquivo)
    const modificado = stat.mtime
    const hoje = new Date()

    // Atualizado se foi modificado no mesmo mês
    return modificado.getMonth() === hoje.getMonth()
        && modificado.getFullYear() === hoje.getFullYear()
}

// ===============================
// 📸 HISTÓRICO (fotografia mensal)
// ===============================

function mesAnoAtual() {

    const hoje = new Date()
    const mes = String(hoje.getMonth() + 1).padStart(2, "0")
    const ano = hoje.getFullYear()

    return `${mes}/${ano}`
}

function carregarHistorico() {

    if (!fs.existsSync(HISTORICO_FILE)) return {}

    const linhas = fs.readFileSync(HISTORICO_FILE, "utf-8")
        .split(/\r?\n/)
        .filter(l => l.trim())

    // formato: mesAno;ticker;meses
    const historico = {}

    for (let i = 1; i < linhas.length; i++) {

        const [mesAno, ticker, meses] = linhas[i].split(";")

        if (!historico[mesAno]) historico[mesAno] = {}

        historico[mesAno][ticker] = parseInt(meses)
    }

    return historico
}

function salvarHistorico(historico) {

    let csv = "mes_ano;ticker;meses\n"

    const meses = Object.keys(historico).sort()

    for (const mesAno of meses) {

        const tickers = Object.keys(historico[mesAno]).sort()

        for (const ticker of tickers) {

            csv += `${mesAno};${ticker};${historico[mesAno][ticker]}\n`
        }
    }

    fs.writeFileSync(HISTORICO_FILE, csv)
}

function mesAnterior() {

    const hoje = new Date()
    hoje.setMonth(hoje.getMonth() - 1)

    const mes = String(hoje.getMonth() + 1).padStart(2, "0")
    const ano = hoje.getFullYear()

    return `${mes}/${ano}`
}

// ===============================
// 🏢 SEGMENTOS
// ===============================

function carregarSegmentos() {

    if (!fs.existsSync(SEGMENTOS_FILE)) return {}

    const segmentos = {}

    fs.readFileSync(SEGMENTOS_FILE, "utf-8")
        .split(/\r?\n/)
        .filter(l => l.trim())
        .forEach(linha => {

            const idx = linha.indexOf(";")
            if (idx > 0) {
                const ticker = linha.substring(0, idx)
                const segmento = linha.substring(idx + 1)
                segmentos[ticker] = segmento
            }
        })

    return segmentos
}

function salvarSegmentos(segmentos) {

    if (!fs.existsSync(PASTA_CACHE)) {
        fs.mkdirSync(PASTA_CACHE)
    }

    const conteudo = Object.keys(segmentos).sort()
        .map(t => `${t};${segmentos[t]}`)
        .join("\n")

    fs.writeFileSync(SEGMENTOS_FILE, conteudo)
}

async function extrairSegmento(page) {

    return await page.evaluate(() => {

        const allText = document.body.innerText
        const match = allText.match(/SEGMENTO\n([^\n]+)/)

        return match ? match[1].trim() : null
    })
}

// ===============================
// 🎨 ANSI COLORS
// ===============================

const BG_YELLOW = "\x1b[43m"
const FG_BLACK = "\x1b[30m"
const RESET = "\x1b[0m"

// ===============================
// 🖥️ STATUS DINÂMICO
// ===============================

let statusJaExiste = false

function atualizarStatus({
    ticker = "",
    pagina = "",
    percentual = 0,
    fonte = "net"
}) {

    // remove status anterior
    if (statusJaExiste) {

        process.stdout.write("\x1b[4F")
        process.stdout.write("\x1b[J")
    }

    statusJaExiste = true

    const icone = fonte === "cache" ? "💾" : "🌐"
    const texto = fonte === "cache"
        ? `${icone} Cache: ${ticker}`
        : `${icone} Net: página ${pagina} do ${ticker}`

    console.log("")

    console.log(
        BG_YELLOW +
        FG_BLACK +
        `⏳ Total carregado: ${percentual.toFixed(1)}%`
        +
        RESET
    )

    console.log(
        BG_YELLOW +
        FG_BLACK +
        texto
        +
        RESET
    )

    console.log(
        BG_YELLOW +
        FG_BLACK +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        +
        RESET
    )
}

// ===============================
// 🧹 REMOVER STATUS
// ===============================

function removerStatus() {

    if (!statusJaExiste) {
        return
    }

    process.stdout.write("\x1b[4F")
    process.stdout.write("\x1b[J")

    statusJaExiste = false
}

// ===============================
// 📈 CALCULAR MESES SEM QUEBRA
// ===============================

function calcularMesesSemQuebra(historicoDividendos) {

    if (!historicoDividendos.length) {

        return {
            meses: 0,
            quebra: null
        }
    }

    const lista = historicoDividendos.map(h => {

        const valor = parseFloat(
            h.valor
                .replace(/\./g, "")
                .replace(",", ".")
        )

        return {
            dataCom: h.dataCom,
            valor
        }
    })

    let meses = 1
    let quebra = null

    for (let i = 0; i < lista.length - 2; i++) {

        const atual = lista[i]
        const proximo = lista[i + 1]
        const depois = lista[i + 2]

        if (atual.valor >= proximo.valor) {

            meses++
            continue
        }

        const ehPicoTemporario =

            proximo.valor > atual.valor
            &&
            depois.valor <= atual.valor

        if (ehPicoTemporario) {

            meses++
            continue
        }

        quebra = proximo.dataCom
        break
    }

    return {
        meses,
        quebra
    }
}

// ===============================
// 🌐 EXTRAIR TABELA
// ===============================

async function lerTabelaDividendos(page) {

    return await page.evaluate(() => {

        const linhas =
            Array.from(
                document.querySelectorAll("table tbody tr")
            )

        return linhas.map(linha => {

            return Array.from(
                linha.querySelectorAll("td")
            ).map(td => td.innerText.trim())
        })
    })
}

// ===============================
// 🌐 EXTRAIR RENDIMENTOS
// ===============================

async function extrairRendimentos(
    page,
    ticker,
    indice,
    total
) {

    const cacheExistente = lerCache(ticker)
    const datasCache = new Set(
        cacheExistente.map(r => `${r.dataCom}-${r.pagamento}-${r.valor}`)
    )

    const novos = []
    const registros = new Set()

    let pagina = 1
    let continuar = true

    while (continuar) {

        atualizarStatus({
            ticker,
            pagina,
            percentual: ((indice - 1) / total) * 100
        })

        await new Promise(r => setTimeout(r, 3000))

        const linhas =
            await lerTabelaDividendos(page)

        let encontrouNaPagina = 0

        for (const cols of linhas) {

            if (cols.length >= 4) {

                const tipo = cols[0]
                const dataCom = cols[1]
                const pagamento = cols[2]
                const valor = cols[3]

                const ehData =
                    /^\d{2}\/\d{2}\/\d{4}$/.test(dataCom)

                const ehValor =
                    /^[0-9.,]+$/.test(valor)

                if (
                    tipo.toUpperCase().includes("RENDIMENTO")
                    && ehData
                    && ehValor
                ) {

                    const chave =
                        `${dataCom}-${pagamento}-${valor}`

                    // Encontrou algo que já está no cache — para
                    if (datasCache.has(chave)) {

                        continuar = false
                        break
                    }

                    if (!registros.has(chave)) {

                        registros.add(chave)

                        novos.push({
                            dataCom,
                            pagamento,
                            valor
                        })

                        encontrouNaPagina++
                    }
                }
            }
        }

        if (!continuar) break

        const primeiroAntes =
            novos[
                novos.length - encontrouNaPagina
            ]?.dataCom

        const paginaAlvo = pagina + 1

        const clicou = await page.evaluate((paginaAlvo) => {

            const elementos =
                Array.from(
                    document.querySelectorAll("a, button")
                )

            const botao =
                elementos.find(el => {

                    const texto =
                        el.innerText?.trim()

                    return texto === paginaAlvo.toString()
                })

            if (!botao) {
                return false
            }

            const disabled =
                botao.disabled
                || botao.classList.contains("disabled")

            if (disabled) {
                return false
            }

            botao.scrollIntoView({
                behavior: "instant",
                block: "center"
            })

            botao.click()

            return true

        }, paginaAlvo)

        if (!clicou) {
            break
        }

        pagina++

        if (pagina > 20) {
            break
        }

        try {

            await page.waitForFunction(

                (primeiroAntes) => {

                    const linhas =
                        Array.from(
                            document.querySelectorAll("table tbody tr")
                        )

                    for (const linha of linhas) {

                        const cols =
                            Array.from(
                                linha.querySelectorAll("td")
                            ).map(td => td.innerText.trim())

                        if (cols[1] === primeiroAntes) {
                            return false
                        }
                    }

                    return true

                },

                {
                    timeout: 10000
                },

                primeiroAntes
            )

        } catch {

            continuar = false
        }

        await new Promise(r => setTimeout(r, 2000))
    }

    // Mescla novos (recentes) + cache (antigos)
    const completo = novos.concat(cacheExistente)

    // Salva sempre — mesmo vazio, marca que já foi verificado
    salvarCache(ticker, completo)

    return completo
}

// ===============================
// 🧾 GERAR HTML
// ===============================

function gerarHtml(resultados, historicoAnterior, historico, segmentos) {

    // Calcular últimos 3 meses
    const ultimos3Meses = []
    const hoje = new Date()

    for (let i = 1; i <= 3; i++) {

        const d = new Date(hoje)
        d.setMonth(d.getMonth() - i)

        const mes = String(d.getMonth() + 1).padStart(2, "0")
        const ano = d.getFullYear()

        ultimos3Meses.push(`${mes}/${ano}`)
    }

    let linhas = ""

    let contador = 0

    resultados.forEach(r => {

        contador++

        const destaque = r.meses >= 48 ? ' class="destaque"' : ''

        const mesesAnterior = historicoAnterior[r.ticker]
        let seta = ""

        if (mesesAnterior !== undefined && r.meses > mesesAnterior) {
            seta = ' <span class="seta-up">↑</span>'
        }

        // Bolinha azul se entrou nos 48+ nos últimos 3 meses
        if (r.meses >= 48) {

            let entrouRecente = false

            for (const mes of ultimos3Meses) {

                const hist = historico[mes]
                if (hist && hist[r.ticker] !== undefined && hist[r.ticker] < 48) {
                    entrouRecente = true
                    break
                }
            }

            if (entrouRecente) {
                seta = ' <span class="novo-48">●</span>'
            }
        }

        linhas += `
<tr${destaque}>
    <td>${contador}</td>
    <td>${r.ticker}${seta}</td>
    <td>${r.meses}</td>
    <td>${r.quebra || "Sem quebra"}</td>
    <td>${r.totalRendimentos}</td>
    <td>${segmentos[r.ticker] || "-"}</td>
</tr>
`
    })

    const html = `
<html>

<head>

<meta charset="UTF-8">

<style>

body{
    font-family:Arial;
    background:#f4f8ff;
    padding:40px;
}

h1{
    text-align:center;
    margin-bottom:30px;
}

table{
    border-collapse:collapse;
    width:1000px;
    margin:auto;
    background:white;
}

th{
    background:#4a90e2;
    color:white;
    padding:14px;
}

td{
    padding:12px;
    text-align:center;
}

tr:nth-child(even){
    background:#e6f0ff;
}

tr:nth-child(odd){
    background:#ffffff;
}

tr.destaque td{
    background:#d4edda;
    font-weight:bold;
}

.seta-up{
    color:#28a745;
    font-weight:bold;
    font-size:16px;
}

.novo-48{
    color:#007bff;
    font-weight:bold;
    font-size:16px;
}

.legenda{
    width:1000px;
    margin:20px auto;
    padding:14px 20px;
    background:#f8f9fa;
    border-left:5px solid #4a90e2;
    border-radius:4px;
    font-size:14px;
    line-height:1.8;
}

</style>

</head>

<body>

<h1>Scanner de FIIs</h1>

<table>

<thead>

<tr>
    <th>#</th>
    <th>FII</th>
    <th>Meses sem quebra</th>
    <th>Data da quebra</th>
    <th>Rendimentos encontrados</th>
    <th>Segmento</th>
</tr>

</thead>

<tbody>

${linhas}

</tbody>

</table>

<div class="legenda">
    🟢 <strong>Linhas em verde</strong>: FIIs com 48 meses ou mais sem queda nos rendimentos (4+ anos de estabilidade/crescimento).<br>
    <span class="seta-up">↑</span> <strong>Seta verde</strong>: FII aumentou o número de meses sem quebra em relação ao mês anterior.<br>
    <span class="novo-48">●</span> <strong>Bolinha azul</strong>: FII entrou na lista de 48+ meses sem quebra nos últimos 3 meses.
</div>

</body>

</html>
`

    fs.writeFileSync("resultado.html", html)
}

// ===============================
// 🌐 PROCESSAR FII
// ===============================

async function processarFii(
    browser,
    ticker,
    indice,
    total
) {

    const url =
        `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`

    let page = null

    try {

        atualizarStatus({
            ticker,
            pagina: 1,
            percentual: ((indice - 1) / total) * 100
        })

        page = await browser.newPage()

        await page.setViewport({
            width: 1600,
            height: 900
        })

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/137.0.0.0 Safari/537.36"
        )

        await page.goto(url, {
            waitUntil: "networkidle2",
            timeout: 0
        })

        await new Promise(r => setTimeout(r, 5000))

        await page.evaluate(() => {

            const tabelas =
                Array.from(document.querySelectorAll("table"))

            if (tabelas.length > 0) {

                tabelas[0].scrollIntoView({
                    behavior: "instant",
                    block: "center"
                })
            }
        })

        await new Promise(r => setTimeout(r, 3000))

        const historicoDividendos =
            await extrairRendimentos(
                page,
                ticker,
                indice,
                total
            )

        // Extrair segmento se ainda não tem no cache
        if (!segmentos[ticker]) {

            const segmento = await extrairSegmento(page)

            if (segmento) {
                segmentos[ticker] = segmento
            }
        }

        const resultado =
            calcularMesesSemQuebra(historicoDividendos)

        // remove somente a barra temporária
        removerStatus()

        // escreve resultado definitivo
        console.log(`📊 ${ticker}`)
        console.log(
            `📈 Meses sem quebra: ${resultado.meses}`
        )

        if (resultado.quebra) {

            console.log(
                `📉 Quebra encontrada em: ${resultado.quebra}`
            )
        }
        else {

            console.log(
                "✅ Nenhuma quebra encontrada"
            )
        }

        console.log(
            `✅ ${historicoDividendos.length} rendimentos encontrados`
        )

        console.log("")

        // recria status abaixo do histórico
        atualizarStatus({
            ticker: "",
            pagina: "",
            percentual: (indice / total) * 100
        })

        return {
            ticker,
            meses: resultado.meses,
            quebra: resultado.quebra,
            totalRendimentos: historicoDividendos.length
        }

    } catch (e) {

        removerStatus()

        console.log(`❌ Erro em ${ticker}`)
        console.log(e.message)
        console.log("")

        atualizarStatus({
            ticker: "",
            pagina: "",
            percentual: (indice / total) * 100
        })

        return null

    } finally {

        if (page) {

            try {
                await page.close()
            }
            catch (_) {}
        }
    }
}

// ===============================
// 🚀 MAIN
// ===============================

async function main() {

    const fiis = lerFiis()

    console.log("")
    console.log(`📊 ${fiis.length} FIIs carregados`)
    console.log("")

    atualizarStatus({
        ticker: "aguardando...",
        pagina: "-",
        percentual: 0
    })

    const browser = await puppeteer.launch({

        headless: true,

        args: [
            "--disable-extensions",
            "--disable-web-security",
            "--disable-features=IsolateOrigins"
        ]
    })

    const segmentos = carregarSegmentos()

    const resultados = []

    for (let i = 0; i < fiis.length; i++) {

        const fii = fiis[i]

        // Se o mês atual já está no cache, usa direto
        if (mesAtualNoCache(fii)) {

            atualizarStatus({
                ticker: fii,
                percentual: ((i) / fiis.length) * 100,
                fonte: "cache"
            })

            const cache = lerCache(fii)
            const resultado = calcularMesesSemQuebra(cache)

            removerStatus()

            console.log(`💾 ${fii} — ${resultado.meses} meses (cache)`)
            console.log("")

            atualizarStatus({
                ticker: "",
                percentual: ((i + 1) / fiis.length) * 100,
                fonte: "cache"
            })

            resultados.push({
                ticker: fii,
                meses: resultado.meses,
                quebra: resultado.quebra,
                totalRendimentos: cache.length
            })

            continue
        }

        const resultado =
            await processarFii(
                browser,
                fii,
                i + 1,
                fiis.length
            )

        if (resultado) {
            resultados.push(resultado)
        }
    }

    resultados.sort((a, b) => b.meses - a.meses)

    removerStatus()

    // Carregar histórico e comparar com mês anterior
    const historico = carregarHistorico()
    const mesAnt = mesAnterior()
    const historicoAnterior = historico[mesAnt] || {}

    // Salvar fotografia do mês atual
    const mesAtual = mesAnoAtual()
    historico[mesAtual] = {}

    for (const r of resultados) {
        historico[mesAtual][r.ticker] = r.meses
    }

    salvarHistorico(historico)

    gerarHtml(resultados, historicoAnterior, historico, segmentos)

    // Buscar segmentos faltantes
    const semSegmento = resultados
        .filter(r => !segmentos[r.ticker])
        .map(r => r.ticker)

    if (semSegmento.length > 0) {

        console.log(`🏢 Buscando segmentos de ${semSegmento.length} FIIs...`)

        for (const ticker of semSegmento) {

            try {

                process.stdout.write(`🏢 ${ticker}...`)

                const page = await browser.newPage()

                await page.setUserAgent(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/137.0.0.0 Safari/537.36"
                )

                await page.goto(
                    `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`,
                    { waitUntil: "networkidle2", timeout: 30000 }
                )

                await new Promise(r => setTimeout(r, 3000))

                const segmento = await extrairSegmento(page)

                if (segmento) {
                    segmentos[ticker] = segmento
                    process.stdout.write(` ${segmento}\n`)
                } else {
                    segmentos[ticker] = "N/A"
                    process.stdout.write(` não encontrado\n`)
                }

                await page.close()

            } catch (_) {

                segmentos[ticker] = "N/A"
                process.stdout.write(` erro\n`)
            }

            await new Promise(r => setTimeout(r, 2000))
        }

        // Regera o HTML com segmentos atualizados
        gerarHtml(resultados, historicoAnterior, historico, segmentos)
    }

    salvarSegmentos(segmentos)

    console.log("📄 HTML gerado: resultado.html")
    console.log("")
    console.log("✅ Finalizado")

    exec(`start "" "${path.resolve(__dirname, "resultado.html")}"`)

    await browser.close()
}

main()