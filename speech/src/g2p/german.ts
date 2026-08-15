import { contentHash } from "../hash.js";
import { VOWEL_LENGTH_CLASS } from "../phones.js";
import type {
  G2pPhone,
  G2pResult,
  G2pWord,
  SpeechComponentDescriptor,
} from "../types.js";

interface LexiconEntry {
  phones: string[];
  stress_syllable: number;
}

const LEXICON: Record<string, LexiconEntry> = {
  wir: { phones: ["v", "iː", "ɐ"], stress_syllable: 1 },
  bieten: { phones: ["b", "iː", "t", "ə", "n"], stress_syllable: 1 },
  ihnen: { phones: ["iː", "n", "ə", "n"], stress_syllable: 1 },
  diesen: { phones: ["d", "iː", "z", "ə", "n"], stress_syllable: 1 },
  termin: { phones: ["t", "ɛ", "ʁ", "m", "iː", "n"], stress_syllable: 2 },
  an: { phones: ["a", "n"], stress_syllable: 1 },
  sprechen: { phones: ["ʃ", "p", "ʁ", "ɛ", "ç", "ə", "n"], stress_syllable: 1 },
  ich: { phones: ["ɪ", "ç"], stress_syllable: 1 },
  auch: { phones: ["a", "ʊ", "x"], stress_syllable: 1 },
  nicht: { phones: ["n", "ɪ", "ç", "t"], stress_syllable: 1 },
  gut: { phones: ["g", "uː", "t"], stress_syllable: 1 },
  morgen: { phones: ["m", "ɔ", "ʁ", "g", "ə", "n"], stress_syllable: 1 },
  danke: { phones: ["d", "a", "ŋ", "k", "ə"], stress_syllable: 1 },
  bitte: { phones: ["b", "ɪ", "t", "ə"], stress_syllable: 1 },
  hotel: { phones: ["h", "o", "t", "ɛ", "l"], stress_syllable: 2 },
  zimmer: { phones: ["ts", "ɪ", "m", "ɐ"], stress_syllable: 1 },
  tag: { phones: ["t", "aː", "k"], stress_syllable: 1 },
  haus: { phones: ["h", "a", "ʊ", "s"], stress_syllable: 1 },
  buch: { phones: ["b", "uː", "x"], stress_syllable: 1 },
  reservierung: {
    phones: ["ʁ", "ɛ", "z", "ɛ", "ʁ", "v", "iː", "ʁ", "ʊ", "ŋ"],
    stress_syllable: 3,
  },
  willkommen: { phones: ["v", "ɪ", "l", "k", "ɔ", "m", "ə", "n"], stress_syllable: 2 },
  wie: { phones: ["v", "iː"], stress_syllable: 1 },
  "spät": { phones: ["ʃ", "p", "ɛː", "t"], stress_syllable: 1 },
  "schön": { phones: ["ʃ", "øː", "n"], stress_syllable: 1 },
  "über": { phones: ["yː", "b", "ɐ"], stress_syllable: 1 },
  müde: { phones: ["m", "yː", "d", "ə"], stress_syllable: 1 },
};

const FRONT_CH_CONTEXT = new Set(["i", "e", "ü", "ö", "l", "m", "n", "r", "ä", "y"]);

function lexiconWord(word: string): G2pWord {
  const entry = LEXICON[word];
  const phones: G2pPhone[] = entry.phones.map((symbol) => ({
    symbol,
    ...(VOWEL_LENGTH_CLASS[symbol] ? { length_class: VOWEL_LENGTH_CLASS[symbol] } : {}),
  }));
  return {
    text: word,
    phones,
    stress_syllable: entry.stress_syllable,
    from_lexicon: true,
  };
}

interface RuleOutput {
  phones: string[];
  uncertain_symbols: number[];
}

