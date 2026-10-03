Caratteri dei temi del sito (vedi ../temi.css, ../temi.js).

  josefin-sans.woff2, montserrat.woff2   i caratteri classici del sito (tema "Neubrutal"), qui solo per le anteprime
  titan-one.woff2, fredoka.woff2         tema "Sticker"
  nunito.woff2                           tema "Soft"
  chakra-petch.woff2, inconsolata.woff2  tema "Arcade"

  tema-<id>.css   fa prendere ai caratteri del tema il posto di 'Josefin Sans' (titoli) e 'Montserrat' (testo)
                  in tutto il sito; size-adjust e metriche di riga tengono uguali gli ingombri.
  anteprime.css   nomi propri dei caratteri, per le anteprime del selettore nel profilo.

Tutti i caratteri vengono da Google Fonts (sottoinsieme latino).
Licenza: SIL Open Font License 1.1 (https://openfontlicense.org).
Caratteri: Josefin Sans, Montserrat, Titan One, Fredoka, Nunito, Chakra Petch, Inconsolata.

Come sono calibrati (per cambiare un carattere e tenere le dimensioni degli oggetti)
  size-adjust       rapporto tra la larghezza di una frase di prova nel carattere originale (Josefin Sans 800 per i
                    titoli, Montserrat 600 per il testo) e nello stesso testo col carattere del tema, alla stessa
                    grandezza. Così il testo occupa la stessa larghezza e i bottoni a misura di testo non cambiano.
  ascent/descent-override, line-gap-override
                    rimettono le metriche di riga divise per size-adjust, così l'altezza di una riga è quella dell'originale
                    (Josefin Sans 100%, Montserrat 122% della grandezza).
  Per provare un carattere nuovo: stesso procedimento, poi controllare che larghezza e altezza di una frase di prova
  stiano entro l'1-2% dell'originale (a tema attivo, con document.fonts.ready).
