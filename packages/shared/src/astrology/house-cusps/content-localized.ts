import type {
  HouseCuspCorpus,
  HouseCuspKey,
  HouseCuspLocale,
  HouseCuspSign,
  HouseNumber,
} from './types';

// TYPE-ONLY IMPORT, AND IT HAS TO STAY THAT WAY.
// `scripts/validate-natal-integrity.mjs` loads this module with a dynamic
// `import()` so it can run the builder — a text scan cannot see composed
// output. Node's type stripping erases `import type` but does NOT resolve
// extensionless specifiers, so a single VALUE import here (say, pulling
// HOUSE_NUMBERS from './types') would make the validator die with
// ERR_MODULE_NOT_FOUND. A guard in that script asserts this file imports
// nothing at runtime, because the failure is loud but the cause is not obvious.

type GeneratedLocale = Exclude<HouseCuspLocale, 'en' | 'fr'>;

/**
 * Exactly twelve of something.
 *
 * The tables below used to be `as const` with no annotation, so an eleven-entry
 * house table was not a compile error — it silently interpolated the string
 * "undefined" into twelve readings and shipped. The tuple type makes a short
 * table fail `tsc`, which is where a missing translation should be caught.
 */
type Twelve<T> = readonly [T, T, T, T, T, T, T, T, T, T, T, T];

/** Builds one opening sentence from the house phrase and the sign phrase. */
type Frame = (house: string, sign: string) => string;

const HOUSES: Twelve<HouseNumber> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const SIGNS: Twelve<HouseCuspSign> = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

const HOUSE: Record<GeneratedLocale, Twelve<string>> = {
  es: [
    'la identidad, el cuerpo y la primera impresión',
    'el dinero, los valores y la sensación de estabilidad',
    'la comunicación, el aprendizaje diario y el entorno cercano',
    'el hogar, las raíces y la base emocional',
    'la creatividad, el romance, el juego y la expresión personal',
    'la rutina, el trabajo cotidiano y los hábitos de cuidado',
    'las relaciones uno a uno, los acuerdos y los espejos',
    'la intimidad, los recursos compartidos y la transformación',
    'los viajes, las creencias, el estudio y la búsqueda de sentido',
    'la carrera, la reputación y el papel visible',
    'las amistades, los grupos y los deseos de futuro',
    'la soledad, los sueños y los patrones que viven detrás de escena',
  ],
  pt: [
    'a identidade, o corpo e a primeira impressão',
    'dinheiro, valores e a sensação de estabilidade',
    'comunicação, aprendizagem diária e o ambiente próximo',
    'lar, raízes e base emocional',
    'criatividade, romance, brincadeira e expressão pessoal',
    'rotina, trabalho diário e hábitos de cuidado',
    'relações a dois, acordos e espelhos',
    'intimidade, recursos compartilhados e transformação',
    'viagens, crenças, estudo e busca de sentido',
    'carreira, reputação e papel visível',
    'amizades, grupos e esperanças futuras',
    'solidão, sonhos e padrões que ficam nos bastidores',
  ],
  de: [
    'Identität, Körper und erster Eindruck',
    'Geld, Werte und das Gefühl von Stabilität',
    'Kommunikation, tägliches Lernen und die nahe Umgebung',
    'Zuhause, Wurzeln und emotionale Grundlage',
    'Kreativität, Romantik, Spiel und Selbstausdruck',
    'Routine, tägliche Arbeit und Gewohnheiten der Fürsorge',
    'Zweierbeziehungen, Absprachen und Spiegelungen',
    'Intimität, geteilte Ressourcen und Verwandlung',
    'Reisen, Überzeugungen, Studium und Sinnsuche',
    'Beruf, Ruf und sichtbare Rolle',
    'Freundschaften, Gruppen und Zukunftswünsche',
    'Rückzug, Träume und Muster hinter den Kulissen',
  ],
  ja: [
    'アイデンティティ、身体、第一印象',
    'お金、価値観、安定感',
    'コミュニケーション、日々の学び、身近な環境',
    '家、ルーツ、感情の土台',
    '創造性、恋、遊び、自己表現',
    '日々の習慣、仕事のリズム、ケアの仕方',
    '一対一の関係、約束、相手という鏡',
    '親密さ、共有するもの、深い変化',
    '旅、信念、学び、意味の探求',
    'キャリア、評判、社会に見える役割',
    '友人、グループ、未来への願い',
    'ひとりの時間、夢、見えにくい心のパターン',
  ],
  zh: [
    '身份、身体与第一印象',
    '金钱、价值感与稳定感',
    '沟通、日常学习与身边环境',
    '家庭、根源与情感基础',
    '创造力、恋爱、玩乐与自我表达',
    '日常节奏、工作习惯与照顾自己的方式',
    '一对一关系、承诺与彼此映照',
    '亲密、共享资源与深层转化',
    '旅行、信念、学习与意义探索',
    '事业、名声与可见的社会角色',
    '朋友、群体与未来愿景',
    '独处、梦境与幕后运行的内在模式',
  ],
  ar: [
    'الهوية والجسد والانطباع الأول',
    'المال والقيم والإحساس بالثبات',
    'التواصل والتعلم اليومي والمحيط القريب',
    'البيت والجذور والأساس العاطفي',
    'الإبداع والرومانسية واللعب والتعبير عن الذات',
    'الروتين والعمل اليومي وعادات العناية',
    'العلاقات الفردية والاتفاقات والمرايا',
    'الألفة والموارد المشتركة والتحول',
    'السفر والمعتقدات والدراسة والبحث عن المعنى',
    'المهنة والسمعة والدور المرئي',
    'الصداقات والمجموعات وآمال المستقبل',
    'العزلة والأحلام والأنماط التي تعمل خلف الستار',
  ],
} as const;

