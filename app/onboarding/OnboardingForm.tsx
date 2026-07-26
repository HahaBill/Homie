"use client";

import { useState } from "react";
import { PhoneCall } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

const CONDITION_OPTIONS = [
  "Rheumatoid arthritis",
  "Lupus",
  "Diabetes",
  "Asthma",
  "Fibromyalgia",
  "Chronic pain",
  "Migraine",
  "Crohn's / IBD",
  "Multiple sclerosis",
  "Other",
];

const SYMPTOM_OPTIONS = [
  "Pain",
  "Fatigue",
  "Joint swelling",
  "Stiffness",
  "Brain fog",
  "Poor sleep",
  "Headaches",
  "Breathlessness",
  "Digestive symptoms",
  "Low mood",
  "Anxiety",
  "Other",
];

const CARE_OPTIONS = [
  "GP / primary care",
  "Specialist",
  "Rheumatology team",
  "Pharmacist",
  "Nurse",
  "Other",
  "I'm not sure",
];

const GENDER_OPTIONS = ["woman", "man", "non-binary", "self-describe"];

const BASELINE_LABELS: Record<string, { label: string; help: string }> = {
  "1": { label: "Very well", help: "Most days feel manageable." },
  "2": {
    label: "Mostly okay",
    help: "Some symptoms, but they usually stay in the background.",
  },
  "3": { label: "Okay", help: "A mixed baseline: not awful, not easy." },
  "4": { label: "Often hard", help: "Symptoms often shape the day." },
  "5": { label: "Very unwell", help: "Most days need extra care or support." },
};

type InitialOnboardingProfile = {
  call_phone?: string;
  date_of_birth?: string;
  gender?: string;
  height_cm?: number;
  weight_kg?: number;
  conditions?: string[];
  primary_condition?: string;
  symptoms?: string[];
  baseline_feeling?: number;
  bad_day?: string;
  remember?: string;
  care_contact?: string;
  country?: string;
};

type InitialOnboarding = {
  name?: string | null;
  consent_at?: string | null;
  call_consent_at?: string | null;
  transcript_consent_at?: string | null;
  onboarding_profile?: InitialOnboardingProfile | null;
};

