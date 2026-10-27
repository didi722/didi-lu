'use strict';
// Un DOM minuscolo per leggere in un test l'HTML dei tooltip (senza browser): solo quello che serve a docs/app-schede.js.
//   parsa(html) -> elemento radice (dataset, className, getAttribute, childNodes, textContent, innerHTML, querySelector(All), closest)
// Selettori: lista con virgola, discendente (spazio), figlio (>), e per ogni pezzo tag, .classe, :not(.classe | tag), :scope.
const VUOTI = new Set(['br', 'img', 'hr', 'input']);
const ENTITA = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&#x25ce;': '◎', '&#x2713;': '✓', '&nbsp;': ' ' };
const decodifica = t => t.replace(/&#?\w+;/g, e => ENTITA[e] || e);

function elemento(tag, attributi, genitore) {
    const el = {
        nodeType: 1, tag, tagName: tag.toUpperCase(), attributi: attributi || {}, genitore: genitore || null, childNodes: [], dataset: {},
        get className() { return this.attributi.class || ''; },
        getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attributi, n) ? this.attributi[n] : null; },
        get children() { return this.childNodes.filter(n => n.nodeType === 1); },
        get textContent() { return this.childNodes.map(n => n.nodeType === 3 ? n.textContent : n.textContent).join(''); },
        get innerHTML() { return this.childNodes.map(serializza).join(''); },
        set innerHTML(v) { this._html = v; this.childNodes = []; },
        discendenti() { const out = []; const giu = n => { for (const f of n.children) { out.push(f); giu(f); } }; giu(this); return out; },
        querySelectorAll(sel) { return interroga(this, sel); },
        querySelector(sel) { return interroga(this, sel)[0] || null; },
        closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.genitore) if (n.genitore !== undefined && corrisponde(n, analizzaPezzo(sel.trim()), this)) return n; return null; },
        addEventListener() { /* niente eventi */ }
    };
    return el;
}

const testo = (t, genitore) => ({ nodeType: 3, textContent: t, genitore });

function serializza(n) {
    if (n.nodeType === 3) return n.textContent;
    const attr = Object.entries(n.attributi).map(([k, v]) => ` ${k}="${v}"`).join('');
    return VUOTI.has(n.tag) ? `<${n.tag}${attr}>` : `<${n.tag}${attr}>${n.innerHTML}</${n.tag}>`;
}

function parsa(html) {
    const radice = elemento('radice', {}, null);
    let corrente = radice;
    const rx = /<!--[\s\S]*?-->|<\/(\w+)\s*>|<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
    for (const m of html.matchAll(rx)) {
        if (m[1]) {
            let n = corrente;
            while (n && n.tag !== m[1]) n = n.genitore;
            if (n && n.genitore) corrente = n.genitore;
        } else if (m[2]) {
            const attributi = {};
            for (const a of (m[3] || '').matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributi[a[1]] = a[2] === undefined ? '' : decodifica(a[2]);
            const el = elemento(m[2].toLowerCase(), attributi, corrente);
            corrente.childNodes.push(el);
            if (!VUOTI.has(el.tag) && !m[4]) corrente = el;
        } else if (m[5] !== undefined) {
            corrente.childNodes.push(testo(decodifica(m[5]), corrente));
        }
    }
    return radice;
}

// ---- selettori ----
function analizzaPezzo(s) {
    const p = { tag: '', classi: [], no: [], scope: false };
    for (const m of s.matchAll(/:not\(([^)]*)\)|:scope|\.([\w-]+)|([a-z][\w-]*)/g)) {
        if (m[0] === ':scope') p.scope = true;
        else if (m[1] !== undefined) p.no.push(analizzaPezzo(m[1].trim()));
        else if (m[2]) p.classi.push(m[2]);
        else if (m[3]) p.tag = m[3];
    }
    return p;
}
function corrisponde(el, p, scope) {
    if (p.scope) return el === scope;
    if (p.tag && el.tag !== p.tag) return false;
    const classi = el.className.split(/\s+/);
    if (!p.classi.every(c => classi.includes(c))) return false;
    return !p.no.some(n => corrisponde(el, n, scope));
}
function analizzaSelettore(s) {
    const pezzi = [];
    let comb = ' ';
    for (const t of s.replace(/\s*>\s*/g, ' > ').trim().split(/\s+/)) {
        if (t === '>') { comb = '>'; continue; }
        pezzi.push({ comb, p: analizzaPezzo(t) });
        comb = ' ';
    }
    return pezzi;
}
function combacia(el, pezzi, i, scope) {
    if (!corrisponde(el, pezzi[i].p, scope)) return false;
    if (i === 0) return true;
    const comb = pezzi[i].comb;
    let n = el.genitore;
    while (n && n.nodeType === 1) {
        if (n.genitore !== null || pezzi[i - 1].p.scope) { if (combacia(n, pezzi, i - 1, scope)) return true; }
        if (comb === '>') return false;
        n = n.genitore;
    }
    return false;
}
function interroga(radice, sel) {
    const liste = String(sel).split(',').map(analizzaSelettore);
    return radice.discendenti().filter(el => liste.some(l => combacia(el, l, l.length - 1, radice)));
}

module.exports = { parsa };