function applyRules(rawWord: string): RuleOutput {
  const w = rawWord.toLowerCase();
  const phones: string[] = [];
  const uncertain_symbols: number[] = [];
  const push = (symbol: string, uncertain = false) => {
    phones.push(symbol);
    if (uncertain) uncertain_symbols.push(phones.length - 1);
  };

  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    const prev = i > 0 ? w[i - 1] : "";
    const atStart = i === 0;
    const atEnd = i === w.length - 1;

    if (rest.startsWith("tsch")) { push("tʃ"); i += 4; continue; }
    if (rest.startsWith("sch")) { push("ʃ"); i += 3; continue; }
    if (rest.startsWith("chs")) { push("k"); push("s"); i += 3; continue; }
    if (rest.startsWith("ck")) { push("k"); i += 2; continue; }
    if (rest.startsWith("tz")) { push("ts"); i += 2; continue; }
    if (rest.startsWith("ph")) { push("f"); i += 2; continue; }
    if (rest.startsWith("qu")) { push("k"); push("v"); i += 2; continue; }
    if (rest.startsWith("pf")) { push("p"); push("f"); i += 2; continue; }
    if (rest.startsWith("ng") && !atStart) { push("ŋ"); i += 2; continue; }
    if (rest.startsWith("nk") && !atStart) { push("ŋ"); push("k"); i += 2; continue; }
    if (rest.startsWith("ch")) {
      if (FRONT_CH_CONTEXT.has(prev)) push("ç", atStart);
      else if (["a", "o", "u"].includes(prev)) push("x");
      else push("ç", true);
      i += 2;
      continue;
    }
    if (rest.startsWith("ieh")) { push("iː"); i += 3; continue; }
    if (rest.startsWith("ie")) { push("iː"); i += 2; continue; }
    if (rest.startsWith("ei") || rest.startsWith("ai")) { push("aɪ"); i += 2; continue; }
    if (rest.startsWith("eu") || rest.startsWith("äu")) { push("ɔʏ"); i += 2; continue; }
    if (rest.startsWith("au")) { push("aʊ"); i += 2; continue; }
    if (rest.startsWith("aa")) { push("aː"); i += 2; continue; }
    if (rest.startsWith("ee")) { push("eː"); i += 2; continue; }
    if (rest.startsWith("oo")) { push("oː"); i += 2; continue; }
    if (rest.startsWith("ä")) { push("ɛː", true); i += 1; continue; }
    if (rest.startsWith("ö")) { push("øː", true); i += 1; continue; }
    if (rest.startsWith("ü")) { push("yː", true); i += 1; continue; }
    if (rest.startsWith("ß")) { push("s"); i += 1; continue; }

    if (atStart && rest.startsWith("sp")) { push("ʃ"); push("p"); i += 2; continue; }
    if (atStart && rest.startsWith("st")) { push("ʃ"); push("t"); i += 2; continue; }

    if (rest.startsWith("en") && w.length - i <= 2) { push("ə"); push("n"); i += 2; continue; }
    if (rest.startsWith("er") && w.length - i <= 2) { push("ɐ"); i += 2; continue; }
    if (rest[0] === "e" && atEnd) { push("ə", true); i += 1; continue; }
    if (rest[0] === "r" && atEnd && "aeiouäöü".includes(prev)) { push("ɐ", true); i += 1; continue; }

    switch (rest[0]) {
      case "b": push(atEnd ? "p" : "b"); break;
      case "d": push(atEnd ? "t" : "d"); break;
      case "g": push(atEnd ? "k" : "g"); break;
      case "s": push(atStart && i + 1 < w.length && "aeiouäöü".includes(w[i + 1]) ? "z" : "s"); break;
      case "v": push("f"); break;
      case "w": push("v"); break;
      case "j": push("j"); break;
      case "z": push("ts"); break;
      case "r": push("ʁ", true); break;
      case "h": if (!"aeiouäöü".includes(prev)) push("h"); break;
      case "i": push(atEnd || !isShorteningContext(w, i) ? "iː" : "ɪ", true); break;
      case "u": push(atEnd || !isShorteningContext(w, i) ? "uː" : "ʊ", true); break;
      case "o": push(atEnd || !isShorteningContext(w, i) ? "oː" : "ɔ", true); break;
      case "e": push(atEnd || !isShorteningContext(w, i) ? "eː" : "ɛ", true); break;
      case "a": push(atEnd || !isShorteningContext(w, i) ? "aː" : "a", true); break;
      default: push(rest[0], true); break;
    }
    i += 1;
  }

  return { phones, uncertain_symbols };
}

function isShorteningContext(word: string, vowelIndex: number): boolean {
  const after = word.slice(vowelIndex + 1);
  const consonantRun = after.match(/^[bcdfghjklmnpqrstvwxz]*/)?.[0] ?? "";
  return consonantRun.length >= 2;
}

function ruleWord(word: string): G2pWord {
  const { phones, uncertain_symbols } = applyRules(word);
  const g2pPhones: G2pPhone[] = phones.map((symbol, index) => ({
    symbol,
    ...(VOWEL_LENGTH_CLASS[symbol] ? { length_class: VOWEL_LENGTH_CLASS[symbol] } : {}),
    ...(uncertain_symbols.includes(index) ? { uncertain: true } : {}),
  }));
  return {
    text: word,
    phones: g2pPhones,
    from_lexicon: false,
    uncertain: true,
  };
}

export const GERMAN_G2P_DESCRIPTOR: SpeechComponentDescriptor = {
  component_ref: "component.g2p.german-rules",
  role: "g2p",
  provider_id: "provider.llos.local",
  model_id: "german-lexicon-grapheme-rules",
  model_version: "0.1.0",
};

export class GermanG2p {
  readonly descriptor = GERMAN_G2P_DESCRIPTOR;

  toPronunciation(normalizedText: string): G2pResult {
    const words = normalizedText
      .split(" ")
      .filter(Boolean)
      .map((word) => LEXICON[word] ? lexiconWord(word) : ruleWord(word));

    const graph_hash = contentHash(words.map((word) => ({
      text: word.text,
      phones: word.phones.map((phone) => phone.symbol),
    })));

    return {
      words,
      graph_ref: {
        uri: `artifact://pronunciation-graphs/de/${graph_hash.slice(0, 16)}`,
        sha256: graph_hash,
        media_type: "application/json",
      },
    };
  }
}
