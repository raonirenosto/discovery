const fs = require("fs")
const puppeteer = require("puppeteer")

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
    percentual = 0
}) {

    // remove status anterior
    if (statusJaExiste) {

        process.stdout.write("\x1b[4F")
        process.stdout.write("\x1b[J")
    }

    statusJaExiste = true

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
        `🔄 Carregando: página ${pagina} do ${ticker}`
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

    const historicoDividendos = []
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

                    if (!registros.has(chave)) {

                        registros.add(chave)

                        historicoDividendos.push({
                            dataCom,
                            pagamento,
                            valor
                        })

                        encontrouNaPagina++
                    }
                }
            }
        }

        const primeiroAntes =
            historicoDividendos[
                historicoDividendos.length - encontrouNaPagina
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

    return historicoDividendos
}

// ===============================
// 🧾 GERAR HTML
// ===============================

function gerarHtml(resultados) {

    let linhas = ""

    resultados.forEach(r => {

        linhas += `
<tr>
    <td>${r.ticker}</td>
    <td>${r.meses}</td>
    <td>${r.quebra || "Sem quebra"}</td>
    <td>${r.totalRendimentos}</td>
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

</style>

</head>

<body>

<h1>Scanner de FIIs</h1>

<table>

<thead>

<tr>
    <th>FII</th>
    <th>Meses sem quebra</th>
    <th>Data da quebra</th>
    <th>Rendimentos encontrados</th>
</tr>

</thead>

<tbody>

${linhas}

</tbody>

</table>

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

    const resultados = []

    for (let i = 0; i < fiis.length; i++) {

        const fii = fiis[i]

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

    gerarHtml(resultados)

    console.log("📄 HTML gerado: resultado.html")
    console.log("")
    console.log("✅ Finalizado")

    await browser.close()
}

main()