const SIGN: Record<GeneratedLocale, Record<HouseCuspSign, string>> = {
  es: {
    aries: 'iniciativa, franqueza y movimiento rápido',
    taurus: 'paciencia, lealtad y necesidad de algo confiable',
    gemini: 'curiosidad, palabras y flexibilidad',
    cancer: 'cuidado, memoria emocional y búsqueda de seguridad',
    leo: 'calidez, orgullo sano y deseo de ser reconocido',
    virgo: 'detalle, utilidad y mejora gradual',
    libra: 'armonía, belleza y sentido de reciprocidad',
    scorpio: 'profundidad, reserva y deseo de verdad emocional',
    sagittarius: 'amplitud, honestidad y necesidad de horizonte',
    capricorn: 'responsabilidad, paciencia y construcción a largo plazo',
    aquarius: 'independencia, ideas futuras y mirada poco convencional',
    pisces: 'sensibilidad, imaginación y compasión',
  },
  pt: {
    aries: 'iniciativa, franqueza e movimento rápido',
    taurus: 'paciência, lealdade e necessidade de algo confiável',
    gemini: 'curiosidade, palavras e flexibilidade',
    cancer: 'cuidado, memória emocional e busca por segurança',
    leo: 'calor, orgulho saudável e desejo de reconhecimento',
    virgo: 'detalhe, utilidade e melhora gradual',
    libra: 'harmonia, beleza e senso de reciprocidade',
    scorpio: 'profundidade, reserva e desejo de verdade emocional',
    sagittarius: 'amplitude, honestidade e necessidade de horizonte',
    capricorn: 'responsabilidade, paciência e construção de longo prazo',
    aquarius: 'independência, ideias futuras e olhar pouco convencional',
    pisces: 'sensibilidade, imaginação e compaixão',
  },
  de: {
    // Dative throughout: every frame below puts these behind `von` / `mit` /
    // `an`. This entry was the only nominative one left ("schnelle Bewegung"),
    // which read as a case error in all twelve of its readings.
    aries: 'Initiative, Direktheit und schneller Bewegung',
    taurus: 'Geduld, Loyalität und dem Wunsch nach Verlässlichkeit',
    gemini: 'Neugier, Sprache und Beweglichkeit',
    cancer: 'Fürsorge, emotionaler Erinnerung und dem Bedürfnis nach Sicherheit',
    leo: 'Wärme, gesundem Stolz und dem Wunsch, gesehen zu werden',
    virgo: 'Genauigkeit, Nützlichkeit und schrittweiser Verbesserung',
    libra: 'Harmonie, Schönheit und Sinn für Gegenseitigkeit',
    scorpio: 'Tiefe, Zurückhaltung und dem Wunsch nach emotionaler Wahrheit',
    sagittarius: 'Weite, Offenheit und dem Bedürfnis nach Horizont',
    capricorn: 'Verantwortung, Geduld und langfristigem Aufbau',
    aquarius: 'Unabhängigkeit, Zukunftsideen und einem ungewöhnlichen Blick',
    pisces: 'Sensibilität, Vorstellungskraft und Mitgefühl',
  },
  ja: {
    aries: '率直さ、始める力、すばやい行動',
    taurus: '忍耐、忠実さ、信頼できるものを求める感覚',
    gemini: '好奇心、言葉、柔軟な反応',
    cancer: '思いやり、感情の記憶、安心を求める力',
    leo: 'あたたかさ、誇り、認められたい気持ち',
    virgo: '細やかさ、役に立つ姿勢、少しずつ整える力',
    libra: '調和、美しさ、互いを大切にする感覚',
    scorpio: '深さ、慎重さ、感情の真実を求める力',
    sagittarius: '広がり、率直さ、遠くを見る感覚',
    capricorn: '責任感、忍耐、長い時間をかけて築く力',
    aquarius: '独立心、未来への視点、型にはまらない見方',
    pisces: '感受性、想像力、やさしい共感',
  },
  zh: {
    aries: '主动、直接与快速行动',
    taurus: '耐心、忠诚与对可靠感的需要',
    gemini: '好奇、语言与灵活变化',
    cancer: '照顾、情感记忆与安全感',
    leo: '温暖、健康的骄傲与被看见的愿望',
    virgo: '细节、实用性与逐步改善',
    libra: '和谐、美感与互相回应',
    scorpio: '深度、保留与情感真实',
    sagittarius: '开阔、坦率与更远的视野',
    capricorn: '责任、耐心与长期建设',
    aquarius: '独立、未来感与不寻常的视角',
    pisces: '敏感、想象力与温柔的共情',
  },
  ar: {
    aries: 'المبادرة والصراحة والحركة السريعة',
    taurus: 'الصبر والولاء والحاجة إلى ما يمكن الوثوق به',
    gemini: 'الفضول والكلمات والمرونة',
    cancer: 'الرعاية والذاكرة العاطفية والبحث عن الأمان',
    leo: 'الدفء والاعتزاز الصحي والرغبة في أن تُرى',
    virgo: 'الدقة والفائدة والتحسين الهادئ',
    libra: 'الانسجام والجمال والإحساس بالتبادل',
    scorpio: 'العمق والتحفظ والرغبة في الصدق العاطفي',
    sagittarius: 'الاتساع والصراحة والحاجة إلى أفق أوسع',
    capricorn: 'المسؤولية والصبر والبناء على المدى الطويل',
    aquarius: 'الاستقلال والأفكار المستقبلية والنظرة غير التقليدية',
    pisces: 'الحساسية والخيال والتعاطف اللطيف',
  },
} as const;

