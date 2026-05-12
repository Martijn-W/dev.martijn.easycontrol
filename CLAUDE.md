# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bosch EasyControl** is a Homey app that integrates with the Bosch EasyControl CT200 thermostat and ETRV (electronic thermostatic radiator valve) devices. It supports two connectivity protocols: XMPP (legacy) and HTTPS (modern OAuth2-based), with separate device/driver implementations for each.

## Common Commands

```bash
# Validate and build (preferred — runs tsc + Homey-specific validation)
homey app validate

# Lint code
npm run lint

# Install dependencies
npm install
```

Use `homey app validate` instead of `npm run build` to verify changes. It runs the TypeScript build internally and also performs Homey-specific validation (app.json structure, flow card IDs, capability definitions, etc.).

The build output goes to `.homeybuild/`, which is Homey's expected format for app deployment.

## Architecture Overview

### High-Level Data Flow

```
Bosch EasyControl System (CT200 + ETRV devices)
                |
    +----------------------------------+
    |   Client Abstraction Layer       |
    |  (src/bosch/client.ts)           |
    +----------------------------------+
    | - Abstract Client base class     |
    | - XmppClient implementation      |
    | - HttpClient implementation      |
    +----------------------------------+
                |
    +----------------------------------+
    |   Bosch XMPP Library             |
    |  (bosch-xmpp-client npm pkg)     |
    +----------------------------------+
                |
         Network (XMPP / HTTPS)
```

### Core Layers

**1. Device Layer** (`src/devices/`)
- `Ct200BaseDevice` and `Ct200BaseDriver` contain all shared sync logic, capability registration, and error handling. Protocol-specific subclasses (`ct200/`, `ct200https/`) only override `getNewClient()`, `getDeviceSettings()`, and `getConnectionSettings()`.
- The sync cycle polls device state at a configurable interval (default 30s). On 2+ consecutive failures it throws `ApiFailureThresholdError`, marks the device unavailable, and backs off to a 60s retry.
- `etrv/` devices look up their parent CT200 via `ThermostatManager` (a serial-number registry) and delegate all API calls to it.

**2. Bosch Integration Layer** (`src/bosch/`)
- `client.ts` — Abstract base defining all API methods matching the `Endpoint` enum.
- `xmppClient.ts` — Wraps `bosch-xmpp-client` npm package; XMPP-based.
- `httpClient.ts` — HTTPS/OAuth2 implementation; emits `tokenUpdated` events when tokens are refreshed so the device can persist them to settings.
- `models/` — Typed DTOs: `DeviceResponse`, `ZoneResponse`, `ValueResponse<T>`, `PutResponse`, and connection settings types.
- `endpoint.ts` — Enum of all REST-like endpoint paths (e.g. `/zones/zn%1/...`); zone/device ID placeholders are substituted at runtime.
- `thermostatManager.ts` — Global registry mapping serial number → CT200 device instance; used by ETRV to reach its parent thermostat.

**3. App / API Layer** (`app.ts`, `api.ts`)
- `app.ts` — Minimal; holds `activePairingCode` and emits token events on successful HTTPS OAuth redirect.
- `api.ts` — Exposes a `POST /token` endpoint on Homey's local network; validates the pairing code and forwards the OAuth token to the driver.

### Pairing Flows

**XMPP** (`ct200/driver.ts`): User enters serial number, access key, and password. Driver creates a temporary `XmppClient`, validates credentials, fetches the device list, and presents discovered thermostats.

**HTTPS** (`ct200https/driver.ts`):
1. Driver generates a random 4-digit code and shows the user: code + local Homey IP + app ID.
2. User completes OAuth login at the Bosch portal; browser redirects to `/token`.
3. App validates the code, emits the token; driver stores it in device settings.
4. Repair flow re-runs steps 1–3 to refresh expired tokens.

### Capability System

Custom Homey capabilities are defined in `.homeycompose/capabilities/`:
- `ec_temperature_offset` — calibration offset (−2 to +2 °C)
- `ec_away_mode` — system away mode toggle
- `ec_child_lock` — valve child lock
- `ec_thermostat_mode` — manual vs. clock program

Flow triggers, actions, and conditions are declared in `app.json` (generated from `.homeycompose/`).

### Token Persistence (HTTPS only)

Device settings store `accessToken`, `refreshToken`, and `expiresAtUtc`. When `HttpClient` emits `tokenUpdated`, the device writes the new tokens to settings immediately. This is critical for long-lived installations.

### Device Type Filtering

- XMPP pairing filters for `device.type === 'thermostat'` (CT200 only).
- HTTPS pairing first fetches the gateway device (`deviceType === 'rrc2'`) then fetches child devices.
- HTTPS driver `fixSettings()` converts string IDs to numbers to work around Homey's settings serialization.
