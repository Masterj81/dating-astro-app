// Sign-on-cusp interpretations — English corpus.
//
// PROVENANCE. Every string here was written for JUNO. The feature was designed
// from `docs/temple-of-zeus-planets-source-notes-2026-09.md`, which records
// only non-protectable general astrology (house life-areas, sign qualities)
// and states its own copyright boundary. No third-party text is reproduced,
// paraphrased sentence-by-sentence, condensed, or reorganised here, and no
// example, metaphor or phrasing from any source page is reused.
//
// THIS FILE IMPORTS NOTHING, ON PURPOSE — same reason as
// `packages/shared/src/coach/content.ts`: the validator loads it with
// `await import()` under Node's native type stripping, which does not resolve
// module specifiers. The shape is still fully checked: `./contract.ts` asserts
// it against `HouseCuspCorpus`, so all 144 keys are a compile-time obligation.
//
// VOICE RULES (enforced by `__tests__/house-cusps.test.ts`, not just written
// down here):
//   - Modal, never deterministic: may / can / often / tends to / might.
//   - Banned: always, never, destiny, soulmate, guaranteed, must, will be.
//   - Describes how a sign COLOURS a life area. No prediction of events.
//   - No clinical or medical vocabulary. This is not therapy.
//   - A pattern to reflect on, never a verdict on a person. No house-sign
//     combination is bad luck, and none is a promise.
//   - One to three sentences. The second usually offers the reflective angle:
//     what the colouring is good for, and what it costs when unwatched.
//
// WHY THE CORPUS LIVES HERE AND NOT IN `locales/*.json`:
// 144 keys x 8 locales x 2 platforms is 2304 entries. Mobile locale parity is
// exact, so shipping English into eight files would make the translation debt
// invisible — the same trade already made and documented for the coach corpus.
// Here the debt is one missing file per language, and `HOUSE_CUSP_LOCALES` is
// the single list that says which languages are real.

