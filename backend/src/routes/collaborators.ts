import { Router } from "express";
import * as StellarSdk from "@stellar/stellar-sdk";
import { contractQuery } from "../lib/stellar.js";

export const collaboratorRouter = Router();

export interface CollaboratorShare {
  address: string;
  basisPoints: number;
}

/**
 * GET /api/collaborators/:contractId
 *
 * Returns all collaborators and their shares in a single RPC simulation
 * of get_all_shares — eliminates the previous N+1 per-collaborator calls.
 */
collaboratorRouter.get("/:contractId", async (req, res) => {
  try {
    const raw = await contractQuery("get_all_shares", []);
    const shareMap = StellarSdk.scValToNative(raw) as Record<string, number>;

    const collaborators: CollaboratorShare[] = Object.entries(shareMap).map(
      ([address, basisPoints]) => ({ address, basisPoints }),
    );

    res.json({ collaborators });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/collaborators — add a collaborator (admin only)
 */
collaboratorRouter.post("/", async (req, res) => {
  const { address, basis_points } = req.body as {
    address: string;
    basis_points: number;
  };

  if (!address || basis_points == null) {
    return res.status(400).json({ error: "address and basis_points are required" });
  }

  try {
    const { adminInvoke } = await import("../lib/stellar.js");
    const hash = await adminInvoke("add_collaborator", [
      StellarSdk.nativeToScVal(address, { type: "address" }),
      StellarSdk.nativeToScVal(basis_points, { type: "u32" }),
    ]);
    res.json({ hash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
