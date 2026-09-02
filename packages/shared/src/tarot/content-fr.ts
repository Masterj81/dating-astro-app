// Tarot — le corpus français. 78 noms, 312 significations.
//
// PROVENANCE. Chaque signification a été écrite pour JUNO. Les NOMS de cartes
// sont les titres traditionnels du tarot à 78 lames, dans leur forme française
// courante — vocabulaire partagé du jeu, pas la prose protégeable de qui que ce
// soit. Aucune interprétation n'est reprise, condensée, paraphrasée ni
// réorganisée depuis une source publiée.
//
// CE FICHIER N'IMPORTE RIEN D'AUTRE QUE DES TYPES, VOLONTAIREMENT — même raison
// que pour `content-en.ts` : le validateur le charge par `await import()` sous
// le type stripping de Node, qui efface `import type` mais ne résout pas les
// specifiers d'exécution sans extension.
//
// TUTOIEMENT, ET POURQUOI. Le reste du dépôt vouvoie (« Votre ascendant
// façonne… »), mais le chrome du tarot tutoie déjà dans les huit locales :
// « Ce qui demande ton attention », « Ton tirage symbolique ». Un écran qui
// vouvoie dans le texte de carte et tutoie dans les titres au-dessus se lit
// comme deux produits collés. La cohérence de l'écran l'emporte ici sur la
// cohérence du dépôt ; l'écart de registre entre fonctionnalités est noté dans
// `docs/tarot-canonical-corpus-2026-09.md` comme une décision à trancher, pas
// comme un oubli.
//
// VOIX. Le tarot dans JUNO est une surface de réflexion, pas une prévision. Les
// cartes décrivent un motif que la lectrice ou le lecteur peut reconnaître ;
// elles ne rapportent pas d'événements. La grammaire est donc délibérément
// prudente — « peut », « souvent », « a tendance à », « remarque », « ça vaut
// la peine de » — et le vocabulaire exclut la prédiction, le fatalisme
// (« destin », « inévitable », « malchance »), les étiquettes pseudo-cliniques
// (« toxique »), l'injonction (« tu dois », « il faut ») et les absolus
// (« jamais »). `validate-tarot-content.mjs` casse le build sur chacun d'eux.
import type { TarotCorpus } from './types';

export const NAMES_FR: TarotCorpus['names'] = {
  'major-00': 'Le Fou',
  'major-01': 'Le Magicien',
  'major-02': 'La Grande Prêtresse',
  'major-03': "L'Impératrice",
  'major-04': "L'Empereur",
  'major-05': 'Le Hiérophante',
  'major-06': 'Les Amoureux',
  'major-07': 'Le Chariot',
  'major-08': 'La Force',
  'major-09': "L'Ermite",
  'major-10': 'La Roue de Fortune',
  'major-11': 'La Justice',
  'major-12': 'Le Pendu',
  'major-13': 'La Mort',
  'major-14': 'Tempérance',
  'major-15': 'Le Diable',
  'major-16': 'La Tour',
  'major-17': "L'Étoile",
  'major-18': 'La Lune',
  'major-19': 'Le Soleil',
  'major-20': 'Le Jugement',
  'major-21': 'Le Monde',

  'cups-01': 'As de Coupes',
  'cups-02': 'Deux de Coupes',
  'cups-03': 'Trois de Coupes',
  'cups-04': 'Quatre de Coupes',
  'cups-05': 'Cinq de Coupes',
  'cups-06': 'Six de Coupes',
  'cups-07': 'Sept de Coupes',
  'cups-08': 'Huit de Coupes',
  'cups-09': 'Neuf de Coupes',
  'cups-10': 'Dix de Coupes',
  'cups-11': 'Valet de Coupes',
  'cups-12': 'Cavalier de Coupes',
  'cups-13': 'Reine de Coupes',
  'cups-14': 'Roi de Coupes',

  'wands-01': 'As de Bâtons',
  'wands-02': 'Deux de Bâtons',
  'wands-03': 'Trois de Bâtons',
  'wands-04': 'Quatre de Bâtons',
  'wands-05': 'Cinq de Bâtons',
  'wands-06': 'Six de Bâtons',
  'wands-07': 'Sept de Bâtons',
  'wands-08': 'Huit de Bâtons',
  'wands-09': 'Neuf de Bâtons',
  'wands-10': 'Dix de Bâtons',
  'wands-11': 'Valet de Bâtons',
  'wands-12': 'Cavalier de Bâtons',
  'wands-13': 'Reine de Bâtons',
  'wands-14': 'Roi de Bâtons',

  'swords-01': "As d'Épées",
  'swords-02': "Deux d'Épées",
  'swords-03': "Trois d'Épées",
  'swords-04': "Quatre d'Épées",
  'swords-05': "Cinq d'Épées",
  'swords-06': "Six d'Épées",
  'swords-07': "Sept d'Épées",
  'swords-08': "Huit d'Épées",
  'swords-09': "Neuf d'Épées",
  'swords-10': "Dix d'Épées",
  'swords-11': "Valet d'Épées",
  'swords-12': "Cavalier d'Épées",
  'swords-13': "Reine d'Épées",
  'swords-14': "Roi d'Épées",

  'pents-01': 'As de Deniers',
  'pents-02': 'Deux de Deniers',
  'pents-03': 'Trois de Deniers',
  'pents-04': 'Quatre de Deniers',
  'pents-05': 'Cinq de Deniers',
  'pents-06': 'Six de Deniers',
  'pents-07': 'Sept de Deniers',
  'pents-08': 'Huit de Deniers',
  'pents-09': 'Neuf de Deniers',
  'pents-10': 'Dix de Deniers',
  'pents-11': 'Valet de Deniers',
  'pents-12': 'Cavalier de Deniers',
  'pents-13': 'Reine de Deniers',
  'pents-14': 'Roi de Deniers',
};

