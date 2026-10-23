# VitalNest — Family Health Tracker

A mobile-first app for families managing **Type 1 diabetes, Type 2 diabetes, and Type 2 diabetes with heart conditions**.
Built by Advankart Solutions. Runs as a website (Vercel), as an installable web app, and as an Android APK.

## Features
- **Vitals** — blood sugar (with fasting / after-meal context), BP + pulse, heart rate, weight, SpO₂, temperature, HbA1c. Date & time are logged automatically.
- **Smart status** — every reading is colour-coded against personal targets, with plain-language guidance for lows/highs.
- **Trends** — sugar chart with target band, time-in-range, estimated HbA1c, average by time of day, BP/pulse/weight charts, adherence, calories and water.
- **Medicines** — schedule by time and weekday, mark doses taken, stock countdown and refill alerts.
- **Reminders** — local alarms on Android (work offline, app closed) for medicines and measurements, with "Mark taken" / "Snooze" buttons.
- **Food** — 224+ Indian foods with calories, carbs, protein and GI hints, packaged-food search (Open Food Facts), custom family foods.
- **Water** — quick-add glasses with daily goal.
- **Health reports** — upload photos/PDFs of lab reports, prescriptions, scans (private storage).
- **Family** — multiple patient profiles with full personal & medical details; each family member has their own username + password; roles: Admin, Caregiver, Viewer; live updates.
- **Share** — WhatsApp summary card (image) and formatted message, PDF doctor report with charts, Excel workbook (8 sheets), CSV.
- Light & dark mode, offline-capable PWA.

## Stack
React 19 + TypeScript + Vite + Tailwind CSS 4 · Recharts · Supabase (Auth, Postgres with Row-Level Security, Storage, Realtime) · Capacitor 8 (Android) · Vercel hosting · GitHub Actions builds the APK.

## Setup
See **[docs/SETUP.md](docs/SETUP.md)** for the step-by-step guide (Supabase → GitHub → Vercel → APK).

## Local development
```bash
cp .env.example .env.local   # add your Supabase URL + anon key
npm install
npm run dev
```
Without keys the app offers a **demo mode** with sample data stored only in the browser.

> VitalNest is a personal record-keeping tool and does not provide medical diagnosis.