export default function OnboardingForm({
  initial,
}: {
  initial?: InitialOnboarding;
}) {
  const profile = initial?.onboarding_profile ?? {};
  const savedGender = profile.gender ?? "";
  const savedGenderIsOption = GENDER_OPTIONS.includes(savedGender);
  const [name, setName] = useState(initial?.name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth ?? "");
  const [gender, setGender] = useState(
    savedGender && !savedGenderIsOption ? "self-describe" : savedGender,
  );
  const [genderSelfDescribe, setGenderSelfDescribe] = useState(
    savedGender && !savedGenderIsOption ? savedGender : "",
  );
  const [heightCm, setHeightCm] = useState(profile.height_cm ? String(profile.height_cm) : "");
  const [weightKg, setWeightKg] = useState(profile.weight_kg ? String(profile.weight_kg) : "");
  const [heightUnit, setHeightUnit] = useState<"metric" | "imperial">("metric");
  const [weightUnit, setWeightUnit] = useState<"metric" | "imperial">("metric");
  const initialHeightInches = profile.height_cm ? Math.round(profile.height_cm / 2.54) : 0;
  const [heightFeet, setHeightFeet] = useState(initialHeightInches ? String(Math.floor(initialHeightInches / 12)) : "");
  const [heightInches, setHeightInches] = useState(initialHeightInches ? String(initialHeightInches % 12) : "");
  const [weightLb, setWeightLb] = useState(
    profile.weight_kg ? String(Math.round(profile.weight_kg * 2.20462 * 10) / 10) : "",
  );
  const [conditions, setConditions] = useState<string[]>(profile.conditions ?? []);
  const [otherCondition, setOtherCondition] = useState("");
  const [primaryCondition, setPrimaryCondition] = useState(profile.primary_condition ?? "");
  const [symptoms, setSymptoms] = useState<string[]>(profile.symptoms ?? []);
  const [otherSymptom, setOtherSymptom] = useState("");
  const [baselineFeeling, setBaselineFeeling] = useState(String(profile.baseline_feeling ?? 3));
  const [badDay, setBadDay] = useState(profile.bad_day ?? "");
  const [remember, setRemember] = useState(profile.remember ?? "");
  const [careContact, setCareContact] = useState(profile.care_contact ?? "");
  const [country, setCountry] = useState(profile.country ?? "United Kingdom");
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medSchedule, setMedSchedule] = useState("");
  const [briefing, setBriefing] = useState(initial?.consent_at !== null);
  const [calls, setCalls] = useState(Boolean(initial?.call_consent_at));
  const [transcripts, setTranscripts] = useState(initial?.transcript_consent_at !== null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(
    list: string[],
    value: string,
    setter: (next: string[]) => void,
  ) {
    setter(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    );
  }

  function numberOrUndefined(value: string) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const typedPhone =
        window.sessionStorage.getItem("homie:onboarding-phone") ||
        (document.getElementById("phone") as HTMLInputElement | null)?.value ||
        undefined;
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          onboarding_profile: {
            call_phone: typedPhone,
            date_of_birth: dateOfBirth || undefined,
            gender:
              gender === "self-describe"
                ? genderSelfDescribe.trim() || undefined
                : gender || undefined,
            height_cm: numberOrUndefined(heightCm),
            weight_kg: numberOrUndefined(weightKg),
            conditions: [
              ...conditions.filter((c) => c !== "Other"),
              ...(otherCondition.trim() ? [otherCondition.trim()] : []),
            ],
            primary_condition: primaryCondition || undefined,
            symptoms: [
              ...symptoms.filter((s) => s !== "Other"),
              ...(otherSymptom.trim() ? [otherSymptom.trim()] : []),
            ],
            baseline_feeling: Number(baselineFeeling),
            bad_day: badDay || undefined,
            remember: remember || undefined,
            care_contact: careContact || undefined,
            country: country || undefined,
          },
          medication_name: medName || undefined,
          medication_dose: medDose || undefined,
          medication_schedule: medSchedule || undefined,
          morning_briefing: briefing,
          call_consent: calls,
          transcript_consent: transcripts,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(
          d.error ?? "That did not save. Give it a moment and try again.",
        );
        return;
      }
      if (calls) {
        const callStarted = await fetch("/api/onboarding/intro-call", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: typedPhone }),
        })
          .then((response) => response.ok)
          .catch(() => false);
        window.location.assign(
          callStarted
            ? "/live?calling=1"
            : "/dashboard?onboarding=saved&call=failed",
        );
        return;
      }
      window.location.assign("/dashboard?onboarding=saved");
    } catch {
      setNotice("That did not save. Give it a moment and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>A little about you</h1>
      <p className="lede" style={{ fontSize: 18 }}>
        A calm setup for the first call. Skip anything you do not want Homie to
        remember.
      </p>

      <form onSubmit={submit}>
        <div className="onboarding-section">
          <span className="mono">BASICS</span>

          <div className="field">
            <Label className="field-label" htmlFor="ob-name">
              What should Homie call you
            </Label>
            <Input
              id="ob-name"
              className="homie-input"
              type="text"
              autoComplete="given-name"
              placeholder="first name is plenty"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="field">
            <Label className="field-label" htmlFor="ob-dob">
              Date of birth
            </Label>
            <Input
              id="ob-dob"
              className="homie-input"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="field">
            <Label className="field-label" htmlFor="ob-gender">
              How do you describe your gender
            </Label>
            <Select
              value={gender || "prefer-not"}
              onValueChange={(value) =>
                setGender(value === "prefer-not" ? "" : value)
              }
              disabled={busy}
            >
              <SelectTrigger id="ob-gender" className="homie-select-trigger">
                <SelectValue placeholder="Prefer not to say" />
              </SelectTrigger>
              <SelectContent className="homie-select-content">
                <SelectItem value="prefer-not">Prefer not to say</SelectItem>
                <SelectItem value="woman">Woman</SelectItem>
                <SelectItem value="man">Man</SelectItem>
                <SelectItem value="non-binary">Non-binary</SelectItem>
                <SelectItem value="self-describe">
                  Prefer to self-describe
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {gender === "self-describe" ? (
            <div className="field">
              <Label className="field-label" htmlFor="ob-gender-self">
                Your words
              </Label>
              <Input
                id="ob-gender-self"
                className="homie-input"
                type="text"
                value={genderSelfDescribe}
                onChange={(e) => setGenderSelfDescribe(e.target.value)}
                disabled={busy}
              />
            </div>
          ) : null}
        </div>

        <div className="onboarding-section">
          <span className="mono">BODY PROFILE</span>

          <div className="two-fields">
            <div className="field">
              <div className="field-heading">
                <Label className="field-label" htmlFor="ob-height">Height</Label>
                <select
                  className="unit-select"
                  aria-label="Height units"
                  value={heightUnit}
                  onChange={(event) => {
                    const unit = event.target.value as "metric" | "imperial";
                    if (unit === "imperial" && heightCm) {
                      const total = Math.round(Number(heightCm) / 2.54);
                      setHeightFeet(String(Math.floor(total / 12)));
                      setHeightInches(String(total % 12));
                    }
                    setHeightUnit(unit);
                  }}
                  disabled={busy}
                >
                  <option value="metric">cm</option>
                  <option value="imperial">ft / in</option>
                </select>
              </div>
              {heightUnit === "metric" ? (
                <Input
                  id="ob-height"
                  className="homie-input"
                  type="number"
                  inputMode="decimal"
                  min="60"
                  max="260"
                  placeholder="cm"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  disabled={busy}
                />
              ) : (
                <div className="imperial-inputs">
                  <Input
                    id="ob-height"
                    className="homie-input"
                    type="number"
                    min="2"
                    max="8"
                    aria-label="Height in feet"
                    placeholder="ft"
                    value={heightFeet}
                    onChange={(event) => {
                      const value = event.target.value;
                      setHeightFeet(value);
                      setHeightCm(
                        value || heightInches
                          ? String(Math.round((Number(value || 0) * 12 + Number(heightInches || 0)) * 2.54 * 10) / 10)
                          : "",
                      );
                    }}
                    disabled={busy}
                  />
                  <Input
                    className="homie-input"
                    type="number"
                    min="0"
                    max="11"
                    aria-label="Additional height in inches"
                    placeholder="in"
                    value={heightInches}
                    onChange={(event) => {
                      const value = event.target.value;
                      const inches = Math.min(11, Number(value || 0));
                      setHeightInches(value);
                      setHeightCm(
                        value || heightFeet
                          ? String(Math.round((Number(heightFeet || 0) * 12 + inches) * 2.54 * 10) / 10)
                          : "",
                      );
                    }}
                    disabled={busy}
                  />
                </div>
              )}
            </div>
            <div className="field">
              <div className="field-heading">
                <Label className="field-label" htmlFor="ob-weight">Weight</Label>
                <select
                  className="unit-select"
                  aria-label="Weight units"
                  value={weightUnit}
                  onChange={(event) => {
                    const unit = event.target.value as "metric" | "imperial";
                    if (unit === "imperial" && weightKg) {
                      setWeightLb(String(Math.round(Number(weightKg) * 2.20462 * 10) / 10));
                    }
                    setWeightUnit(unit);
                  }}
                  disabled={busy}
                >
                  <option value="metric">kg</option>
                  <option value="imperial">lb</option>
                </select>
              </div>
              <Input
                id="ob-weight"
                className="homie-input"
                type="number"
                inputMode="decimal"
                min={weightUnit === "metric" ? "20" : "44"}
                max={weightUnit === "metric" ? "350" : "772"}
                placeholder={weightUnit === "metric" ? "kg" : "lb"}
                value={weightUnit === "metric" ? weightKg : weightLb}
                onChange={(event) => {
                  const value = event.target.value;
                  if (weightUnit === "metric") {
                    setWeightKg(value);
                  } else {
                    setWeightLb(value);
                    setWeightKg(value ? String(Math.round((Number(value) / 2.20462) * 10) / 10) : "");
                  }
                }}
                disabled={busy}
              />
            </div>
          </div>
        </div>

        <div className="onboarding-section">
          <span className="mono">HEALTH PROFILE</span>

          <div className="field">
            <Label className="field-label" htmlFor="ob-primary-condition">
              Which condition affects you most day to day
            </Label>
            <Input
              id="ob-primary-condition"
              className="homie-input"
              type="text"
              placeholder="e.g. rheumatoid arthritis"
              value={primaryCondition}
              onChange={(e) => setPrimaryCondition(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="field">
            <Label className="field-label">
              Any long-term conditions Homie should know about
            </Label>
            <div className="choice-grid">
              {CONDITION_OPTIONS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  className={`choice-pill${conditions.includes(option) ? " selected" : ""}`}
                  aria-pressed={conditions.includes(option)}
                  disabled={busy}
                  onClick={() => toggle(conditions, option, setConditions)}
                >
                  <span className="choice-radio" aria-hidden="true" />
                  <span>{option}</span>
                </Button>
              ))}
            </div>
          </div>

          {conditions.includes("Other") ? (
            <div className="field">
              <Label className="field-label" htmlFor="ob-condition-other">
                Add another condition
              </Label>
              <Input
                id="ob-condition-other"
                className="homie-input"
                type="text"
                value={otherCondition}
                onChange={(e) => setOtherCondition(e.target.value)}
                disabled={busy}
              />
            </div>
          ) : null}

          <div className="field">
            <Label className="field-label">
              Symptoms that tend to bother you most
            </Label>
            <div className="choice-grid">
              {SYMPTOM_OPTIONS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  className={`choice-pill${symptoms.includes(option) ? " selected" : ""}`}
                  aria-pressed={symptoms.includes(option)}
                  disabled={busy}
                  onClick={() => toggle(symptoms, option, setSymptoms)}
                >
                  <span className="choice-radio" aria-hidden="true" />
                  <span>{option}</span>
                </Button>
              ))}
            </div>
          </div>

          {symptoms.includes("Other") ? (
            <div className="field">
              <Label className="field-label" htmlFor="ob-symptom-other">
                Add another symptom
              </Label>
              <Input
                id="ob-symptom-other"
                className="homie-input"
                type="text"
                value={otherSymptom}
                onChange={(e) => setOtherSymptom(e.target.value)}
                disabled={busy}
              />
            </div>
          ) : null}
        </div>

        <div className="onboarding-section">
          <span className="mono">NORMAL FOR ME</span>

          <div className="field">
            <Label className="field-label">
              On an average day, how are you usually feeling
            </Label>
            <div className="baseline-control">
              <div>
                <strong>{BASELINE_LABELS[baselineFeeling].label}</strong>
                <p>{BASELINE_LABELS[baselineFeeling].help}</p>
              </div>
              <span className="baseline-score">{baselineFeeling}/5</span>
            </div>
            <Slider
              value={[Number(baselineFeeling)]}
              min={1}
              max={5}
              step={1}
              onValueChange={([value]) => setBaselineFeeling(String(value))}
              disabled={busy}
              className="homie-slider"
            />
            <div className="scale-track" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((value) => (
                <span
                  key={value}
                  className={`scale-tick${Number(baselineFeeling) === value ? " active" : ""}`}
                >
                  <i />
                  <b>{value}</b>
                </span>
              ))}
            </div>
            <div className="range-label">
              <span>Very well</span>
              <span>Okay</span>
              <span>Very unwell</span>
            </div>
          </div>

          <div className="field">
            <Label className="field-label" htmlFor="ob-bad-day">
              What does a bad day usually look like
            </Label>
            <Textarea
              id="ob-bad-day"
              className="homie-textarea"
              rows={3}
              placeholder="e.g. my hands swell, I get exhausted and need to rest"
              value={badDay}
              onChange={(e) => setBadDay(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="field">
            <Label className="field-label" htmlFor="ob-remember">
              Anything you want Homie to remember when checking in
            </Label>
            <Textarea
              id="ob-remember"
              className="homie-textarea"
              rows={3}
              placeholder="e.g. fatigue is worse in the afternoons"
              value={remember}
              onChange={(e) => setRemember(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="onboarding-section">
          <span className="mono">CARE CONTEXT</span>

          <div className="field">
            <Label className="field-label" htmlFor="ob-care">
              Who do you normally speak to when you need help
            </Label>
            <Select
              value={careContact || "none"}
              onValueChange={(value) =>
                setCareContact(value === "none" ? "" : value)
              }
              disabled={busy}
            >
              <SelectTrigger id="ob-care" className="homie-select-trigger">
                <SelectValue placeholder="Choose if useful" />
              </SelectTrigger>
              <SelectContent className="homie-select-content">
                <SelectItem value="none">Choose if useful</SelectItem>
                {CARE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="field">
            <Label className="field-label" htmlFor="ob-country">
              Country you are currently in
            </Label>
            <Input
              id="ob-country"
              className="homie-input"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="onboarding-section">
          <span className="mono">MEDICATION CONTEXT</span>

          <div className="field">
            <Label className="field-label" htmlFor="ob-med">
              A medication to keep in mind, if you like
            </Label>
            <Input
              id="ob-med"
              className="homie-input"
              type="text"
              placeholder="e.g. naproxen"
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
              disabled={busy}
            />
          </div>

          {medName.trim() ? (
            <>
              <div className="field">
                <Label className="field-label" htmlFor="ob-dose">
                  Dose, as written on the box
                </Label>
                <Input
                  id="ob-dose"
                  className="homie-input"
                  type="text"
                  placeholder="e.g. 250mg"
                  value={medDose}
                  onChange={(e) => setMedDose(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="field">
                <Label className="field-label" htmlFor="ob-sched">
                  When you usually take it
                </Label>
                <Input
                  id="ob-sched"
                  className="homie-input"
                  type="text"
                  placeholder="e.g. with breakfast"
                  value={medSchedule}
                  onChange={(e) => setMedSchedule(e.target.value)}
                  disabled={busy}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="onboarding-section">
          <span className="mono">CONSENT</span>

          <label className="consent-row" htmlFor="ob-briefing">
            <Checkbox
              id="ob-briefing"
              checked={briefing}
              onCheckedChange={(checked) => setBriefing(checked === true)}
              disabled={busy}
              className="homie-checkbox consent-checkbox"
            />
            <span>
              Text me a morning briefing — pressure, heat and sun for the day,
              read against what is normal for me. One a morning at most, and
              replying STOP always works.
            </span>
          </label>

          <label className="consent-row" htmlFor="ob-calls">
            <Checkbox
              id="ob-calls"
              checked={calls}
              onCheckedChange={(checked) => setCalls(checked === true)}
              disabled={busy}
              className="homie-checkbox consent-checkbox"
            />
            <span>
              I agree to receive calls from Homie at my verified number.
            </span>
          </label>

          <label className="consent-row" htmlFor="ob-transcripts">
            <Checkbox
              id="ob-transcripts"
              checked={transcripts}
              onCheckedChange={(checked) => setTranscripts(checked === true)}
              disabled={busy}
              className="homie-checkbox consent-checkbox"
            />
            <span>
              I agree that Homie may save transcripts and summaries of my
              conversations so it can remember previous check-ins.
            </span>
          </label>
        </div>

        <p className="auth-note">
          Homie notices patterns and asks questions. It never diagnoses, never
          predicts a flare, and never changes a dose — what to do about a
          pattern is a conversation for you and your own clinician.
        </p>

        {notice ? (
          <p className="auth-note" role="status">
            {notice}
          </p>
        ) : null}

        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Button className="btn btn-primary" type="submit" disabled={busy}>
            <PhoneCall size={18} />
            {busy ? "Saving…" : "That's me"}
          </Button>
          <a className="btn btn-quiet" href="/dashboard">
            skip for now
          </a>
        </div>
      </form>
    </div>
  );
}
