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
// 📈 CALCULAR MESES CRESCENTES
// ===============================

function calcularMesesCrescentes(historicoDividendos) {

    if (!historicoDividendos.length) {
        return 0
    }

    const listaOriginal = historicoDividendos.map(h => {

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

    const lista = []

    for (let i = 0; i < listaOriginal.length; i++) {

        const atual = listaOriginal[i]
        const anterior = listaOriginal[i + 1]
        const proximo = listaOriginal[i + 2]

        const partes =
            atual.dataCom.split("/")

        const mes =
            partes[1]

        // ignorar janeiro e junho
        if (mes === "01" || mes === "06") {
            continue
        }

        // ignorar pico temporário
        if (anterior && proximo) {

            const ehPico =
                atual.valor > anterior.valor
                && proximo.valor >= anterior.valor

            if (ehPico) {
                continue
            }
        }

        lista.push(atual)
    }

    let meses = 1

    for (let i = 0; i < lista.length - 1; i++) {

        const atual = lista[i]
        const anterior = lista[i + 1]

        if (atual.valor >= anterior.valor) {
            meses++
        }
        else {
            break
        }
    }

    return meses
}

// ===============================
// 🌐 EXTRAIR TABELA VIA DOM REAL
// ===============================

async function lerTabelaDividendos(page) {

    return await page.evaluate(() => {

        const linhas =
            Array.from(
                document.querySelectorAll("table tbody tr")
            )

        return linhas.map(linha => {

            const colunas =
                Array.from(
                    linha.querySelectorAll("td")
                ).map(td => td.innerText.trim())

            return colunas
        })
    })
}

// ===============================
// 🌐 EXTRAIR RENDIMENTOS
// ===============================

async function extrairRendimentos(page) {

    const historicoDividendos = []
    const registros = new Set()

    let pagina = 1
    let continuar = true

    while (continuar) {

        console.log("")
        console.log(`📄 Página ${pagina}`)

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

                        console.log(
                            `• ${dataCom} | ${pagamento} | ${valor}`
                        )
                    }
                }
            }
        }

        if (encontrouNaPagina === 0) {

            console.log("⚠️ Página ignorada")
        }

        // ===============================
        // SALVAR PRIMEIRO ITEM
        // ===============================

        const primeiroAntes =
            historicoDividendos[
                historicoDividendos.length - encontrouNaPagina
            ]?.dataCom

        // ===============================
        // TENTAR CLICAR NA PRÓXIMA PÁGINA
        // ===============================

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

        // ===============================
        // ESPERAR DOM MUDAR
        // ===============================

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

            console.log("⚠️ Página não mudou")
            continuar = false
        }

        await new Promise(r => setTimeout(r, 2000))
    }

    return historicoDividendos
}

// ===============================
// 🌐 PROCESSAR FII
// ===============================

async function processarFii(browser, ticker) {

    const url =
        `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`

    let page = null

    try {

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

        console.log("")
        console.log("==================================================")
        console.log(`📊 ${ticker}`)
        console.log("==================================================")

        await page.goto(url, {
            waitUntil: "networkidle2",
            timeout: 0
        })

        await new Promise(r => setTimeout(r, 5000))

        // scroll até a tabela carregar
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
            await extrairRendimentos(page)

        const mesesCrescentes =
            calcularMesesCrescentes(historicoDividendos)

        console.log("")
        console.log(
            `📈 Rendimentos iguais/crescentes: ${mesesCrescentes} meses`
        )

        console.log(
            `✅ ${historicoDividendos.length} rendimentos encontrados`
        )

    } catch (e) {

        console.log(`❌ Erro em ${ticker}`)
        console.log(e.message)

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

    const browser = await puppeteer.launch({

        headless: true,

        args: [
            "--disable-extensions",
            "--disable-web-security",
            "--disable-features=IsolateOrigins"
        ]
    })

    for (const fii of fiis) {

        await processarFii(browser, fii)
    }

    console.log("")
    console.log("✅ Finalizado")

    await browser.close()
}

main()