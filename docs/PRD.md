# Homie — Product Requirements

**Version** 1.0 · 25 July 2026
**Event** Consumer Health Hackathon, Encode Hub London · submission 12:00 Sun 26 Jul
**Status** Build spec. This document is the source of truth for scope.

---

## 1. The problem

A person with lupus or rheumatoid arthritis has good days and bad days, and the
pattern behind them is real but invisible. Barometric pressure drops and their
joints seize. They sleep badly and the next day is wrecked. They half-notice
this, so they start writing it down — in a notebook, in the Notes app, in a
spreadsheet, in a chat with an AI assistant.

Then the appointment comes, eleven weeks later, and they can't remember. They
say "it's been about the same" because that's all they've got. The consultant
adjusts nothing. The cycle repeats.

**Two things are true at once: the tracking is already happening, and it's
already failing.** That is the signal of a real problem — the customer is
solving it badly with tools that weren't built for it.

## 2. What Homie is

> Homie texts you every morning, notices the pattern between the weather, your
> sleep and how you feel, and turns ninety days of it into one page you hand
> your consultant.

**Tagline:** Homie checks in, so you don't have to keep track.

No app to download. It arrives as a text message. The user replies in their own
words. That is the entire interface.

## 3. Who it's for

Primary persona is a woman in her sixties with lupus and rheumatoid arthritis.
She is not a quantified-self enthusiast. Her hands hurt, her eyes are tired, and
she has already deleted four health apps that awarded her badges for logging
pain.

Design consequences, all non-negotiable:

- 18px body text minimum, 52px tap targets
- No install, no account creation, no onboarding flow
- No scores, streaks, grades, or anything that can be failed
- She must be able to ignore Homie for three days without consequence

## 4. Non-goals

These are out of scope for the hackathon build and stated here so no one
rebuilds them at 3am.

| Not building | Why |
| --- | --- |
| **Medication dose recommendations** | Recommending a dose change is practising medicine. It makes Homie an MHRA-regulated medical device and destroys the trust position. **Hard prohibition, not a scope cut.** |
| Diagnosis, triage decisions, flare prediction | Same reason. Homie notices; it never concludes. |
| Appointment booking | A second product. One sentence in the pitch at most. |
| Meta Ray-Ban Display surface | Only if Display hardware is physically in the room. Otherwise a slide. |
| Community, forums, social | Juno's territory. |
| Native app | The absence of one is a feature. |
| Appointment-slot matching algorithm | Parked. Interesting, not this weekend. |

## 5. The core loop

Everything in the build serves this one loop. If a task doesn't, cut it.

```
  morning              she replies              Homie stores
  message      →       in her own       →       structured        →   the page
  goes out             words                    data
```

**Morning message.** Sent daily at a fixed local time. Composed from: today's
barometric pressure delta, last night's sleep and HRV if a wearable is
connected, her medication schedule, and what she said yesterday. Ends with one
question that is easy to ignore.

**Her reply.** Free text. "hands are bad", "ok today", "didn't sleep". Never a
form, never a scale, never a required format.

**Structuring.** Claude parses the reply into: pain level (inferred 1–5),
affected areas, medication taken yes/no, free-text note. Ambiguity is stored as
ambiguity — never guessed into a number that looks certain.

**The page.** The output that justifies the whole thing. A single printable
summary: pressure and symptom lines plotted together, medication adherence,
her own words quoted with dates, and the correlation stated plainly. Built to
be handed to a rheumatologist, not admired in an app.

## 6. Surfaces

**The thread** — the hero. iMessage/SMS. This is the product and the demo.

**The page** — a web view at a link Homie texts her. Also printable. This is
the payoff.

**The call** — ElevenLabs voice agent. Homie rings if the morning message goes
unanswered twice, or she texts `call` because typing hurts. Cut this before
cutting anything above it.

**The glasses** — Meta Ray-Ban Display, one line of text, hosted HTTPS page on
Vercel. Only if the hardware is in the room. Note: Web Apps run only on
Ray-Ban *Display*, need glasses sw v125+ and Meta AI app v272+ with Developer
Mode. Not a streaming API. HRV never comes from the glasses.

