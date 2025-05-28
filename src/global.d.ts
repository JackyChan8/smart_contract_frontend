interface EthereumProvider {
  selectedAddress?: string;
  isMetaMask?: boolean;
  isTrust?: boolean;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider & {
      isMetaMask?: boolean;
      isTrust?: boolean;
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}

export {}