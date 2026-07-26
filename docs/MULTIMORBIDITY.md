# Why multimorbidity is the bottleneck — and why Homie fits

Evidence brief for pitches, judges, and NHS conversations. Prefer primary sources over secondary blogs when citing.

---

## 1. The scale (UK / England)

| Fact | Number | Source |
| --- | --- | --- |
| Adults with ≥2 long-term conditions | **~1 in 4** | [DHSC Major Conditions Strategy — case for change](https://www.gov.uk/government/publications/major-conditions-strategy-case-for-change-and-our-strategic-framework/major-conditions-strategy-case-for-change-and-our-strategic-framework--2) |
| Share of hospital admissions, outpatients, and GP consultations from people with ≥2 conditions | **~50%** | Same · [Health Foundation 2018](https://www.health.org.uk/sites/default/files/upload/publications/2018/Understanding%20the%20health%20care%20needs%20of%20people%20with%20multiple%20health%20conditions.pdf) |
| Share of NHS costs (primary + secondary care analysed) | **>50%** (often cited ~55% of analysed hospital/outpatient costs) | Health Foundation 2018 · Major Conditions Strategy |
| Share of primary-care prescription costs | **~75%** | Major Conditions Strategy · Health Foundation |
| Rough NHS spend attributable (order-of-magnitude) | **~£90bn** against 2022/23 budget framing | [Appt Health summary](https://www.appt-health.co.uk/blog/multimorbidity-explained-what-it-is-and-the-impact-on-the-nhs) citing Major Conditions Strategy |
| Extra hospital activity / cost if trends continue | **+14% activity, +£4bn** over 5 years | [Health Foundation](https://reader.health.org.uk/understanding-health-care-needs-people-multiple-health-conditions/the-complex-care-of-people-with-multiple-conditions) |
| People aged 65+ with ≥2 conditions | **~73%** (commonly cited) | Appt Health citing BJGP / population studies — verify for formal papers |
| 65+ population growth | **~+50%** over next ~20 years | ONS / Appt Health framing |

**Pitch line:** Multimorbidity is not a niche. It is already half the NHS’s work and most of its prescription spend — and it is growing with an ageing population.

---

## 2. The burden on the person and the GP

From the [Health Foundation analysis](https://www.health.org.uk/sites/default/files/upload/publications/2018/Understanding%20the%20health%20care%20needs%20of%20people%20with%20multiple%20health%20conditions.pdf) (2-year window):

| | 1 condition | 4+ conditions |
| --- | --- | --- |
| Primary-care consultations | **10.0** | **28.9** (~2.9×) |
| Face-to-face GP visits (subset) | — | **24.6** (~once a month) |
| Outpatient visits | **2.8** | **8.9** across **2.8 specialties** |
| Different medications prescribed | **5.6** | **20.6** |
| Extra GP time per consult despite complexity | — | **~+14 seconds** |

So: more visits, more specialties, more drugs — and almost no extra minutes in the room. That is the orchestration failure.

Also: in deprived areas, multimorbid patients often get **shorter** consultations ([BJGP](https://doi.org/10.3399/bjgp20x714029); [Annals of Family Medicine](https://www.annfammed.org/content/16/2/127)) — the inverse care law on top of complexity.

**Pitch line:** The GP is the orchestrator with ~10 minutes and 20 drugs. The patient is left as the integration layer between appointments. Homie fills the eleven weeks between them.

---

## 3. Why single-disease tools fail

Healthcare systems (and most apps) are still designed for **one condition at a time** ([Major Conditions Strategy](https://www.gov.uk/government/publications/major-conditions-strategy-case-for-change-and-our-strategic-framework/major-conditions-strategy-case-for-change-and-our-strategic-framework--2); [BMJ commentary](https://www.bmj.com/content/382/bmj.p1867)).

Cross-condition effects are where harm lives:

- A drug that helps condition A can worsen condition B (polypharmacy, prescribing cascades).
- Patients juggle conflicting advice from different specialists.
- Mental health commonly co-occurs with physical multimorbidity — another silo.

[BMJ](https://www.bmj.com/content/382/bmj.p1867): people with multimorbidity spend “a vast amount of time and energy accessing different services, complying with multiple complex treatment plans and coordinating care.” Roughly **one-third of hospital inpatients** have five or more conditions.

**Pitch line:** Every tool organises around a single disease. In multimorbidity the danger lives *between* conditions. Homie watches the whole person, not a specialty.

---

## 4. Why lupus / RA is the right first wedge

Homie’s first persona is lupus / rheumatoid arthritis — not because multimorbidity stops there, but because that cohort *is* multimorbidity:

| Finding | Source |
| --- | --- |
| People with SLE are **~3×** as likely to have multimorbidity as matched comparators (prevalent cohort) | [Rheumatology — Lupus Midwest Network](https://doi.org/10.1093/rheumatology/kead617) |
| Risk of developing multimorbidity after SLE onset **~2×** higher than comparators | Same |
| Multimorbidity often present **before** SLE classification | Same |
| SLE care is organ-siloed; multidisciplinary care is ideal but rarely available outpatient | [PMC systematic review](https://pmc.ncbi.nlm.nih.gov/articles/PMC10298977/) |
| Polypharmacy is common; raises interaction, adherence, cognitive and logistical burden | [ACR Open / polypharmacy in SLE](https://doi.org/10.1002/acr.25686) |

Weather/pressure and sleep are real, patient-visible drivers of bad days in inflammatory disease — Homie notices those without claiming to practise medicine.

**Pitch line:** We start where the orchestration pain is sharpest — autoimmune multimorbidity — with an architecture built for every next condition.

---

## 5. How Homie maps onto the evidence

| Evidence problem | Homie answer |
| --- | --- |
| Patient as unpaid care coordinator | One thread (iMessage / call / web) — no new app to fail |
| Eleven weeks of blank memory before clinic | Daily free-text → structured observations → printable report |
| 20+ meds, conflicting specialty advice | Logs what she took and how she felt — **never** advises a dose |
| GP has +14 seconds, not +14 minutes | Hands a one-page pressure/symptom/quote summary into the room |
| Systems built per disease | One patient identity, multi-channel, cross-signal (weather, sleep, words, calls) |
| Safety / MHRA risk if you “advise” | Deterministic red-flag bypass; no diagnosis, no triage decisions, no flare-as-prescription |
| Care coordinators exist but don’t scale to daily life | Homie is the between-appointment layer; clinicians stay the decision-makers |

What Homie deliberately is **not**: a medical device that recommends treatment, a flare oracle, or another specialty silo.

---

## 6. One-minute verbal argument

> One in four adults in England lives with two or more long-term conditions. They drive about half of NHS activity and over half of costs — on the order of ninety billion pounds. People with four or more conditions see their GP nearly three times as often as someone with one condition, across multiple specialties, on twenty different meds — and get almost no extra time in the appointment.
>
> The GP is the orchestrator. The patient is currently the integration layer. That’s the bottleneck.
>
> Homie takes the integration job off her hands: one continuous check-in across text and voice, sleep and weather in the picture, and one page for the consultant. It notices. It doesn’t advise. That’s how you help multimorbidity without pretending to replace the NHS.

---

## 7. Source list (cite these)

1. **DHSC — Major Conditions Strategy: case for change**  
   https://www.gov.uk/government/publications/major-conditions-strategy-case-for-change-and-our-strategic-framework/major-conditions-strategy-case-for-change-and-our-strategic-framework--2

2. **Health Foundation (2018) — Understanding the health care needs of people with multiple health conditions**  
   https://www.health.org.uk/sites/default/files/upload/publications/2018/Understanding%20the%20health%20care%20needs%20of%20people%20with%20multiple%20health%20conditions.pdf  
   Reader: https://reader.health.org.uk/understanding-health-care-needs-people-multiple-health-conditions/the-complex-care-of-people-with-multiple-conditions

3. **BMJ — The major conditions strategy—just another NHS plan?**  
   https://www.bmj.com/content/382/bmj.p1867

4. **Appt Health — Multimorbidity explained (accessible summary + NHS cost framing)**  
   https://www.appt-health.co.uk/blog/multimorbidity-explained-what-it-is-and-the-impact-on-the-nhs

5. **BJGP — consultation length, multimorbidity, deprivation**  
   https://doi.org/10.3399/bjgp20x714029

6. **Annals of Family Medicine — multimorbidity & deprivation in consultations**  
   https://www.annfammed.org/content/16/2/127

7. **Rheumatology — Multimorbidity in SLE (Lupus Midwest Network)**  
   https://doi.org/10.1093/rheumatology/kead617

8. **Polypharmacy in adults with SLE**  
   https://doi.org/10.1002/acr.25686

9. **Multidisciplinary SLE care — systematic review**  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC10298977/

---

*Homie never claims to reduce NHS spend by itself. The argument is product-market fit: the system’s biggest cost and complexity pool is multimorbidity, and Homie is built for the seam the system leaves empty — the patient’s daily life between appointments.*