## 7. Safety requirements

These are gates, not preferences. Each one is testable and each one gets tested
before a real user receives message one.

1. **Red-flag bypass runs before the model path.** A hard-coded rule set checks
   every inbound message for emergency language (chest pain, breathing
   difficulty, sudden severe symptoms, stroke signs). On a match, Homie returns
   fixed NHS 111 / 999 guidance and does not invoke the LLM. This is a string
   check ahead of the agent, deliberately dumb and deliberately first.
2. **Homie never advises.** System prompt forbids diagnosis, dose changes, and
   flare prediction. Output is filtered for these before send.
3. **`STOP`, `DELETE`, `MY DATA` work.** The privacy policy promises them. They
   ship before message one or the policy is a lie.
4. **Consent is explicit and recorded.** First message links the privacy policy
   and asks for a yes. Timestamped. UK GDPR Art 9(2)(a) — explicit consent is
   the sole lawful basis.
5. **Wearable scopes minimised.** WHOOP: request `read:recovery` and
   `read:sleep` only, not all six. Data minimisation is a scoring line as much
   as a legal one.
6. **Synthetic everywhere except consented real users.** Hackathon T&Cs forbid
   real patient data. The one real user has given explicit informed consent and
   knows exactly what is shown on stage.

## 8. Data model

```sql
users            id, phone, name, timezone, consent_at, consent_version,
                 baseline_hrv, status
medications      id, user_id, name, dose, schedule
checkins         id, user_id, sent_at, message_text, replied_at, reply_text
observations     id, checkin_id, pain_level, areas[], meds_taken,
                 confidence, note
readings         id, user_id, date, source, hrv, resting_hr, sleep_minutes,
                 sleep_quality
weather          id, user_id, date, pressure_hpa, pressure_delta_24h,
                 temp_c, humidity
audit_log        id, user_id, event, payload, created_at   -- insert-only
```

RLS keyed on `user_id`. `audit_log` is insert-only. Consent version is stored so
a policy change doesn't silently inherit old consent.

## 9. Stack

Built from scratch during the event — the rules require it. First commit must
be timestamped inside the hackathon window.

| Layer | Choice |
| --- | --- |
| App | Next.js App Router on Vercel |
| Messaging | Twilio SMS, webhook to a Next.js route handler |
| Model | Claude via AI SDK — composes messages, parses replies |
| Voice | ElevenLabs Agents over the same Twilio number |
| Data | Supabase Postgres with RLS |
| Weather | Open-Meteo — barometric pressure, free, no API key |
| Wearable | WHOOP OAuth2, two scopes |
| Scheduling | Vercel cron |

Sponsor tools are used where they genuinely help, which is the stated bar.
Nothing is included to tick a box.

> **Amendment, 25 Jul:** the runtime split has since been revised — see
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). Messaging moves to Sendblue for the
> iMessage thread, and the AI SDK backend runs on Cloudflare Workers + Sandbox
> rather than Vercel functions. Twilio is retained for voice calls.

## 10. Build order

Times are hard. When a slot ends, the work in it stops whether or not it's
finished.

| Time | Work | Done means |
| --- | --- | --- |
| 17:00–19:00 | SMS loop end to end | Twilio in and out, Supabase writing, cron fires a morning message to my own phone |
| 19:00–20:00 | Make the message good | Open-Meteo pressure delta feeding Claude; reply parsed to `observations` |
| **20:00** | **Ship to first real user** | Consent captured, `STOP`/`DELETE` live, first message sent |
| 20:00–22:00 | Recruit | r/lupus, r/ChronicIllness, Lupus UK, Versus Arthritis. **Screenshot every post** — the bonus asks *how* you got users |
| 22:00–01:00 | The page | Pressure and pain plotted together, her words quoted, printable |
| 01:00–03:00 | The thread as design | Every message written properly. This is the design mark |
| 03:00–04:00 | The call | ElevenLabs. Cut without hesitation if the text loop is shaky |
| 04:00–08:00 | Sleep | Non-negotiable. A tired demo loses |
| 08:00–10:00 | Harden | Run the demo eight times, record a fallback video, second tethered phone, pull user count and quotes |
| 10:00 | Freeze | Submit early. Do not touch the code again |

