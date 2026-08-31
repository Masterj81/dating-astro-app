# Google Play — notes de version, versionCode 123

**Build :** 123 · commit `886f199` · profil `production`
**Ce qu'il contient :** Conversation Guide (P0) + intégrité de l'ascendant.

**Contrainte Play :** 500 caractères maximum par langue, rejet au-delà.
Longueurs vérifiées ci-dessous.

**Vocabulaire :** aucun terme banni par `scripts/check-store-metadata.mjs`
(`soulmate`, `perfect match`, `guaranteed`, `prediction`, `dating app`,
`swipe-to-like`, `it's a match`…). Rien ne promet de résultat.

> **Pourquoi mentionner l'ascendant.** 17 comptes voyaient un ascendant que
> l'app ne pouvait pas connaître ; il a disparu de leur profil. Sans un mot ici,
> c'est une régression inexpliquée. Avec, c'est une correction qu'on assume —
> et c'est la position de marque de JUNO : l'astrologie comme langage de
> réflexion, jamais comme certitude inventée. Voir
> `docs/rising-sign-integrity-2026-08.md`.

---

## À coller directement dans Play Console

Format multilingue de Play : un bloc `<code-langue>` par fiche. **Ne garde que
les langues pour lesquelles une fiche Play existe** — une balise pour une
langue non déclarée fait échouer l'enregistrement.

```
<en-US>
NEW — Conversation Guide
Not sure how to say it? Pick a sign and a situation — start a conversation, ask for clarity, repair a misunderstanding, set a boundary — and get a short card with one sentence you can make your own. Starting a conversation is free, for all twelve signs.

ALSO
• Your rising sign now appears only when your birth time is on file. Without it, it cannot be known — so we say so instead of guessing.
</en-US>
<fr-FR>
NOUVEAU — Guide de conversation
Tu ne sais pas comment le dire ? Choisis un signe et une situation — engager la conversation, demander où on en est, réparer un malentendu, poser une limite — et reçois une courte fiche avec une phrase à faire tienne. Engager la conversation est gratuit, pour les douze signes.

AUSSI
• Ton ascendant ne s'affiche que si ton heure de naissance est enregistrée. Sans elle, il est incalculable : on le dit plutôt que de le deviner.
</fr-FR>
<fr-CA>
NOUVEAU — Guide de conversation
Tu ne sais pas comment le dire ? Choisis un signe et une situation — engager la conversation, demander où on en est, réparer un malentendu, poser une limite — et reçois une courte fiche avec une phrase à faire tienne. Engager la conversation est gratuit, pour les douze signes.

AUSSI
• Ton ascendant ne s'affiche que si ton heure de naissance est enregistrée. Sans elle, il est incalculable : on le dit plutôt que de le deviner.
</fr-CA>
<es-ES>
NUEVO — Guía de conversación
¿No sabes cómo decirlo? Elige un signo y una situación — empezar una conversación, pedir claridad, reparar un malentendido, poner un límite — y recibe una tarjeta breve con una frase que puedes hacer tuya. Empezar una conversación es gratis, para los doce signos.

ADEMÁS
• Tu ascendente solo aparece si tu hora de nacimiento está registrada. Sin ella no se puede saber: lo decimos en vez de adivinarlo.
</es-ES>
<es-419>
NUEVO — Guía de conversación
¿No sabes cómo decirlo? Elige un signo y una situación — empezar una conversación, pedir claridad, reparar un malentendido, poner un límite — y recibe una tarjeta breve con una frase que puedes hacer tuya. Empezar una conversación es gratis, para los doce signos.

ADEMÁS
• Tu ascendente solo aparece si tu hora de nacimiento está registrada. Sin ella no se puede saber: lo decimos en vez de adivinarlo.
</es-419>
<pt-PT>
NOVO — Guia de conversa
Não sabes como dizer? Escolhe um signo e uma situação — começar uma conversa, pedir clareza, reparar um mal-entendido, definir um limite — e recebe um cartão curto com uma frase para fazeres tua. Começar uma conversa é gratuito, para os doze signos.

TAMBÉM
• O teu ascendente só aparece se a tua hora de nascimento estiver registada. Sem ela não há como saber: dizemo-lo em vez de adivinhar.
</pt-PT>
<pt-BR>
NOVO — Guia de conversa
Não sabe como dizer? Escolha um signo e uma situação — começar uma conversa, pedir clareza, reparar um mal-entendido, definir um limite — e receba um cartão curto com uma frase para fazer sua. Começar uma conversa é gratuito, para os doze signos.

TAMBÉM
• O seu ascendente só aparece se a sua hora de nascimento estiver registrada. Sem ela não há como saber: dizemos isso em vez de adivinhar.
</pt-BR>
<de-DE>
NEU — Gesprächsleitfaden
Du weißt nicht, wie du es sagen sollst? Wähle ein Sternzeichen und eine Situation — ein Gespräch beginnen, um Klarheit bitten, ein Missverständnis klären, eine Grenze setzen — und du bekommst eine kurze Karte mit einem Satz, den du zu deinem machen kannst. Ein Gespräch beginnen ist kostenlos, für alle zwölf Zeichen.

AUSSERDEM
• Dein Aszendent erscheint nur mit hinterlegter Geburtszeit. Ohne sie ist er nicht bestimmbar — wir sagen das, statt zu raten.
</de-DE>
<ja-JP>
新機能 — 会話ガイド
何て言えばいいか迷っていますか。星座と場面を選ぶだけ — 会話を始める、気持ちを確かめる、行き違いを修復する、境界線を伝える — 短いカードと、あなたの言葉に変えられる一文が届きます。「会話を始める」は12星座すべて無料です。

その他
・アセンダントは出生時刻が登録されている場合にのみ表示されます。ない場合は分からないため、推測せずにその旨をお伝えします。
</ja-JP>
<ar>
جديد — دليل المحادثة
لا تعرف كيف تقولها؟ اختر برجًا وموقفًا — ابدأ محادثة، اطلب التوضيح، أصلح سوء تفاهم، ضع حدًا — واحصل على بطاقة قصيرة وجملة تجعلها لك. بدء المحادثة مجاني لكل الأبراج الاثني عشر.

أيضًا
• لا يظهر برجك الطالع إلا إذا كان وقت ميلادك مسجلًا. بدونه لا يمكن معرفته، لذا نقول ذلك بدل تخمينه.
</ar>
<zh-CN>
全新 — 对话指南
不知道该怎么说？选择一个星座和一个情境 — 开启一段对话、确认彼此的想法、化解一次误会、表达一个界限 — 就能得到一张简短的卡片，和一句可以改成你自己的话。「开启一段对话」对十二星座全部免费。

其他
• 只有在已填写出生时间时才会显示上升星座。没有出生时间就无从得知，我们会如实说明，而不是猜测。
</zh-CN>
```

