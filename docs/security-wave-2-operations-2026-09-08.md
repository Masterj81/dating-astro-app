# Sécurité JUNO — conduite opérationnelle de la vague 2

**Date de référence :** 8 septembre 2026

**Portée :** mise en production et validation de JUNO-04, JUNO-21, JUNO-18 et JUNO-20, puis préparation de JUNO-09.
**Documents de référence :**

- [`security-audit-2026-09-07.md`](security-audit-2026-09-07.md) — audit et registre des constats ;
- [`runbooks/unsubscribe-dual-key-2026-09.md`](runbooks/unsubscribe-dual-key-2026-09.md) — transition des liens de désabonnement ;
- [`runbooks/service-role-least-privilege-2026-09.md`](runbooks/service-role-least-privilege-2026-09.md) — retrait de `service_role` de `marketingagent` et décision de rotation.

Ce document orchestre les opérations. Les deux runbooks spécialisés restent la source de vérité pour les détails cryptographiques, les tests et les procédures de récupération.

---

## 1. Résumé exécutif

La première vague a fermé cinq constats sur vingt-sept : JUNO-01, JUNO-02, JUNO-03, JUNO-08 et JUNO-11. Les migrations correspondantes ont été vérifiées en base, et les contrôles du dépôt sont verts.

La deuxième vague est présente dans Git, mais sa présence sur une branche ou sur `master` ne prouve pas son activation en production. Trois états doivent toujours être distingués :

1. **code versionné** — le commit est présent dans Git ;
2. **code déployé** — Vercel ou Supabase exécute ce commit ;
3. **comportement vérifié** — une vérification contrôlée démontre le résultat attendu.

La vague 2 ne sera déclarée terminée qu'après validation du dual-key de désabonnement et retrait effectif de `SUPABASE_SERVICE_ROLE_KEY` de l'environnement local de `marketingagent`.

Le commit de renforcement du runbook et de l'outil hors ligne est :

```text
aa92dcb docs(security): prove the legacy unsubscribe key instead of guessing it
```

Il a été poussé sur :

```text
fix/security-wave-2-2026-09-08
```

---

## 2. État connu et état à confirmer