## 11. Demo

Two minutes per the organisers' briefing, though the mark scheme screenshot says
one — **verify with an organiser and build the 90-second cut so it trims to 60
cleanly.**

Open cold on the real thread on a real phone. No slides, no architecture, no
sign-up screen — the judges explicitly said not to show onboarding.

```
"My mum has lupus. Her appointments are eleven weeks apart.
By the time she gets there she can't remember which days
were bad, or why."                                          0:00

[the thread — real messages, real dates]
"Homie texts her every morning. There's no app. She replies
like she'd reply to anyone."                                0:20

[scroll back through three weeks]
"It's been reading barometric pressure the whole time."     0:50

[the page]
"That's the pattern. Pressure drops, her hands get worse,
and she's short on sleep the day after. She's taking this
to her rheumatologist on the 14th."                         1:10

"Homie doesn't tell her what to do. It notices, so she has
something to say when someone finally asks."                1:30
```

## 12. How this maps to judging

| Criterion | The claim |
| --- | --- |
| **Product** | Not "manage chronic illness". One specific problem: the pattern you can't hold in your head between appointments. Already being solved badly in notebooks and spreadsheets |
| **Design** | The thread is the interface. Warm apricot system, 18px minimum, no install. Consumer-facing, not an AI dump |
| **Code quality** | Legible, typed, RLS-enforced, red-flag rules deliberately outside the model path. Sponsor tools used where they earn it |
| **Demo** | Stuck to solved, in ninety seconds, on a real phone with a real person's messages |
| **Real users bonus** | A real user with real data, plus screenshotted evidence of how others were recruited |
| **Trust** | Homie sells nothing, advises nothing, and hands the output to the patient and her own clinician. This is the answer to "does it feel like it's on my side" |

## 13. Design system

Warm apricot, v2. Fraunces 600 for the name and the one feeling line per
screen; Nunito Sans 18px minimum for everything else with tabular figures.
20px cards, 22px bubbles, pill buttons at 52px.

```css
--ink:#2E2622; --cocoa:#5C4C43; --mushroom:#8C7B70;
--oat:#FBF4EA; --milk:#FFFCF7; --edge:#EDE1D3;
--apricot:#E8823F; --clay:#D2643C;
--moss:#6FA07A; --sky:#6E93BF; --blush:#E6A79E; --alert:#B4291F;
```

One apricot element per screen. Alert red appears only on the 999 path. No
gradients, no glass, no shadows, no emoji, no exclamation marks.

## 14. Voice

Homie notices. It does not advise.

> morning. you slept about five hours and your HRV's under your usual.
> pressure's dropping today too, which is usually a rough combination for you.
>
> no rush — did the tablets happen?

Never:

> Good morning! ☀️ Your Health Score is 72/100! You're trending toward a flare —
> consider increasing your dose.

Lowercase-comfortable. Short. Compared to her own recent baseline, never a
population average. Silence is a valid message. Every question has an obvious
way to not answer it.

## 15. Cut list, in order

1. Meta Ray-Ban Display → one sentence
2. Guided meditation → one sentence
3. Appointment booking → one sentence
4. The voice call → drop entirely if the text loop is unclean
5. WHOOP integration → the loop works on weather and self-report alone

**Never cut:** the real thread, the real user count, the page, or the time
limit on the demo.

## 16. Open items

- Confirm demo length with an organiser — 1 minute or 2
- Confirm Ray-Ban *Display* hardware availability, in the next ten minutes
- Fill privacy policy placeholders: entity, address, ICO number, contact email
- Collect ElevenLabs, Vercel, Supabase promo codes before writing telephony
- Approach the medical consultant who was looking for a team — a clinician
  standing beside you while you say "Homie never advises" is the strongest
  trust signal available, and teams go up to four