const REFLECTION: Record<GeneratedLocale, Twelve<string>> = {
  es: [
    'Puede ayudarte a notar cuándo actuar y cuándo dejar que la otra persona llegue.',
    'A menudo se vuelve más claro cuando distingues seguridad de rigidez.',
    'Puede abrir una conversación honesta si eliges una pregunta y no diez.',
    'A veces pide cuidar sin cargar con todo.',
    'Puede brillar mejor cuando la expresión deja espacio para escuchar.',
    'A menudo sirve más cuando el cuidado no se convierte en control.',
    'Puede crear cercanía cuando el acuerdo incluye tu deseo real.',
    'A veces pide confianza antes de pedir profundidad.',
    'Puede crecer mejor cuando la libertad también tiene una promesa clara.',
    'A menudo gana ternura cuando el logro no es la única prueba de valor.',
    'Puede sentirse más humano cuando la diferencia también busca pertenecer.',
    'A veces necesita bordes suaves para que la empatía no lo absorba todo.',
  ],
  pt: [
    'Pode ajudar você a notar quando agir e quando deixar a outra pessoa chegar.',
    'Muitas vezes fica mais claro quando você separa segurança de rigidez.',
    'Pode abrir uma conversa honesta quando você escolhe uma pergunta, não dez.',
    'Às vezes pede cuidado sem carregar tudo sozinho.',
    'Pode brilhar melhor quando a expressão deixa espaço para escutar.',
    'Muitas vezes serve melhor quando o cuidado não vira controle.',
    'Pode criar proximidade quando o acordo inclui seu desejo real.',
    'Às vezes pede confiança antes de pedir profundidade.',
    'Pode crescer melhor quando a liberdade também tem uma promessa clara.',
    'Muitas vezes ganha ternura quando conquista não é a única prova de valor.',
    'Pode ficar mais humano quando a diferença também busca pertencer.',
    'Às vezes precisa de bordas suaves para que a empatia não absorva tudo.',
  ],
  de: [
    'Das kann dir helfen zu spüren, wann Handlung gut tut und wann jemand Zeit braucht.',
    'Oft wird es klarer, wenn Sicherheit nicht mit Starrheit verwechselt wird.',
    'Das kann ein ehrliches Gespräch öffnen, wenn eine Frage genügt und nicht zehn.',
    'Manchmal bittet es um Fürsorge, ohne alles allein zu tragen.',
    'Es kann besser leuchten, wenn Ausdruck auch Raum zum Zuhören lässt.',
    'Oft dient es besser, wenn Fürsorge nicht zu Kontrolle wird.',
    'Das kann Nähe schaffen, wenn die Abmachung deinen echten Wunsch enthält.',
    'Manchmal braucht es Vertrauen, bevor es Tiefe verlangt.',
    'Es kann besser wachsen, wenn Freiheit auch eine klare Zusage hat.',
    'Oft wird es weicher, wenn Leistung nicht der einzige Beweis von Wert ist.',
    'Das kann menschlicher werden, wenn Unterschied auch Zugehörigkeit sucht.',
    'Manchmal braucht es sanfte Grenzen, damit Mitgefühl nicht alles aufsaugt.',
  ],
  ja: [
    '行動する時と、相手が近づく余白を残す時を見分ける助けになるかもしれません。',
    '安心と固さを分けて考えると、ここはよく澄んできます。',
    '十の質問ではなく一つの問いを選ぶと、誠実な会話につながることがあります。',
    'すべてを背負わずに大切にする練習を求めるかもしれません。',
    '表現の中に聞く余白があるほど、ここはよく輝くことがあります。',
    'ケアが支配にならない時、この場所はよく役に立ちます。',
    '約束の中に本当の望みが入ると、近さが生まれるかもしれません。',
    '深さを求める前に、信頼を育てることが必要な場合があります。',
    '自由に明確な約束が添えられると、ここは育ちやすいかもしれません。',
    '成果だけを価値の証明にしない時、ここにはやわらかさが戻ることがあります。',
    '違いが居場所も求める時、ここはより人間的になるかもしれません。',
    '共感がすべてを吸い込まないよう、やさしい境界が必要なことがあります。',
  ],
  zh: [
    '它可能帮助你分辨何时主动，何时给别人靠近的空间。',
    '当你把安全感和僵硬分开时，这里常常会更清楚。',
    '选择一个真正的问题，而不是十个问题，可能会打开诚实的对话。',
    '它有时提醒你照顾别人时，不必把一切都扛起来。',
    '当表达也留出聆听的位置时，这里可能会更有光。',
    '当照顾不变成控制时，这个位置常常更有用。',
    '当关系里的约定也包含你的真实愿望时，亲近可能会出现。',
    '它有时需要先建立信任，再进入更深的层次。',
    '当自由也带着清楚的承诺时，这里可能更容易成长。',
    '当成就不是价值的唯一证明时，这里常常会变得更柔软。',
    '当独特也寻找归属时，这个位置可能更有人味。',
    '它有时需要温柔的边界，让共情不至于吸收一切。',
  ],
  ar: [
    'قد يساعدك هذا على ملاحظة متى تتحرك ومتى تترك مساحة للآخر كي يقترب.',
    'يمكن أن يصبح أوضح عندما تفصل بين الأمان والجمود.',
    'قد يفتح حديثا صادقا عندما تختار سؤالا واحدا بدلا من عشرة.',
    'أحيانا يطلب رعاية لا تعني أن تحمل كل شيء وحدك.',
    'قد يلمع أكثر عندما يترك التعبير مساحة للإصغاء.',
    'يمكن أن يخدمك أكثر عندما لا تتحول الرعاية إلى سيطرة.',
    'قد يصنع قربا عندما يتضمن الاتفاق رغبتك الحقيقية أيضا.',
    'أحيانا يحتاج إلى ثقة قبل أن يطلب عمقا أكبر.',
    'قد ينمو بشكل أفضل عندما تحمل الحرية وعدا واضحا أيضا.',
    'يمكن أن يصبح ألطف عندما لا يكون الإنجاز الدليل الوحيد على القيمة.',
    'قد يصبح أكثر إنسانية عندما يبحث الاختلاف عن انتماء أيضا.',
    'أحيانا يحتاج إلى حدود لطيفة حتى لا يمتص التعاطف كل شيء.',
  ],
} as const;

