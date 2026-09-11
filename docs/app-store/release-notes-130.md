# Google Play — notes de version, versionCode 130

**Build :** 130 · version `2.1.1` · commit `50e8e6d` · profil `production`
**EAS :** `643003cd-1b16-4caa-b136-bbf45d9a1025`
**Ce qu'il contient :** écran « Courriel et mot de passe » dans les réglages ;
quatre situations de plus dans le Guide de conversation ; lecture de
synastrie prise sur le serveur (JUNO-01) avec le calcul local en repli.

**Contrainte Play :** 500 caractères maximum par langue, rejet au-delà.
Longueurs vérifiées ci-dessous (la plus longue, fr-FR, fait 474 caractères).

**Vocabulaire :** aucun terme banni par `scripts/check-store-metadata.mjs`
(`soulmate`, `perfect match`, `guaranteed`, `prediction`, `dating app`,
`swipe-to-like`, `it's a match`…). Rien ne promet de résultat.

> **Pourquoi la synastrie n'est pas dans les notes.** Le passage au calcul
> serveur (`resolveSynastryView`) est réel dans l'app, mais ce qu'il change
> pour le lecteur dépend du déploiement de `get-profile-chart` : tant que la
> fonction publiée renvoie encore les longitudes, l'app calcule localement
> comme avant et rien n'est visible. Une note qui annonce une protection non
> déployée serait une promesse. Ajouter la ligne au prochain build, quand le
> déploiement de la vague 1 sera constaté (`docs/security-audit-2026-09-07.md`,
> « Étapes manuelles avant déploiement »).

> **Pourquoi mentionner le changement d'adresse.** Jusqu'ici, changer son
> courriel exigeait d'écrire au support. C'est le premier build où le lecteur
> le fait seul, et la nouvelle adresse ne devient active qu'après la
> confirmation envoyée par Supabase Auth (`double_confirm_changes`) — c'est
> pourquoi la note dit « après confirmation » et pas « immédiatement ».

---

## À coller directement dans Play Console

Format multilingue de Play : un bloc `<code-langue>` par fiche. **Ne garde que
les langues pour lesquelles une fiche Play existe** — une balise pour une
langue non déclarée fait échouer l'enregistrement.

