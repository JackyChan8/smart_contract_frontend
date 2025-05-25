'use client'
import { useState } from 'react'
import Web3 from 'web3'
import type { ExternalProvider } from 'web3-core'

declare global {
  interface Window {
    ethereum?: ExternalProvider & {
      // EIP-1193 метод
      request(args: { method: string; params?: unknown[] }): Promise<unknown>
      selectedAddress?: string
    }
  }
}

// Для типов RPC-ошибок
interface RpcError extends Error {
  code?: number
}

export default function Wallet() {
  const [account, setAccount] = useState<string>()
  const [status, setStatus]   = useState('Нажмите Connect Wallet')
  const [isConnecting, setIsConnecting] = useState(false)

  async function connectAndExecute() {
    const eth = window.ethereum
    if (!eth) {
      setStatus('Установите MetaMask или другой Web3-провайдер')
      return
    }

    // Если уже подключались, берём адрес
    let addr = eth.selectedAddress
    if (!addr) {
      setIsConnecting(true)
      setStatus('Ожидаем подтверждения подключения…')
      try {
        const response = await eth.request({
          method: 'eth_requestAccounts'
        })
        // Приводим результат к нужному типу
        const accounts = response as string[]
        addr = accounts[0]
      } catch (err: unknown) {
        const rpcError = err as RpcError
        const msg = rpcError.message ?? String(err)
        if (msg.includes('message port closed')) {
          setStatus('Вы закрыли окно MetaMask. Попробуйте снова.')
        } else if (rpcError.code === -32002) {
          setStatus('Подтвердите уже открытый запрос в MetaMask.')
        } else {
          setStatus(`Ошибка подключения: ${msg}`)
        }
        setIsConnecting(false)
        return
      } finally {
        setIsConnecting(false)
      }
    }

    setAccount(addr)
    setStatus('Кошелёк подключён, инициализируем контракт…')

    try {
      const res = await fetch('http://localhost:8000/contract')
      if (!res.ok) throw new Error('Не удалось получить контракт с бэка')
      const json = await res.json()
      const abi     = json.abi as unknown
      const address = json.address as string

      // Инициализация Web3 и контракта
      const web3 = new Web3(eth)
      const contract = new web3.eth.Contract(
        abi as any, // Web3.js пока ожидает `any` для ABI
        address
      )

      setStatus('Вызываем метод смарт-контракта…')
      // Замените someAction на ваш метод
      const tx = await contract.methods
        .someAction()
        .send({ from: addr })
      setStatus(`Транзакция отправлена: ${tx.transactionHash}`)
    } catch (err: unknown) {
      const rpcError = err as RpcError
      const msg = rpcError.message ?? String(err)
      setStatus(`Ошибка выполнения: ${msg}`)
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
  )
}