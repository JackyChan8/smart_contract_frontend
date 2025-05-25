'use client';

import { useTonConnectUI, TonConnectButton, useTonWallet } from '@tonconnect/ui-react';
import { useState } from 'react';
import styles from '@/app/page.module.scss'

export default function Home() {
  const wallet = useTonWallet();
  const [tonConnectUi] = useTonConnectUI();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePlay = async () => {
    if (!wallet?.account?.address) {
      setStatus('Сначала подключите кошелёк');
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch('http://localhost:8008/ton/get-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_address: wallet.account.address })
      });
      console.log('res: ', res);

      const { data } = await res.json();
      await tonConnectUi.sendTransaction(data);

      setStatus('✅ Транзакция отправлена!');
    } catch (e) {
      console.error(e);
      setStatus('❌ Ошибка при отправке транзакции');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>FullBalance Game</h1>
      <p className={styles.description}>
        В этой игре ты рискуешь всем. Нажми кнопку — и весь твой TON баланс будет использован!
      </p>

      <TonConnectButton />

      <button
        onClick={handlePlay}
        disabled={loading}
        className={styles.playButton}
      >
        {loading ? 'Отправка...' : 'Играть на весь баланс'}
      </button>

      {status && <p className={styles.status}>{status}</p>}

      {wallet?.account?.address && (
        <p className={styles.address}>Кошелёк: {wallet.account.address}</p>
      )}
    </main>
  );
} 