export const HOUSE_CUSP_CONTENT_EN = {
  // --- House 1: identity, body, first impression, how life is approached ---
  natalHouseCuspInterpretation_1_aries:
    'You may arrive quickly — decisions made in motion, opinions offered before they are polished. That directness often reads as honesty, and it lands even better when people get to see the pause as well as the push.',
  natalHouseCuspInterpretation_1_taurus:
    'Your presence may settle a room rather than announce itself, and people often meet you as someone unhurried. Warmth tends to build at its own pace here, which can look like reserve until trust arrives.',
  natalHouseCuspInterpretation_1_gemini:
    'First impressions may be quick, verbal and curious — questions as a way of saying hello. The lightness is real, and it can also be somewhere to hide; depth often arrives when you let one subject stay.',
  natalHouseCuspInterpretation_1_cancer:
    'You may approach new situations by reading the emotional weather first, deciding quietly whether it is safe to open. People often feel cared for by you before they feel they know you.',
  natalHouseCuspInterpretation_1_leo:
    'There can be warmth and colour in how you arrive, and a natural willingness to be seen. Recognition often matters more than it gets admitted, and owning that tends to be easier than performing around it.',
  natalHouseCuspInterpretation_1_virgo:
    'You may enter a room already noticing what could be improved, including in yourself. That attentiveness is genuinely useful, and it becomes kinder when the same standard is applied gently.',
  natalHouseCuspInterpretation_1_libra:
    'First contact often runs through charm, symmetry and a wish to make things pleasant. Agreement can come easily here, so it helps to notice when you have agreed to something you did not actually want.',
  natalHouseCuspInterpretation_1_scorpio:
    'You may reveal yourself slowly, watching more than you show, and people often sense there is more underneath. Privacy is a real need here rather than a strategy, and saying so plainly saves a lot of misreading.',
  natalHouseCuspInterpretation_1_sagittarius:
    'You may meet life as something to explore, with a frankness that lands as refreshing more often than not. Room to move matters, and commitments tend to hold better when they are chosen out loud rather than assumed.',
  natalHouseCuspInterpretation_1_capricorn:
    'There can be composure in how you arrive — measured, capable, slower to show effort than to show results. Letting people see the work in progress often builds more closeness than the finished version does.',
  natalHouseCuspInterpretation_1_aquarius:
    'You may present as your own category: friendly but slightly apart, often more at ease with ideas than with small talk. Difference comes easily to you, while being included on ordinary terms can take more practice.',
  natalHouseCuspInterpretation_1_pisces:
    'You may take the emotional temperature of a room and adjust to it before deciding who you are in it. That sensitivity is a gift, and it works best with edges — knowing where you end helps other people meet you.',

  // --- House 2: money, values, possessions, self-worth, what feels stable ---
  natalHouseCuspInterpretation_2_aries:
    'You may earn and spend in bursts, backing an instinct before the spreadsheet catches up. Self-worth often follows action here, so the useful question is which risks build something and which only prove you can take them.',
  natalHouseCuspInterpretation_2_taurus:
    'Comfort, quality and steadiness may matter more to you than volume, and slow accumulation can feel better than a windfall. Worth tends to be measured in what lasts, which is grounding until it becomes a reason to change nothing.',
  natalHouseCuspInterpretation_2_gemini:
    'Money may arrive through several channels rather than one, and interest can move faster than commitment. Naming what you actually value, out loud, often steadies the decisions more than a budget does.',
  natalHouseCuspInterpretation_2_cancer:
    'Security may be emotional before it is financial, and saving can be a way of protecting the people you love. It is worth noticing when you hold on to something because letting go feels like loss rather than because keeping it helps.',
  natalHouseCuspInterpretation_2_leo:
    'You may spend generously on what makes life feel warm, and value what carries meaning or beauty. Worth can get tangled with recognition here; the steadier version is knowing your value without needing it confirmed.',
  natalHouseCuspInterpretation_2_virgo:
    'You may track the details, prefer usefulness to flash, and feel steadied by knowing exactly where things stand. Self-worth can quietly become a checklist, which is worth loosening — being useful is not the same as being valuable.',
  natalHouseCuspInterpretation_2_libra:
    'Value may be tied to beauty, fairness and shared arrangements, and money can turn into a relationship conversation. Deciding what you want before the negotiation starts often protects the balance you are trying to keep.',
  natalHouseCuspInterpretation_2_scorpio:
    'Resources may be held privately and managed with real intent, and you can be strategic about what you disclose. Depth of investment is a strength; the practice is noticing the moment control has quietly replaced trust.',
  natalHouseCuspInterpretation_2_sagittarius:
    'You may value freedom over accumulation and spend on experience, learning or distance more readily than on things. Optimism serves you here, and it tends to work better with one honest number attached to it.',
  natalHouseCuspInterpretation_2_capricorn:
    'Building slowly may feel natural, and a long horizon can make sacrifice bearable. Worth is often tied to accomplishment here, which is worth questioning on the days when nothing gets finished.',
  natalHouseCuspInterpretation_2_aquarius:
    'Your relationship with money may be unconventional, principled, or deliberately detached. Values can be held strongly, and putting them into ordinary daily choices is where they stop being theory.',
  natalHouseCuspInterpretation_2_pisces:
    'Boundaries around money and possessions can be soft, and generosity may arrive before the calculation does. Naming a limit out loud is not meanness here — it is what keeps the generosity sustainable.',

  // --- House 3: communication, siblings, local world, daily learning -------
  natalHouseCuspInterpretation_3_aries:
    'You may say it as you think it, and speed can be part of how you show interest. Directness is easy to trust, and one breath before sending often keeps it from landing harder than you meant.',
  natalHouseCuspInterpretation_3_taurus:
    'You may speak slowly, mean it, and dislike being rushed to a conclusion. That steadiness reassures people, and it can read as stubbornness when the subject has already moved on.',
  natalHouseCuspInterpretation_3_gemini:
    'Words may come easily, in volume and in variety, and curiosity can carry a conversation for hours. The pleasure is real; the depth tends to arrive when one thread gets followed instead of swapped.',
  natalHouseCuspInterpretation_3_cancer:
    'You may communicate in tone as much as in content, and remember conversations long after they end. Saying the feeling plainly, rather than implying it, often prevents the quiet misreadings.',
  natalHouseCuspInterpretation_3_leo:
    'You may speak with warmth and colour, and enjoy telling it well. Attention is part of the pleasure here, and the generous version leaves as much room to listen as to hold the floor.',
  natalHouseCuspInterpretation_3_virgo:
    'You may choose words carefully and notice the ones other people use loosely. Precision is a service, and it becomes kinder when the correction is offered rather than automatic.',
  natalHouseCuspInterpretation_3_libra:
    'Conversation may be where you create balance, softening edges and looking for the fair version. Diplomacy is a real skill, and the harder honesty usually needs saying anyway.',
  natalHouseCuspInterpretation_3_scorpio:
    'You may say less than you know and read subtext more accurately than most. Depth in conversation is a gift here, and asking directly often saves the energy you spend decoding.',
  natalHouseCuspInterpretation_3_sagittarius:
    'You may speak frankly, think in big pictures, and enjoy an argument as a kind of play. Frankness is refreshing, and checking that the other person is playing too keeps it that way.',
  natalHouseCuspInterpretation_3_capricorn:
    'You may speak with economy, preferring the useful sentence to the decorative one. That weight makes your words count, and a little added warmth stops it reading as coldness.',
  natalHouseCuspInterpretation_3_aquarius:
    'You may think in systems and enjoy the idea more than the small talk around it. Original perspective is your contribution, and grounding it in something personal is what makes it land.',
  natalHouseCuspInterpretation_3_pisces:
    'You may communicate in images, moods and half-sentences that turn out to be accurate. Ambiguity can be beautiful and it can be confusing — one concrete sentence per conversation goes a long way.',

  // --- House 4: home, roots, family pattern, privacy, foundation ----------
  natalHouseCuspInterpretation_4_aries:
    'Home may be somewhere you act rather than settle, and independence can have started early. Peace at the foundation often has to be built on purpose here, because the instinct is to move.',
  natalHouseCuspInterpretation_4_taurus:
    'You may need a home that feels solid, sensory and unhurried, and roots can matter more to you than mobility. Comfort is a genuine resource; noticing when it has turned into inertia keeps it one.',
  natalHouseCuspInterpretation_4_gemini:
    'Home may be several places at once, or one place full of talk, books and coming and going. Belonging can spread thin, and choosing where to be fully present is the work.',
  natalHouseCuspInterpretation_4_cancer:
    'Home may be your centre of gravity, and family memory can run deep in how you feel safe. Caring for the people you come from is natural; deciding how much of it is yours to carry is the harder part.',
  natalHouseCuspInterpretation_4_leo:
    'You may want a home with warmth, colour and people in it, and pride in your origins can run strong. Generosity at home is real, and leaving room for others to shape the space keeps it shared.',
  natalHouseCuspInterpretation_4_virgo:
    'You may steady yourself by ordering your surroundings, and helpfulness can be how care was shown where you come from. Rest is allowed here, even when something is still unfinished.',
  natalHouseCuspInterpretation_4_libra:
    'You may want harmony at home and feel a disturbed atmosphere almost physically. Keeping the peace is a skill, and the peace tends to hold longer when the disagreement actually gets had.',
  natalHouseCuspInterpretation_4_scorpio:
    'Home may be private, guarded, and emotionally intense in ways you do not show outside. Family history can carry weight, and looking at it directly tends to loosen it more than avoidance does.',
  natalHouseCuspInterpretation_4_sagittarius:
    'Home may be wherever the horizon stays open, and your roots can be philosophical rather than geographic. Belonging is available here, and it usually asks you to stay long enough to feel it.',
  natalHouseCuspInterpretation_4_capricorn:
    'Responsibility may have arrived early, and home can be something you provide rather than receive. Letting yourself be looked after is not a debt — it is often the missing half.',
  natalHouseCuspInterpretation_4_aquarius:
    'Home may be unconventional and chosen rather than inherited, and family can mean the people you assembled. Distance from your origins is workable, and naming what you kept from them adds ground.',
  natalHouseCuspInterpretation_4_pisces:
    'Home may be more of an atmosphere than an address, and you can absorb the emotional state of a household. A private space that is genuinely yours often does more for you than you expect.',

  // --- House 5: creativity, play, romance, joy, self-expression -----------
  natalHouseCuspInterpretation_5_aries:
    'Romance may start fast and playfully, and making something can be more satisfying than perfecting it. Pursuit is enjoyable here, and staying past the first excitement is where the interesting part begins.',
  natalHouseCuspInterpretation_5_taurus:
    'Pleasure may be unhurried and physical, and you can be loyal in how you love and steady in what you make. Slow enjoyment is a real talent, and keeping a little novelty in it stops comfort turning into routine.',
  natalHouseCuspInterpretation_5_gemini:
    'Flirting may run on wit, and creativity can thrive on variety and quick starts. Play is genuine here, and letting one thing become serious is the risk worth taking.',
  natalHouseCuspInterpretation_5_cancer:
    'Romance may be tender and protective, and quicker to attach than to announce itself. Feelings tend to show in gestures before words, so saying them out loud is often the missing half.',
  natalHouseCuspInterpretation_5_leo:
    'You may love generously and create with an audience in mind, and being appreciated can be part of the joy. Warmth is the gift here, and making room for someone else to shine keeps it warm.',
  natalHouseCuspInterpretation_5_virgo:
    'You may express care through craft, effort and getting the details right for someone. Playfulness can get blocked by self-criticism here, and permission to make something badly is usually the unlock.',
  natalHouseCuspInterpretation_5_libra:
    'Romance may be aesthetic and mutual, attentive to how things feel between two people. Charm comes easily, and choosing from desire rather than from what pleases is the deeper practice.',
  natalHouseCuspInterpretation_5_scorpio:
    'Attraction may run deep and privately, and creativity can come from what is intense rather than light. All-or-nothing is the tendency here, and playfulness is allowed to be part of depth.',
  natalHouseCuspInterpretation_5_sagittarius:
    'Romance may be adventurous and honest, and better with room in it; creating can be about meaning as much as form. Freedom matters here, and saying so early keeps it from reading as retreat.',
  natalHouseCuspInterpretation_5_capricorn:
    'You may take love seriously, and creativity can be disciplined rather than spontaneous. Play is not a waste of time here, even on the days it feels like one.',
  natalHouseCuspInterpretation_5_aquarius:
    'You may love on your own terms and create outside the expected form. Independence in romance works well when it is stated; assumed distance is what tends to hurt.',
  natalHouseCuspInterpretation_5_pisces:
    'Romance may be imaginative and compassionate, and easy to idealise; creativity can flow best when you stop steering. Seeing the person as they are, rather than as the feeling, is what makes it last.',

  // --- House 6: routines, work rhythm, health habits, service ------------
  natalHouseCuspInterpretation_6_aries:
    'You may work in sprints, need momentum to stay engaged, and lose interest when a task goes slow. Energy is the resource here, and pacing it on purpose keeps the sprint from becoming the stall.',
  natalHouseCuspInterpretation_6_taurus:
    'Routine may genuinely steady you, and a rhythm that works can hold for years. Consistency is the strength, and noticing when it has stopped serving you keeps it from becoming a rut.',
  natalHouseCuspInterpretation_6_gemini:
    'You may need variety in the day and several things running at once to stay interested. Flexibility is real capacity, and one or two fixed anchors keep the day from scattering.',
  natalHouseCuspInterpretation_6_cancer:
    'You may care for others practically, and daily life can rise and fall with how you feel. Building routines that still hold on the low days matters more here than optimising the good ones.',
  natalHouseCuspInterpretation_6_leo:
    'You may put heart into ordinary work and want it to be noticed. Doing it well is its own reward on the days nobody says so, and asking for acknowledgement is allowed too.',
  natalHouseCuspInterpretation_6_virgo:
    'Details, care and improvement may be a natural language for you, and the daily is where you feel competent. Good enough is a real standard, and treating it as one protects the energy.',
  natalHouseCuspInterpretation_6_libra:
    'You may work best with company, balance and a pleasant environment, and friction in a team can cost you more than the task does. A fair share of the load is worth naming rather than absorbing.',
  natalHouseCuspInterpretation_6_scorpio:
    'You may work intensely and privately, going deep rather than wide. Rest can feel like weakness here, and scheduling it is more reliable than waiting until it feels earned.',
  natalHouseCuspInterpretation_6_sagittarius:
    'You may need meaning in daily work and struggle with repetition that has no why attached. Connecting the routine to the larger aim tends to do more than discipline alone.',
  natalHouseCuspInterpretation_6_capricorn:
    'You may be reliable and structured, and hard on yourself about output. Capability is not the question here; separating your worth from your productivity is the ongoing work.',
  natalHouseCuspInterpretation_6_aquarius:
    'You may want to redesign the process rather than follow it, and work best with autonomy. Innovation lands better once the existing rhythm has been understood first.',
  natalHouseCuspInterpretation_6_pisces:
    'You may work in waves and need a gentler structure than most systems offer. Boundaries around helping — how much, for whom, until when — are what protect the compassion.',

  // --- House 7: one-to-one bonds, partnership, mirrors, agreements -------
  natalHouseCuspInterpretation_7_aries:
    'You may be drawn to people with drive and directness, and partnership can move quickly once you have decided. Conflict tends to be faced rather than avoided here, which serves you as long as the other person gets room to answer.',
  natalHouseCuspInterpretation_7_taurus:
    'You may look for steadiness in a partner and offer loyalty in return, and commitment can be slow to give and long to keep. Security is the aim, and checking that it has not become avoidance of change keeps it honest.',
  natalHouseCuspInterpretation_7_gemini:
    'You may want a partner you can talk to endlessly, and interest often begins in the mind. Conversation is the bond here, and letting silences and heavier subjects in is what deepens it.',
  natalHouseCuspInterpretation_7_cancer:
    'You may bond protectively and want a partnership that feels like safety. Care is given readily here, and asking for it as clearly as you give it is often the missing piece.',
  natalHouseCuspInterpretation_7_leo:
    'You may want warmth, loyalty and mutual pride in a partner, and love generously when it is returned. Appreciation matters here, and naming that need works better than testing for it.',
  natalHouseCuspInterpretation_7_virgo:
    'You may show love by noticing and by helping, and choose partners carefully. Improvement offered as care can land as criticism, and asking first usually resolves it.',
  natalHouseCuspInterpretation_7_libra:
    'Partnership may be a central theme, and you can be genuinely good at meeting someone halfway. The risk is the half that goes missing — keeping your own preference visible is what makes the balance real.',
  natalHouseCuspInterpretation_7_scorpio:
    'You may bond deeply and want honesty at a level most conversations avoid. Trust is built slowly here and worth the time, and direct questions serve it better than testing does.',
  natalHouseCuspInterpretation_7_sagittarius:
    'You may want a partner who is also a companion in exploring, with honesty and room to move. Space and closeness are not opposites, and saying which one you need on a given day helps.',
  natalHouseCuspInterpretation_7_capricorn:
    'You may take commitment seriously and prefer a partnership that gets built rather than declared. Reliability is the love language here, and adding warmth to it stops it reading as duty.',
  natalHouseCuspInterpretation_7_aquarius:
    'You may want friendship inside the partnership and freedom alongside it. Unconventional agreements can work well here when they are actually agreed rather than assumed.',
  natalHouseCuspInterpretation_7_pisces:
    'You may merge easily with a partner and feel what they feel. Compassion is the gift, and keeping a clear sense of your own preferences is what stops it dissolving.',

  // --- House 8: shared resources, intimacy, trust, loss, transformation ---
  natalHouseCuspInterpretation_8_aries:
    'You may face intense subjects head-on and prefer the difficult conversation to the slow one. Directness helps here, and pacing it to the other person’s readiness helps more.',
  natalHouseCuspInterpretation_8_taurus:
    'You may want intimacy to be steady and physical, and shared finances to be solid. Letting go is the harder theme here, since holding on can outlast the reason for it.',
  natalHouseCuspInterpretation_8_gemini:
    'You may approach intimacy and difficult subjects by talking about them, sometimes as a way of staying above them. Naming what you feel, and not only what you think, is the deeper move.',
  natalHouseCuspInterpretation_8_cancer:
    'Trust may be given slowly and felt strongly, and closeness can mean being allowed into someone’s private version of themselves. Old attachments can linger, and tending them gently is more useful than forcing closure.',
  natalHouseCuspInterpretation_8_leo:
    'You may be generous with what you share and want loyalty in return. Pride can make vulnerability difficult here, and showing the unpolished part is what tends to deepen the bond.',
  natalHouseCuspInterpretation_8_virgo:
    'You may handle shared responsibilities carefully and prefer clear terms in intimate matters. Precision helps here, and letting closeness be imperfect helps more.',
  natalHouseCuspInterpretation_8_libra:
    'You may want fairness in what gets shared, emotionally and materially. Avoiding the uncomfortable negotiation tends to cost more than having it would.',
  natalHouseCuspInterpretation_8_scorpio:
    'Depth, privacy and transformation may be native ground here, and you can hold what other people find heavy. Power inside a bond is worth watching — shared openly, it turns into trust.',
  natalHouseCuspInterpretation_8_sagittarius:
    'You may meet loss and change with perspective and a search for meaning. Philosophy can arrive a little early, and feeling it first tends to make the meaning truer.',
  natalHouseCuspInterpretation_8_capricorn:
    'You may manage shared resources responsibly and get through difficulty without complaining. Letting someone carry part of it is not a failure of strength.',
  natalHouseCuspInterpretation_8_aquarius:
    'You may take an unusually detached view of intimacy and shared arrangements. Objectivity is useful here, and staying present when it turns emotional is the growth.',
  natalHouseCuspInterpretation_8_pisces:
    'You may feel other people’s states as your own and give more than was agreed. The compassion is real, and a stated boundary is what protects it.',

  // --- House 9: travel, belief, philosophy, study, wider meaning ---------
  natalHouseCuspInterpretation_9_aries:
    'You may learn by doing and form convictions quickly. Conviction is energising, and staying curious after you have decided keeps it from hardening.',
  natalHouseCuspInterpretation_9_taurus:
    'You may adopt beliefs slowly and keep them, preferring knowledge you can use. Depth over novelty is a strength, and occasional exposure to the unfamiliar keeps it fresh.',
  natalHouseCuspInterpretation_9_gemini:
    'You may collect ideas widely and enjoy the exchange more than the conclusion. Breadth is real learning, and one subject taken all the way changes you differently.',
  natalHouseCuspInterpretation_9_cancer:
    'Belief may be rooted in belonging, family and what feels emotionally true. Meaning grows here when the familiar gets compared with the unfamiliar rather than defended against it.',
  natalHouseCuspInterpretation_9_leo:
    'You may hold your beliefs warmly and enjoy teaching what you have found. Enthusiasm carries other people, and leaving room for disagreement keeps it a conversation.',
  natalHouseCuspInterpretation_9_virgo:
    'You may study carefully and distrust claims that skip the evidence. Rigour is valuable here, and allowing for what cannot be measured yet is part of it.',
  natalHouseCuspInterpretation_9_libra:
    'You may weigh perspectives and prefer the view that holds several truths together. Balance is genuine wisdom, and at some point choosing a position is part of it too.',
  natalHouseCuspInterpretation_9_scorpio:
    'You may look for the meaning underneath the official one and distrust easy answers. Depth is the gift here, and letting some things stay simple is the relief.',
  natalHouseCuspInterpretation_9_sagittarius:
    'Meaning, distance and philosophy may be native ground, and you can be genuinely at home in the unfamiliar. Enthusiasm for the big picture is a strength, and the details still matter.',
  natalHouseCuspInterpretation_9_capricorn:
    'You may prefer beliefs that have been tested and knowledge that has a use. Structure serves understanding here, and leaving room for wonder serves it too.',
  natalHouseCuspInterpretation_9_aquarius:
    'You may build your worldview yourself, often against the inherited one. Independent thought is the asset, and checking it against other people is what keeps it sharp.',
  natalHouseCuspInterpretation_9_pisces:
    'Meaning may arrive through image, intuition and feeling rather than argument. That knowing is real, and grounding it in something checkable is what makes it shareable.',

  // --- House 10: career, reputation, public role, achievement -----------
  natalHouseCuspInterpretation_10_aries:
    'You may move toward visible roles quickly and prefer leading to waiting your turn. Initiative gets noticed here, and staying with something long enough to finish it is what compounds.',
  natalHouseCuspInterpretation_10_taurus:
    'You may build a reputation slowly and hold it for a long time, preferring steady value to a fast rise. Reliability is your signature, and the risk is staying in a role past its usefulness.',
  natalHouseCuspInterpretation_10_gemini:
    'Your public role may involve words, ideas, or several occupations at once. Versatility is real, and one clear sentence about what you do makes it legible to everyone else.',
  natalHouseCuspInterpretation_10_cancer:
    'Your public life may be coloured by care, loyalty and the wish to create a sense of safety. At work or in reputation, you may be noticed for protecting, for gathering people, or for bringing a human tone into places that run cold.',
  natalHouseCuspInterpretation_10_leo:
    'You may want work that lets you be seen and that you can be proud of, and you can lead with warmth. Recognition is a genuine need here, and both earning it and asking for it are allowed.',
  natalHouseCuspInterpretation_10_virgo:
    'You may be the one who makes the work actually function, with a reputation resting on competence rather than presence. Visibility is not immodesty, and quality is easier to trust once it has been named.',
  natalHouseCuspInterpretation_10_libra:
    'Your public role may involve mediation, aesthetics, or bringing people into agreement. Being liked and being effective can pull in different directions, and choosing the second sometimes is part of the job.',
  natalHouseCuspInterpretation_10_scorpio:
    'You may work with what is hidden, complex or high-stakes, and prefer influence to display. Power tends to work best in the open here, since quiet control usually costs trust.',
  natalHouseCuspInterpretation_10_sagittarius:
    'You may want work with meaning, scope or travel in it, and dislike a ceiling. Vision attracts opportunity, and following through is what converts it.',
  natalHouseCuspInterpretation_10_capricorn:
    'Ambition may be steady and long-range, and authority can suit you once it has been earned. Achievement is real ground, and deciding whose definition of success you are using matters.',
  natalHouseCuspInterpretation_10_aquarius:
    'You may want a role that changes something, and fit awkwardly into a conventional ladder. Originality is the contribution, and translating it into terms others can use is the craft.',
  natalHouseCuspInterpretation_10_pisces:
    'You may be drawn to work involving imagination, care, or something larger than the job description. Direction can be less linear here, and choosing one visible commitment gives the sensitivity a shape.',

  // --- House 11: friends, groups, networks, future hopes, community -----
  natalHouseCuspInterpretation_11_aries:
    'You may energise a group and prefer doing something together to talking about it. Initiative is welcome here, and leaving space for slower voices keeps the group yours as well as theirs.',
  natalHouseCuspInterpretation_11_taurus:
    'Friendships may be few, long and steady, and you can be the one who stays. Loyalty is the strength, and letting new people in is what keeps the circle alive.',
  natalHouseCuspInterpretation_11_gemini:
    'You may know a lot of people and enjoy moving between circles. Range is genuine social intelligence, and a few deeper ties are what carry weight when it matters.',
  natalHouseCuspInterpretation_11_cancer:
    'Friendship may be family-like, protective and emotionally close. Caring for the group comes naturally, and checking whether it is mutual is what protects you.',
  natalHouseCuspInterpretation_11_leo:
    'You may be a warm centre in a group and give generously to your friends. Appreciation matters in both directions, and letting others lead sometimes deepens the loyalty.',
  natalHouseCuspInterpretation_11_virgo:
    'You may be the friend who helps concretely and notices what is needed. Being useful is real love, and being wanted for your company alone is allowed too.',
  natalHouseCuspInterpretation_11_libra:
    'You may build networks easily and keep the peace inside them. Harmony is your contribution, and stating a preference occasionally is what keeps the friendships real.',
  natalHouseCuspInterpretation_11_scorpio:
    'Friendship may be selective and deep, with little patience for the superficial. Trust is slow and durable here, and saying what you need directly saves a lot of testing.',
  natalHouseCuspInterpretation_11_sagittarius:
    'You may collect friends across places and enjoy people who widen your view. Freedom in friendship is fine, and showing up consistently is what turns it into belonging.',
  natalHouseCuspInterpretation_11_capricorn:
    'You may take friendship seriously and be relied on inside a group. Responsibility is real here, and letting friendships be light sometimes is part of what sustains them.',
  natalHouseCuspInterpretation_11_aquarius:
    'Community, ideas and shared causes may be where you come alive. Belonging to something larger suits you, and the individual friendships still need tending one at a time.',
  natalHouseCuspInterpretation_11_pisces:
    'You may join groups by feeling rather than by plan, and absorb the mood of a circle. Compassion draws people to you, and choosing the circles carefully protects your energy.',

  // --- House 12: solitude, dreams, hidden patterns, retreat -------------
  natalHouseCuspInterpretation_12_aries:
    'Anger and drive may be the parts hardest to see in yourself, and rest can feel like defeat. Solitude is where the energy refills, and using it deliberately beats crashing into it.',
  natalHouseCuspInterpretation_12_taurus:
    'You may hold on quietly to things you have not admitted you are holding. Slowing down on purpose can show you what the routine was covering.',
  natalHouseCuspInterpretation_12_gemini:
    'The mind may keep running when you are alone, and thinking can stand in for feeling. Quiet without input is uncomfortable at first and often clarifying after that.',
  natalHouseCuspInterpretation_12_cancer:
    'Old feelings and family memory may live close to the surface in private. Tending them gently, with someone you trust, tends to lighten what carrying them alone does not.',
  natalHouseCuspInterpretation_12_leo:
    'The need to be seen may be the private part, and solitude can feel like disappearing. Time alone is not a loss of self — it is often where the self gets found.',
  natalHouseCuspInterpretation_12_virgo:
    'Self-criticism may run quietly underneath and be the hardest thing to notice. Rest without earning it is the practice here, and it does take practice.',
  natalHouseCuspInterpretation_12_libra:
    'You may lose track of your own preferences in private as well as in public. Solitude is usually where the honest answer to what you want turns up.',
  natalHouseCuspInterpretation_12_scorpio:
    'Intensity may live below the surface, and you can carry more than you show. Bringing some of it into daylight, in your own time, usually costs less than holding it does.',
  natalHouseCuspInterpretation_12_sagittarius:
    'Restlessness may be the private theme, and stillness can feel like being trapped. Meaning found while staying put is a different kind, and often worth the discomfort.',
  natalHouseCuspInterpretation_12_capricorn:
    'The pressure you put on yourself may be invisible to others and constant to you. Solitude without a task is the harder discipline here, and the more restorative one.',
  natalHouseCuspInterpretation_12_aquarius:
    'You may feel apart even inside the groups you belong to. Naming the loneliness rather than theorising it is what tends to close the distance.',
  natalHouseCuspInterpretation_12_pisces:
    'Inner life, imagination and porousness may be strong here, and the boundary between you and the atmosphere can be thin. Regular solitude is not withdrawal — it is maintenance.',
};
