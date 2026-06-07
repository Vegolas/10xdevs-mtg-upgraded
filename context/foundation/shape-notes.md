---
project: "DeckDelta"
context_type: greenfield
created: 2026-05-28
updated: 2026-05-28
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain type"
      decision: "workflow friction + missing capability — existing tools show diffs but don't understand card types or integrate pricing"
    - topic: "primary persona"
      decision: "Commander/EDH player upgrading precons or budget decks"
    - topic: "insight"
      decision: "the diff is the wrong abstraction — players need an upgrade plan grouped by card function with price context"
    - topic: "auth model"
      decision: "local profile — browser storage, no server, no login; past comparisons can be revisited"
    - topic: "role separation"
      decision: "flat single-user model, no roles"
  frs_drafted: 9
  quality_check_status: accepted
---

## Vision & Problem Statement

Commander/EDH players who want to upgrade a precon or budget deck toward a target list face a tedious manual process — comparing two deck lists side by side in a text editor or spreadsheet to figure out what to swap in and out. They lose track of what changed and why, and have no visibility into the cost of the upgrade.

Existing tools (Archidekt, Moxfield) can show a raw diff of two lists, but they don't understand card types, don't integrate pricing, and don't frame the output as an actionable upgrade plan. The result is "add card X, remove card Y" — not "cut these 3 lands and 2 creatures, add these better alternatives, total upgrade cost: $X." The insight is that the diff itself is the wrong abstraction. Players need an upgrade plan: swaps grouped by card function (lands, creatures, instants, sorceries, artifacts, enchantments), with price context, so they can prioritize purchases and understand the strategic shape of the upgrade.

## User & Persona

**Primary persona:** A Commander/EDH player upgrading a precon or budget deck. They found a target deck list online (EDHRec, a content creator's list, or a friend's deck) and want to plan the upgrade path — what to buy, what to cut, grouped by card function. They are comfortable with text-based deck lists (the standard MTG deck-list format) and want to move quickly from "I found a better list" to "here's my shopping list."

## Access Control

Single user; no auth; data lives on-device only (browser local storage). No roles, no login flow. Past comparisons are persisted locally for revisiting but never leave the browser.

## Success Criteria

### Primary
- User pastes two Commander deck lists (base and target) and automatically receives a grouped upgrade plan showing cards to remove and cards to add — organized by card type (lands, creatures, instants, sorceries, artifacts, enchantments) — with card images and prices from Scryfall, plus the total upgrade cost.

### Secondary
- Past comparisons are saved locally (browser storage) so the user can revisit a previous upgrade plan without re-pasting the lists.

### Guardrails
- Card data accuracy: card names, types, images, and prices must match Scryfall's canonical data. Misidentified cards make the tool untrustworthy.
- Graceful input handling: malformed or unrecognized deck list entries must produce clear error messages, not crashes or blank output.

## Functional Requirements

### Deck Input
- FR-001: User can paste a base deck list as text. Priority: must-have
  > Socrates: Counter-argument considered: "text paste is fragile — users will paste in wrong formats from different sources (MTGO, Arena, Moxfield)." Resolution: kept; parsing must handle common format variations rather than requiring one specific format.
- FR-002: User can paste a target deck list as text. Priority: must-have
  > Socrates: Same concern as FR-001 — format fragility applies equally. Same resolution: robust parsing across common formats.

### Comparison
- FR-003: User sees the upgrade plan automatically when both deck lists have valid content. Priority: must-have
  > Socrates: Counter-argument considered: "a manual 'compare' button adds an unnecessary click." Resolution: revised to auto-compare — the upgrade plan renders automatically once both text areas contain valid deck list content, eliminating the button.

### Upgrade Plan Display
- FR-004: User can view the upgrade plan grouped by card type (lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers). Priority: must-have
  > Socrates: No counter-argument; it stands as written. Card type is the standard MTG mental model and the right grouping for MVP.
- FR-005: User can see card images for each card in the upgrade plan. Priority: must-have
  > Socrates: Counter-argument considered: "images slow down the page significantly when loading 100+ cards from Scryfall." Resolution: kept; images are core to the MTG tool experience. Performance mitigation (lazy loading, thumbnails) is an implementation concern, not a product concern.
- FR-006: User can see prices for each card in the upgrade plan. Priority: must-have
  > Socrates: Counter-argument considered: "prices are volatile and stale quickly." Resolution: kept; prices are explicitly informational/approximate. Users understand MTG prices fluctuate.
- FR-007: User can see the total upgrade cost. Priority: must-have
  > Socrates: Counter-argument considered: "European vs American prices differ significantly — the cost is only for eye-measuring, not a concrete purchase price that varies by vendor." Resolution: kept with explicit framing as approximate/indicative pricing. The total is a ballpark, not a quote.
- FR-008: User can see cards shared between both decks (unchanged cards). Priority: must-have
  > Socrates: Counter-argument considered: "shared cards should be collapsed by default to avoid burying the diff in 70+ unchanged cards." Resolution: kept with UX note — shared cards displayed collapsed/expandable by default so they don't dominate the view.

### Persistence
- FR-009: User can save and revisit past comparisons from local browser storage. Priority: nice-to-have
  > Socrates: Counter-argument considered: "local storage is fragile — clearing browser data loses everything." Resolution: kept as nice-to-have; the fragility is accepted for MVP simplicity. No false promise of durability.

## User Stories

### US-01: User generates an upgrade plan from two deck lists

- **Given** a user with a base Commander deck list and a target deck list
- **When** they paste both lists (the upgrade plan generates automatically)
- **Then** they see an upgrade plan showing:
    - Cards to remove, grouped by type (lands, creatures, instants, etc.)
    - Cards to add, grouped by type, with images and prices
    - Cards shared between both decks
    - Total upgrade cost

#### Acceptance Criteria
- Both deck lists accept standard MTG text format (e.g., "1 Sol Ring")
- Card types are resolved via Scryfall API
- Cards with unrecognized names show a clear error, not silent omission
- Grouping covers at minimum: lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers

## Business Logic

The app resolves each card's identity (type, image, price) from its name and organizes the diff between two deck lists by card function.

The rule consumes two user-facing inputs: a base deck list and a target deck list, both as plain text containing card names with quantities. It resolves each card name against a canonical card database (Scryfall) to obtain the card's type line, image, and approximate market price. It then computes the set difference — cards present only in the base list (removals), cards present only in the target list (additions), and cards present in both (shared). The output groups removals and additions by card type (lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers) and attaches the resolved image and price to each card. The user encounters the output as a structured upgrade plan that appears automatically once both deck lists are pasted, with a total approximate upgrade cost derived from the sum of addition prices.

Prices are explicitly approximate and informational — European and American markets differ significantly, and the actual cost depends on the vendor chosen by the user. The total is a ballpark for eye-measuring, not a purchase quote.

## Non-Functional Requirements

- The product remains usable on the latest versions of Chrome, Firefox, Edge, and Safari. No install, extension, or plugin required — it runs entirely in the browser.
- No user data (deck lists, comparisons, preferences) leaves the browser except for Scryfall API lookups by card name. The app does not operate a backend server that receives or stores user content.

## Non-Goals

- No URL-based deck import (Archidekt, Moxfield, EDHRec links). MVP is text-paste only — each platform's API is a separate integration effort that doesn't prove the core upgrade-planning value.
- No multi-user features (sharing upgrade plans, public links, collaboration). This is a single-user local tool.
- No mobile-optimized responsive design. Desktop-first; a functional but unoptimized mobile experience is acceptable for MVP.