export const MEANINGS_FR: TarotCorpus['meanings'] = {
  // ---------------------------------------------------------------- majeurs
  'major-00': {
    love: {
      upright: "Quelque chose ici n'a rien prouvé, et c'est peut-être exactement le sujet. Commencer sans certitude demande son propre courage.",
      reversed: "Un élan peut être une fuite bien habillée. Demande-toi ce que tu quitterais, pas seulement ce vers quoi tu irais.",
    },
    general: {
      upright: "Un début sans carte. Ne pas connaître la forme de la chose est normal à ce stade, et souvent nécessaire.",
      reversed: "Soit l'élan est précipité, soit l'hésitation a fait son temps. Remarque de laquelle il s'agit.",
    },
  },
  'major-01': {
    love: {
      upright: "Tu as plus de ressources ici que tu n'en comptes. L'attention, la franchise et le rythme forment souvent tout l'outillage.",
      reversed: "Un écart peut s'ouvrir entre ce qui est montré et ce qui est pensé — du tien ou du sien. Plus facile à nommer maintenant que plus tard.",
    },
    general: {
      upright: "Les pièces sont déjà dans tes mains. Cette carte parle de les utiliser plutôt que d'en collecter d'autres.",
      reversed: "De la capacité sans direction, ou un récit mieux raconté que vécu. Ça vaut la peine de vérifier lequel.",
    },
  },
  'major-02': {
    love: {
      upright: "Quelque chose se comprend ici sans être dit. Fie-toi à cette lecture — et envisage de la dire quand même.",
      reversed: "Tu es peut-être en train de te convaincre du contraire de ce que tu sens. Le signal discret est aussi une information.",
    },
    general: {
      upright: "La réponse est plus près de l'intuition que de l'analyse en ce moment. Donne-lui une pièce calme.",
      reversed: "Le bruit a recouvert la lecture intérieure. Moins d'entrées, pas plus, aide généralement ici.",
    },
  },
  'major-03': {
    love: {
      upright: "De la chaleur et du soin, et le fait d'être nourri par un lien plutôt que vidé par lui. Remarque ce qui nourrit vraiment.",
      reversed: "Le don a peut-être basculé de la générosité vers l'effacement. Un soin qui te vide se tient difficilement dans la durée.",
    },
    general: {
      upright: "Croissance, confort et plénitude créative. Laisse quelque chose être savouré plutôt qu'optimisé.",
      reversed: "Épuisement, ou un blocage créatif qui est surtout un déficit de repos. Remplis avant de pousser.",
    },
  },
  'major-04': {
    love: {
      upright: "La structure fait de la place à la douceur. Des accords clairs permettent souvent à un lien de se détendre.",
      reversed: "Le contrôle sait se faire passer pour de la stabilité. Où la structure a-t-elle cessé de servir les gens qu'elle abrite ?",
    },
    general: {
      upright: "Limites, ordre et suivi. Un cadre bâti maintenant pourra porter du poids plus tard.",
      reversed: "Rigidité, ou absence totale de cadre. Les deux te font porter plus que ta part.",
    },
  },
  'major-05': {
    love: {
      upright: "Des valeurs partagées, et des scripts hérités sur la forme que l'amour devrait avoir. Certains méritent d'être gardés.",
      reversed: "Une règle que tu n'as pas choisie mène peut-être la barque. Elle peut être examinée.",
    },
    general: {
      upright: "Tradition, transmission, et la sagesse d'un chemin déjà parcouru. L'emprunt est permis.",
      reversed: "La convention ne va plus. S'en écarter est un choix, pas un échec.",
    },
  },
  'major-06': {
    love: {
      upright: "Alignement — de valeurs autant que d'attirance. Ce sur quoi vous vous entendez compte autant que ce que tu ressens.",
      reversed: "Une traction dans deux directions, ou des valeurs discrètement décalées. Nommer l'écart est plus doux que de le contourner.",
    },
    general: {
      upright: "Un choix qui demande qui tu es vraiment, pas seulement ce que tu veux.",
      reversed: "Une décision prise pour éviter l'inconfort a tendance à revenir. Regarde ce que tu esquives.",
    },
  },
  'major-07': {
    love: {
      upright: "Avancer vers ce que tu veux, les yeux ouverts. La direction compte plus que l'intensité ici.",
      reversed: "L'effort sans accord, c'est pousser et non poursuivre. Vérifie que vous allez dans le même sens.",
    },
    general: {
      upright: "Élan et concentration. L'obstacle est généralement l'attention, pas la capacité.",
      reversed: "Énergie dispersée, ou force appliquée là où la patience ferait davantage.",
    },
  },
  'major-08': {
    love: {
      upright: "De la constance sans dureté. Rester doux sous pression est la compétence la plus difficile, et la meilleure.",
      reversed: "C'est peut-être le doute qui parle. Il a tendance à exagérer le danger.",
    },
    general: {
      upright: "Un courage qui, de l'extérieur, a l'air tranquille. La patience en fait partie.",
      reversed: "Patience épuisée, ou force employée là où la douceur aurait suffi. Le repos n'est pas un détour.",
    },
  },
  'major-09': {
    love: {
      upright: "La distance peut clarifier. Savoir ce que tu veux seul te rend souvent plus net avec quelqu'un d'autre.",
      reversed: "La solitude a peut-être tourné à l'évitement. Remarque la différence entre choisir l'espace et s'y cacher.",
    },
    general: {
      upright: "Un pas en arrière pour t'entendre. La réponse arrive souvent dans le calme.",
      reversed: "Isolement au-delà de son utilité. Une conversation peut faire plus qu'une semaine de réflexion.",
    },
  },
  'major-10': {
    love: {
      upright: "Un tour dans le motif. Quelque chose bouge peut-être que tu n'as pas organisé, et l'accueillir coûte souvent moins que de s'arc-bouter.",
      reversed: "Le timing sonne faux. La patience coûte souvent moins cher ici que la poussée.",
    },
    general: {
      upright: "Cycles et points de bascule. Un changement demande peut-être ton attention plutôt que ta résistance.",
      reversed: "Résister à un mouvement que tu sens déjà. Cette phase se déplace ; remarque ce qu'elle te montre.",
    },
  },
  'major-11': {
    love: {
      upright: "L'équité, et le soulagement d'être franc l'un avec l'autre. La franchise a tendance à stabiliser un lien.",
      reversed: "Un déséquilibre que ni l'un ni l'autre n'a dit à voix haute. Il se règle rarement tout seul.",
    },
    general: {
      upright: "Responsabilité et vue claire. Pèse honnêtement, ta propre part comprise.",
      reversed: "Éviter une conséquence, ou juger une situation sur des informations incomplètes.",
    },
  },
  'major-12': {
    love: {
      upright: "Une pause qui change l'angle. Ne pas agir est parfois la chose la plus utile disponible.",
      reversed: "De l'attentisme déguisé en patience. Demande-toi de quoi l'attente te protège.",
    },
    general: {
      upright: "Suspension, et déplacement du point de vue. La vue est réellement différente d'ici.",
      reversed: "Coincé plutôt qu'immobile. Un sacrifice qui n'aide personne peut être déposé.",
    },
  },
  'major-13': {
    love: {
      upright: "Une fin qui fait de la place. Ce qui se referme ici était probablement déjà terminé.",
      reversed: "Tenir au-delà du point où ça aide. Lâcher est une compétence lente.",
    },
    general: {
      upright: "Transformation par le relâchement. Quelque chose s'achève pour qu'autre chose commence.",
      reversed: "Résister à un changement déjà en cours. Le délai coûte souvent plus que le changement.",
    },
  },
  'major-14': {
    love: {
      upright: "La proportion. Ni trop, ni trop retenu — le milieu fait un vrai travail ici.",
      reversed: "Des extrêmes, ou un mélange qui n'a pas encore trouvé son dosage. Ajuste doucement.",
    },
    general: {
      upright: "Équilibre et patience. Combiner des contraires prend du temps, et ça se passe bien.",
      reversed: "Surcorrection dans un sens. Les petits ajustements valent mieux que les grands gestes.",
    },
  },
  'major-15': {
    love: {
      upright: "Intensité et attachement, et la question de ce qui te retient ici. L'attraction n'est pas l'accord.",
      reversed: "Un motif qui desserre sa prise. Voir le mécanisme, c'est déjà l'essentiel du travail.",
    },
    general: {
      upright: "Ce qui t'attache — habitude, confort, appétit. Regarde-en la forme sans honte.",
      reversed: "Desserrer une emprise que tu subissais. La liberté arrive ici progressivement.",
    },
  },
  'major-16': {
    love: {
      upright: "Une clarté soudaine qui redispose les choses. Inconfortable, et ça peut dégager de la place pour la franchise.",
      reversed: "Éviter une rupture qui se prépare. La vérité remonte quand elle est prête, pas avant.",
    },
    general: {
      upright: "Une structure cède et révèle ce qu'elle soutenait. L'effondrement peut être une information.",
      reversed: "Repousser un changement qui veut arriver. Le délai est lui-même une décision.",
    },
  },
  'major-17': {
    love: {
      upright: "Un espoir qui a retrouvé son assise. Quelque chose de doux se reconstruit.",
      reversed: "La foi est basse. Elle a tendance à revenir, discrètement et hors calendrier.",
    },
    general: {
      upright: "Reconstitution et clarté après la tension. Continue doucement.",
      reversed: "Découragement. Mieux vaut le nommer que jouer l'optimisme par-dessus.",
    },
  },
  'major-18': {
    love: {
      upright: "Tout n'est pas encore visible ici. Une part de ce que tu ressens est peut-être de la mémoire plutôt que du présent.",
      reversed: "Le brouillard se lève. Ce qui t'effrayait paraît parfois plus petit à la lumière.",
    },
    general: {
      upright: "Incertitude et projection. Tiens tes conclusions sans serrer, pour l'instant.",
      reversed: "La clarté émerge. Sépare ce qui relevait de la peur de ce qui relevait du fait.",
    },
  },
  'major-19': {
    love: {
      upright: "De la chaleur sans effort. Être vu et aimer ça — à savourer plutôt qu'à analyser.",
      reversed: "Éclat atténué, ou attente faisant le travail que la joie devrait faire. Ça passe.",
    },
    general: {
      upright: "Vitalité et bien-être tout simple. Laisse ça rester simple.",
      reversed: "Une platitude passagère. Ce n'est un verdict sur rien.",
    },
  },
  'major-20': {
    love: {
      upright: "Un règlement de comptes avec un motif, et la possibilité d'y répondre autrement cette fois.",
      reversed: "Rejouer un vieux verdict sur toi-même. Les preuves ont peut-être expiré.",
    },
    general: {
      upright: "Réveil et revue honnête. Qu'as-tu réellement appris ?",
      reversed: "L'autocritique prend la place de la réflexion. Ce sont deux activités différentes.",
    },
  },
  'major-21': {
    love: {
      upright: "Un sentiment de complétude — un cycle qui se referme bien plutôt que spectaculairement.",
      reversed: "Presque fini. La dernière marche est souvent celle qu'on saute le plus facilement.",
    },
    general: {
      upright: "Plénitude, et un chapitre qui touche à sa fin. Ça vaut la peine de le marquer avant le suivant.",
      reversed: "Un fil qui traîne et garde la porte ouverte. Il peut être coupé volontairement.",
    },
  },

  // ----------------------------------------------------------------- coupes
  'cups-01': {
    love: {
      upright: "Un sentiment qui s'ouvre, encore neuf et un peu sans défense. Laisse-le être tendre.",
      reversed: "Un sentiment retenu, peut-être pour de bonnes raisons. Remarque ce qui rend l'ouverture difficile.",
    },
    general: {
      upright: "Un début émotionnel. Quelque chose demande à être ressenti avant d'être compris.",
      reversed: "Émotion bloquée, ou une coupe que tu gardes couverte. Elle se conserve.",
    },
  },
  'cups-02': {
    love: {
      upright: "Reconnaissance mutuelle. Deux personnes qui se rencontrent plutôt qu'une idée l'une de l'autre.",
      reversed: "Un côté porte peut-être davantage le lien. Ça vaut la peine de le dire.",
    },
    general: {
      upright: "Un partenariat à égalité. La réciprocité est le sujet.",
      reversed: "Un échange déséquilibré. Le nommer aide généralement plus que le compenser.",
    },
  },
  'cups-03': {
    love: {
      upright: "L'amour en compagnie — les amis, la fête, la joie partagée.",
      reversed: "Trop de bruit autour du lien, ou un cercle dont tu t'es éloigné.",
    },
    general: {
      upright: "Communauté et joie commune. Être parmi les gens est le sujet.",
      reversed: "Socialement surchargé, ou discrètement hors du cercle. Les deux méritent d'être remarqués.",
    },
  },
  'cups-04': {
    love: {
      upright: "Une platitude là où il y avait de l'intérêt. Quelque chose est peut-être devant toi, non enregistré.",
      reversed: "L'intérêt revient après une période terne. Ça vaut la peine de lever les yeux.",
    },
    general: {
      upright: "Contemplation qui glisse vers l'apathie. Demande-toi ce qui a cessé d'atteindre.",
      reversed: "L'appétit revient. La pause a fait son travail.",
    },
  },
  'cups-05': {
    love: {
      upright: "Le chagrin de ce qui n'a pas eu lieu. Ce qui reste s'oublie facilement quand on regarde ce qui s'est renversé.",
      reversed: "Se tourner vers ce qui tient encore debout. Lent, et réel.",
    },
    general: {
      upright: "Perte et déception. Donne-leur de la place, puis compte ce qui reste.",
      reversed: "L'acceptation commence. Pas la résolution, mais du mouvement.",
    },
  },
  'cups-06': {
    love: {
      upright: "Une douceur avec de la mémoire dedans. Le passé peut être chaud sans être ton adresse.",
      reversed: "La nostalgie travaille plus fort que le présent. Compare doucement.",
    },
    general: {
      upright: "Mémoire, innocence, une gentillesse qui revient. Laisse ça rester simple.",
      reversed: "Un passé idéalisé qui encombre ce qui est là.",
    },
  },
  'cups-07': {
    love: {
      upright: "Beaucoup de possibilités, pas toutes réelles. Choisis-en une que tu peux toucher.",
      reversed: "La clarté après une période d'imagination. Une option devient l'option.",
    },
    general: {
      upright: "Options et fantaisie. Ancres-en une avant de choisir.",
      reversed: "La concentration arrive. Le flou te servait à quelque chose — remarque à quoi.",
    },
  },
  'cups-08': {
    love: {
      upright: "S'éloigner de ce qui ne te nourrit plus. Courageux, et souvent silencieux.",
      reversed: "Rester au-delà de ce que tu sais. Demande-toi honnêtement ce que partir coûterait.",
    },
    general: {
      upright: "Laisser quelque chose d'inachevé parce que ce n'est pas à toi de le finir.",
      reversed: "Dériver plutôt que décider. Une direction aiderait.",
    },
  },
  'cups-09': {
    love: {
      upright: "Le contentement. Vouloir ce que tu as est un accomplissement en soi.",
      reversed: "De la satisfaction en surface avec quelque chose d'inassouvi dessous.",
    },
    general: {
      upright: "Un souhait exaucé. Savoure-le avant de déplacer la cible.",
      reversed: "Avoir beaucoup et ressentir peu. À explorer plutôt qu'à réparer.",
    },
  },
  'cups-10': {
    love: {
      upright: "L'appartenance, et le bonheur ordinaire qui photographie mal.",
      reversed: "Un écart entre l'image et le ressenti. Ça vaut la peine de dire la partie silencieuse.",
    },
    general: {
      upright: "Harmonie chez toi et parmi les tiens. C'est la bonne partie.",
      reversed: "Une friction sous une surface tranquille. Petite, et pas rien.",
    },
  },
  'cups-11': {
    love: {
      upright: "Un message ou un geste tendre et maladroit. La sincérité bat souvent l'aisance.",
      reversed: "Le sentiment court devant ce qui s'est réellement passé. Laisse-le rattraper.",
    },
    general: {
      upright: "Curiosité et petite poussée créative. Suis-la sans plan.",
      reversed: "De la sensibilité sans endroit où la mettre. Fabrique quelque chose.",
    },
  },
  'cups-12': {
    love: {
      upright: "Un élan romantique — quelqu'un qui mène par le sentiment, et ça sonne sincère.",
      reversed: "Le charme dépasse la substance, ou une idée de l'amour plus grande que la personne.",
    },
    general: {
      upright: "Suivre ton cœur quelque part. Garde un œil ouvert.",
      reversed: "L'humeur tient le volant. Une journée de recul peut aider.",
    },
  },
  'cups-13': {
    love: {
      upright: "Une stabilité émotionnelle — quelqu'un qui porte le sentiment sans être emporté.",
      reversed: "Absorber la météo de tout le monde. Les limites sont une forme de soin.",
    },
    general: {
      upright: "Compassion et profondeur. Le sentir et le penser coopèrent.",
      reversed: "Fondu dans les états des autres. Où est-ce que tu t'arrêtes ?",
    },
  },
  'cups-14': {
    love: {
      upright: "De la chaleur avec une quille. Le sentiment exprimé sans submerger personne.",
      reversed: "Calme en surface, non-dit en dessous. Le sang-froid n'est pas la franchise.",
    },
    general: {
      upright: "Maturité émotionnelle et diplomatie. Tu peux porter ça.",
      reversed: "Un sentiment géré plutôt que ressenti. Il ressort ailleurs.",
    },
  },

  // ----------------------------------------------------------------- bâtons
  'wands-01': {
    love: {
      upright: "Une étincelle — précoce, énergique, et pas encore une histoire.",
      reversed: "Énergie calée ou mal partie. Attendre la vraie coûte peu.",
    },
    general: {
      upright: "L'inspiration arrive. Commence avant que ce soit complètement formé.",
      reversed: "Un faux départ, ou une motivation qui n'a pas trouvé son objet.",
    },
  },
  'wands-02': {
    love: {
      upright: "Envisager une version plus grande de ta vie, et si quelqu'un y figure.",
      reversed: "Hésiter au bord d'une décision. La carte a peu de chances de devenir plus sûre.",
    },
    general: {
      upright: "Planifier avec de l'ambition réelle. Choisis la direction, pas seulement le souhait.",
      reversed: "Voir petit, ou planifier au lieu de commencer.",
    },
  },
  'wands-03': {
    love: {
      upright: "Des horizons qui s'élargissent. Un amour avec de l'espace dedans.",
      reversed: "Des plans retardés. L'attente fait peut-être quelque chose d'utile.",
    },
    general: {
      upright: "Un progrès visible d'ici. Continue.",
      reversed: "Peu de vue d'ensemble. Regarde plus loin que le pas suivant.",
    },
  },
  'wands-04': {
    love: {
      upright: "Une étape à marquer — une stabilité qui ressemble à une fête.",
      reversed: "Le chez-soi est instable. Les petites réparations comptent plus que les grands gestes.",
    },
    general: {
      upright: "Arrivée, retour, un bon moment entre gens.",
      reversed: "Des fondations qui vacillent. Occupe-toi de la base.",
    },
  },
  'wands-05': {
    love: {
      upright: "De la friction, et pas forcément la mauvaise. La différence teste un lien honnêtement.",
      reversed: "Un conflit évité plutôt que réglé. Il attend.",
    },
    general: {
      upright: "Compétition et avis qui s'entrechoquent. Utile tant que ça reste sur le travail.",
      reversed: "Tension gardée à l'intérieur. Une part pourrait sortir.",
    },
  },
  'wands-06': {
    love: {
      upright: "Être choisi, publiquement ou discrètement. Laisse ça se poser.",
      reversed: "Avoir plus besoin de reconnaissance que de lien. Remarque la faim.",
    },
    general: {
      upright: "Une reconnaissance méritée. Prends la victoire correctement.",
      reversed: "Une victoire qui n'a pas rassasié, ou une que tu attends encore.",
    },
  },
  'wands-07': {
    love: {
      upright: "Tenir ta position. Certaines choses méritent d'être défendues calmement.",
      reversed: "Se défendre par habitude. Vérifie si quelqu'un attaque vraiment.",
    },
    general: {
      upright: "Tenir bon sous pression. Tu as la position haute.",
      reversed: "Usé à force de tenir. Regarde lesquels de ces combats sont les tiens.",
    },
  },
  'wands-08': {
    love: {
      upright: "Les choses vont vite. Savoure le rythme sans le confondre avec la profondeur.",
      reversed: "Messages croisés, élan calé. Plus lent et plus simple aide généralement.",
    },
    general: {
      upright: "Mouvement rapide. Profites-en tant qu'il est là.",
      reversed: "De la vitesse dispersée. Une chose à la fois.",
    },
  },
  'wands-09': {
    love: {
      upright: "Fatigué et encore là. La résilience est peu spectaculaire et bien réelle.",
      reversed: "Une garde qui survit à la menace. Demande-toi contre quoi tu te prépares encore.",
    },
    general: {
      upright: "Presque au bout, et usé. Le repos compte comme stratégie.",
      reversed: "Sur la défensive sans nécessité. Quelque chose peut être déposé.",
    },
  },
  'wands-10': {
    love: {
      upright: "Porter plus de la relation que tu ne l'as admis. Le poids peut être partagé.",
      reversed: "Déposer quelque chose. Le soulagement peut arriver lentement.",
    },
    general: {
      upright: "Surchargé. Une part de tout ça appartient à quelqu'un d'autre.",
      reversed: "Déléguer, ou lâcher ce qui n'est pas à toi. Bien.",
    },
  },
  'wands-11': {
    love: {
      upright: "Enthousiasme, nouvelles, quelqu'un d'enthousiaste. Laisse ça rester léger.",
      reversed: "Un intérêt qui retombe vite. Tout n'a pas à devenir davantage.",
    },
    general: {
      upright: "Exploration et appétit. Suis la curiosité.",
      reversed: "Impatience avec la partie lente. Cette partie est le travail.",
    },
  },
  'wands-12': {
    love: {
      upright: "De la passion avec du mouvement. Excitant, et à observer pour la tenue dans le temps.",
      reversed: "De la chaleur sans suite. Remarque le motif avant d'investir.",
    },
    general: {
      upright: "Action franche et élan. Vas-y, et pilote.",
      reversed: "Impulsivité. Une journée d'écart coûte peu.",
    },
  },
  'wands-13': {
    love: {
      upright: "Une chaleur confiante. Attirante en partie parce qu'elle ne joue pas.",
      reversed: "L'insécurité qui se présente en intensité. Sois doux avec toi.",
    },
    general: {
      upright: "Vitalité et présence à soi. Tu sais ce que tu vaux.",
      reversed: "La comparaison vide le feu. Reviens à ton propre travail.",
    },
  },
  'wands-14': {
    love: {
      upright: "Vision et générosité. Quelqu'un qui fait de la place à ton ambition.",
      reversed: "Une attente livrée comme une consigne. Demander fonctionne mieux.",
    },
    general: {
      upright: "Un leadership avec de la distance. Les gens suivent ça.",
      reversed: "Diriger plus qu'écouter. Le plan s'améliore avec les avis.",
    },
  },

  // ------------------------------------------------------------------ épées
  'swords-01': {
    love: {
      upright: "Une pensée claire sur ce que tu veux vraiment. Dis-la simplement.",
      reversed: "La clarté employée comme lame, ou la confusion déguisée en nuance.",
    },
    general: {
      upright: "Une percée de compréhension. Ça vaut la peine de l'écrire.",
      reversed: "Pensée affûtée, mal visée. Ralentis la livraison.",
    },
  },
  'swords-02': {
    love: {
      upright: "Une décision évitée en gardant les deux options ouvertes.",
      reversed: "L'information arrive. Le choix devient plus lisible.",
    },
    general: {
      upright: "Impasse. Tu en sais peut-être plus que tu ne l'admets.",
      reversed: "Trop d'entrées. Décide avec ce que tu as.",
    },
  },
  'swords-03': {
    love: {
      upright: "De la peine, simplement. La nommer précisément est le début de son apaisement.",
      reversed: "Le tranchant s'émousse. La guérison n'est pas linéaire, et elle est en cours.",
    },
    general: {
      upright: "Une clarté douloureuse. Ça fait mal parce que c'est vrai, pas parce que c'est définitif.",
      reversed: "Récupération en cours. Prends ton temps.",
    },
  },
  'swords-04': {
    love: {
      upright: "Du repos loin du lien. Un retrait qui restaure plutôt qu'il ne punit.",
      reversed: "Revenu trop tôt. La pause n'était pas finie.",
    },
    general: {
      upright: "Récupération et silence. Rien n'a besoin d'être décidé aujourd'hui.",
      reversed: "De l'agitation là où le repos a sa place.",
    },
  },
  'swords-05': {
    love: {
      upright: "Gagner une dispute et perdre quelque chose. Compte le coût entier.",
      reversed: "La réparation devient possible. Quelqu'un doit bouger en premier.",
    },
    general: {
      upright: "Une victoire creuse, ou un combat qui ne valait pas son prix.",
      reversed: "Réparer, ou partir sans le dernier mot.",
    },
  },
  'swords-06': {
    love: {
      upright: "Aller vers des eaux plus calmes. Emporte moins que tu ne crois nécessaire.",
      reversed: "Encore chargé de l'ancienne météo. Elle voyage.",
    },
    general: {
      upright: "Transition. Le plus dur est largement derrière.",
      reversed: "Tourner sur le même terrain. Qu'est-ce qui te retient ici ?",
    },
  },
  'swords-07': {
    love: {
      upright: "Quelque chose de retenu — du tien ou du sien. Une vérité partielle a un coût.",
      reversed: "Dire les choses. Inconfortable, puis plus léger.",
    },
    general: {
      upright: "La stratégie qui glisse vers l'esquive. Vérifie ton propre appui.",
      reversed: "La vérité remonte. L'accueillir vaut mieux que la gérer.",
    },
  },
  'swords-08': {
    love: {
      upright: "Se sentir coincé. La contrainte est peut-être plus mentale que réelle.",
      reversed: "Une limite se desserre. Un petit mouvement suffit à la tester.",
    },
    general: {
      upright: "Piégé par un récit sur tes options. Il peut être testé.",
      reversed: "La perspective revient. Il y avait une porte.",
    },
  },
  'swords-09': {
    love: {
      upright: "L'inquiétude de trois heures du matin. Elle exagère — c'est son métier.",
      reversed: "Le pire passe. Le jour aide.",
    },
    general: {
      upright: "L'anxiété avec le volume monté. La nommer la baisse un peu.",
      reversed: "Le soulagement arrive. Sois indulgent sur le temps que ça a pris.",
    },
  },
  'swords-10': {
    love: {
      upright: "Une fin douloureuse. Le fond est aussi un plancher sur lequel bâtir.",
      reversed: "Une amélioration lente. La reprise est moins spectaculaire que la fin ne l'a été.",
    },
    general: {
      upright: "Quelque chose se termine durement. C'est terminé, ce qui est déjà une clémence.",
      reversed: "Se relever. Le progressif compte.",
    },
  },
  'swords-11': {
    love: {
      upright: "Curiosité et questions. Les honnêtes ouvrent plus que les habiles.",
      reversed: "Observer au lieu de demander. Le dire fonctionne mieux.",
    },
    general: {
      upright: "Vigilance et informations neuves. Reste curieux.",
      reversed: "La parole dépasse l'action, ou trop d'informations de seconde main.",
    },
  },
  'swords-12': {
    love: {
      upright: "Direct et rapide. Rafraîchissant, tant que ce n'est pas négligent.",
      reversed: "Des mots qui atterrissent plus fort que prévu. Ralentis le tempo.",
    },
    general: {
      upright: "Action décisive. Bouge tant que c'est clair.",
      reversed: "Précipitation. Relis avant d'envoyer.",
    },
  },
  'swords-13': {
    love: {
      upright: "Des limites nettes tenues sans froideur. Cette combinaison est rare.",
      reversed: "La distance comme protection. Ça marche, et ça coûte.",
    },
    general: {
      upright: "Une clarté sans sentimentalisme. Tu vois ça nettement.",
      reversed: "Le tranchant retourné vers toi. Desserre un peu.",
    },
  },
  'swords-14': {
    love: {
      upright: "Juste, de principe, franc avec toi. Facile à croire.",
      reversed: "Avoir raison passe avant être proche. Les deux sont disponibles.",
    },
    general: {
      upright: "Une autorité fondée sur le vrai. Emploie-la légèrement.",
      reversed: "Le jugement qui durcit en critique.",
    },
  },

  // ---------------------------------------------------------------- deniers
  'pents-01': {
    love: {
      upright: "Un début qui a de la matière. Lent, concret, réel.",
      reversed: "Une ouverture manquée, ou une bonne chose mesurée à la mauvaise échelle.",
    },
    general: {
      upright: "Un départ tangible. Plante-le et sois patient.",
      reversed: "Le moment ne va pas, ou les fondations ne sont pas posées.",
    },
  },
  'pents-02': {
    love: {
      upright: "Jongler entre l'amour et tout le reste. La souplesse fait le travail.",
      reversed: "Trop d'assiettes en l'air. Quelque chose reçoit les restes.",
    },
    general: {
      upright: "S'adapter entre des exigences. Tu t'en sors.",
      reversed: "Trop d'engagements. Quelque chose peut être soustrait.",
    },
  },
  'pents-03': {
    love: {
      upright: "Bâtir quelque chose ensemble avec de l'effort réel. Collaboration, pas fusion.",
      reversed: "Des plans différents. Comparez-les avant de bâtir plus haut.",
    },
    general: {
      upright: "Compétence, équipe, et progrès visible.",
      reversed: "De l'effort sans alignement. Mettez-vous d'accord sur le plan d'abord.",
    },
  },
  'pents-04': {
    love: {
      upright: "Vouloir garder ce qui est bon. Le tenir mains ouvertes fonctionne mieux.",
      reversed: "Desserrer la prise. La sécurité revient sous une autre forme.",
    },
    general: {
      upright: "Conservation et sécurité. Raisonnable, jusqu'à un certain point.",
      reversed: "Lâcher le contrôle. Inconfortable et utile.",
    },
  },
  'pents-05': {
    love: {
      upright: "Une difficulté qui pèse sur le lien. C'est une circonstance, pas un verdict.",
      reversed: "Du soutien apparaît. Le demander est permis.",
    },
    general: {
      upright: "Manque et sentiment d'être dehors. C'est une saison.",
      reversed: "De l'aide qui arrive, ou qu'on trouve. Ça se prend.",
    },
  },
  'pents-06': {
    love: {
      upright: "Une générosité qui circule dans les deux sens. De l'équilibre dans ce qui est donné.",
      reversed: "Donner avec des conditions attachées. Ça vaut la peine de les nommer.",
    },
    general: {
      upright: "Partage et échange équitable.",
      reversed: "Un déséquilibre entre qui donne et qui reçoit.",
    },
  },
  'pents-07': {
    love: {
      upright: "De la patience pendant que ça pousse. Tout ne montre pas des progrès chaque semaine.",
      reversed: "De l'impatience devant un rendement lent. Vérifie le calendrier plutôt que la plante.",
    },
    general: {
      upright: "Un travail de long terme, à mi-parcours. Évalue sans déterrer.",
      reversed: "De l'effort versé dans le mauvais champ. Ça vaut une réévaluation honnête.",
    },
  },
  'pents-08': {
    love: {
      upright: "S'exercer à aimer — attention, réparation, présence. C'est une compétence.",
      reversed: "Faire les gestes, ou du perfectionnisme là où la chaleur a sa place.",
    },
    general: {
      upright: "Métier et répétition. La maîtrise, c'est surtout ça.",
      reversed: "Ennui, ou des exigences qui ont cessé d'aider.",
    },
  },
  'pents-09': {
    love: {
      upright: "Autonome et ouvert en même temps. Un bon endroit d'où rencontrer.",
      reversed: "L'indépendance comme armure. Avoir besoin de quelqu'un est permis.",
    },
    general: {
      upright: "Un confort gagné. Savoure le résultat.",
      reversed: "De la réussite sans compagnie.",
    },
  },
  'pents-10': {
    love: {
      upright: "Un amour à long horizon — famille, continuité, l'avenir ordinaire.",
      reversed: "De vieux motifs familiaux qui se présentent dans un lien neuf.",
    },
    general: {
      upright: "Stabilité, héritage, et des choses qui te survivent.",
      reversed: "Une tension héritée. Elle peut être examinée et déposée.",
    },
  },
  'pents-11': {
    love: {
      upright: "Quelqu'un de fiable et sans hâte. Prometteur discrètement.",
      reversed: "Des plans sans suite. Regarde ce qui est fait, pas ce qui est dit.",
    },
    general: {
      upright: "Étudier, commencer, apprendre le métier.",
      reversed: "Procrastination, ou un plan qui reste un plan.",
    },
  },
  'pents-12': {
    love: {
      upright: "Stable, fiable, un peu lent. La constance est sous-estimée.",
      reversed: "De la routine sans chaleur. Quelque chose pourrait être ajouté.",
    },
    general: {
      upright: "Un progrès méthodique. Ennuyeux et efficace.",
      reversed: "Coincé dans le sillon. Change une variable.",
    },
  },
  'pents-13': {
    love: {
      upright: "Un soin pratique — celui qui prend la forme de repas et de trajets plutôt que de discours.",
      reversed: "Prendre soin au point de ne plus être pris en soin.",
    },
    general: {
      upright: "Une abondance ancrée, et un confort partageable.",
      reversed: "Pourvoir en étant soi-même à sec.",
    },
  },
  'pents-14': {
    love: {
      upright: "Solide, généreux, imperturbable sur les petites choses. Un terrain facile où bâtir.",
      reversed: "La sécurité placée au-dessus de la proximité. Les deux sont disponibles.",
    },
    general: {
      upright: "Un leadership débrouillard et une stabilité longue.",
      reversed: "Serrer fort. Rien ici n'est aussi rare que ça en a l'air.",
    },
  },
};

export const CORPUS_FR: TarotCorpus = {
  names: NAMES_FR,
  meanings: MEANINGS_FR,
};