```
<en-US>
NEW — Email & password
Change your email address or your password from Settings → Email & password. A new address becomes active after you confirm it from your inbox.

CONVERSATION GUIDE
Four more situations: share feelings, make a plan, flirt gently, slow the pace. Starting a conversation stays free for all twelve signs.

ALSO
• Support now answers from support@junosynastry.com.
</en-US>
<fr-FR>
NOUVEAU — Courriel et mot de passe
Change ton adresse courriel ou ton mot de passe depuis Paramètres → Courriel et mot de passe. Une nouvelle adresse devient active après confirmation depuis ta boîte de réception.

GUIDE DE CONVERSATION
Quatre situations de plus : partager un ressenti, proposer un plan, flirter doucement, ralentir le rythme. Engager la conversation reste gratuit pour les douze signes.

AUSSI
• Le support répond désormais depuis support@junosynastry.com.
</fr-FR>
<fr-CA>
NOUVEAU — Courriel et mot de passe
Change ton adresse courriel ou ton mot de passe depuis Paramètres → Courriel et mot de passe. Une nouvelle adresse devient active après confirmation depuis ta boîte de réception.

GUIDE DE CONVERSATION
Quatre situations de plus : partager un ressenti, proposer un plan, flirter doucement, ralentir le rythme. Engager la conversation reste gratuit pour les douze signes.

AUSSI
• Le support répond désormais depuis support@junosynastry.com.
</fr-CA>
<es-ES>
NUEVO — Correo y contraseña
Cambia tu dirección de correo o tu contraseña desde Configuración → Correo y contraseña. La nueva dirección se activa cuando la confirmas desde tu bandeja de entrada.

GUÍA DE CONVERSACIÓN
Cuatro situaciones más: compartir lo que sientes, hacer un plan, coquetear con suavidad, bajar el ritmo. Empezar una conversación sigue siendo gratis para los doce signos.

ADEMÁS
• El soporte ahora responde desde support@junosynastry.com.
</es-ES>
<es-419>
NUEVO — Correo y contraseña
Cambia tu dirección de correo o tu contraseña desde Configuración → Correo y contraseña. La nueva dirección se activa cuando la confirmas desde tu bandeja de entrada.

GUÍA DE CONVERSACIÓN
Cuatro situaciones más: compartir lo que sientes, hacer un plan, coquetear con suavidad, bajar el ritmo. Empezar una conversación sigue siendo gratis para los doce signos.

ADEMÁS
• El soporte ahora responde desde support@junosynastry.com.
</es-419>
<pt-PT>
NOVO — E-mail e senha
Altera o teu endereço de e-mail ou a tua senha em Configurações → E-mail e senha. O novo endereço fica ativo depois de o confirmares a partir da tua caixa de entrada.

GUIA DE CONVERSA
Mais quatro situações: partilhar sentimentos, fazer um plano, flertar com leveza, diminuir o ritmo. Começar uma conversa continua gratuito para os doze signos.

TAMBÉM
• O suporte responde agora a partir de support@junosynastry.com.
</pt-PT>
<pt-BR>
NOVO — E-mail e senha
Altere seu endereço de e-mail ou sua senha em Configurações → E-mail e senha. O novo endereço fica ativo depois que você o confirma na sua caixa de entrada.

GUIA DE CONVERSA
Mais quatro situações: compartilhar sentimentos, fazer um plano, flertar com leveza, diminuir o ritmo. Começar uma conversa continua gratuito para os doze signos.

TAMBÉM
• O suporte agora responde de support@junosynastry.com.
</pt-BR>
<de-DE>
NEU — E-Mail & Passwort
Ändere deine E-Mail-Adresse oder dein Passwort unter Einstellungen → E-Mail & Passwort. Eine neue Adresse wird aktiv, sobald du sie aus deinem Posteingang bestätigst.

GESPRÄCHSLEITFADEN
Vier weitere Situationen: Gefühle teilen, einen Plan machen, sanft flirten, das Tempo verlangsamen. Ein Gespräch zu beginnen bleibt für alle zwölf Zeichen kostenlos.

AUSSERDEM
• Der Support antwortet jetzt von support@junosynastry.com.
</de-DE>
<ja-JP>
新機能 — メールとパスワード
設定 → メールとパスワード から、メールアドレスやパスワードを変更できます。新しいアドレスは、受信トレイから確認すると有効になります。

会話ガイド
場面が4つ増えました：気持ちを伝える、予定を立てる、やさしく好意を示す、ペースを落とす。「会話を始める」は引き続き12星座すべて無料です。

その他
・サポートからの返信は support@junosynastry.com になりました。
</ja-JP>
<ar>
جديد — البريد وكلمة المرور
غيّر عنوان بريدك أو كلمة مرورك من الإعدادات ← البريد وكلمة المرور. يصبح العنوان الجديد فعالًا بعد تأكيده من صندوق الوارد.

دليل المحادثة
أربعة مواقف إضافية: شارك شعورك، ضع خطة، غازل بلطف، أبطئ الوتيرة. بدء المحادثة يبقى مجانيًا لكل الأبراج الاثني عشر.

أيضًا
• يرد الدعم الآن من support@junosynastry.com.
</ar>
<zh-CN>
全新 — 邮箱与密码
在 设置 → 邮箱与密码 中更改你的邮箱地址或密码。新地址在你从收件箱确认后生效。

对话指南
新增四个情境：表达感受、制定计划、温柔调情、放慢节奏。「开启一段对话」对十二星座依然免费。

其他
• 客服现在通过 support@junosynastry.com 回复。
</zh-CN>
```

---

## Les mêmes textes, langue par langue

## en-US (défaut) — 382 caractères

```
NEW — Email & password
Change your email address or your password from Settings → Email & password. A new address becomes active after you confirm it from your inbox.

CONVERSATION GUIDE
Four more situations: share feelings, make a plan, flirt gently, slow the pace. Starting a conversation stays free for all twelve signs.

ALSO
• Support now answers from support@junosynastry.com.
```

## fr-FR / fr-CA — 474 caractères

```
NOUVEAU — Courriel et mot de passe
Change ton adresse courriel ou ton mot de passe depuis Paramètres → Courriel et mot de passe. Une nouvelle adresse devient active après confirmation depuis ta boîte de réception.

GUIDE DE CONVERSATION
Quatre situations de plus : partager un ressenti, proposer un plan, flirter doucement, ralentir le rythme. Engager la conversation reste gratuit pour les douze signes.

AUSSI
• Le support répond désormais depuis support@junosynastry.com.
```

## es-ES / es-419 — 456 caractères

