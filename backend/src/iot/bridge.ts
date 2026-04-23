/**
 * IoT Bridge — two responsibilities:
 *
 * 1. MQTT: subscribes to smart meter usage topics and records consumption
 *    on-chain via the admin keypair.
 *
 * 2. Contract events: polls Soroban RPC for contract events and reacts
 *    to payment_received, meter_activated, and meter_deactivated.
 *
 * MQTT topic:  solargrid/meters/{meter_id}/usage
 * Payload:     { "units": 100, "cost": 500000 }
 */

import mqtt from "mqtt";
import * as StellarSdk from "@stellar/stellar-sdk";
import { adminInvoke, CONTRACT_ID, server } from "../lib/stellar.js";

const BROKER = process.env.MQTT_BROKER ?? "mqtt://localhost:1883";
const MQTT_TOPIC = "solargrid/meters/+/usage";

// How often to poll for new contract events (ms)
const EVENT_POLL_INTERVAL_MS = 5_000;

// ── MQTT bridge ───────────────────────────────────────────────────────────────

export function startIoTBridge() {
  startMqttBridge();
  startContractEventListener();
}

function startMqttBridge() {
  const client = mqtt.connect(BROKER);

  client.on("connect", () => {
    console.log(`📡 IoT bridge connected to ${BROKER}`);
    client.subscribe(MQTT_TOPIC, (err) => {
      if (err) console.error("MQTT subscribe error:", err);
    });
  });

  client.on("message", async (topic, payload) => {
    try {
      // Extract meter_id from topic: solargrid/meters/{meter_id}/usage
      const parts = topic.split("/");
      const meterId = parts[2];
      const { units, cost } = JSON.parse(payload.toString()) as {
        units: number;
        cost: number;
      };

      console.log(`⚡ Usage update — meter: ${meterId}, units: ${units}, cost: ${cost}`);

      const hash = await adminInvoke("update_usage", [
        StellarSdk.nativeToScVal(meterId, { type: "symbol" }),
        StellarSdk.nativeToScVal(BigInt(units), { type: "u64" }),
        StellarSdk.nativeToScVal(BigInt(cost), { type: "i128" }),
      ]);

      console.log(`✅ Usage recorded on-chain: ${hash}`);
    } catch (err) {
      console.error("IoT bridge error:", err);
    }
  });

  client.on("error", (err) => {
    console.warn("MQTT connection error (will retry):", err.message);
  });
}

// ── Contract event listener ───────────────────────────────────────────────────

// Track the latest ledger sequence we've processed to avoid re-processing events
let lastProcessedLedger = 0;

function startContractEventListener() {
  console.log("🔔 Contract event listener started");
  setInterval(pollContractEvents, EVENT_POLL_INTERVAL_MS);
}

async function pollContractEvents() {
  try {
    const latestLedger = await server.getLatestLedger();
    const currentLedger = latestLedger.sequence;

    if (lastProcessedLedger === 0) {
      // On first run, start from current ledger — don't replay history
      lastProcessedLedger = currentLedger;
      return;
    }

    if (currentLedger <= lastProcessedLedger) return;

    const response = await server.getEvents({
      startLedger: lastProcessedLedger + 1,
      filters: [
        {
          type: "contract",
          contractIds: [CONTRACT_ID],
        },
      ],
      limit: 100,
    });

    for (const event of response.events) {
      await handleContractEvent(event);
    }

    lastProcessedLedger = currentLedger;
  } catch (err) {
    console.error("Contract event poll error:", err);
  }
}

async function handleContractEvent(
  event: StellarSdk.SorobanRpc.Api.RawEventResponse,
) {
  try {
    // Topics are XDR-encoded ScVals — first topic is the event name tuple
    const topics = event.topic.map((t) =>
      StellarSdk.xdr.ScVal.fromXDR(t, "base64"),
    );

    if (topics.length < 2) return;

    const ns = topics[0].sym()?.toString();   // e.g. "payment" or "meter"
    const name = topics[1].sym()?.toString(); // e.g. "received", "activated", "deactivated"

    if (!ns || !name) return;

    const eventKey = `${ns}:${name}`;

    switch (eventKey) {
      case "payment:received": {
        const data = StellarSdk.xdr.ScVal.fromXDR(event.value, "base64");
        const native = StellarSdk.scValToNative(data) as [string, bigint, unknown];
        const [meterId, amount] = native;
        console.log(
          `💰 payment_received — meter: ${meterId}, amount: ${Number(amount) / 10_000_000} XLM`,
        );
        await onPaymentReceived(String(meterId), Number(amount));
        break;
      }

      case "meter:activated": {
        const data = StellarSdk.xdr.ScVal.fromXDR(event.value, "base64");
        const meterId = String(StellarSdk.scValToNative(data));
        console.log(`✅ meter_activated — meter: ${meterId}`);
        await onMeterActivated(meterId);
        break;
      }

      case "meter:deactivated": {
        const data = StellarSdk.xdr.ScVal.fromXDR(event.value, "base64");
        const meterId = String(StellarSdk.scValToNative(data));
        console.log(`🔴 meter_deactivated — meter: ${meterId}`);
        await onMeterDeactivated(meterId);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Error handling contract event:", err);
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function onPaymentReceived(meterId: string, amountStroops: number) {
  // Placeholder: notify downstream services, update a cache, send a push
  // notification, etc.
  console.log(
    `[handler] Payment received for meter ${meterId}: ${amountStroops / 10_000_000} XLM`,
  );
}

async function onMeterActivated(meterId: string) {
  // Send ON signal to the physical smart meter via MQTT or HTTP
  console.log(`[handler] Sending ON signal to meter ${meterId}`);
  // e.g. mqttClient.publish(`solargrid/meters/${meterId}/control`, JSON.stringify({ cmd: "ON" }));
}

async function onMeterDeactivated(meterId: string) {
  // Send OFF signal to the physical smart meter via MQTT or HTTP
  console.log(`[handler] Sending OFF signal to meter ${meterId}`);
  // e.g. mqttClient.publish(`solargrid/meters/${meterId}/control`, JSON.stringify({ cmd: "OFF" }));
}
