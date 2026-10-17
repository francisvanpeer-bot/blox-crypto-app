const tabelBody = document.getElementById('crypto-tabel-body');
const currencyBtn = document.getElementById('currency-btn');
const thPrijs = document.getElementById('th-prijs');

// Actieve valuta ('eur' of 'usd')
let huidigeValuta = 'eur';

function getValutaSymbool() {
    return huidigeValuta === 'eur' ? '€' : '$';
}

function getLocale() {
    return huidigeValuta === 'eur' ? 'nl-NL' : 'en-US';
}

function formatBedrag(waarde) {
    if (waarde === null || waarde === undefined) return 'N.B.';
    const getal = parseFloat(waarde);
    const symbool = getValutaSymbool();
    
    if (getal >= 1e12) return symbool + ' ' + (getal / 1e12).toFixed(2) + ' T';
    if (getal >= 1e9) return symbool + ' ' + (getal / 1e9).toFixed(2) + ' B';
    if (getal >= 1e6) return symbool + ' ' + (getal / 1e6).toFixed(2) + ' M';
    
    return symbool + ' ' + getal.toLocaleString(getLocale(), { maximumFractionDigits: 0 });
}

function formatPrijs(prijs) {
    const symbool = getValutaSymbool();
    const locale = getLocale();
    
    return prijs.toLocaleString(locale, {
        style: 'currency',
        currency: huidigeValuta.toUpperCase(),
        maximumFractionDigits: prijs < 1 ? 4 : 2
    });
}

function begrens(waarde, min, max) {
    return Math.min(Math.max(waarde, min), max);
}

function berekenScore(
    uurVerandering,
    dagVerandering,
    volume,
    marketCap,
    hoogsteMarketCap
) {
    // 1. Momentum: maximaal 25 punten voor 1 uur
    const uurScore = ((begrens(uurVerandering, -5, 5) + 5) / 10) * 25;

    // 2. Momentum: maximaal 25 punten voor 24 uur
    const dagScore = ((begrens(dagVerandering, -20, 20) + 20) / 40) * 25;

    // 3. Handelsactiviteit: maximaal 25 punten
    const volumeRatio = volume / (marketCap || 1);
    const liquiditeitScore = (begrens(volumeRatio, 0, 0.20) / 0.20) * 25;

    // 4. Marktwaarde: maximaal 10 punten.
    const capScore = hoogsteMarketCap > 0 && marketCap > 0
        ? 10 * Math.log1p(marketCap) / Math.log1p(hoogsteMarketCap)
        : 0;

    // 5. Trendbevestiging: maximaal 15 punten
    let trendScore = 0;
    if (uurVerandering > 0 && dagVerandering > 0) {
        trendScore = 15;
    } else if (uurVerandering > 0 || dagVerandering > 0) {
        trendScore = 7.5;
    }

    return Math.round(uurScore + dagScore + liquiditeitScore + capScore + trendScore);
}

function getScoreKlasse(score) {
    if (score >= 65) return 'score-hoog';
    if (score >= 40) return 'score-gemiddeld';
    return 'score-laag';
}

