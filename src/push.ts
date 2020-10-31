import { LogLevel } from './common'
import Utils from './utils'
import {
  TezosNodeWriter,
  TezosParameterFormat,
  TezosNodeReader,
  KeyStore,
  Transaction,
} from 'conseiljs'
import Constants from './constants'
import OperationFeeEstimator from './operation-fee-estimator'

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

    // Generate a keystore.
    const keystore = await Utils.keyStoreFromPrivateKey(pusherPrivateKey)
    const signer = await Utils.signerFromKeyStore(keystore)
    if (logLevel == LogLevel.Debug) {
      Utils.print(`Pushing from account: ${keystore.publicKeyHash}`)
      Utils.print('')
    }

    await Utils.revealAccountIfNeeded(tezosNodeURL, keystore, signer)

    const counter = await TezosNodeReader.getCounterForAccount(
      tezosNodeURL,
      keystore.publicKeyHash,
    )
    const operation = constructPushOperation(
      logLevel,
      keystore,
      counter + 1,
      oracleContractAddress,
      normalizerContractAddress,
    )

    const operationFeeApplicator = new OperationFeeEstimator(tezosNodeURL)
    const operationsWithFees = await operationFeeApplicator.estimateAndApplyFees(
      [operation],
    )

    const nodeResult = await TezosNodeWriter.sendOperation(
      tezosNodeURL,
      operationsWithFees,
      signer,
    )
    Utils.print(
      `Push sent with hash: ${nodeResult.operationGroupID.replace(/"/g, '')}`,
    )
  } catch (error) {
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
 * @param keystore The keystore for the account.
 * @param counter The counter for the operation.
 * @param oracleContractAddress The address of the oracle contract.
 * @param normalizerContractAddress The address of the normalizer contract.
 * @param tezosNodeURL The Tezos node to use.
 * @param dependentOperation An optional operation that must be executed prior to the push.
 */
export function constructPushOperation(
  logLevel: LogLevel,
  keystore: KeyStore,
  counter: number,
  oracleContractAddress: string,
  normalizerContractAddress: string,
): Transaction {
  // Make the update parameter.
  const parameter = `"${normalizerContractAddress}%update"`
  if (logLevel == LogLevel.Debug) {
    Utils.print('Made parameter: ')
    Utils.print(parameter)
    Utils.print('')
  }

  // Calculate gas and storage used for the operation.
  const entrypoint = 'push'
  return TezosNodeWriter.constructContractInvocationOperation(
    keystore.publicKeyHash,
    counter,
    oracleContractAddress,
    0,
    0,
    Constants.storageLimit,
    Constants.gasLimit,
    entrypoint,
    parameter,
    TezosParameterFormat.Michelson,
  )
}