```
NUEVO — Correo y contraseña
Cambia tu dirección de correo o tu contraseña desde Configuración → Correo y contraseña. La nueva dirección se activa cuando la confirmas desde tu bandeja de entrada.

GUÍA DE CONVERSACIÓN
Cuatro situaciones más: compartir lo que sientes, hacer un plan, coquetear con suavidad, bajar el ritmo. Empezar una conversación sigue siendo gratis para los doce signos.

ADEMÁS
• El soporte ahora responde desde support@junosynastry.com.
```

## pt-PT — 439 caractères · pt-BR — 423 caractères

```
NOVO — E-mail e senha
Altera o teu endereço de e-mail ou a tua senha em Configurações → E-mail e senha. O novo endereço fica ativo depois de o confirmares a partir da tua caixa de entrada.

GUIA DE CONVERSA
Mais quatro situações: partilhar sentimentos, fazer um plano, flertar com leveza, diminuir o ritmo. Começar uma conversa continua gratuito para os doze signos.

TAMBÉM
• O suporte responde agora a partir de support@junosynastry.com.
```

## de-DE — 447 caractères

```
NEU — E-Mail & Passwort
Ändere deine E-Mail-Adresse oder dein Passwort unter Einstellungen → E-Mail & Passwort. Eine neue Adresse wird aktiv, sobald du sie aus deinem Posteingang bestätigst.

GESPRÄCHSLEITFADEN
Vier weitere Situationen: Gefühle teilen, einen Plan machen, sanft flirten, das Tempo verlangsamen. Ein Gespräch zu beginnen bleibt für alle zwölf Zeichen kostenlos.

AUSSERDEM
• Der Support antwortet jetzt von support@junosynastry.com.
```

## ja-JP — 211 caractères

```
新機能 — メールとパスワード
設定 → メールとパスワード から、メールアドレスやパスワードを変更できます。新しいアドレスは、受信トレイから確認すると有効になります。

会話ガイド
場面が4つ増えました：気持ちを伝える、予定を立てる、やさしく好意を示す、ペースを落とす。「会話を始める」は引き続き12星座すべて無料です。

その他
・サポートからの返信は support@junosynastry.com になりました。
```

## ar — 331 caractères

```
جديد — البريد وكلمة المرور
غيّر عنوان بريدك أو كلمة مرورك من الإعدادات ← البريد وكلمة المرور. يصبح العنوان الجديد فعالًا بعد تأكيده من صندوق الوارد.

دليل المحادثة
أربعة مواقف إضافية: شارك شعورك، ضع خطة، غازل بلطف، أبطئ الوتيرة. بدء المحادثة يبقى مجانيًا لكل الأبراج الاثني عشر.

أيضًا
• يرد الدعم الآن من support@junosynastry.com.
```

## zh-CN — 146 caractères

```
全新 — 邮箱与密码
在 设置 → 邮箱与密码 中更改你的邮箱地址或密码。新地址在你从收件箱确认后生效。

对话指南
新增四个情境：表达感受、制定计划、温柔调情、放慢节奏。「开启一段对话」对十二星座依然免费。

其他
• 客服现在通过 support@junosynastry.com 回复。
```

---

## Avant publication

1. **La boîte `support@junosynastry.com` reçoit.** La note l'annonce dans les
   onze fiches ; le bouton « Contacter le support » des réglages y mène. La
   bascule des boîtes fonctionnelles (formulaire de contact, signalements) est
   un changement séparé côté web et edge — la note ne doit être publiée qu'une
   fois ce changement déployé, sinon le lecteur écrit à une adresse que
   personne ne lit.
2. Ne pas promouvoir 128 ni 129 par-dessus 130 : la synastrie y lit les
   longitudes que `get-profile-chart` cessera de publier (JUNO-01).

## Après publication

1. Paramètres → Courriel et mot de passe → entrer une **adresse identique** :
   l'app refuse (« Entrez une adresse courriel différente »), rien n'est
   envoyé.
2. Entrer une **adresse valide** : l'écran annonce « Confirmez votre nouvelle
   adresse » et le courriel `email_change` (gabarit doré) arrive dans **les
   deux** boîtes, l'ancienne et la nouvelle (`double_confirm_changes`).
3. Changer le **mot de passe** avec une valeur faible : refus avec l'indice de
   robustesse ; avec une valeur forte : « Mot de passe mis à jour ».
4. Guide de conversation : les huit situations sont listées, la première seule
   ouverte pour un compte gratuit.
