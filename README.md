# Stellar SolarGrid

> Powering Africa with affordable, pay-as-you-go solar energy on blockchain.

Stellar SolarGrid is a decentralized PAYG solar energy platform built on [Soroban](https://soroban.stellar.org), within the Stellar ecosystem. Households and small businesses in underserved regions access solar electricity through flexible micro-payments — no large upfront costs required.

## Architecture

```
stellar-solar-grid/
├── contracts/        # Soroban smart contracts (Rust)
├── frontend/         # React + TypeScript user/provider dashboards
├── backend/          # Node.js API + IoT smart meter bridge
└── README.md
```

## Core Features

- **Smart Meter Integration** — IoT meters with real-time usage monitoring and on/off control
- **Flexible Payment Plans** — Daily, weekly, or usage-based micro-payments in stablecoins
- **Automated Access Control** — Smart contracts enable/disable electricity based on payment status
- **Energy Usage Tracking** — Dashboards for users and providers

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) + `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
- Node.js >= 18
- [Freighter Wallet](https://freighter.app/) (browser extension)

### Smart Contracts

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/solar_grid.wasm --network testnet
```

Deployment guidance:
- Prefer setting `admin` and `token_address` through the contract constructor at deploy time so initialization is atomic.
- If you must call `initialize`, do it in the same transaction flow as deployment. Leaving the contract uninitialized after deploy creates a front-running risk where another caller can initialize first.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend stores IoT usage events in a local SQLite database at `backend/data/usage-events.sqlite` by default. Set `USAGE_EVENTS_DB_PATH` to override the file location.

## Smart Contract Overview

The `SolarGrid` contract manages:

| Function | Description |
|---|---|
| `register_meter(meter_id, owner)` | Register a new smart meter |
| `make_payment(meter_id, amount, plan)` | Pay for energy access |
| `check_access(meter_id)` | Check if meter is currently active |
| `get_usage(meter_id)` | Retrieve usage data |
| `update_usage(meter_id, units)` | Called by IoT oracle to update consumption |

### Contract Error Codes

| Code | Error | Meaning |
|---|---|---|
| `1` | `NotInitialized` | Admin/token configuration has not been set |
| `2` | `AlreadyInitialized` | Constructor or `initialize` was called more than once |
| `3` | `MeterNotFound` | Requested meter does not exist |
| `4` | `MeterAlreadyExists` | A meter with the same ID is already registered |
| `5` | `Unauthorized` | Caller is not allowed to perform the action |
| `6` | `InvalidAmount` | Amount or cost argument is invalid |
| `7` | `InsufficientBalance` | Meter/provider balance is too low for the operation |

### Backend Usage Event Schema

The local `usage_events` SQLite table powers retry and analytics:

| Column | Type | Notes |
|---|---|---|
| `id` | `INTEGER` | Primary key |
| `meter_id` | `TEXT` | Contract meter symbol |
| `units` | `INTEGER` | Usage units reported by the meter |
| `cost` | `TEXT` | Charged amount, stored as text to preserve large integer values |
| `received_at` | `TEXT` | ISO timestamp when the backend accepted the event |
| `source_topic` | `TEXT` | MQTT topic if the event came from the broker |
| `status` | `TEXT` | `pending`, `submitted`, or `failed` |
| `attempt_count` | `INTEGER` | Number of on-chain submission attempts |
| `last_attempt_at` | `TEXT` | ISO timestamp of the last retry |
| `last_error` | `TEXT` | Last submission error message |
| `on_chain_tx_hash` | `TEXT` | Soroban transaction hash after success |
| `submitted_at` | `TEXT` | ISO timestamp when on-chain submission succeeded |

### Meter History API

`GET /api/meters/:id/history?page=1&pageSize=25`

Returns paginated usage events from the local SQLite store so dashboards can query recent history without rebuilding it from on-chain events. Events are written locally before on-chain submission, and failed submissions are retried up to 3 times by the backend worker.

## Network

Deployed on Stellar Testnet. Switch to Mainnet for production.

## License

MIT
