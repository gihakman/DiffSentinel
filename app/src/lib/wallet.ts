import { useCallback, useEffect, useState } from "react";

// EIP-3085 / EIP-3326: add + switch chain requests.
// We call these directly rather than through genlayer-js so we do not depend
// on MetaMask Snaps.
const BRADBURY_CHAIN_PARAMS = {
  chainId: "0x107D", // 4221
  chainName: "GenLayer Bradbury Testnet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: ["https://rpc-bradbury.genlayer.com"],
  blockExplorerUrls: ["https://explorer-bradbury.genlayer.com"],
} as const;

export type WalletState =
  | { kind: "idle" }
  | { kind: "unavailable" }
  | { kind: "connecting" }
  | {
      kind: "wrong-network";
      address: `0x${string}`;
      chainId: string;
    }
  | {
      kind: "ready";
      address: `0x${string}`;
      chainId: string;
    };

const BRADBURY_CHAIN_ID_HEX = "0x107d";

const normalizeChainId = (v: unknown): string =>
  typeof v === "string" ? v.toLowerCase() : `0x${Number(v).toString(16)}`;

export function useWallet() {
  const [state, setState] = useState<WalletState>(() =>
    typeof window !== "undefined" && window.ethereum
      ? { kind: "idle" }
      : { kind: "unavailable" },
  );

  const readContext = useCallback(async () => {
    if (!window.ethereum) return null;
    const accounts = (await window.ethereum.request({
      method: "eth_accounts",
    })) as string[];
    const chainId = (await window.ethereum.request({
      method: "eth_chainId",
    })) as string;
    if (!accounts || accounts.length === 0) return null;
    return {
      address: accounts[0] as `0x${string}`,
      chainId: normalizeChainId(chainId),
    };
  }, []);

  // Restore silently on mount if the provider already remembers this site.
  useEffect(() => {
    let cancelled = false;
    if (!window.ethereum) return;
    readContext().then((ctx) => {
      if (cancelled || !ctx) return;
      setState(
        ctx.chainId === BRADBURY_CHAIN_ID_HEX
          ? { kind: "ready", ...ctx }
          : { kind: "wrong-network", ...ctx },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [readContext]);

  // Subscribe to account and chain changes.
  useEffect(() => {
    if (!window.ethereum?.on) return;
    const onAccounts = (accs: unknown) => {
      const arr = accs as string[];
      if (!arr || arr.length === 0) {
        setState({ kind: "idle" });
        return;
      }
      setState((prev) => {
        const chainId =
          "chainId" in prev ? prev.chainId : BRADBURY_CHAIN_ID_HEX;
        return chainId === BRADBURY_CHAIN_ID_HEX
          ? { kind: "ready", address: arr[0] as `0x${string}`, chainId }
          : {
              kind: "wrong-network",
              address: arr[0] as `0x${string}`,
              chainId,
            };
      });
    };
    const onChain = (chainId: unknown) => {
      const cid = normalizeChainId(chainId);
      setState((prev) => {
        if (prev.kind !== "ready" && prev.kind !== "wrong-network") return prev;
        return cid === BRADBURY_CHAIN_ID_HEX
          ? { kind: "ready", address: prev.address, chainId: cid }
          : { kind: "wrong-network", address: prev.address, chainId: cid };
      });
    };
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "connecting" });
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const chainId = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      const address = accounts[0] as `0x${string}`;
      const cid = normalizeChainId(chainId);
      if (cid !== BRADBURY_CHAIN_ID_HEX) {
        setState({ kind: "wrong-network", address, chainId: cid });
      } else {
        setState({ kind: "ready", address, chainId: cid });
      }
    } catch (err) {
      console.error(err);
      setState({ kind: "idle" });
    }
  }, []);

  const switchToBradbury = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BRADBURY_CHAIN_PARAMS.chainId }],
      });
    } catch (err) {
      // 4902 = chain not added yet. Add it, then it'll be switched automatically.
      const code = (err as { code?: number })?.code;
      if (code === 4902 || code === -32603 || code === -32602) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [BRADBURY_CHAIN_PARAMS],
          });
        } catch (addErr) {
          console.error("failed to add Bradbury chain", addErr);
        }
      } else {
        console.error("failed to switch chain", err);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    // EIP-1193 has no standard disconnect. The best we can do is drop state.
    // The provider retains site permissions until the user revokes them.
    setState({ kind: "idle" });
  }, []);

  return { state, connect, disconnect, switchToBradbury };
}

export const BRADBURY_CHAIN_ID = BRADBURY_CHAIN_ID_HEX;