---

## Les mêmes textes, langue par langue

## en-US (défaut)

```
NEW — Conversation Guide
Not sure how to say it? Pick a sign and a situation — start a conversation, ask for clarity, repair a misunderstanding, set a boundary — and get a short card with one sentence you can make your own. Starting a conversation is free, for all twelve signs.

ALSO
• Your rising sign now appears only when your birth time is on file. Without it, it cannot be known — so we say so instead of guessing.
```

## fr-FR / fr-CA

```
NOUVEAU — Guide de conversation
Tu ne sais pas comment le dire ? Choisis un signe et une situation — engager la conversation, demander où on en est, réparer un malentendu, poser une limite — et reçois une courte fiche avec une phrase à faire tienne. Engager la conversation est gratuit, pour les douze signes.

AUSSI
• Ton ascendant ne s'affiche que si ton heure de naissance est enregistrée. Sans elle, il est incalculable : on le dit plutôt que de le deviner.
```

## es-ES / es-419

```
NUEVO — Guía de conversación
¿No sabes cómo decirlo? Elige un signo y una situación — empezar una conversación, pedir claridad, reparar un malentendido, poner un límite — y recibe una tarjeta breve con una frase que puedes hacer tuya. Empezar una conversación es gratis, para los doce signos.

ADEMÁS
• Tu ascendente solo aparece si tu hora de nacimiento está registrada. Sin ella no se puede saber: lo decimos en vez de adivinarlo.
```

## pt-PT / pt-BR

```
NOVO — Guia de conversa
Não sabes como dizer? Escolhe um signo e uma situação — começar uma conversa, pedir clareza, reparar um mal-entendido, definir um limite — e recebe um cartão curto com uma frase para fazeres tua. Começar uma conversa é gratuito, para os doze signos.

TAMBÉM
• O teu ascendente só aparece se a tua hora de nascimento estiver registada. Sem ela não há como saber: dizemo-lo em vez de adivinhar.
```

## de-DE

```
NEU — Gesprächsleitfaden
Du weißt nicht, wie du es sagen sollst? Wähle ein Sternzeichen und eine Situation — ein Gespräch beginnen, um Klarheit bitten, ein Missverständnis klären, eine Grenze setzen — und du bekommst eine kurze Karte mit einem Satz, den du zu deinem machen kannst. Ein Gespräch beginnen ist kostenlos, für alle zwölf Zeichen.

AUSSERDEM
• Dein Aszendent erscheint nur mit hinterlegter Geburtszeit. Ohne sie ist er nicht bestimmbar — wir sagen das, statt zu raten.
```

## ja-JP

```
新機能 — 会話ガイド
何て言えばいいか迷っていますか。星座と場面を選ぶだけ — 会話を始める、気持ちを確かめる、行き違いを修復する、境界線を伝える — 短いカードと、あなたの言葉に変えられる一文が届きます。「会話を始める」は12星座すべて無料です。

その他
・アセンダントは出生時刻が登録されている場合にのみ表示されます。ない場合は分からないため、推測せずにその旨をお伝えします。
```

## ar

```
جديد — دليل المحادثة
لا تعرف كيف تقولها؟ اختر برجًا وموقفًا — ابدأ محادثة، اطلب التوضيح، أصلح سوء تفاهم، ضع حدًا — واحصل على بطاقة قصيرة وجملة تجعلها لك. بدء المحادثة مجاني لكل الأبراج الاثني عشر.

أيضًا
• لا يظهر برجك الطالع إلا إذا كان وقت ميلادك مسجلًا. بدونه لا يمكن معرفته، لذا نقول ذلك بدل تخمينه.
```

## zh-CN

```
全新 — 对话指南
不知道该怎么说？选择一个星座和一个情境 — 开启一段对话、确认彼此的想法、化解一次误会、表达一个界限 — 就能得到一张简短的卡片，和一句可以改成你自己的话。「开启一段对话」对十二星座全部免费。

其他
• 只有在已填写出生时间时才会显示上升星座。没有出生时间就无从得知，我们会如实说明，而不是猜测。
```

---

## Après publication

1. Vérifier sur un compte **sans** heure de naissance : la ligne Ascendant doit
   être **absente**, remplacée par « Ajouter l'heure de naissance ».
2. Vérifier sur un compte **avec** heure : l'ascendant réel s'affiche, sur le
   profil comme sur Discover.
3. Ne pas promouvoir 121 (repli Bélier) ni 122 (masque les ascendants réels).
