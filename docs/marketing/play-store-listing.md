> **⚠️ SUPERSEDED — historical reference only.** The current paste-ready
> store listing (App Store + Play Store: title, subtitle, short / full
> description, keywords, category) lives in
> [`docs/app-store/juno-metadata.md`](../app-store/juno-metadata.md), and
> the App Review pack in
> [`docs/app-store/juno-app-review-notes.md`](../app-store/juno-app-review-notes.md).
> Everything below predates the JUNO synastry-led repositioning: it still
> uses swipe / dating-clone framing ("Talk, Don't Swipe", "no swipe
> paywall", "dating with depth") that must **not** ship to any store.
> Do not copy from this file — defer entirely to `juno-metadata.md`.
> Kept only as a record of the earlier conversation-first draft.

# JUNO — Play Store Listing (historical draft)

Realigns the live listing with the post-MVP direction: **conversation-first, anti-paywall-to-talk, profile depth (intent + values + lifestyle + prompts + voice + icebreakers)** with astrology as backbone. Replaces the older synastry-only framing.

**How to use**: copy each labeled block into Google Play Console → Main store listing. Char counts noted; Play Console enforces them.

---

## What's broken in the current listing

The live listing (snapshot below) has at least two factual drifts that need to be fixed regardless of any rewrite:

1. **"5 super likes per day" / "Unlimited super likes"** — super-likes were removed entirely (commit `a811b60`, *"remove super-likes feature entirely (dead-on-arrival cleanup)"*). The listing currently advertises a feature that doesn't exist. **Risk**: refund disputes / Play Store policy violation for misleading claims.
2. **"Less random swiping, more meaningful connections"** — the discover screen no longer has a swipe-to-like model at all. It's a navigational deck (prev/next/view profile/message). The framing is stale.
3. **Zero mention of the MVP profile features** — relationship intent, personal values, lifestyle tags (food/sport/music), prompts, voice intros, icebreaker question. These are the actual differentiators now and are invisible in the listing.

---

## CURRENT LISTING (live, for reference)

### Short description (current)

```
Discover a synastry connection through real birth-chart compatibility
```
*56 / 80 chars. Astrology-only framing.*

### Full description (current — abridged)

> Find love written in the stars. JUNO is the only dating app that uses real astrology — not just sun signs — to match you with truly compatible people.
>
> ⭐ TRY FREE FOR 7 DAYS — Full access, cancel anytime.
>
> 🪐 REAL BIRTH CHART ANALYSIS / 💫 SYNASTRY COMPATIBILITY / 🔮 DAILY PERSONALIZED HOROSCOPE / 🃏 TAROT READINGS / ❤️ SMARTER MATCHING
>
> Premium tiers: Celestial (5 super likes/day) / Cosmic (unlimited super likes)
>
> Available in 8 languages.

Issues highlighted above.

---

## PROPOSED REPLACEMENT

### App name (max 30 chars)

```
JUNO: Talk, Don't Swipe
```
*30 / 30 chars exactly.*

Alternates if you want to keep "Astrology" higher in the title for ASO:
- `JUNO — Real Connection` (29)
- `JUNO: Astro + Real Talk` (30)

If you want to keep the **current name** (`JUNO`) untouched and only rewrite the descriptions, that's fine — the rewrite below works either way.

### Short description (max 80 chars) — proposed

```
Astrology, values, voice intros. Send the first message free — no paywall.
```
*74 / 80 chars.*

Alternates:
- `Real connection, not just swipes. Astrology + values + voice intros.` (68)
- `Match on astrology + values. First message free — no swipe paywall.` (66)

### Full description (max 4000 chars) — proposed

```
Tired of swipe culture? Tired of paying just to send the first message?

JUNO is dating with depth. Match on what actually matters — your values, your lifestyle, what you're open to (love, friendship, business) — with astrology as the backbone, not a gimmick. Then start a real conversation. The first message is always free.

━━━━━━━━━━━━━━━━━━━━
✨ WHAT MAKES IT DIFFERENT
━━━━━━━━━━━━━━━━━━━━

🗣️ TALK FIRST, NO PAYWALL
Send the first message to anyone you match with. No subscription, no "unlock to chat" trap. Real connection shouldn't cost $19.99/month.

💬 BUILT FOR CONVERSATION, NOT SWIPING
Every profile has prompt answers you actually want to read, an icebreaker question to start the chat, and a voice intro so you hear the person before you decide. You're meeting humans, not photos.

🌙 ASTROLOGY THAT GOES DEEPER THAN YOUR SUN SIGN
We compute full synastry — Sun, Moon, Rising and the major aspects — so you see how your inner self lines up with theirs, not just whether you're both Leos.

❤️ MATCH ON VALUES & LIFESTYLE
Pick from 12 personal values (family, growth, adventure, authenticity, kindness…) and 36 lifestyle tags across food, sport, and music. See what you have in common at a glance.

🎯 TELL PEOPLE WHAT YOU'RE OPEN TO
Choose what you're open to: Love, Friendship, Business. Pick one, two, or all three — others see only what you've turned on. No more wasted time on mismatched intentions.

━━━━━━━━━━━━━━━━━━━━
🔮 HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━

1. Sign up with your birth date, time, and city → we compute your full birth chart.
2. Build a profile that's actually you: photos, prompts, voice intro, icebreaker, values, lifestyle tags, intent.
3. Discover real profiles — read them, listen to them, view their full profile, message them.
4. Start the conversation. The first message is always free.

━━━━━━━━━━━━━━━━━━━━
🪐 ASTROLOGY DONE RIGHT
━━━━━━━━━━━━━━━━━━━━

Most dating apps slap a sun sign sticker on a profile and call it astrology. We compute proper synastry between two natal charts — your Sun, Moon, Rising and the major aspects between you. You see compatibility across personality, emotional style, and how you both show up to the world.

If astrology isn't your thing, the app still works for you — values, lifestyle, intent, prompts, voice intros and conversation are front and center. The astrology is depth, not gatekeeping.

━━━━━━━━━━━━━━━━━━━━
🃏 TAROT, HOROSCOPE & TRANSITS (PREMIUM)
━━━━━━━━━━━━━━━━━━━━

For users who want the full cosmic toolkit:
• Daily horoscope calculated from your actual chart, not a generic sun-sign blurb
• Weekly or monthly tarot spreads (love & general)
• Planetary transit alerts and retrograde warnings

━━━━━━━━━━━━━━━━━━━━
🛡️ SAFETY & PRIVACY
━━━━━━━━━━━━━━━━━━━━

• Profile verification (photo + selfie) so you know who you're talking to
• Block and report from any profile or chat
• Your birth time is only used to compute your chart — never shared on your profile
• You control what's visible — values, lifestyle, prompts, voice intro, icebreaker: all opt-in
• GDPR-compliant. Delete your account, your data is gone.

━━━━━━━━━━━━━━━━━━━━
💎 PREMIUM (OPTIONAL)
━━━━━━━━━━━━━━━━━━━━

The basics — discovering profiles and sending the first message — are always free. Premium unlocks:
• Detailed synastry breakdowns (aspect-by-aspect)
• Advanced filters (intent, values, lifestyle)
• See who liked you
• Daily personalized horoscope & tarot readings
• Transit alerts & lucky days

You'll never be locked out of starting a conversation.

━━━━━━━━━━━━━━━━━━━━
🌍 AVAILABLE IN 8 LANGUAGES
━━━━━━━━━━━━━━━━━━━━

English, French, Spanish, Portuguese, German, Japanese, Chinese, Arabic.

🤝 INVITE FRIENDS — Share your referral code, you both get 1 month of premium free.

Done with swipe culture? Looking for someone who shares your values? Curious about astrology? Or you just want to actually talk to people? JUNO is built for you.

Download free. Start a real conversation.
```
*~3,720 / 4,000 chars — fits with headroom.*

---

## FR (fr-CA, fr-FR)

### Nom de l'app (max 30 caractères)

```
JUNO : parle, swipe pas
```

### Description courte (max 80 caractères)

```
Astro + valeurs + intro vocale. Premier message gratuit, sans paywall.
```
*70 / 80 caractères.*

### Description longue (max 4000 caractères)

```
Marre du swipe ? Marre de payer juste pour envoyer le premier message ?

JUNO, c'est rencontrer en profondeur. On te match sur ce qui compte vraiment — tes valeurs, ton mode de vie, ton intention — avec l'astrologie comme socle, pas comme gimmick. Et après, tu démarres une vraie conversation. Le premier message est toujours gratuit.

━━━━━━━━━━━━━━━━━━━━
✨ CE QUI CHANGE
━━━━━━━━━━━━━━━━━━━━

🗣️ ON PARLE D'ABORD, PAS DE PAYWALL
Envoie le premier message à n'importe quel match. Pas d'abonnement, pas de "débloque pour chatter". La vraie connexion ne devrait pas coûter 19,99 $/mois.

💬 PENSÉ POUR LA CONVERSATION, PAS LE SWIPE
Chaque profil a des prompts auxquels tu as envie de répondre, une question icebreaker pour lancer la discussion, et une intro vocale pour entendre la personne avant de décider. Tu rencontres des humains, pas des photos.

🌙 DE L'ASTRO QUI VA PLUS LOIN QUE TON SIGNE SOLAIRE
On calcule la synastrie complète — Soleil, Lune, Ascendant — pour voir comment ton monde intérieur s'aligne avec le sien, pas juste si vous êtes tous les deux Lion.

❤️ MATCH SUR TES VALEURS ET TON LIFESTYLE
Choisis parmi 12 valeurs personnelles (famille, croissance, aventure, authenticité, gentillesse…) et 36 tags lifestyle (cuisine, sport, musique). Vois d'un coup d'œil ce que vous avez en commun.

🎯 DIS CE À QUOI TU ES OUVERT·E
Choisis ce à quoi tu es ouvert·e : Amour, Amitié, Business. Une, deux ou les trois — les autres ne voient que ce que tu as activé. Plus de temps perdu sur des intentions qui ne collent pas.

━━━━━━━━━━━━━━━━━━━━
🔮 COMMENT ÇA MARCHE
━━━━━━━━━━━━━━━━━━━━

1. Inscris-toi avec ta date, heure et ville de naissance → on calcule ton thème natal complet.
2. Construis un profil qui te ressemble : photos, prompts, intro vocale, icebreaker, valeurs, tags lifestyle, intention.
3. Découvre de vrais profils — lis-les, écoute-les, consulte le profil complet, écris-leur.
4. Démarre la conversation. Le premier message est toujours gratuit.

━━━━━━━━━━━━━━━━━━━━
🪐 L'ASTRO BIEN FAITE
━━━━━━━━━━━━━━━━━━━━

La plupart des apps collent un autocollant signe solaire sur un profil et appellent ça de l'astro. Nous, on calcule une vraie synastrie entre deux thèmes natals — ton Soleil, ta Lune, ton Ascendant et les aspects majeurs entre vous. Tu vois la compatibilité à travers la personnalité, l'émotionnel, et la façon dont vous vous présentez au monde.

Si l'astro ne t'intéresse pas, l'app fonctionne quand même pour toi — les valeurs, le lifestyle, l'intention, les prompts, l'intro vocale et la conversation sont au premier plan.

━━━━━━━━━━━━━━━━━━━━
🃏 TAROT, HOROSCOPE & TRANSITS (PREMIUM)
━━━━━━━━━━━━━━━━━━━━

• Horoscope quotidien calculé depuis ton vrai thème, pas une phrase générique
• Tirages tarot hebdomadaires ou mensuels (amour & général)
• Alertes de transits planétaires et avertissements de rétrogrades

━━━━━━━━━━━━━━━━━━━━
🛡️ SÉCURITÉ & VIE PRIVÉE
━━━━━━━━━━━━━━━━━━━━

• Vérification de profil (photo + selfie)
• Bloque et signale depuis n'importe quel profil ou chat
• Ton heure de naissance ne sert qu'à calculer ton thème — jamais affichée
• Tu contrôles ce qui est visible — valeurs, lifestyle, prompts, intro vocale : tout est optionnel
• Conforme RGPD. Supprime ton compte, tes données sont effacées.

━━━━━━━━━━━━━━━━━━━━
💎 PREMIUM (OPTIONNEL)
━━━━━━━━━━━━━━━━━━━━

L'essentiel — découvrir des profils et envoyer le premier message — reste toujours gratuit. Premium ajoute :
• Synastries détaillées (aspect par aspect)
• Filtres avancés (intention, valeurs, lifestyle)
• Voir qui t'a liké
• Horoscope quotidien personnalisé & lectures de tarot
• Alertes de transits & jours chanceux

Tu ne seras jamais bloqué·e pour démarrer une conversation.

━━━━━━━━━━━━━━━━━━━━

Disponible en 8 langues : anglais, français, espagnol, portugais, allemand, japonais, chinois, arabe.

🤝 INVITE TES AMIS — Partage ton code, vous gagnez tous les deux 1 mois de premium gratuit.

Fini le swipe ? Tu cherches quelqu'un qui partage tes valeurs ? L'astro t'intrigue ? Tu veux juste vraiment parler à des gens ? JUNO est fait pour toi.

Télécharge gratuitement. Démarre une vraie conversation.
```

---

## Diff table — what changed and why

| Section | Old | New | Why |
|---|---|---|---|
| Headline promise | "Find love written in the stars" | "Talk first, no paywall" | New direction is anti-paywall-to-talk; astro is depth, not headline |
| Trial line | "TRY FREE FOR 7 DAYS — Full access" | (removed from top, premium kept as optional at bottom) | Free tier is now the actual promise — putting "TRY FREE 7 DAYS" first reads like a Tinder paywall pattern, undermines positioning |
| Discover framing | "Less random swiping, more meaningful" | "Built for conversation, not swiping" | Discover deck no longer has a swipe-to-like model |
| Features listed | Birth chart / Synastry / Horoscope / Tarot / Smarter matching | + Prompts / Voice intros / Icebreaker / Values / Lifestyle / Intent | Surfaces the entire MVP profile build |
| Super likes | "5/day Celestial" / "Unlimited Cosmic" | **REMOVED** | Feature was deleted (`a811b60`) — listing was lying |
| Premium tiers | Celestial / Cosmic split with super-likes mention | Single "Premium (optional)" block, no super-likes | Tier structure may still exist in-app; we just don't lean on it as the listing's pitch |
| Languages line | "8 languages" | "8 languages" (kept) | Still true (en/fr canonical + es/pt/de/ja/zh/ar via V1+V2 i18n) |
| Closing CTA | "Download JUNO — your birth chart knows your type" | "Download free. Start a real conversation." | Conversation-first close beats astro-first close given the new framing |

---

## TODO before publishing the rewrite

- [ ] **CRITICAL — fix super-likes claim regardless of full rewrite**: even if you don't ship the rewrite, edit the live description today to remove "5 super likes" and "Unlimited super likes" lines. Misleading store claims are a Play Store policy issue.
- [ ] Replace 4-6 screenshots with: profile detail (MVP sections visible), discover card full-bleed, prompts picker, voice intro player, conversation thread (showing free first message), values/lifestyle picker
- [ ] Update the feature graphic ([apps/mobile/assets/images/google-play-feature-graphic.svg](apps/mobile/assets/images/google-play-feature-graphic.svg) / `-dating.svg` / `-minimal.svg`) — drop "zodiac" headline if any, swap for "Talk first" or "Real connection"
- [ ] Decide locale fan-out: Play Console allows per-locale listings. We have es/pt/de/ar/ja/zh in-app — translate the short + full descriptions for these too if you want full ASO coverage
- [ ] Update [docs/growth-plan.md](docs/growth-plan.md) Week 1 ASO section — currently still says title should be "JUNO — Zodiac Compatibility & Birth Chart Dating", which is the old direction
