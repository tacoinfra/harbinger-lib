/** Taquito types storage as any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access  */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { LogLevel } from './common'
import Utils from './utils'
import { ContractMethod, TezosToolkit, Wallet } from '@taquito/taquito'

/**
 * Push oracle data to a normalizer contract one or more times.
 *
 * @param logLevel The level at which to log output.
 * @param oracleContractAddress The address of the oracle contract.
 * @param normalizerContractAddress The address of the normalizer contract.
 * @param pusherPrivateKey The base58check encoded private key of the pusher. This account will pay transaction fees.
 * @param updateIntervalSeconds The number of seconds between each update, or undefined if the update should only run once.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 */
export default async function pushOracleData(
  logLevel: LogLevel,
  oracleContractAddress: string,
  normalizerContractAddress: string,
  pusherPrivateKey: string,
  updateIntervalSeconds: number | undefined,
  tezosNodeURL: string,
): Promise<void> {
  if (logLevel == LogLevel.Debug) {
    Utils.print('Using node located at: ' + tezosNodeURL)
    Utils.print('')
  }

  // Loop updates if needed.
  if (updateIntervalSeconds) {
    // Loop indefinitely, updating the oracle and then sleeping for the update interval.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await pushOracleDataOnce(
        logLevel,
        oracleContractAddress,
        normalizerContractAddress,
        pusherPrivateKey,
        tezosNodeURL,
      )

      Utils.print(
        `Waiting ${updateIntervalSeconds} seconds to do next update. (Customize with --updateInterval)`,
      )
      await Utils.sleep(updateIntervalSeconds)
    }
  } else {
    await pushOracleDataOnce(
      logLevel,
      oracleContractAddress,
      normalizerContractAddress,
      pusherPrivateKey,
      tezosNodeURL,
    )
  }
}

/**
 * Push oracle data to a normalizer contract exactly once..
 *
 * @param logLevel The level at which to log output.
 * @param oracleContractAddress The address of the oracle contract.
 * @param normalizerContractAddress The address of the normalizer contract.
 * @param pusherPrivateKey The base58check encoded private key of the pusher. This account will pay transaction fees.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 */
export async function pushOracleDataOnce(
  logLevel: LogLevel,
  oracleContractAddress: string,
  normalizerContractAddress: string,
  pusherPrivateKey: string,
  tezosNodeURL: string,
): Promise<void> {
  try {
    Utils.print(`Pushing data from oracle located at: ${oracleContractAddress}`)
    Utils.print(`To: ${normalizerContractAddress}`)
    Utils.print('')

    // Set up TezosToolkit with a signer
    const tezos = await Utils.tezosToolkitFromPrivateKey(
      tezosNodeURL,
      pusherPrivateKey,
    )
    const publicKeyHash = await tezos.signer.publicKeyHash()
    if (logLevel == LogLevel.Debug) {
      Utils.print(`Pushing from account: ${publicKeyHash}`)
      Utils.print('')
    }

    const pushOperation = await constructPushOperation(
      tezos,
      oracleContractAddress,
      normalizerContractAddress,
    )
    const result = await pushOperation.send()
    Utils.print(`Push sent with hash: ${result.opHash}`)
  } catch (error: any) {
    Utils.print('Error occurred while trying to update.')
    if (logLevel == LogLevel.Debug) {
      Utils.print(error)
    }
    Utils.print('')
  }
}

/**
 * Make a push operation.
 *
 * @param logLevel The level at which to log output.
 * @param tezos A TezosToolkit configured with a signer.
 * @param oracleContractAddress The address of the oracle contract.
 * @param normalizerContractAddress The address of the normalizer contract.
 */
export async function constructPushOperation(
  tezos: TezosToolkit,
  oracleContractAddress: string,
  normalizerContractAddress: string,
): Promise<ContractMethod<Wallet>> {
  const contract = await tezos.wallet.at(oracleContractAddress)
  return contract.methods['push'](`${normalizerContractAddress}%update`)
}
