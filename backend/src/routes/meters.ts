import { Router } from "express";
import * as StellarSdk from "@stellar/stellar-sdk";
import { adminInvoke, contractQuery } from "../lib/stellar.js";
import {
  getUsageHistory,
  persistAndSubmitUsageEvent,
} from "../lib/usageEvents.js";

export const meterRouter = Router();

/** GET /api/meters/:id — get meter status */
meterRouter.get("/:id", async (req, res) => {
  try {
    const result = await contractQuery("get_meter", [
      StellarSdk.nativeToScVal(req.params.id, { type: "symbol" }),
    ]);
    res.json({ meter: StellarSdk.scValToNative(result) });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/** GET /api/meters/:id/access — check if meter is active */
meterRouter.get("/:id/access", async (req, res) => {
  try {
    const result = await contractQuery("check_access", [
      StellarSdk.nativeToScVal(req.params.id, { type: "symbol" }),
    ]);
    res.json({ active: StellarSdk.scValToNative(result) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/meters/:id/history — paginated local usage history */
meterRouter.get("/:id/history", (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25) || 25));

  try {
    const history = getUsageHistory(req.params.id, page, pageSize);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/meters/owner/:address — list all meters for an owner (#32) */
meterRouter.get("/owner/:address", async (req, res) => {
  try {
    const result = await contractQuery("get_meters_by_owner", [
      StellarSdk.nativeToScVal(req.params.address, { type: "address" }),
    ]);
    res.json({ meters: StellarSdk.scValToNative(result) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/meters — register a new meter (admin only) */
meterRouter.post("/", async (req, res) => {
  const { meter_id, owner } = req.body as { meter_id: string; owner: string };
  if (!meter_id || !owner) {
    return res.status(400).json({ error: "meter_id and owner are required" });
  }
  try {
    const hash = await adminInvoke("register_meter", [
      StellarSdk.nativeToScVal(meter_id, { type: "symbol" }),
      StellarSdk.nativeToScVal(owner, { type: "address" }),
    ]);
    res.json({ hash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/meters/:id/usage — IoT oracle reports usage */
meterRouter.post("/:id/usage", async (req, res) => {
  const { units, cost } = req.body as { units: number; cost: number };
  if (units == null || cost == null) {
    return res.status(400).json({ error: "units and cost are required" });
  }
  try {
    const event = await persistAndSubmitUsageEvent({
      meterId: req.params.id,
      units,
      cost,
      sourceTopic: null,
    });

    res.json({
      event,
      hash: event.on_chain_tx_hash,
      queued: !event.on_chain_tx_hash,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
