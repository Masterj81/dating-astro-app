ce site# JUNO — prochaines étapes au 14 septembre 2026

Cette checklist commence après l'application de la migration JUNO-30 et la mise en production d'Android **2.1.1 / versionCode 130** à 100 % sur Google Play.

> Ne jamais confondre code local, commit poussé, CI verte, déploiement effectué et comportement prouvé en production.

## P0 — terminer JUNO-30 exploitation — **FAIT le 15 septembre 2026**

- [x] Le 15 septembre 2026, après **12:00 UTC** (08:00 à Toronto), exécuter la passe C de `diagnose_juno30_horoscope_closure.sql`.
- [x] Confirmer `daily-horoscope-push.active = false`.
- [x] Confirmer `passages_apres_repere = 0` — **mesuré : 0 nouveau passage** (le `1` de la lecture brute est le passage-repère d'hier midi lui-même, compté « après » par 59,869 ms : repère pg_net tronqué à la seconde vs `start_time` à la microseconde — explication et preuve au runbook JUNO-30, §6).
- [x] Confirmer `dernier_passage = 2026-09-14 12:00:00+00` — mesuré `2026-09-14 12:00:00.059869+00` (hier) : **le midi du 15 septembre est passé sans exécution**.
- [x] Ne pas attribuer un éventuel nouveau 401 global à ce cron sans corrélation supplémentaire — **0×401 après le repère** de toute façon.
- [x] Consigner la preuve finale dans l'audit.
- [x] Marquer JUNO-30 fermé pour son versant exploitation uniquement lorsque les trois mesures sont conformes — **conformes : FERMÉ le 15 septembre 2026, 12:43 UTC**.

Les cinq réponses `pg_net` à statut `NULL` restent un suivi distinct et ne bloquent pas cette fermeture sans preuve de corrélation.

## P1 — fermer le résiduel JUNO-01

### Adoption Android

- [ ] Dans Google Play Console, ouvrir **Statistiques → Utilisateurs actifs**.
- [ ] Regrouper le graphique par **version de l'application**.
- [ ] Mesurer les sept derniers jours disponibles après le délai Play de 24 à 48 heures.
- [ ] Exporter un CSV daté, sans l'ajouter au dépôt s'il contient des données sensibles.
- [ ] Confirmer que la version **2.1.1 (130)** représente au moins **95 % des utilisateurs actifs pendant sept jours consécutifs**.

Le déploiement Play à 100 % prouve la promotion de la version, pas la mise à jour des appareils actifs.

### Compatibilité PWA

- [ ] Tester une PWA installée avant le dernier déploiement web.
- [ ] Vérifier que son ancien service worker récupère correctement la version courante.
- [ ] Vérifier qu'elle consomme `response.synastry` sans dépendre des degrés legacy.
- [ ] Si ce comportement n'est pas garanti, traiter JUNO-16 avant la bascule.

### Retrait des degrés legacy

À exécuter seulement lorsque les portes Android et PWA sont vertes :

- [ ] Passer `PUBLISH_LEGACY_DEGREES` à `false`.
- [ ] Exécuter les tests de synastrie, `validate:chart-privacy` et `validate:edge-astrology`.
- [ ] Exécuter le typecheck et le lint.
- [ ] Redéployer `get-profile-chart`.
- [ ] Tester une synastrie sur le web et Android 130.
- [ ] Vérifier récursivement l'absence de champs legacy et de coordonnées dans la réponse.
- [ ] Consigner JUNO-01 comme fermé sans résiduel.

Il n'existe aucune application iOS native distribuée au 14 septembre 2026. Le risque iOS se limite donc à la PWA installée.

## P1 — valider les nouvelles fonctions de compte

### Web

- [ ] Demander un changement d'adresse courriel.
- [ ] Recevoir le message de confirmation JUNO.
- [ ] Confirmer la nouvelle adresse.
- [ ] Vérifier la connexion avec la nouvelle adresse.
- [ ] Changer le mot de passe.
- [ ] Se déconnecter, puis se reconnecter avec le nouveau mot de passe.
- [ ] Vérifier le libellé **Adresse courriel et mot de passe** dans l'état fermé de la carte.
- [ ] Vérifier le remplacement automatique d'une photo de profil cassée.

### Android 130

- [ ] Ouvrir **Paramètres → Courriel et mot de passe**.
- [ ] Tester le changement d'adresse et sa confirmation.
- [ ] Tester le changement de mot de passe.
- [ ] Se déconnecter, puis se reconnecter avec les nouveaux identifiants.
- [ ] Vérifier que le lien de support vise `support@junosynastry.com`.

## P1 — ouvrir le chantier des notifications push

### Suivi A — enregistrement des jetons

- [ ] Comprendre pourquoi seulement un jeton existe pour 289 profils actifs.
- [ ] Comprendre pourquoi aucun jeton n'est au format Expo attendu.
- [ ] Vérifier les parcours de demande de permission et d'enregistrement Android.
- [ ] Vérifier les changements de compte sur un même appareil.
- [ ] Vérifier la suppression ou l'invalidation des jetons obsolètes.
- [ ] Ajouter un diagnostic sans afficher les valeurs des jetons.
- [ ] Ne pas modifier ou supprimer le jeton existant pendant le diagnostic.

### Suivi B — consentement

- [ ] Documenter que `dailyHoroscope` est activé par défaut depuis le 24 août.
- [ ] Déterminer si ce défaut constitue un consentement valide.
- [ ] Décider de la valeur par défaut future.
- [ ] Préparer, si nécessaire, une migration distincte pour les préférences existantes.
- [ ] N'envoyer aucune notification avant cette décision.

`daily-horoscope-push` doit rester désarmé jusqu'à la fermeture des suivis A et B.

## P2 — isoler le chantier `marketingagent`

- [ ] Inventorier les fichiers modifiés et non suivis du chantier.
- [ ] Exclure `.gitignore`, `CLAUDE.md`, les runbooks de sécurité et les assets Store sans rapport.
- [ ] Créer une branche dédiée seulement après avoir vérifié le périmètre exact.
- [ ] Exécuter les tests du `marketingagent`.
- [ ] Vérifier qu'aucun secret ou fichier `.env` n'entre dans l'index.
- [ ] Examiner le passage à Gemini, la stratégie de contenu, TikTok et la boucle d'entraînement.
- [ ] Préparer une PR dédiée.

### Décision sur la publication

- [ ] Choisir un seul publieur : Blotato manuel **ou** file cloud avec cron.
- [ ] Concevoir une déduplication structurelle avant toute automatisation.
- [ ] Conserver `publish-scheduled-posts` sans cron tant que la décision reste manuelle.
- [ ] Ne pas poser `BLOTATO_API_KEY` dans Supabase tant que le chemin cloud est désactivé.
- [ ] Si le cloud est retenu, régénérer ensemble le secret fonction et le secret Vault le même jour.

## P2 — assainir l'arbre de travail

Traiter séparément :

- [ ] `.gitignore`.
- [ ] `CLAUDE.md`.
- [ ] `docs/runbooks/JUNO-31-EXECUTION.md`.
- [ ] Runbooks d'exécution JUNO-09.
- [ ] Notes Google Play et App Store.
- [ ] Répertoire `app/` égaré à la racine.
- [ ] Assets Store non suivis.
- [ ] Changements et nouveaux fichiers `marketingagent/`.

Règles :

- ne jamais utiliser `git add .` ;
- ne jamais utiliser `git reset --hard`, `git checkout --` ou `git clean` ;
- ajouter les fichiers explicitement ;
- un thème fonctionnel par commit ;
- vérifier `git diff --cached --check` avant chaque commit.

## P2 — compléter le CI

- [ ] Ajouter `validate:natal-integrity`.
- [ ] Ajouter `validate:design-tokens`.
- [ ] Ajouter `validate:engine-contract`.
- [ ] Ajouter `validate:cron-secrets`.
- [ ] Ajouter `validate:media-purge`.
- [ ] Ajouter `validate:orphan-purge`.
- [ ] Vérifier le temps total du pipeline.
- [ ] Vérifier que chaque validateur échoue réellement lors d'une régression injectée.
- [ ] Exécuter la CI sur une branche avant fusion.

## P3 — constats de sécurité encore ouverts

Ordre recommandé, à confirmer contre l'état courant de l'audit :

- [ ] **JUNO-05 / JUNO-13** — stockage des sessions web et CSP inline.
- [ ] **JUNO-06** — fonctionnalités premium encore contrôlées uniquement côté client.
- [ ] **JUNO-07 / JUNO-14** — relais `/api/contact` et limite de débit en mémoire.
- [ ] **JUNO-12** — dépendances et résultat de `npm audit`.
- [ ] **JUNO-10**.
- [ ] **JUNO-15**.
- [ ] **JUNO-17**.
- [ ] **JUNO-19**.
- [ ] **JUNO-22 à JUNO-27**.

Avant chaque nouveau chantier, relire le constat dans `docs/security-audit-2026-09-07.md`, confirmer qu'il est toujours reproductible, puis séparer diagnostic, correction, déploiement et preuve de production.

## Terminé et à ne pas refaire

- [x] Android 2.1.1 / versionCode 130 construit et promu à 100 % sur Google Play.
- [x] `support@junosynastry.com` reçoit les messages.
- [x] `send-report-email` et `cancel-account-deletion` redéployées.
- [x] JUNO-09 fermé, y compris le rattrapage des cinq orphelins historiques.
- [x] JUNO-21 terminé.
- [x] JUNO-29 fermé.
- [x] JUNO-31 fermé.
- [x] Contrôle J+14 exécuté : 68,8 %, supérieur au seuil de 56,8 %.
- [x] Décision produit JUNO-30 enregistrée et cron horoscope désarmé.

## Prochaine action immédiate

Exécuter la passe C de JUNO-30 le 15 septembre 2026 après 12:00 UTC, puis lancer en parallèle la mesure d'adoption Android 130 et le test de la PWA installée avec un ancien service worker.