| Élément | État connu | Preuve requise avant clôture |
|---|---|---|
| CI sur `master` | Vert, durée rapportée de 1 min 14 s | URL ou identifiant du run conservé dans le journal de livraison |
| `permissions: contents: read` | Ne casse pas le CI | Workflow exécuté avec succès |
| `validate:repo-hygiene` | Exécuté en intégration | Étape verte dans le run CI |
| Vague 1 en base | Vérifiée | 28/28 posture et 6/6 comportement rapportés |
| Fonctions edge de la vague 1 | **Déployées** — `functions list` : les sept fonctions de l'étape 5 (`get-profile-chart` incluse, v33) partagent l'horodatage **2026-09-07 16:19:37 UTC** | comportement vérifié le **14 septembre 2026** pour `get-profile-chart` (JUNO-01 fermé avec résiduel temporaire documenté) : preuve complète dans [`security-audit-2026-09-07.md`](security-audit-2026-09-07.md), § « Preuve de production — 14 septembre 2026 » ; les six autres restent à vérifier comportementalement au fil des usages |
| Build Android 130 (`2.1.1`) | **Promu à 100 % en production sur Google Play** (constat de l'exploitant, 14 septembre 2026) | adoption à mesurer sur le **quotidien** : Utilisateurs actifs regroupés par **version**, **7 derniers jours disponibles** (délai Play 24–48 h) — une fenêtre de 28 jours compterait des actifs de la 129 d'avant la publication et sous-estimerait l'adoption ; seuil **130 ≥ 95 % pendant 7 jours consécutifs** ; canal iOS natif **sans objet** (aucune app iOS distribuée) — reste le test d'une PWA installée avec ancien service worker (JUNO-16). Détail dans l'audit, § « Preuve de production — 14 septembre 2026 » |
| `20260907000003` | Appliquée et vérifiée | Contrôle 19 vert |
| `20260908000002` | Appliquée | Diagnostic du limiteur et test d'un 429 contrôlé |
| Déploiement Web | Lancé depuis `master` | Commit effectivement servi et tests de fumée réussis |
| Fonctions `send-email` et `unsubscribe` | À confirmer / ne pas présumer déployées | versions déployées + ancien et nouveau liens testés |
| Fonction `marketing-agent` | À confirmer / ne pas présumer déployée | quatre opérations permises et refus négatifs testés |
| `20260908000001` | À confirmer explicitement | vérificateur : posture 13/13, validations 9/9, file lisible |
| Retrait local de `service_role` | Non prouvé | variable absente de `marketingagent/.env`, sans afficher le fichier |

Une case ne doit jamais être cochée sur la seule base d'un commit ou d'un message de déploiement.

---

## 3. Principes de sécurité pendant les opérations

- Utiliser `npx supabase` puisque le CLI est installé au niveau du projet.
- Vérifier le projet lié avant toute commande distante.
- Ne jamais passer un secret directement dans les arguments d'une commande.
- Ne jamais afficher un `.env`, une clé, un fragment de clé ou sa longueur dans un rapport.
- Ne jamais coller une clé dans une conversation, un ticket, un log ou un presse-papiers synchronisé.
- Effectuer les opérations sur un terminal privé, sans partage d'écran.
- Ne pas finaliser de paiement pendant les tests Stripe.
- Ne pas révoquer `service_role` avant que toutes les portes de la phase de rotation soient vertes.
- En cas de résultat ambigu, arrêter la séquence. Ne pas deviner une valeur de compatibilité.
- Consigner les preuves sans données personnelles : heure, environnement, résultat, version déployée et opérateur.

Avant toute opération distante :

```powershell
npx supabase projects list
npx supabase secrets list
```

Contrôler que le project ref attendu est sélectionné. `secrets list` prouve la présence d'un nom, jamais la justesse de sa valeur.

---

## 4. Séquence obligatoire

### Porte 0 — intégrité Git et CI

- [ ] La branche de sécurité est fusionnée dans `master`.
- [ ] Le CI du commit fusionné est vert.
- [ ] Le commit servi peut être identifié.
- [ ] Aucun `.env`, secret ou artefact temporaire n'est contenu dans le commit.
- [ ] Les migrations appliquées à distance existent dans Git.

Conserver :

```text
commit master : ______________________________
run CI        : ______________________________
date/heure    : ______________________________
```

### Porte 1 — déploiement Web terminé

Attendre que Vercel annonce un déploiement réussi pour le commit attendu. Ne pas confondre « build lancé », « build réussi » et « trafic servi ».

- [ ] Déploiement Vercel réussi.
- [ ] Domaine de production attaché à ce déploiement.
- [ ] Aucun rollback automatique observé.
- [ ] La version servie correspond au commit attendu.

### Porte 2 — test de synastrie Web

Tester au minimum deux comptes de test sans utiliser les données d'un utilisateur réel non consentant.

#### Compte autorisé

- [ ] Le compte abonné ouvre une synastrie.
- [ ] La réponse contient `response.synastry`.
- [ ] `SynastryOverview` affiche les résultats issus du serveur.
- [ ] Aucune longitude astrologique brute interdite n'apparaît dans la réponse réseau.
- [ ] Aucun recalcul client historique n'est observé.
- [ ] Les blocages et la visibilité continuent de s'appliquer.

#### Compte gratuit

- [ ] Le paywall est affiché.
- [ ] L'utilisateur ne voit pas une erreur technique brute.
- [ ] Aucun appel permettant de récupérer le thème d'une cible n'aboutit.

#### Risque résiduel JUNO-01

`PUBLISH_LEGACY_DEGREES = true` publie encore certains degrés quantifiés à `0,1°`. Ce mode ne doit être retiré qu'après confirmation que le Web et une proportion suffisante des clients mobiles utilisent `resolveSynastryView`.

Ne pas désactiver le mode legacy uniquement parce que le Web fonctionne : les anciennes versions mobiles doivent être prises en compte.

### Porte 3 — checkout annuel Stripe

Ouvrir Stripe Checkout, mais ne pas finaliser le paiement.

- [ ] Le mode Stripe est identifié : test ou live.
- [ ] Tous les `priceId` utilisés appartiennent à ce même mode.
- [ ] Le bon produit est affiché.
- [ ] La périodicité est annuelle.
- [ ] La devise est correcte.
- [ ] Le montant avant remise est correct.
- [ ] Le montant après remise correspond au coupon annuel attendu.
- [ ] La requête du navigateur ne contient pas `couponId`.
- [ ] Aucun montant ni pourcentage de remise n'est choisi par le client.
- [ ] Le paiement n'est pas finalisé.

Si le checkout s'ouvre au prix plein, vérifier la présence et la valeur opérationnelle de `STRIPE_ANNUAL_COUPON_ID` côté Supabase. Ne pas réintroduire le coupon dans le client pour contourner le problème.

Consigner uniquement :

```text
mode Stripe            : test / live
produit                 : ______________________________
périodicité             : annuelle
devise                  : ______________________________
remise attendue/observée: ______________________________
couponId côté client    : absent / présent
résultat                : succès / échec
```

### Porte 4 — migrations de la vague 2

Confirmer `20260908000001_marketing_agent_narrow_rpcs.sql` avant de déployer `marketing-agent`.

Exécuter le vérificateur selon ses instructions, en tenant compte du fait que l'éditeur SQL peut n'afficher que le dernier résultat d'un script multi-énoncés.

- [ ] Posture : 13/13.
- [ ] Refus et validations : 9/9.
- [ ] File marketing lisible avec les colonnes prévues.
- [ ] `PUBLIC`, `anon` et `authenticated` n'ont pas reçu d'accès aux RPC étroites.
- [ ] Le limiteur requis par `marketing-agent` existe et fonctionne.

Ne pas déployer `marketing-agent` si cette porte n'est pas entièrement verte : la fonction est conçue pour échouer fermée.

---

## 5. JUNO-21 — transition dual-key

### 5.1 Identifier la génération historique

Commencer par vérifier si le nom `UNSUBSCRIBE_TOKEN_SECRET` apparaît :

```powershell
npx supabase secrets list
```

- S'il apparaît, les anciens liens peuvent avoir été signés avec cette valeur.
- S'il n'apparaît pas, ils peuvent avoir été signés avec la dérivation historique de `service_role`.
- Dans les deux cas, une valeur candidate doit être prouvée avec un lien historique. Elle ne doit jamais être devinée.

### 5.2 Vérification hors ligne

Utiliser un terminal privé et l'outil du dépôt. Les valeurs passent par l'environnement, jamais par `argv`.

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing

$env:JUNO_UNSUB_TOKEN = Read-Host "URL ou jeton historique"

# Choisir exactement une candidate :
$env:JUNO_CANDIDATE_SECRET = Read-Host "Secret historique candidat"
# ou
$env:JUNO_CANDIDATE_SERVICE_ROLE = Read-Host "Ancienne service_role candidate"

npm run check:unsubscribe-legacy-key

Remove-Item Env:JUNO_UNSUB_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:JUNO_CANDIDATE_SECRET -ErrorAction SilentlyContinue
Remove-Item Env:JUNO_CANDIDATE_SERVICE_ROLE -ErrorAction SilentlyContinue
```

Interprétation :

| Résultat | Décision |
|---|---|
| correspondance legacy | candidate admissible pour `_PREVIOUS` |
| correspondance v2 | utiliser un courriel plus ancien pour identifier le legacy |
| aucune correspondance | ne rien poser ; rechercher une autre candidate ou un lien historique |
| erreur d'usage ou technique | corriger l'entrée ; ne rien poser |

L'outil ne doit jamais imprimer la candidate, un fragment ou sa longueur.

### 5.3 Provisionner sans basculer

Préparer :

- `UNSUBSCRIBE_TOKEN_SECRET_V2` — nouvelle clé, utilisée pour signer les nouveaux liens ;
- `UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS` — clé vérifiée pour les liens historiques.

L'ancien code ne lit pas ces noms. Leur provisionnement doit donc être sans effet jusqu'au déploiement coordonné.

- [ ] La candidate legacy a été prouvée hors ligne.
- [ ] La clé v2 a été générée avec un générateur cryptographiquement sûr.
- [ ] Les deux noms apparaissent dans `npx supabase secrets list`.
- [ ] Un ancien lien fonctionne encore avant le déploiement.

### 5.4 Déployer les deux fonctions

```powershell
npx supabase functions deploy send-email
npx supabase functions deploy unsubscribe
```

Les deux fonctions forment une seule bascule opérationnelle. Ne pas conclure après le seul succès de la commande de déploiement.

### 5.5 Vérifier les deux générations

- [ ] Un lien provenant d'un ancien courriel fonctionne.
- [ ] Les journaux indiquent `generation=legacy`, sans jeton ni identifiant utilisateur.
- [ ] Un nouveau courriel lifecycle est généré.
- [ ] Son en-tête `List-Unsubscribe` est présent.
- [ ] Son lien fonctionne.
- [ ] Les journaux indiquent `generation=v2`.
- [ ] Un jeton altéré est refusé avec une erreur générique.
- [ ] Le désabonnement répété reste idempotent.

Surveiller les refus anormaux pendant 72 heures. Une hausse des erreurs legacy impose l'arrêt de toute rotation jusqu'à compréhension et correction.

---

## 6. JUNO-04 — retirer `service_role` de `marketingagent`

### 6.1 Préconditions

- [ ] JUNO-21 fonctionne pour legacy et v2.
- [ ] `20260908000001` est confirmée.
- [ ] Le limiteur de l'edge function fonctionne.
- [ ] La fonction `marketing-agent` du commit attendu est prête à être déployée.

### 6.2 Jeton dédié

Le même `MARKETING_AGENT_TOKEN`, généré de manière cryptographiquement sûre, doit être configuré :

1. dans les secrets Supabase de la fonction ;
2. dans `marketingagent/.env` sur le poste autorisé.

Ne pas retirer encore `SUPABASE_SERVICE_ROLE_KEY`. La coexistence temporaire permet la validation et le retour arrière.

### 6.3 Déploiement

```powershell
npx supabase functions deploy marketing-agent
```

### 6.4 Tests positifs

- [ ] `npm run agent -- cloud-list` affiche au plus les lignes prévues.
- [ ] Une publication de test autorisée peut être planifiée.
- [ ] L'image est téléversée dans le chemin choisi par le serveur.
- [ ] L'URL appartient au bucket et au préfixe attendus.
- [ ] `cloud-sync` ou le tableau de bord récupère les statuts.

Éviter une publication publique involontaire : utiliser une entrée de test contrôlée ou s'arrêter avant l'action irréversible si l'environnement ne fournit pas de bac à sable.

### 6.5 Tests négatifs

- [ ] Sans `Authorization` : 401 générique.
- [ ] Avec un faux jeton : même 401 générique.
- [ ] Opération inconnue : 400.
- [ ] Type `text/html` en upload : 415.
- [ ] Table, bucket ou chemin arbitraire : impossible à fournir dans le contrat.
- [ ] Dépassement du rate limit : 429.
- [ ] Indisponibilité du limiteur : refus fermé, pas de continuation.

### 6.6 Retrait local

Après réussite de tous les tests :

1. retirer uniquement la ligne `SUPABASE_SERVICE_ROLE_KEY` de `marketingagent/.env` ;
2. ne pas afficher le fichier ;
3. relancer les quatre opérations permises ;
4. confirmer que le code de `marketingagent` ne lit plus cette variable.

À ce stade, JUNO-04 est fermé pour le poste local même si la rotation globale est reportée.

---

## 7. Décision de rotation de `service_role`

La rotation corrige une exposition passée ou réduit le risque lié à une clé ancienne. Elle ne remplace pas le moindre privilège.

### 7.1 Rotation obligatoire si

- [ ] la clé a déjà été suivie par Git ;
- [ ] elle apparaît dans un artefact, un log ou une archive ;
- [ ] elle a été partagée ;
- [ ] elle a été transmise à un tiers ;
- [ ] le poste ou un compte autorisé a pu être compromis ;
- [ ] son historique d'exposition ne peut pas être établi raisonnablement.

Si aucune condition n'est vraie, la rotation reste une mesure préventive recommandée, mais elle ne doit pas être présentée comme la réponse à une compromission prouvée.

### 7.2 Porte d'entrée obligatoire

Avant toute révocation :

- [ ] ancien lien de désabonnement testé ;
- [ ] nouveau lien v2 testé ;
- [ ] nouveaux courriels signés uniquement en v2 ;
- [ ] quatre opérations de `marketing-agent` testées après retrait local de `service_role` ;
- [ ] opérations hors périmètre refusées ;
- [ ] aucun consommateur local restant ;
- [ ] inventaire des consommateurs distants terminé ;
- [ ] variable Vercel identifiée dans tous les environnements concernés ;
- [ ] plan de récupération relu par un second opérateur.

La rotation elle-même suit exclusivement la phase D de [`runbooks/service-role-least-privilege-2026-09.md`](runbooks/service-role-least-privilege-2026-09.md).

---

## 8. Critères de fermeture

### JUNO-21

- [ ] Nouveaux liens signés avec une clé indépendante.
- [ ] Anciens liens encore vérifiables.
- [ ] Aucun fallback de signature vers `service_role`.
- [ ] Tests legacy/v2 verts.
- [ ] Comportement réel legacy/v2 vérifié.
- [ ] Surveillance initiale sans anomalie significative.

### JUNO-04

- [ ] `marketingagent` utilise seulement son endpoint étroit.
- [ ] Les quatre opérations autorisées fonctionnent.
- [ ] Les opérations interdites sont refusées.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` est absente de `marketingagent/.env`.
- [ ] Les opérations fonctionnent encore après son retrait.
- [ ] L'analyse d'exposition est documentée.
- [ ] La rotation est effectuée si la décision la rend obligatoire.

### JUNO-18

- [ ] `permissions: contents: read` est présent.
- [ ] Le workflow fonctionne avec cette permission.
- [ ] Aucun job ne possède une permission plus large sans justification.
- [ ] `validate:repo-hygiene` s'exécute en CI.

### JUNO-20

- [ ] `apps/mobile/app/appaD.zip` n'est plus suivi.
- [ ] Il n'est référencé par aucun build.
- [ ] Le validateur empêche son retour sous un dossier de routes.
- [ ] L'historique Git n'est pas réécrit en l'absence de secret découvert.

---

## 9. Journal de livraison

Ne consigner aucune donnée personnelle ou valeur de secret.

| Étape | Date/heure | Opérateur | Version | Résultat | Preuve non sensible |
|---|---|---|---|---|---|
| CI master | | | | | |
| Vercel servi | | | | | |
| Synastrie abonné | | | | | |
| Paywall gratuit | | | | | |
| Checkout annuel | | | | | |
| Migration `00001` | | | | | |
| Limiteur `00002` | | | | | |
| Candidate legacy vérifiée | | | | | |
| `send-email` déployée | | | | | |
| `unsubscribe` déployée | | | | | |
| Ancien lien vérifié | | | | | |
| Nouveau lien v2 vérifié | | | | | |
| `marketing-agent` déployée | | | | | |
| Tests positifs agent | | | | | |
| Tests négatifs agent | | | | | |
| `service_role` retirée localement | | | | | |
| Décision de rotation | | | | | |

---

## 10. Incident et arrêt de la séquence

Arrêter immédiatement la vague si :

- un ancien lien devient invalide ;
- les nouveaux courriels ne portent pas un lien v2 fonctionnel ;
- un secret apparaît dans une sortie ou un historique ;
- le projet Supabase lié n'est pas celui attendu ;
- `marketing-agent` accepte une opération inconnue ;
- le limiteur échoue ouvert ;
- le checkout reçoit un coupon ou montant choisi par le client ;
- la synastrie expose de nouveau des longitudes interdites.

En cas d'arrêt : ne pas révoquer de clé, ne pas multiplier les déploiements et conserver les journaux non sensibles. Revenir au dernier état dont le comportement a été prouvé.

---

## 11. Étape suivante — cadrage de JUNO-09

JUNO-09 concerne les objets qui survivent à la suppression d'un compte : photos, introduction vocale et médias de vérification. Il nécessite un chantier séparé parce qu'il touche les trois parcours de suppression, Storage, la base et le rattrapage des objets orphelins.

Avant toute implémentation :

1. inventorier les trois chemins de suppression ;
2. inventorier les buckets et conventions de chemins ;
3. déterminer quels objets appartiennent à l'utilisateur ;
4. définir l'ordre entre purge Storage et suppression Auth ;
5. assurer l'idempotence et la reprise après échec partiel ;
6. journaliser sans conserver les noms de fichiers sensibles ;
7. préparer un outil de détection des orphelins en lecture seule ;
8. séparer la purge des comptes futurs du rattrapage historique ;
9. tester les absences, doublons, timeouts et suppressions partielles ;
10. documenter la durée de conservation légale lorsqu'une conservation est réellement requise.

Ne pas lancer le chantier JUNO-09 avant que la vague 2 ait un état final consigné, afin de ne pas mélanger les preuves et les procédures de retour arrière.
