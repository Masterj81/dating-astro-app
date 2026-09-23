// Tarot server entry — the artifact generator bundles THIS so the edge draws
// with the exact shared engine (same seed, same shuffle, same meanings as the
// historical client-side reading — determinism is the product promise).
// `generateReading` is the whole pipeline (draw + corpus resolution + fallback
// flag), so the server and the shipped client cannot diverge on any layer.
export { generateReading, drawSpread, pickMeaning } from './index';
export { DECK } from './deck';
export { CORPUS_EN } from './content-en';
export { CORPUS_FR } from './content-fr';