/** First letter upper-cased, for the frames that open on a variable. */
function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * One opening sentence per HOUSE, per language.
 *
 * There used to be a single frame per language, so all 144 readings began with
 * the same eight words. That is not a theoretical blemish: equal-house cusps
 * always land on twelve consecutive, DISTINCT signs, so a reader opening their
 * chart sees twelve cards at once — and saw the same sentence twelve times. It
 * was the one repetition an individual reader could actually perceive, and the
 * cheapest thing in the file to fix.
 *
 * Grammar notes that are easy to undo by accident:
 *   es / pt — every house phrase is a LIST of nouns, so the verb is plural.
 *             The old frames said "se exprese" / "se expresse" against a plural
 *             subject in all 288 readings.
 *   de      — the sign phrases are DATIVE, so frames use von / mit / an, never
 *             `durch` (accusative), and the house phrases stay nominative
 *             subjects rather than accusative objects.
 *   ar      — the grammatical subject is never the interpolated phrase. Arabic
 *             verbs agree with it, and the house phrases switch gender
 *             (المهنة feminine, البيت masculine), so a leading verb would be
 *             wrong for roughly half the houses. Every frame keeps a fixed
 *             subject (هذا البيت, أثر, الأمر, لغة) instead.
 */
const FRAME: Record<GeneratedLocale, Twelve<Frame>> = {
  es: [
    (h, s) => `En esta casa, ${h} pueden expresarse con ${s}.`,
    (h, s) => `Aquí, ${h} suelen teñirse de ${s}.`,
    (h, s) => `Esta casa puede dar a ${h} un tono de ${s}.`,
    (h, s) => `Con este signo en la cúspide, ${h} pueden vivirse con ${s}.`,
    (h, s) => `${cap(s)} pueden colorear ${h}.`,
    (h, s) => `Esta casa tiende a filtrar ${h} a través de ${s}.`,
    (h, s) => `Aquí, ${h} encuentran su tono en ${s}.`,
    (h, s) => `${cap(h)} pueden apoyarse en ${s}.`,
    (h, s) => `Esta casa puede pedir que ${h} se vivan con ${s}.`,
    (h, s) => `En esta zona de tu vida, ${h} pueden mostrarse con ${s}.`,
    (h, s) => `Aquí, ${s} pueden marcar el ritmo de ${h}.`,
    (h, s) => `Esta casa puede teñir ${h} de ${s}.`,
  ],
  pt: [
    (h, s) => `Nesta casa, ${h} podem se expressar com ${s}.`,
    (h, s) => `Aqui, ${h} costumam ganhar o tom de ${s}.`,
    (h, s) => `Esta casa pode dar a ${h} um tom de ${s}.`,
    (h, s) => `Com este signo na cúspide, ${h} podem aparecer com ${s}.`,
    (h, s) => `${cap(s)} podem colorir ${h}.`,
    (h, s) => `Esta casa tende a filtrar ${h} através de ${s}.`,
    (h, s) => `Aqui, ${h} encontram seu tom em ${s}.`,
    (h, s) => `${cap(h)} podem se apoiar em ${s}.`,
    (h, s) => `Esta casa pode pedir que ${h} caminhem com ${s}.`,
    (h, s) => `Nesta área da sua vida, ${h} podem se mostrar com ${s}.`,
    (h, s) => `Aqui, ${s} podem marcar o ritmo de ${h}.`,
    (h, s) => `Esta casa pode tingir ${h} de ${s}.`,
  ],
  de: [
    (h, s) => `In diesem Haus können ${h} von ${s} gefärbt sein.`,
    (h, s) => `Hier tragen ${h} oft eine Note von ${s}.`,
    (h, s) => `${h} können hier von ${s} geprägt sein.`,
    (h, s) => `In diesem Bereich zeigen sich ${h} häufig zusammen mit ${s}.`,
    (h, s) => `Hier können ${h} eine Färbung von ${s} annehmen.`,
    (h, s) => `${h} bekommen in diesem Haus oft einen Ton von ${s}.`,
    (h, s) => `Dieses Haus kann zeigen, wie sich ${h} mit ${s} verbinden.`,
    (h, s) => `In diesem Lebensbereich können ${h} von ${s} begleitet sein.`,
    (h, s) => `Hier wirken ${h} oft stark von ${s} gefärbt.`,
    (h, s) => `${h} können sich hier mit ${s} verweben.`,
    (h, s) => `In diesem Haus mischen sich ${h} gern mit ${s}.`,
    (h, s) => `Hier lassen sich ${h} oft an ${s} erkennen.`,
  ],
  ja: [
    (h, s) => `このハウスでは、${h}が${s}によって色づくかもしれません。`,
    (h, s) => `ここでは、${h}に${s}の色が混じることがあります。`,
    (h, s) => `${h}は、${s}とともに動くかもしれません。`,
    (h, s) => `この領域では、${h}が${s}の影響を受けやすいかもしれません。`,
    (h, s) => `${h}に、${s}のトーンが重なることがあります。`,
    (h, s) => `このハウスは、${h}を${s}で彩ることがあります。`,
    (h, s) => `ここでの${h}は、${s}を通して形になりやすいようです。`,
    (h, s) => `${s}が、${h}の進み方を左右することがあります。`,
    (h, s) => `この場所では、${h}と${s}が結びつきやすいかもしれません。`,
    (h, s) => `${h}は、${s}を手がかりに動くことがあります。`,
    (h, s) => `ここでは、${s}が${h}に色を添えるかもしれません。`,
    (h, s) => `このハウスでは、${h}が${s}のかたちをとることがあります。`,
  ],
  zh: [
    (h, s) => `这个宫位可能让${h}带上${s}的色彩。`,
    (h, s) => `在这里，${h}常常与${s}交织在一起。`,
    (h, s) => `${h}可能以${s}的方式展开。`,
    (h, s) => `这个领域里，${h}容易被${s}影响。`,
    (h, s) => `${s}可能为${h}定下基调。`,
    (h, s) => `这个宫位有时会用${s}来描绘${h}。`,
    (h, s) => `此处的${h}，往往透过${s}显现。`,
    (h, s) => `${h}可能带着${s}的节奏前行。`,
    (h, s) => `在这个位置，${h}与${s}容易彼此呼应。`,
    (h, s) => `${s}可能成为${h}的底色。`,
    (h, s) => `这里，${h}或许会以${s}的语气表达。`,
    (h, s) => `这个宫位可能把${h}染上${s}的色彩。`,
  ],
  ar: [
    (h, s) => `قد يجعل هذا البيت ${h} يتلون بصفات ${s}.`,
    (h, s) => `قد يرسم هذا البيت ${h} بألوان ${s}.`,
    (h, s) => `قد يعطي هذا البيت ${h} نبرة من ${s}.`,
    (h, s) => `في هذا المجال، قد يظهر أثر ${s} على ${h}.`,
    (h, s) => `قد يصبغ هذا البيت ${h} بصفات ${s}.`,
    (h, s) => `هنا، قد نلمس في ${h} أثر ${s}.`,
    (h, s) => `قد يمنح هذا البيت ${h} طابعا من ${s}.`,
    (h, s) => `في هذا الموضع، قد نجد أثر ${s} في ${h}.`,
    (h, s) => `قد يلوّن هذا البيت ${h} بصفات ${s}.`,
    (h, s) => `هنا، قد يسير الأمر في ${h} على إيقاع ${s}.`,
    (h, s) => `قد يضع هذا البيت في ${h} لمسة من ${s}.`,
    (h, s) => `في هذه المنطقة من حياتك، قد تظهر لغة ${s} داخل ${h}.`,
  ],
};

