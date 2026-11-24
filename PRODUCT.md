# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Chosen with the user. Yarn monorepo; React and TypeScript frontends (three apps); NestJS backend with WebSockets; PostgreSQL with PostGIS; self-hosted OSRM routing and map tiles on real OpenStreetMap data; Stripe in test mode. Hosting is $0: frontends on Cloudflare Pages, backend, database and routing home-hosted behind a tunnel for now, with an always-on landing page and a recorded demo for when the host machine is off. Oracle Always Free is a possible later upgrade. See `docs/adr/0001-per-app-sandbox.md` for the Sandbox decision.

## Users
Primary: recruiters and hiring managers evaluating the owner's engineering and product skills. They arrive from the owner's existing portfolio site, usually on a desktop, and want to try the product quickly without setup or a second person.

Inside the demo, visitors act as the three roles (Rider, Driver, Admin), each in its own app.

## Product Purpose
Thirrem is a simulated ride-hailing marketplace in the spirit of Uber and Lyft, built solo as a portfolio piece. It exists to show full-stack depth, real-time systems, maps and geolocation, payments and UX, in a thorough, fully testable form. No real people, vehicles or money are involved. Success is a visitor completing the full loop in a few minutes and believing the engineering behind it.

## Positioning
A ride-hailing platform a visitor can run entirely alone: three independent apps, each with a private, continuously simulated world on a real map of Gjakova, Kosovo (Prishtina as fallback), where every function can be tested and awkward cases can be forced on demand.

## Operating Context
- Three separate web apps, each with its own landing page, signup and Sandbox: Rider, Driver, Admin. Desktop-first; visitors open three windows to try all three.
- A Sandbox is a private, self-contained simulation per visitor and app. It starts on use, stops after 15 minutes of inactivity, is discarded after 24 hours, and at most 30 run at once. Accounts persist; there is no guest mode. Riders confirm their email address through a verification email sent over Google SMTP from a dedicated Gmail account (see `docs/adr/0002-email-verification-via-google-smtp.md`, issue #30).
- Rides run in real time by default, with other speed options. Each app has a simulation controls panel to force events (declines, cancellations, payment failure, SOS, a Driver going offline).
- Ride Requests broadcast to Available Drivers of the requested Vehicle Type, chosen by quadtree cells plus neighbours (at least 5 Drivers, 20-second accept window, widening to the parent cell on timeout). The first Driver to accept wins.
- Pickup and drop-off use named places or a pin the user drops, because street names are incomplete in OpenStreetMap.

## Capabilities and Constraints
- Core: Ride Requests, matching, live tracking, Fare, card payment (Stripe test mode), mutual ratings.
- Ride options: Economy, Comfort and XL Vehicle Types; Shared Rides (chosen per Ride Request); Scheduled Ride Requests.
- Driver side: online and offline, onboarding approved by a simulated Admin, a simulated earnings ledger with a 20% platform commission and a fake cash-out.
- Trust: real-time chat (simulated actors reply with canned messages), SOS that raises an incident for the Admin, receipts.
- Admin: user management, Driver approval, live fleet map, disputes and refunds, analytics, on a seeded and continuously active simulation.
- Out: surge pricing, promo codes, tips, cancellation fees, cash payments, guest mode, social login, native or PWA apps. UI is English only for v1 (Albanian possible later); Fares in EUR, distances in km.
- Constraints: $0 budget and no cloud card on file. The first build milestone is a routing test on Gjakova data, falling back to Prishtina or fixing OSM tags if routes are wrong.
- Domain vocabulary lives in `GLOSSARY.md`.
- Open: Fare rates per Vehicle Type, final quadtree and timing parameters (tunable after load testing), the demo's name and domain, and the Albanian translation.

## Brand Commitments
The name is Thirrem. No logo, voice or visual identity has been set.

## Evidence on Hand
None beyond the owner's existing portfolio site, which links to this project. No real rides, users, drivers or payments exist or may be claimed. Future work must not invent customers, metrics, testimonials or performance figures.

## Product Principles
- Self-contained first: any visitor can test every function alone, so the simulation must feel alive without a second person.
- Real where it counts: real map, real routing, real payments flow in test mode. Simulate only people and money.
- Let visitors reach awkward cases on demand instead of waiting for them.
- Never present the simulation as a real service, and never fabricate usage or credentials.
- Record undecided facts as open instead of guessing them.

## Accessibility & Inclusion
No product-specific requirement has been established. Desktop-first by decision, and English only for v1.
