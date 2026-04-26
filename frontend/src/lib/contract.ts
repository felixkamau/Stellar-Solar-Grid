import * as StellarSdk from "@stellar/stellar-sdk";

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET;
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";

/**
 * Project-controlled funded account used as the fee source for read-only
 * simulations when no wallet is connected. Set this in .env.local.
 * Never hardcode a public key here — testnet resets can defund any account.
 */
const FEE_SOURCE_ADDRESS = process.env.NEXT_PUBLIC_FEE_SOURCE_ADDRESS ?? "";

const STROOPS_PER_XLM = 10_000_000;
const MILLI_KWH_PER_KWH = 1_000;

const server = new StellarSdk.SorobanRpc.Server(RPC_URL);

/**
 * Read-only contract simulation (no auth needed).
 *
 * @param method   Contract function name
 * @param args     ScVal arguments
 * @param sourceAddress  Optional — use the connected wallet address when
 *                 available. Falls back to NEXT_PUBLIC_FEE_SOURCE_ADDRESS.
 *                 Passing an address that exists on-chain avoids failures
 *                 caused by hardcoded or unfunded accounts after testnet resets.
 */
export async function contractQuery(
  method: string,
  args: StellarSdk.xdr.ScVal[],
  sourceAddress?: string,
): Promise<StellarSdk.xdr.ScVal> {
  const source = sourceAddress ?? FEE_SOURCE_ADDRESS;
  if (!source) {
    throw new Error(
      "No fee source address available. Connect your wallet or set NEXT_PUBLIC_FEE_SOURCE_ADDRESS in .env.local.",
    );
  }

  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const account = await server.getAccount(source);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  return (sim as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
}

export interface MeterData {
  active: boolean;
  balance: number; // XLM
  unitsUsed: number; // kWh
  plan: string;
}

/**
 * Fetch and parse a meter from the contract.
 * Pass the connected wallet address so simulation never relies on a
 * hardcoded or potentially unfunded account.
 */
export async function fetchMeter(
  meterId: string,
  sourceAddress?: string,
): Promise<MeterData> {
  const raw = await contractQuery(
    "get_meter",
    [StellarSdk.nativeToScVal(meterId, { type: "symbol" })],
    sourceAddress,
  );
  const native = StellarSdk.scValToNative(raw) as Record<string, unknown>;

  const balance = Number(native.balance as bigint) / STROOPS_PER_XLM;
  const unitsUsed = Number(native.units_used as bigint) / MILLI_KWH_PER_KWH;
  const planRaw = native.plan as Record<string, unknown>;
  const plan = Object.keys(planRaw)[0] ?? "Unknown";

  return { active: native.active as boolean, balance: Math.max(0, balance), unitsUsed, plan };
}

/** Sign and submit a contract transaction via Freighter. */
export async function contractInvoke(
  sourceAddress: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
): Promise<string> {
  const freighter = (window as unknown as { freighter: any }).freighter;
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const account = await server.getAccount(sourceAddress);

  let tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }

  tx = StellarSdk.SorobanRpc.assembleTransaction(tx, sim).build();
  const signed = await freighter.signTransaction(tx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const result = await server.sendTransaction(
    StellarSdk.TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE),
  );
  return result.hash;
}