function genereerSparklineSVG(prijzen, isPositief) {
    const breedte = 100;
    const hoogte = 30;
    const min = Math.min(...prijzen);
    const max = Math.max(...prijzen);
    const bereik = max - min || 1;

    const punten = prijzen.map((p, index) => {
        const x = (index / (prijzen.length - 1)) * breedte;
        const y = hoogte - ((p - min) / bereik) * (hoogte - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' L ');

    const kleurKlasse = isPositief ? 'positief' : 'negatief';

    return `
        <svg class="sparkline" viewBox="0 0 ${breedte} ${hoogte}">
            <path class="sparkline-path ${kleurKlasse}" d="M ${punten}" />
        </svg>
    `;
}

async function laadEchteData() {
    console.log(`Top 50 live crypto-data ophalen via CoinGecko in ${huidigeValuta.toUpperCase()}...`);

    const UITGESLOTEN_IDS = new Set([
        'tether', 'usd-coin', 'ethena-usde', 'dai', 'world-liberty-financial-usd',
        'usds', 'first-digital-usd', 'paypal-usd', 'true-usd', 'pax-dollar',
        'gemini-dollar', 'frax', 'usdd', 'blackrock-usd-institutional-digital-liquidity-fund',
        'usyc', 'circle-usyc', 'ondo-us-dollar-yield', 'usd0', 'tether-gold', 'pax-gold'
    ]);
    const UITGESLOTEN_SYMBOLEN = new Set([
        'usdt', 'usdc', 'usde', 'dai', 'usd1', 'usds', 'fdusd', 'pyusd',
        'tusd', 'usdp', 'gusd', 'frax', 'usdd', 'usdtb', 'usyc', 'buidl', 'xaut'
    ]);

    function isUitgesloten(munt) {
        const id = (munt.id || '').toLowerCase();
        const symbool = (munt.symbol || '').toLowerCase();
        const naam = (munt.name || '').toLowerCase();
        if (UITGESLOTEN_IDS.has(id)) return true;
        if (UITGESLOTEN_SYMBOLEN.has(symbool)) return true;
        if (naam.includes('blackrock') || naam.includes('usyc')) return true;
        return false;
    }

    try {
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${huidigeValuta}&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=1h,24h`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Netwerkrespons was niet oké');
        }
        
        const data = await response.json();

        const gefilterdeData = data.filter(
            (munt) => !isUitgesloten(munt) && (munt.total_volume || 0) > 0
        );

        let heeftBCH = gefilterdeData.some(munt => munt.id === 'bitcoin-cash');
        if (!heeftBCH) {
            try {
                const bchResponse = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=${huidigeValuta}&ids=bitcoin-cash&sparkline=true&price_change_percentage=1h,24h`);
                const bchData = await bchResponse.json();
                if (bchData.length > 0 && !isUitgesloten(bchData[0])) {
                    gefilterdeData.push(bchData[0]);
                }
            } catch (bchError) {
                console.warn('Kon Bitcoin Cash niet apart ophalen:', bchError);
            }
        }

        const dataVoorScores = gefilterdeData;
        const hoogsteMarketCap = dataVoorScores[0]?.market_cap || 1;

        const verwerkteMunten = dataVoorScores.map((munt) => {
            const prijs = munt.current_price;
            const change1h = munt.price_change_percentage_1h_in_currency ?? munt.price_change_percentage_1h ?? 0;
            const change24h = munt.price_change_percentage_24h_in_currency ?? munt.price_change_percentage_24h ?? 0;
            const volume = munt.total_volume;
            const marketCap = munt.market_cap;

            const score = berekenScore(change1h, change24h, volume, marketCap, hoogsteMarketCap);

            let naam = munt.name;
            if (naam.includes('BlackRock USD Institutional Digital Liquidity Fund')) {
                naam = 'BlackRock';
            }

            return {
                id: munt.id,
                name: naam,
                price: prijs,
                change1h: change1h,
                change24h: change24h,
                volume: volume,
                cap: marketCap,
                sparkline: munt.sparkline_in_7d ? munt.sparkline_in_7d.price : [],
                score: score
            };
        });

        verwerkteMunten.sort((a, b) => b.score - a.score);
        let top50 = verwerkteMunten.slice(0, 50);

        const bch = verwerkteMunten.find((munt) => munt.id === 'bitcoin-cash');
        const bchInTop50 = top50.some((munt) => munt.id === 'bitcoin-cash');
        if (bch && !bchInTop50) {
            top50[top50.length - 1] = bch;
        }

        tabelBody.innerHTML = '';

        top50.forEach((munt, index) => {
            const prijsFormatted = formatPrijs(munt.price);
            const volume = formatBedrag(munt.volume);
            const marketCap = formatBedrag(munt.cap);
            
            const scoreKlasse = getScoreKlasse(munt.score);

            const isPositiefUur = munt.change1h >= 0;
            const uurKleur = isPositiefUur ? 'positief' : 'negatief';
            const uurTeken = isPositiefUur ? '+' : '';
            const uurTekst = `${uurTeken}${munt.change1h.toFixed(2)}%`;

            const isPositiefDag = munt.change24h >= 0;
            const dagKleur = isPositiefDag ? 'positief' : 'negatief';
            const dagTeken = isPositiefDag ? '+' : '';
            const dagTekst = `${dagTeken}${munt.change24h.toFixed(2)}%`;

            const isPositief = isPositiefDag;

            let grafiekPrijzen = munt.sparkline;
            if (!grafiekPrijzen || grafiekPrijzen.length === 0) {
                grafiekPrijzen = [munt.price, munt.price];
            } else {
                grafiekPrijzen = grafiekPrijzen.slice(-24);
            }
            
            const sparklineHTML = genereerSparklineSVG(grafiekPrijzen, isPositief);

            const bchMarkering = munt.id === 'bitcoin-cash' ? ' ⭐' : '';
            const rij = document.createElement('tr');
            rij.innerHTML = `
                <td>${index + 1}</td>
                <td><strong>${munt.name}${bchMarkering}</strong></td>
                <td>${prijsFormatted}</td>
                <td class="${uurKleur}">${uurTekst}</td>
                <td class="${dagKleur}">${dagTekst}</td>
                <td>${sparklineHTML}</td>
                <td>${volume}</td>
                <td>${marketCap}</td>
                <td><span class="score-badge ${scoreKlasse}">${munt.score}</span></td>
            `;
            
            tabelBody.appendChild(rij);
        });

    } catch (error) {
        console.error('Fout bij het ophalen van live data:', error);
        tabelBody.innerHTML = `<tr><td colspan="9" class="loading" style="color: #f87171;">Kon geen live data ophalen (mogelijk rate-limit bereikt). Probeer het later nog eens.</td></tr>`;
    }
}

// Event listener voor de valuta-wisselaar knop
currencyBtn.addEventListener('click', () => {
    huidigeValuta = huidigeValuta === 'eur' ? 'usd' : 'eur';
    
    // Update knoptekst en kolomkop
    if (huidigeValuta === 'eur') {
        currencyBtn.textContent = 'Valuta: € (EUR)';
        thPrijs.textContent = 'Prijs (€)';
    } else {
        currencyBtn.textContent = 'Valuta: $ (USD)';
        thPrijs.textContent = 'Prijs ($)';
    }
    
    tabelBody.innerHTML = `<tr><td colspan="9" class="loading">Data herladen in ${huidigeValuta.toUpperCase()}...</td></tr>`;
    laadEchteData();
});

// Start direct bij het laden
laadEchteData();

// Ververs automatisch elke 60 seconden
setInterval(laadEchteData, 60000);