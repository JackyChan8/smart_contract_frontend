'use client';

import { TonConnectButton, useTonConnectUI } from '@tonconnect/ui-react';
import { useTonWallet } from '@tonconnect/ui-react';
import { useState } from 'react';

export default function TonTransaction() {
  const wallet = useTonWallet();
  const [tonConnectUi] = useTonConnectUI();
  const [status, setStatus] = useState<string | null>(null);

  const handleSend = async () => {
    if (!wallet?.account?.address) {
      setStatus('Сначала подключите кошелёк');
      return;
    }

    try {
      const res = await fetch('http://localhost:8000/ton/get-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_address: wallet.account.address }),
      });

      const { data } = await res.json(); // ResponseModel<{ validUntil, messages }>

      await tonConnectUi.sendTransaction(data);

      setStatus('✅ Транзакция отправлена!');
    } catch (e) {
      console.error(e);
      setStatus('❌ Ошибка при отправке');
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <TonConnectButton />
      <br />
      <button onClick={handleSend} style={{ marginTop: 16 }}>
        Играть на весь баланс
      </button>
      {status && <p>{status}</p>}
    </div>
  );
}
