// Interprétations signe-sur-cuspide — corpus français.
//
// PROVENANCE : écrit pour JUNO, pas traduit mot à mot de `content-en.ts` et
// pas repris d'une source tierce. Mêmes règles de voix que la version
// anglaise, et mêmes garde-fous appliqués par le test.
//
// VOUVOIEMENT, sur décision de cohérence : l'écran dit déjà « Votre ascendant
// façonne les premières impressions » (`natalRisingMeaning`) et « Votre MC
// indique la direction publique ». Mélanger « tu » et « vous » sur une même
// page se remarque immédiatement. Passer tout l'écran au tutoiement reste
// possible — c'est alors une décision produit, pas une décision de ce fichier.
//
// Mots proscrits : toujours, jamais, destin, âme sœur, garanti, « vous devez ».
// Chaque texte porte au moins une modalisation : peut, peuvent, souvent,
// parfois, a tendance à, pourrait.
//
// CE FICHIER N'IMPORTE RIEN, comme son équivalent anglais : le validateur le
// charge par `await import()` sous le type-stripping natif de Node, qui ne
// résout pas les spécificateurs de module.

export const HOUSE_CUSP_CONTENT_FR = {
  // --- Maison 1 : identité, corps, première impression, abordage de la vie ---
  natalHouseCuspInterpretation_1_aries:
    'Vous arrivez souvent vite : des décisions prises en mouvement, des avis donnés avant d’être polis. Cette franchise se lit facilement comme de l’honnêteté, et elle passe encore mieux quand on vous voit aussi hésiter, pas seulement avancer.',
  natalHouseCuspInterpretation_1_taurus:
    'Votre présence a tendance à apaiser une pièce plutôt qu’à s’y annoncer, et on vous rencontre souvent comme quelqu’un que rien ne presse. La chaleur s’installe à son rythme ici, ce qui peut passer pour de la réserve tant que la confiance n’est pas là.',
  natalHouseCuspInterpretation_1_gemini:
    'Les premières impressions peuvent être rapides, verbales et curieuses — poser des questions comme façon de dire bonjour. Cette légèreté est réelle, et elle peut aussi servir d’abri ; la profondeur arrive souvent quand vous laissez un sujet durer.',
  natalHouseCuspInterpretation_1_cancer:
    'Vous pouvez aborder les situations nouvelles en lisant d’abord la météo émotionnelle, en décidant discrètement s’il est prudent de s’ouvrir. On se sent souvent pris en considération par vous avant de sentir qu’on vous connaît.',
  natalHouseCuspInterpretation_1_leo:
    'Il peut y avoir de la chaleur et de la couleur dans votre façon d’arriver, et une vraie disponibilité à être vu. La reconnaissance compte souvent plus qu’on ne l’avoue, et l’assumer est en général plus simple que de composer autour.',
  natalHouseCuspInterpretation_1_virgo:
    'Vous entrez peut-être dans une pièce en remarquant déjà ce qui pourrait être amélioré, y compris chez vous. Cette attention est utile, et elle devient plus douce quand la même exigence s’applique avec ménagement.',
  natalHouseCuspInterpretation_1_libra:
    'Le premier contact passe souvent par le charme, l’équilibre et l’envie de rendre les choses agréables. L’accord vient facilement ici, alors il vaut la peine de repérer quand vous avez dit oui à quelque chose que vous ne vouliez pas.',
  natalHouseCuspInterpretation_1_scorpio:
    'Vous vous dévoilez peut-être lentement, en observant plus que vous ne montrez, et on sent souvent qu’il y a autre chose en dessous. La discrétion est ici un vrai besoin, pas une tactique, et le dire simplement évite beaucoup de malentendus.',
  natalHouseCuspInterpretation_1_sagittarius:
    'Vous pouvez aborder la vie comme un terrain à explorer, avec une franchise qui rafraîchit plus souvent qu’elle ne heurte. L’espace compte, et les engagements tiennent mieux quand ils sont choisis à voix haute plutôt que supposés.',
  natalHouseCuspInterpretation_1_capricorn:
    'Il peut y avoir du calme dans votre façon d’arriver : mesuré, capable, plus lent à montrer l’effort que le résultat. Laisser voir le travail en cours crée souvent plus de proximité que la version finie.',
  natalHouseCuspInterpretation_1_aquarius:
    'Vous vous présentez peut-être comme votre propre catégorie : cordial mais un peu à part, souvent plus à l’aise avec les idées qu’avec les banalités. La différence vous vient facilement ; être inclus sur un mode ordinaire demande parfois plus d’entraînement.',
  natalHouseCuspInterpretation_1_pisces:
    'Vous prenez peut-être la température émotionnelle d’une pièce et vous vous y ajustez avant de décider qui vous y êtes. Cette sensibilité est un don, et elle fonctionne mieux avec des contours : savoir où vous vous arrêtez aide les autres à vous rejoindre.',

  // --- Maison 2 : argent, valeurs, possessions, estime de soi, stabilité ---
  natalHouseCuspInterpretation_2_aries:
    'Vous pouvez gagner et dépenser par à-coups, en suivant une intuition avant que le tableur ne suive. L’estime de soi passe souvent par l’action ici : la bonne question est de savoir quels risques construisent, et lesquels prouvent seulement que vous savez en prendre.',
  natalHouseCuspInterpretation_2_taurus:
    'Le confort, la qualité et la stabilité comptent peut-être plus pour vous que le volume, et accumuler lentement peut être plus agréable qu’un coup de chance. La valeur se mesure souvent à ce qui dure, ce qui rassure — jusqu’à devenir une raison de ne rien changer.',
  natalHouseCuspInterpretation_2_gemini:
    'L’argent peut arriver par plusieurs canaux plutôt qu’un seul, et l’intérêt peut aller plus vite que l’engagement. Nommer à voix haute ce que vous valorisez vraiment stabilise souvent mieux les décisions qu’un budget.',
  natalHouseCuspInterpretation_2_cancer:
    'La sécurité peut être émotionnelle avant d’être financière, et épargner peut être une façon de protéger ceux que vous aimez. Il vaut la peine de remarquer quand vous gardez une chose parce que la lâcher ressemble à une perte, et non parce que la garder aide.',
  natalHouseCuspInterpretation_2_leo:
    'Vous pouvez dépenser généreusement pour ce qui rend la vie chaleureuse, et valoriser ce qui porte du sens ou de la beauté. La valeur peut se mêler ici à la reconnaissance ; la version plus stable consiste à connaître la vôtre sans avoir besoin qu’on la confirme.',
  natalHouseCuspInterpretation_2_virgo:
    'Vous suivez peut-être les détails, préférez l’utile au spectaculaire, et vous vous rassurez en sachant exactement où en sont les choses. L’estime de soi peut discrètement devenir une liste à cocher, utile à desserrer : être utile n’est pas la même chose qu’avoir de la valeur.',
  natalHouseCuspInterpretation_2_libra:
    'La valeur peut être liée à la beauté, à l’équité et aux arrangements partagés, et l’argent peut devenir une conversation de couple. Décider de ce que vous voulez avant que la négociation commence protège souvent l’équilibre que vous cherchez.',
  natalHouseCuspInterpretation_2_scorpio:
    'Les ressources peuvent être gardées discrètement et gérées avec une vraie intention, et vous pouvez être stratégique sur ce que vous dévoilez. La profondeur de l’investissement est une force ; l’exercice consiste à repérer le moment où le contrôle a remplacé la confiance.',
  natalHouseCuspInterpretation_2_sagittarius:
    'Vous valorisez peut-être la liberté plus que l’accumulation, et vous dépensez plus volontiers en expériences, en apprentissages ou en distance qu’en objets. L’optimisme vous sert ici, et il fonctionne mieux avec un chiffre honnête attaché.',
  natalHouseCuspInterpretation_2_capricorn:
    'Construire lentement peut vous sembler naturel, et un horizon long rend le sacrifice supportable. La valeur est souvent liée à l’accomplissement ici, ce qui mérite d’être questionné les jours où rien n’aboutit.',
  natalHouseCuspInterpretation_2_aquarius:
    'Votre rapport à l’argent peut être atypique, guidé par des principes, ou volontairement distant. Les valeurs peuvent être fortes, et c’est en les mettant dans des choix quotidiens ordinaires qu’elles cessent d’être une théorie.',
  natalHouseCuspInterpretation_2_pisces:
    'Les limites autour de l’argent et des biens peuvent être souples, et la générosité peut arriver avant le calcul. Poser une limite à voix haute n’est pas de la dureté ici : c’est ce qui rend la générosité tenable.',

  // --- Maison 3 : communication, fratrie, monde proche, apprentissages ---
  natalHouseCuspInterpretation_3_aries:
    'Vous dites peut-être les choses à mesure que vous les pensez, et la vitesse fait partie de la façon dont vous montrez de l’intérêt. La franchise inspire confiance, et une respiration avant d’envoyer évite souvent qu’elle arrive plus fort que prévu.',
  natalHouseCuspInterpretation_3_taurus:
    'Vous parlez peut-être lentement, vous le pensez, et vous n’aimez pas qu’on vous presse de conclure. Cette stabilité rassure, et elle peut passer pour de l’entêtement quand le sujet a déjà avancé.',
  natalHouseCuspInterpretation_3_gemini:
    'Les mots peuvent venir facilement, en quantité et en variété, et la curiosité peut porter une conversation pendant des heures. Le plaisir est réel ; la profondeur arrive plutôt quand un fil est suivi au lieu d’être échangé.',
  natalHouseCuspInterpretation_3_cancer:
    'Vous communiquez peut-être autant par le ton que par le contenu, et vous vous souvenez des conversations longtemps après. Dire le sentiment simplement, au lieu de le suggérer, évite souvent les malentendus silencieux.',
  natalHouseCuspInterpretation_3_leo:
    'Vous parlez peut-être avec chaleur et couleur, et vous aimez bien raconter. L’attention fait partie du plaisir ici, et la version généreuse laisse autant de place pour écouter que pour occuper l’espace.',
  natalHouseCuspInterpretation_3_virgo:
    'Vous choisissez peut-être vos mots avec soin et remarquez ceux que les autres emploient à peu près. La précision est un service, et elle devient plus douce quand la correction est proposée plutôt qu’automatique.',
  natalHouseCuspInterpretation_3_libra:
    'La conversation peut être l’endroit où vous créez de l’équilibre, en adoucissant les angles et en cherchant la version juste. La diplomatie est une vraie compétence, et l’honnêteté plus difficile finit en général par devoir être dite.',
  natalHouseCuspInterpretation_3_scorpio:
    'Vous en dites peut-être moins que vous n’en savez, et vous lisez le sous-texte mieux que la plupart. La profondeur en conversation est un don ici, et demander directement économise souvent l’énergie passée à décoder.',
  natalHouseCuspInterpretation_3_sagittarius:
    'Vous parlez peut-être franchement, pensez en grands ensembles, et aimez la discussion comme un jeu. La franchise rafraîchit, et vérifier que l’autre joue aussi la garde ainsi.',
  natalHouseCuspInterpretation_3_capricorn:
    'Vous parlez peut-être avec économie, en préférant la phrase utile à la phrase décorative. Ce poids donne du prix à vos mots, et un peu de chaleur ajoutée évite que ce soit lu comme de la froideur.',
  natalHouseCuspInterpretation_3_aquarius:
    'Vous pensez peut-être en systèmes et appréciez l’idée plus que la conversation légère autour. Le regard original est votre apport, et l’ancrer dans du personnel est ce qui le fait atterrir.',
  natalHouseCuspInterpretation_3_pisces:
    'Vous communiquez peut-être par images, ambiances et demi-phrases qui se révèlent justes. L’ambiguïté peut être belle et elle peut égarer — une phrase concrète par conversation change beaucoup de choses.',

  // --- Maison 4 : foyer, racines, famille, intimité, fondations ---------
  natalHouseCuspInterpretation_4_aries:
    'Le foyer peut être un lieu où vous agissez plutôt qu’un lieu où vous vous posez, et l’indépendance a peut-être commencé tôt. La paix à la base se construit souvent volontairement ici, parce que l’instinct pousse à bouger.',
  natalHouseCuspInterpretation_4_taurus:
    'Vous avez peut-être besoin d’un chez-vous solide, sensoriel et sans urgence, et les racines peuvent compter plus que la mobilité. Le confort est une vraie ressource ; remarquer quand il est devenu de l’inertie le maintient tel.',
  natalHouseCuspInterpretation_4_gemini:
    'Le chez-soi peut être plusieurs lieux à la fois, ou un lieu plein de paroles, de livres et d’allées et venues. L’appartenance peut s’étaler un peu mince, et choisir où être pleinement présent est le vrai travail.',
  natalHouseCuspInterpretation_4_cancer:
    'Le foyer peut être votre centre de gravité, et la mémoire familiale peut être profonde dans votre façon de vous sentir en sécurité. Prendre soin de ceux d’où vous venez est naturel ; décider quelle part vous revient est plus délicat.',
  natalHouseCuspInterpretation_4_leo:
    'Vous voulez peut-être une maison chaleureuse, colorée et habitée, et la fierté des origines peut être forte. La générosité chez soi est réelle, et laisser les autres façonner l’espace le garde partagé.',
  natalHouseCuspInterpretation_4_virgo:
    'Vous vous stabilisez peut-être en ordonnant votre environnement, et l’aide concrète a peut-être été la façon dont on montrait l’affection là d’où vous venez. Le repos est permis ici, même quand quelque chose reste inachevé.',
  natalHouseCuspInterpretation_4_libra:
    'Vous voulez peut-être de l’harmonie chez vous et vous ressentez presque physiquement une atmosphère troublée. Maintenir la paix est une compétence, et la paix tient plus longtemps quand le désaccord a vraiment eu lieu.',
  natalHouseCuspInterpretation_4_scorpio:
    'Le foyer peut être privé, protégé, et émotionnellement intense d’une façon que vous ne montrez pas dehors. L’histoire familiale peut peser, et la regarder en face la desserre souvent plus que l’évitement.',
  natalHouseCuspInterpretation_4_sagittarius:
    'Le chez-soi peut être là où l’horizon reste ouvert, et vos racines peuvent être philosophiques plutôt que géographiques. L’appartenance est possible ici, et elle demande en général de rester assez longtemps pour la sentir.',
  natalHouseCuspInterpretation_4_capricorn:
    'La responsabilité est peut-être arrivée tôt, et le foyer peut être quelque chose que vous fournissez plutôt que vous recevez. Se laisser prendre en charge n’est pas une dette : c’est souvent la moitié manquante.',
  natalHouseCuspInterpretation_4_aquarius:
    'Le foyer peut être atypique et choisi plutôt qu’hérité, et la famille peut désigner les gens que vous avez réunis. La distance avec les origines est vivable, et nommer ce que vous en avez gardé ajoute du sol.',
  natalHouseCuspInterpretation_4_pisces:
    'Le chez-soi peut être davantage une atmosphère qu’une adresse, et vous pouvez absorber l’état émotionnel d’une maisonnée. Un espace vraiment à vous fait souvent plus pour vous que vous ne l’imaginez.',

  // --- Maison 5 : créativité, jeu, romance, joie, expression -------------
  natalHouseCuspInterpretation_5_aries:
    'La romance peut démarrer vite et sur un mode joueur, et créer peut être plus satisfaisant que perfectionner. La conquête plaît ici, et rester au-delà du premier élan est là où commence la partie intéressante.',
  natalHouseCuspInterpretation_5_taurus:
    'Le plaisir peut être lent et physique, et vous pouvez être fidèle dans votre façon d’aimer et régulier dans ce que vous fabriquez. La jouissance tranquille est un vrai talent, et garder un peu de nouveauté empêche le confort de devenir routine.',
  natalHouseCuspInterpretation_5_gemini:
    'Le flirt peut passer par l’esprit, et la créativité s’épanouir dans la variété et les débuts rapides. Le jeu est sincère ici, et laisser une chose devenir sérieuse est le risque qui vaut la peine.',
  natalHouseCuspInterpretation_5_cancer:
    'La romance peut être tendre et protectrice, plus rapide à s’attacher qu’à se déclarer. Les sentiments se montrent souvent en gestes avant les mots, alors les dire à voix haute est fréquemment la moitié manquante.',
  natalHouseCuspInterpretation_5_leo:
    'Vous aimez peut-être généreusement et créez avec un public en tête, et être apprécié peut faire partie de la joie. La chaleur est le cadeau ici, et laisser de la place à l’autre pour briller la garde chaude.',
  natalHouseCuspInterpretation_5_virgo:
    'Vous exprimez peut-être l’affection par le soin, l’effort et les détails justes pour quelqu’un. Le jeu peut être bloqué par l’autocritique ici, et l’autorisation de faire quelque chose de mal fait est souvent ce qui débloque.',
  natalHouseCuspInterpretation_5_libra:
    'La romance peut être esthétique et réciproque, attentive à ce qui se passe entre deux personnes. Le charme vient facilement, et choisir depuis le désir plutôt que depuis ce qui plaît est l’exercice plus profond.',
  natalHouseCuspInterpretation_5_scorpio:
    'L’attirance peut être profonde et discrète, et la créativité venir de ce qui est intense plutôt que léger. Le tout ou rien est la tendance ici, et la légèreté a le droit de faire partie de la profondeur.',
  natalHouseCuspInterpretation_5_sagittarius:
    'La romance peut être aventureuse et honnête, meilleure avec de l’espace dedans ; créer peut relever du sens autant que de la forme. La liberté compte ici, et le dire tôt évite que ce soit lu comme un retrait.',
  natalHouseCuspInterpretation_5_capricorn:
    'Vous prenez peut-être l’amour au sérieux, et la créativité peut être disciplinée plutôt que spontanée. Le jeu n’est pas une perte de temps ici, même les jours où il en a l’air.',
  natalHouseCuspInterpretation_5_aquarius:
    'Vous aimez peut-être à vos conditions et créez hors des formes attendues. L’indépendance en amour fonctionne bien quand elle est dite ; c’est la distance supposée qui blesse.',
  natalHouseCuspInterpretation_5_pisces:
    'La romance peut être imaginative et compatissante, et facile à idéaliser ; la créativité coule mieux quand vous cessez de diriger. Voir la personne telle qu’elle est, et non telle que le sentiment la dessine, est ce qui fait durer.',

  // --- Maison 6 : routines, rythme de travail, santé, service ------------
  natalHouseCuspInterpretation_6_aries:
    'Vous travaillez peut-être par sprints, avez besoin d’élan pour rester engagé, et perdez l’intérêt quand une tâche traîne. L’énergie est la ressource ici, et la doser volontairement évite que le sprint devienne l’arrêt.',
  natalHouseCuspInterpretation_6_taurus:
    'La routine peut vraiment vous stabiliser, et un rythme qui fonctionne peut tenir des années. La régularité est la force, et remarquer quand elle ne vous sert plus évite qu’elle devienne une ornière.',
  natalHouseCuspInterpretation_6_gemini:
    'Vous avez peut-être besoin de variété dans la journée et de plusieurs choses en cours pour rester intéressé. La souplesse est une vraie capacité, et un ou deux points fixes empêchent la journée de s’éparpiller.',
  natalHouseCuspInterpretation_6_cancer:
    'Vous prenez peut-être soin des autres concrètement, et le quotidien peut monter et descendre avec votre état intérieur. Construire des routines qui tiennent les jours bas compte ici plus qu’optimiser les bons jours.',
  natalHouseCuspInterpretation_6_leo:
    'Vous mettez peut-être du cœur dans un travail ordinaire et souhaitez qu’on le remarque. Bien faire est sa propre récompense les jours où personne ne le dit, et demander de la reconnaissance est permis aussi.',
  natalHouseCuspInterpretation_6_virgo:
    'Le détail, le soin et l’amélioration peuvent être une langue naturelle pour vous, et le quotidien l’endroit où vous vous sentez compétent. « Assez bien » est un vrai standard, et le traiter comme tel protège l’énergie.',
  natalHouseCuspInterpretation_6_libra:
    'Vous travaillez peut-être mieux en compagnie, dans l’équilibre et un environnement agréable, et une tension d’équipe peut vous coûter plus que la tâche. Une répartition juste mérite d’être nommée plutôt qu’absorbée.',
  natalHouseCuspInterpretation_6_scorpio:
    'Vous travaillez peut-être intensément et discrètement, en profondeur plutôt qu’en largeur. Le repos peut sembler une faiblesse ici, et le planifier est plus fiable que d’attendre de l’avoir mérité.',
  natalHouseCuspInterpretation_6_sagittarius:
    'Vous avez peut-être besoin de sens dans le travail quotidien et vous butez sur la répétition sans pourquoi. Relier la routine à l’objectif plus large fait souvent plus que la discipline seule.',
  natalHouseCuspInterpretation_6_capricorn:
    'Vous êtes peut-être fiable et structuré, et dur avec vous-même sur le rendement. La capacité n’est pas en question ici ; séparer votre valeur de votre productivité est le travail de fond.',
  natalHouseCuspInterpretation_6_aquarius:
    'Vous voulez peut-être redessiner le processus plutôt que le suivre, et vous travaillez mieux en autonomie. L’innovation passe mieux une fois le rythme existant compris.',
  natalHouseCuspInterpretation_6_pisces:
    'Vous travaillez peut-être par vagues et avez besoin d’une structure plus douce que celle des systèmes habituels. Les limites autour de l’aide — combien, pour qui, jusqu’à quand — sont ce qui protège la compassion.',

  // --- Maison 7 : liens un à un, couple, miroirs, accords ---------------
  natalHouseCuspInterpretation_7_aries:
    'Vous êtes peut-être attiré par des gens directs et énergiques, et le couple peut avancer vite une fois la décision prise. Le conflit se regarde en face ici plutôt qu’il ne s’évite, ce qui vous sert tant que l’autre a la place de répondre.',
  natalHouseCuspInterpretation_7_taurus:
    'Vous cherchez peut-être la stabilité chez un partenaire et offrez de la loyauté en retour, et l’engagement peut être lent à donner et long à tenir. La sécurité est le but, et vérifier qu’elle n’est pas devenue un refus du changement la garde honnête.',
  natalHouseCuspInterpretation_7_gemini:
    'Vous voulez peut-être un partenaire avec qui parler sans fin, et l’intérêt commence souvent par l’esprit. La conversation est le lien ici, et laisser entrer les silences et les sujets lourds est ce qui l’approfondit.',
  natalHouseCuspInterpretation_7_cancer:
    'Vous vous liez peut-être de façon protectrice et souhaitez un couple qui ressemble à un abri. Le soin se donne facilement ici, et le demander aussi clairement que vous le donnez est souvent la pièce manquante.',
  natalHouseCuspInterpretation_7_leo:
    'Vous voulez peut-être de la chaleur, de la loyauté et une fierté partagée, et vous aimez généreusement quand c’est rendu. L’appréciation compte ici, et nommer ce besoin fonctionne mieux que le tester.',
  natalHouseCuspInterpretation_7_virgo:
    'Vous montrez peut-être l’amour en remarquant et en aidant, et vous choisissez vos partenaires avec soin. Une amélioration proposée par affection peut être reçue comme une critique, et demander d’abord règle souvent la question.',
  natalHouseCuspInterpretation_7_libra:
    'Le couple peut être un thème central, et vous pouvez être vraiment doué pour faire la moitié du chemin. Le risque est la moitié qui disparaît : garder votre propre préférence visible est ce qui rend l’équilibre réel.',
  natalHouseCuspInterpretation_7_scorpio:
    'Vous vous liez peut-être en profondeur et voulez une honnêteté que la plupart des conversations évitent. La confiance se construit lentement ici et vaut le temps qu’elle prend, et les questions directes la servent mieux que les mises à l’épreuve.',
  natalHouseCuspInterpretation_7_sagittarius:
    'Vous voulez peut-être un partenaire qui soit aussi un compagnon d’exploration, avec de l’honnêteté et de l’espace. L’espace et la proximité ne s’opposent pas, et dire lequel vous manque un jour donné aide beaucoup.',
  natalHouseCuspInterpretation_7_capricorn:
    'Vous prenez peut-être l’engagement au sérieux et préférez un couple qui se construit plutôt qu’il ne se déclare. La fiabilité est le langage d’amour ici, et y ajouter de la chaleur évite que ce soit lu comme un devoir.',
  natalHouseCuspInterpretation_7_aquarius:
    'Vous voulez peut-être de l’amitié à l’intérieur du couple et de la liberté à côté. Des arrangements peu conventionnels fonctionnent bien ici quand ils sont réellement convenus, pas supposés.',
  natalHouseCuspInterpretation_7_pisces:
    'Vous fusionnez peut-être facilement avec un partenaire et ressentez ce qu’il ressent. La compassion est le don, et garder une idée claire de vos propres préférences est ce qui l’empêche de se dissoudre.',

  // --- Maison 8 : ressources partagées, intimité, confiance, mutation ----
  natalHouseCuspInterpretation_8_aries:
    'Vous abordez peut-être les sujets intenses de front et préférez la conversation difficile à la conversation lente. La franchise aide ici, et l’ajuster au rythme de l’autre aide davantage.',
  natalHouseCuspInterpretation_8_taurus:
    'Vous voulez peut-être une intimité stable et physique, et des finances communes solides. Lâcher prise est le thème plus difficile ici, car on peut continuer à tenir bien après la raison de tenir.',
  natalHouseCuspInterpretation_8_gemini:
    'Vous abordez peut-être l’intimité et les sujets difficiles en en parlant, parfois pour rester au-dessus. Nommer ce que vous ressentez, et pas seulement ce que vous pensez, est le mouvement plus profond.',
  natalHouseCuspInterpretation_8_cancer:
    'La confiance peut se donner lentement et se ressentir fort, et la proximité peut vouloir dire être admis dans la version privée de quelqu’un. D’anciens attachements peuvent persister, et les soigner doucement est plus utile que de forcer la page à se tourner.',
  natalHouseCuspInterpretation_8_leo:
    'Vous êtes peut-être généreux avec ce que vous partagez et attendez de la loyauté en retour. La fierté peut rendre la vulnérabilité difficile ici, et montrer la part non polie est ce qui approfondit le lien.',
  natalHouseCuspInterpretation_8_virgo:
    'Vous gérez peut-être les responsabilités communes avec soin et préférez des termes clairs dans l’intime. La précision aide ici, et accepter que la proximité soit imparfaite aide davantage.',
  natalHouseCuspInterpretation_8_libra:
    'Vous voulez peut-être de l’équité dans ce qui se partage, sur le plan émotionnel comme matériel. Éviter la négociation inconfortable coûte en général plus cher que de l’avoir.',
  natalHouseCuspInterpretation_8_scorpio:
    'La profondeur, le secret et la transformation peuvent être un terrain natal ici, et vous pouvez porter ce que d’autres trouvent lourd. Le pouvoir dans un lien mérite d’être surveillé : partagé ouvertement, il devient de la confiance.',
  natalHouseCuspInterpretation_8_sagittarius:
    'Vous rencontrez peut-être la perte et le changement avec du recul et une recherche de sens. La philosophie peut arriver un peu tôt, et ressentir d’abord rend en général le sens plus vrai.',
  natalHouseCuspInterpretation_8_capricorn:
    'Vous gérez peut-être les ressources communes avec sérieux et traversez les difficultés sans vous plaindre. Laisser quelqu’un en porter une part n’est pas un défaut de force.',
  natalHouseCuspInterpretation_8_aquarius:
    'Vous avez peut-être un regard inhabituellement détaché sur l’intimité et les arrangements partagés. L’objectivité est utile ici, et rester présent quand cela devient émotionnel est la marge de progression.',
  natalHouseCuspInterpretation_8_pisces:
    'Vous ressentez peut-être les états des autres comme les vôtres et donnez plus que ce qui était convenu. La compassion est réelle, et une limite énoncée est ce qui la protège.',

  // --- Maison 9 : voyage, croyances, philosophie, études, sens ----------
  natalHouseCuspInterpretation_9_aries:
    'Vous apprenez peut-être en faisant et formez vos convictions vite. La conviction donne de l’énergie, et rester curieux après avoir décidé l’empêche de durcir.',
  natalHouseCuspInterpretation_9_taurus:
    'Vous adoptez peut-être vos croyances lentement et les gardez, en préférant un savoir utilisable. La profondeur plutôt que la nouveauté est une force, et une exposition ponctuelle à l’inconnu la garde vivante.',
  natalHouseCuspInterpretation_9_gemini:
    'Vous collectionnez peut-être les idées largement et appréciez l’échange plus que la conclusion. L’étendue est un vrai apprentissage, et un seul sujet mené jusqu’au bout vous transforme autrement.',
  natalHouseCuspInterpretation_9_cancer:
    'La croyance peut être enracinée dans l’appartenance, la famille et ce qui sonne juste émotionnellement. Le sens grandit ici quand le familier est comparé à l’inconnu plutôt que défendu contre lui.',
  natalHouseCuspInterpretation_9_leo:
    'Vous portez peut-être vos convictions avec chaleur et aimez transmettre ce que vous avez trouvé. L’enthousiasme entraîne, et laisser de la place au désaccord garde cela conversationnel.',
  natalHouseCuspInterpretation_9_virgo:
    'Vous étudiez peut-être avec soin et vous méfiez des affirmations qui sautent les preuves. La rigueur a de la valeur ici, et laisser une place à ce qui n’est pas encore mesurable en fait partie.',
  natalHouseCuspInterpretation_9_libra:
    'Vous pesez peut-être les points de vue et préférez celui qui tient plusieurs vérités ensemble. L’équilibre est une vraie sagesse, et à un moment, prendre position en fait partie aussi.',
  natalHouseCuspInterpretation_9_scorpio:
    'Vous cherchez peut-être le sens sous le sens officiel et vous méfiez des réponses faciles. La profondeur est le don ici, et laisser certaines choses rester simples est le soulagement.',
  natalHouseCuspInterpretation_9_sagittarius:
    'Le sens, la distance et la philosophie peuvent être un terrain natal, et vous pouvez être vraiment à l’aise dans l’inconnu. L’enthousiasme pour la vue d’ensemble est une force, et les détails comptent quand même.',
  natalHouseCuspInterpretation_9_capricorn:
    'Vous préférez peut-être les croyances éprouvées et un savoir qui sert. La structure sert la compréhension ici, et laisser une place à l’émerveillement la sert aussi.',
  natalHouseCuspInterpretation_9_aquarius:
    'Vous construisez peut-être votre vision du monde vous-même, souvent contre celle dont vous avez hérité. La pensée indépendante est l’atout, et la confronter à d’autres est ce qui la garde affûtée.',
  natalHouseCuspInterpretation_9_pisces:
    'Le sens peut arriver par l’image, l’intuition et le ressenti plutôt que par l’argument. Ce savoir est réel, et l’ancrer dans quelque chose de vérifiable est ce qui le rend partageable.',

  // --- Maison 10 : carrière, réputation, rôle public, accomplissement ----
  natalHouseCuspInterpretation_10_aries:
    'Vous allez peut-être vite vers des rôles visibles et préférez mener plutôt qu’attendre votre tour. L’initiative se remarque ici, et rester assez longtemps pour terminer est ce qui capitalise.',
  natalHouseCuspInterpretation_10_taurus:
    'Vous construisez peut-être une réputation lentement et la gardez longtemps, en préférant la valeur régulière à l’ascension rapide. La fiabilité est votre signature, et le risque est de rester dans un rôle au-delà de son utilité.',
  natalHouseCuspInterpretation_10_gemini:
    'Votre rôle public peut passer par les mots, les idées, ou plusieurs métiers à la fois. La polyvalence est réelle, et une phrase claire sur ce que vous faites la rend lisible pour les autres.',
  natalHouseCuspInterpretation_10_cancer:
    'Votre vie publique peut être colorée par le soin, la loyauté et l’envie de créer un sentiment de sécurité. Au travail ou dans votre réputation, on peut vous remarquer pour votre façon de protéger, de rassembler, ou d’apporter une tonalité humaine dans des endroits qui tournent froid.',
  natalHouseCuspInterpretation_10_leo:
    'Vous voulez peut-être un travail où vous pouvez être vu et dont vous pouvez être fier, et vous pouvez diriger avec chaleur. La reconnaissance est un vrai besoin ici, et la mériter comme la demander sont permis.',
  natalHouseCuspInterpretation_10_virgo:
    'Vous êtes peut-être celui par qui le travail fonctionne vraiment, avec une réputation qui tient à la compétence plus qu’à la présence. La visibilité n’est pas de l’immodestie, et la qualité inspire davantage confiance une fois nommée.',
  natalHouseCuspInterpretation_10_libra:
    'Votre rôle public peut passer par la médiation, l’esthétique ou l’art de mettre les gens d’accord. Être apprécié et être efficace peuvent tirer dans des directions différentes, et choisir parfois le second fait partie du rôle.',
  natalHouseCuspInterpretation_10_scorpio:
    'Vous travaillez peut-être avec ce qui est caché, complexe ou à fort enjeu, et préférez l’influence à la démonstration. Le pouvoir fonctionne mieux à découvert ici, car le contrôle discret coûte souvent de la confiance.',
  natalHouseCuspInterpretation_10_sagittarius:
    'Vous voulez peut-être un travail porteur de sens, d’envergure ou de voyage, et vous supportez mal un plafond. La vision attire les occasions, et c’est le suivi qui les convertit.',
  natalHouseCuspInterpretation_10_capricorn:
    'L’ambition peut être régulière et à long terme, et l’autorité peut vous aller une fois qu’elle est méritée. L’accomplissement est un sol réel, et savoir de qui vient la définition du succès que vous suivez compte.',
  natalHouseCuspInterpretation_10_aquarius:
    'Vous voulez peut-être un rôle qui change quelque chose, et vous logez mal dans une échelle conventionnelle. L’originalité est l’apport, et la traduire en termes utilisables par d’autres est le vrai métier.',
  natalHouseCuspInterpretation_10_pisces:
    'Vous pouvez être attiré par un travail qui fait appel à l’imagination, au soin, ou à quelque chose de plus grand que la fiche de poste. La direction peut être moins linéaire ici, et choisir un engagement visible donne une forme à la sensibilité.',

  // --- Maison 11 : amis, groupes, réseaux, projets, communauté ----------
  natalHouseCuspInterpretation_11_aries:
    'Vous pouvez donner de l’énergie à un groupe et préférer faire ensemble plutôt qu’en parler. L’initiative est bienvenue ici, et laisser de la place aux voix plus lentes garde le groupe autant le vôtre que le leur.',
  natalHouseCuspInterpretation_11_taurus:
    'Les amitiés peuvent être peu nombreuses, longues et stables, et vous pouvez être celui qui reste. La loyauté est la force, et laisser entrer de nouvelles personnes est ce qui garde le cercle vivant.',
  natalHouseCuspInterpretation_11_gemini:
    'Vous connaissez peut-être beaucoup de monde et aimez circuler entre les cercles. L’étendue est une vraie intelligence sociale, et quelques liens plus profonds sont ce qui pèse quand ça compte.',
  natalHouseCuspInterpretation_11_cancer:
    'L’amitié peut ressembler à une famille, protectrice et émotionnellement proche. Prendre soin du groupe vient naturellement, et vérifier que c’est réciproque est ce qui vous protège.',
  natalHouseCuspInterpretation_11_leo:
    'Vous pouvez être un centre chaleureux dans un groupe et donner généreusement à vos amis. L’appréciation compte dans les deux sens, et laisser parfois les autres mener approfondit la loyauté.',
  natalHouseCuspInterpretation_11_virgo:
    'Vous pouvez être l’ami qui aide concrètement et remarque ce qui manque. Être utile est une vraie forme d’amour, et être voulu pour votre seule compagnie est permis aussi.',
  natalHouseCuspInterpretation_11_libra:
    'Vous construisez peut-être des réseaux facilement et y maintenez la paix. L’harmonie est votre apport, et énoncer parfois une préférence est ce qui garde les amitiés réelles.',
  natalHouseCuspInterpretation_11_scorpio:
    'L’amitié peut être sélective et profonde, avec peu de patience pour le superficiel. La confiance est lente et durable ici, et dire ce dont vous avez besoin épargne beaucoup de mises à l’épreuve.',
  natalHouseCuspInterpretation_11_sagittarius:
    'Vous collectionnez peut-être des amis à travers les lieux et appréciez ceux qui élargissent votre regard. La liberté en amitié va très bien, et la constance est ce qui la transforme en appartenance.',
  natalHouseCuspInterpretation_11_capricorn:
    'Vous prenez peut-être l’amitié au sérieux et on compte sur vous dans un groupe. La responsabilité est réelle ici, et laisser parfois les amitiés être légères fait partie de ce qui les tient.',
  natalHouseCuspInterpretation_11_aquarius:
    'La communauté, les idées et les causes partagées peuvent être là où vous vous sentez vivant. Appartenir à plus grand vous convient, et les amitiés individuelles demandent quand même d’être entretenues une à une.',
  natalHouseCuspInterpretation_11_pisces:
    'Vous rejoignez peut-être les groupes au ressenti plutôt qu’au plan, et vous absorbez l’humeur d’un cercle. La compassion attire, et choisir les cercles avec soin protège votre énergie.',

  // --- Maison 12 : solitude, rêves, part cachée, retrait ---------------
  natalHouseCuspInterpretation_12_aries:
    'La colère et l’élan peuvent être les parts les plus difficiles à voir chez vous, et le repos peut ressembler à une défaite. La solitude est là où l’énergie se refait, et l’utiliser volontairement vaut mieux que de s’y écrouler.',
  natalHouseCuspInterpretation_12_taurus:
    'Vous tenez peut-être discrètement à des choses que vous n’avez pas reconnu tenir. Ralentir exprès peut montrer ce que la routine recouvrait.',
  natalHouseCuspInterpretation_12_gemini:
    'L’esprit peut continuer de tourner quand vous êtes seul, et penser peut remplacer ressentir. Le silence sans stimulation est inconfortable d’abord, et souvent éclairant ensuite.',
  natalHouseCuspInterpretation_12_cancer:
    'D’anciens sentiments et la mémoire familiale peuvent affleurer dans l’intimité. Les soigner doucement, avec quelqu’un de confiance, allège plus que les porter seul.',
  natalHouseCuspInterpretation_12_leo:
    'Le besoin d’être vu peut être la part privée, et la solitude peut donner l’impression de disparaître. Le temps seul n’est pas une perte de soi : c’est souvent là que le soi se trouve.',
  natalHouseCuspInterpretation_12_virgo:
    'L’autocritique peut tourner discrètement en dessous et être la chose la plus difficile à repérer. Se reposer sans l’avoir mérité est l’exercice ici, et il demande de l’entraînement.',
  natalHouseCuspInterpretation_12_libra:
    'Vous pouvez perdre le fil de vos propres préférences en privé comme en public. La solitude est généralement là où la réponse honnête à ce que vous voulez apparaît.',
  natalHouseCuspInterpretation_12_scorpio:
    'L’intensité peut vivre sous la surface, et vous pouvez porter plus que vous ne montrez. En amener une part à la lumière, à votre rythme, coûte en général moins que de la retenir.',
  natalHouseCuspInterpretation_12_sagittarius:
    'L’agitation peut être le thème privé, et l’immobilité peut ressembler à un piège. Le sens trouvé en restant sur place est d’une autre nature, et vaut souvent l’inconfort.',
  natalHouseCuspInterpretation_12_capricorn:
    'La pression que vous vous mettez peut être invisible pour les autres et constante pour vous. La solitude sans tâche est la discipline la plus difficile ici, et la plus réparatrice.',
  natalHouseCuspInterpretation_12_aquarius:
    'Vous pouvez vous sentir à part même à l’intérieur des groupes auxquels vous appartenez. Nommer la solitude plutôt que la théoriser est ce qui referme la distance.',
  natalHouseCuspInterpretation_12_pisces:
    'La vie intérieure, l’imagination et la porosité peuvent être fortes ici, et la frontière entre vous et l’ambiance peut être mince. Une solitude régulière n’est pas un retrait : c’est de l’entretien.',
};
