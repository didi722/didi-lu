'use strict';
// Un lettore di GIF animate, quanto basta per sapere dove sta il disegno in ogni fotogramma (nessuna dipendenza).
// leggiGif(buffer) → { larghezza, altezza, fotogrammi: [{ alfa: Uint8Array(l * a) }] }: per ogni fotogramma già composto (con i metodi di smaltimento della GIF)
// l'opacità di ogni pixel (0 = trasparente).

function lzw(dati, minimo, quanti) {
    const clear = 1 << minimo, fine = clear + 1;
    const fuori = new Uint8Array(quanti);
    let n = 0, dimensione = minimo + 1, prossimo = fine + 1;
    const prefisso = new Int16Array(4096), suffisso = new Uint8Array(4096), pila = new Uint8Array(4097);
    let bit = 0, byte = 0, precedente = -1, primo = 0;
    const leggi = () => {
        while (bit < dimensione) { if (byte >= dati.length) return -1; bitsBuf |= dati[byte++] << bit; bit += 8; }
        const v = bitsBuf & ((1 << dimensione) - 1);
        bitsBuf >>= dimensione; bit -= dimensione;
        return v;
    };
    let bitsBuf = 0;
    bit = 0;
    for (;;) {
        const codice = leggi();
        if (codice < 0 || codice === fine) break;
        if (codice === clear) { dimensione = minimo + 1; prossimo = fine + 1; precedente = -1; continue; }
        let c = codice, sp = 0;
        if (precedente === -1) { if (n < quanti) fuori[n++] = codice; precedente = codice; primo = codice; continue; }
        if (c >= prossimo) { pila[sp++] = primo; c = precedente; }
        while (c >= clear) { pila[sp++] = suffisso[c]; c = prefisso[c]; }
        primo = c;
        pila[sp++] = c;
        while (sp > 0 && n < quanti) fuori[n++] = pila[--sp];
        if (prossimo < 4096) {
            prefisso[prossimo] = precedente; suffisso[prossimo] = primo; prossimo++;
            if (prossimo === (1 << dimensione) && dimensione < 12) dimensione++;
        }
        precedente = codice;
    }
    return fuori;
}

function leggiGif(buf) {
    if (buf.toString('latin1', 0, 3) !== 'GIF') throw new Error('non è una GIF');
    let p = 6;
    const L = buf.readUInt16LE(p), A = buf.readUInt16LE(p + 2); p += 4;
    const flag = buf[p]; p += 3;
    if (flag & 0x80) p += 3 * (1 << ((flag & 7) + 1));
    let tela = new Uint8Array(L * A);                // opacità composta
    const fotogrammi = [];
    let gce = null;
    while (p < buf.length) {
        const b = buf[p++];
        if (b === 0x3B) break;
        if (b === 0x21) {
            const tipo = buf[p++];
            if (tipo === 0xF9) gce = { smaltimento: (buf[p + 1] >> 2) & 7, trasparente: (buf[p + 1] & 1) ? buf[p + 4] : -1 };
            while (buf[p] !== 0) p += buf[p] + 1;
            p++;
        } else if (b === 0x2C) {
            const x = buf.readUInt16LE(p), y = buf.readUInt16LE(p + 2), w = buf.readUInt16LE(p + 4), h = buf.readUInt16LE(p + 6);
            const f = buf[p + 8]; p += 9;
            if (f & 0x80) p += 3 * (1 << ((f & 7) + 1));
            const minimo = buf[p++];
            const blocchi = [];
            while (buf[p] !== 0) { blocchi.push(buf.subarray(p + 1, p + 1 + buf[p])); p += buf[p] + 1; }
            p++;
            const indici = lzw(Buffer.concat(blocchi), minimo, w * h);
            const g = gce || { smaltimento: 0, trasparente: -1 };
            const prima = g.smaltimento === 3 ? tela.slice() : null;
            // l'immagine interlacciata: le righe arrivano a gruppi
            const righe = [];
            if (f & 0x40) { for (const [da, passo] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let r = da; r < h; r += passo) righe.push(r); } else for (let r = 0; r < h; r++) righe.push(r);
            righe.forEach((riga, k) => {
                for (let c = 0; c < w; c++) {
                    const idx = indici[k * w + c];
                    const X = x + c, Y = y + riga;
                    if (X >= L || Y >= A) continue;
                    if (idx !== g.trasparente) tela[Y * L + X] = 255;
                }
            });
            fotogrammi.push({ alfa: tela.slice() });
            if (g.smaltimento === 2) { for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const X = x + c, Y = y + r; if (X < L && Y < A) tela[Y * L + X] = 0; } }
            else if (g.smaltimento === 3 && prima) tela = prima;
            gce = null;
        } else break;
    }
    return { larghezza: L, altezza: A, fotogrammi };
}

/** Dove sta il disegno: { visibile: altezza del disegno più alto tra i fotogrammi, tipico: la mediana, sotto: spazio vuoto sotto il disegno più basso, sopra, larghezza } */
function misura(gif) {
    const { larghezza: L, altezza: A } = gif;
    let visibile = 0, sotto = A, sopra = A, larghezza = 0;
    const altezze = [];
    for (const { alfa } of gif.fotogrammi) {
        let y0 = A, y1 = -1, x0 = L, x1 = -1;
        for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) if (alfa[y * L + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
        if (y1 < 0) continue;
        altezze.push(y1 - y0 + 1);
        visibile = Math.max(visibile, y1 - y0 + 1);
        sotto = Math.min(sotto, A - 1 - y1);
        sopra = Math.min(sopra, y0);
        larghezza = Math.max(larghezza, x1 - x0 + 1);
    }
    altezze.sort((a, b) => a - b);
    const tipico = altezze.length ? altezze[Math.floor(altezze.length / 2)] : A;      // il disegno di tutti i giorni, non quello allungato a metà salto
    return { larghezzaTela: L, altezzaTela: A, visibile, tipico, sotto, sopra, larghezza };
}

module.exports = { leggiGif, misura };
