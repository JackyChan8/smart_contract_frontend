'use client'
import { useState } from 'react';
import Web3 from 'web3';

declare global {
  interface Window {
    ethereum?: {
      request: (...args: any[]) => Promise<any>;
      selectedAddress?: string;
    };
  }
}

export default function Wallet() {
  const [account, setAccount]       = useState<string>();
  const [status, setStatus]         = useState<string>('Нажмите Connect Wallet');
  const [isConnecting, setIsConnecting] = useState(false);

  async function connectAndExecute() {
    if (!window.ethereum) {
      setStatus('Установите MetaMask или другой Web3-кошелёк');
      return;
    }

    // Если уже подключались — не дергаем повторно
    let addr = window.ethereum.selectedAddress;
    if (!addr) {
      setIsConnecting(true);
      setStatus('Ожидаем подтверждения подключения…');
      try {
        const accounts: string[] = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });
        addr = accounts[0];
      } catch (err: any) {
        const msg = err.message || '';
        if (msg.includes('message port closed')) {
          setStatus('Вы закрыли окно MetaMask. Попробуйте снова.');
        } else if (err.code === -32002) {
          setStatus('Подтвердите запрос подключения в MetaMask.');
        } else {
          setStatus(`Ошибка подключения: ${msg}`);
        }
        setIsConnecting(false);
        return;
      } finally {
        setIsConnecting(false);
      }
    }

    setAccount(addr);
    setStatus('Кошелёк подключён, инициализируем контракт…');

    try {
      // 2) Получаем ABI и адрес контракта
      const res = await fetch('http://localhost:8000/contract');
      if (!res.ok) throw new Error('Не удалось получить контракт');
      const { abi, address } = await res.json();

      // 3) Инициализируем Web3 и контракт
      const web3 = new Web3(window.ethereum as any);
      const contract = new web3.eth.Contract(abi, address);

      setStatus('Вызываем метод смарт-контракта…');
      // 4) Пример: вызываем метод someAction()
      const tx = await contract.methods.someAction().send({ from: addr });
      setStatus(`Транзакция отправлена: ${tx.transactionHash}`);
    } catch (err: any) {
      setStatus(`Ошибка выполнения: ${err.message || err}`);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Connect & Execute</h1>
      <button onClick={connectAndExecute} disabled={isConnecting}>
        {isConnecting ? 'Подключаем…' : 'Connect Wallet & Execute'}
      </button>
      <p><strong>Статус:</strong> {status}</p>
      {account && <p><strong>Аккаунт:</strong> {account}</p>}
    </div>
  );
}