/** Japanese and Chinese do not put a space after 。 */
const JOIN: Record<GeneratedLocale, string> = {
  es: ' ',
  pt: ' ',
  de: ' ',
  ja: '',
  zh: '',
  ar: ' ',
};

/**
 * No `as HouseCuspKey` any more: with `house` typed as `HouseNumber` and
 * `sign` as `HouseCuspSign`, the template literal IS a `HouseCuspKey` and the
 * compiler can see it. The assertion it replaced would have accepted
 * `key(13, 'ophiuchus')`.
 */
function key(house: HouseNumber, sign: HouseCuspSign): HouseCuspKey {
  return `natalHouseCuspInterpretation_${house}_${sign}`;
}

/**
 * The one assertion left in this file is on the RETURN value, and it cannot be
 * removed: TypeScript has no way to prove a loop filled every key of a mapped
 * type. What CAN be guaranteed is that the inputs are total — `Twelve<T>` and
 * `Record<HouseCuspSign, string>` above make a short table a compile error — so
 * the loop has nothing to be short of. The output is checked at runtime by
 * `__tests__/house-cusps.test.ts` and by `validate-natal-integrity`, which
 * imports this module and counts.
 */
function build(locale: GeneratedLocale): HouseCuspCorpus {
  const corpus = {} as HouseCuspCorpus;
  for (const house of HOUSES) {
    for (const sign of SIGNS) {
      const opening = FRAME[locale][house - 1](HOUSE[locale][house - 1], SIGN[locale][sign]);
      const reflection = REFLECTION[locale][SIGNS.indexOf(sign)];
      corpus[key(house, sign)] = `${opening}${JOIN[locale]}${reflection}`;
    }
  }
  return corpus;
}

export const HOUSE_CUSP_CONTENT_ES = build('es');
export const HOUSE_CUSP_CONTENT_PT = build('pt');
export const HOUSE_CUSP_CONTENT_DE = build('de');
export const HOUSE_CUSP_CONTENT_JA = build('ja');
export const HOUSE_CUSP_CONTENT_ZH = build('zh');
export const HOUSE_CUSP_CONTENT_AR = build('ar');
