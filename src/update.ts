/** Data from Coinbase is untyped as `any`. */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { LogLevel } from './common'
import Utils from './utils'
import {
  TezosNodeReader,
  TezosNodeWriter,
  TezosParameterFormat,
  KeyStore,
  Signer,
  TezosLanguageUtil,
  Transaction,
} from 'conseiljs'
import * as WebRequest from 'web-request'
import Constants from './constants'
import { constructPushOperation } from './push'
import crypto = require('crypto')
import OperationFeeEstimator from './operation-fee-estimator'

/**
 * Data returned from an Oracle.
 */
interface OracleData {
  // Michelson formatted messages
  //
  // Example message:
  // (Pair "BTC-USD" (Pair 1594499220 (Pair 1594559220 (Pair 9208860000 (Pair 9210510000 (Pair 9208850000 (Pair 9210510000 596189)))))))
  messages: Array<string>

  // String based signatures.
  //
  // Example Signature:
  // spsig1dgz1RbLtvvtpW54t7rJbCmjxwYCBfSzpvc7YcmD53b8ynhAcpPVDa13EU8w4KNTF9vAGeAGx4UFHK91cteqbcmyDRDjJm
  signatures: Array<string>
}

// TODO(keefertaylor): The code in this file is duplicated across Coinbase and non-coinbase
//                     updates. Consider strategies to deduplicate.

/**
 * Update the Oracle from Coinbase.
 *
 * @param logLevel The level at which to log output.
 * @param apiKeyID The ID of the Coinbase Pro API key to use.
 * @param apiSecret The secret for the Coinbase Pro API key.
 * @param apiPassphrase The passphrase for the Coinbase API key.
 * @param oracleContractAddress The address of the oracle contract.
 * @param assetNames An array of asset names to update in the oracle contract.
 * @param posterPrivateKey The base58check encoded private key of the poster. This account will pay operation fees.
 * @param updateIntervalSeconds The number of seconds between each update, or undefined if the update should only run once.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 * @param normalizerContractAddress If set, updates are forwarded to a normalizer contract. Defaults to undefined.
 * @param enableZeroFees If `true`, the operation will be sent with zero-fees. Default is `false`.
 */
export default async function updateOracleFromCoinbase(
  logLevel: LogLevel,
  apiKeyID: string,
  apiSecret: string,
  apiPassphrase: string,
  oracleContractAddress: string,
  assetNames: Array<string>,
  posterPrivateKey: string,
  updateIntervalSeconds: number | undefined,
  tezosNodeURL: string,
  normalizerContractAddress: string | undefined = undefined,
  enableZeroFees = false,
): Promise<void> {
  if (logLevel == LogLevel.Debug) {
    Utils.print('Using node located at: ' + tezosNodeURL)
    Utils.print('')
  }

  // Generate a keystore.
  const keyStore = await Utils.keyStoreFromPrivateKey(posterPrivateKey)
  const signer = await Utils.signerFromKeyStore(keyStore)
  if (logLevel == LogLevel.Debug) {
    Utils.print('Updating from account: ' + keyStore.publicKeyHash)
    Utils.print('')
  }

  // Loop updates if needed.
  if (updateIntervalSeconds) {
    // Loop indefinitely, updating the oracle and then sleeping for the update interval.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await updateOracleFromCoinbaseOnce(
        logLevel,
        apiKeyID,
        apiSecret,
        apiPassphrase,
        oracleContractAddress,
        assetNames,
        keyStore,
        signer,
        tezosNodeURL,
        normalizerContractAddress,
        enableZeroFees,
      )

      Utils.print(
        `Waiting ${updateIntervalSeconds} seconds to do next update. (Customize with --update-interval)`,
      )
      await Utils.sleep(updateIntervalSeconds)
    }
  } else {
    await updateOracleFromCoinbaseOnce(
      logLevel,
      apiKeyID,
      apiSecret,
      apiPassphrase,
      oracleContractAddress,
      assetNames,
      keyStore,
      signer,
      tezosNodeURL,
      normalizerContractAddress,
      enableZeroFees,
    )
  }
}

/**
 * Update the oracle service from Coinbase exactly once.
 *
 * @param logLevel The level at which to log output.
 * @param apiKeyID The ID of the Coinbase Pro API key to use.
 * @param apiSecret The secret for the Coinbase Pro API key.
 * @param apiPassphrase The passphrase for the Coinbase API key.
 * @param oracleContractAddress The address of the oracle contract.
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @param posterPrivateKey The base58check encoded private key of the poster. This account will pay operation fees.
 * @param updateIntervalSeconds The number of seconds between each update, or undefined if the update should only run once.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 * @param normalizerContractAddress If set, updates are forwarded to a normalizer contract. Defaults to undefined.
 * @param enableZeroFees If `true`, the operation will be sent with zero-fees. Default is `false`.
 * @returns The operation hash.
 */
export async function updateOracleFromCoinbaseOnce(
  logLevel: LogLevel,
  apiKeyID: string,
  apiSecret: string,
  apiPassphrase: string,
  oracleContractAddress: string,
  assetNames: Array<string>,
  keyStore: KeyStore,
  signer: Signer,
  tezosNodeURL: string,
  normalizerContractAddress: string | undefined = undefined,
  enableZeroFees = false,
): Promise<string> {
  try {
    await Utils.revealAccountIfNeeded(tezosNodeURL, keyStore, signer)

    Utils.print('Updating oracle located at: ' + oracleContractAddress)
    if (logLevel == LogLevel.Debug) {
      Utils.print(
        'Using assets: ' +
        assetNames.reduce((previousValue, assetName) => {
          return previousValue + assetName + ', '
        }, ''),
      )
    }
    Utils.print('')

    const counter = await TezosNodeReader.getCounterForAccount(
      tezosNodeURL,
      keyStore.publicKeyHash,
    )
    const operations: Array<Transaction> = []
    const operation = await makeUpdateOperationFromCoinbase(
      logLevel,
      apiKeyID,
      apiSecret,
      apiPassphrase,
      assetNames,
      keyStore,
      oracleContractAddress,
      counter + 1,
    )
    operations.push(operation)

    // Push an operation to the normalizer if an address was provided.
    if (normalizerContractAddress !== undefined) {
      const normalizerPushOperation = constructPushOperation(
        logLevel,
        keyStore,
        counter + 2,
        oracleContractAddress,
        normalizerContractAddress,
      )
      operations.push(normalizerPushOperation)
    }

    const operationFeeEstimator = new OperationFeeEstimator(
      tezosNodeURL,
      enableZeroFees,
    )
    const operationsWithFees = await operationFeeEstimator.estimateAndApplyFees(
      operations,
    )

    const nodeResult = await TezosNodeWriter.sendOperation(
      tezosNodeURL,
      operationsWithFees,
      signer,
    )

    const hash = nodeResult.operationGroupID.replace(/"/g, '')
    Utils.print('Update sent with hash: ' + hash)
    return hash
  } catch (error: any) {
    Utils.print('Error occurred while trying to update.')
    if (logLevel == LogLevel.Debug) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Utils.print(error.message)
    }
    Utils.print('')
    return ''
  }
}

/**
 * Update the Oracle from a URL.
 *
 * @param logLevel The level at which to log output.
 * @param oracleFeedURL A URL which will serve the Oracle's data feed.
 * @param oracleContractAddress The address of the oracle contract.
 * @param assetNames An array of asset names to update in the oracle contract.
 * @param posterPrivateKey The base58check encoded private key of the poster. This account will pay operation fees.
 * @param updateIntervalSeconds The number of seconds between each update, or undefined if the update should only run once.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 * @param normalizerContractAddress If set, updates are forwarded to a normalizer contract. Defaults to undefined.
 * @param enableZeroFees If `true`, the operation will be sent with zero-fees. Default is `false`.
 */
export async function updateOracleFromFeed(
  logLevel: LogLevel,
  oracleFeedURL: string,
  oracleContractAddress: string,
  assetNames: Array<string>,
  posterPrivateKey: string,
  updateIntervalSeconds: number | undefined,
  tezosNodeURL: string,
  normalizerContractAddress: string | undefined = undefined,
  enableZeroFees = false,
): Promise<void> {
  if (logLevel == LogLevel.Debug) {
    Utils.print('Using node located at: ' + tezosNodeURL)
    Utils.print('')
  }

  // Generate a keystore.
  const keyStore = await Utils.keyStoreFromPrivateKey(posterPrivateKey)
  const signer = await Utils.signerFromKeyStore(keyStore)
  if (logLevel == LogLevel.Debug) {
    Utils.print('Updating from account: ' + keyStore.publicKeyHash)
    Utils.print('')
  }

  // Loop updates if needed.
  if (updateIntervalSeconds) {
    // Loop indefinitely, updating the oracle and then sleeping for the update interval.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await updateOracleFromFeedOnce(
        logLevel,
        oracleFeedURL,
        oracleContractAddress,
        assetNames,
        keyStore,
        signer,
        tezosNodeURL,
        normalizerContractAddress,
        enableZeroFees,
      )

      Utils.print(
        `Waiting ${updateIntervalSeconds} seconds to do next update. (Customize with --update-interval)`,
      )
      await Utils.sleep(updateIntervalSeconds)
    }
  } else {
    await updateOracleFromFeedOnce(
      logLevel,
      oracleFeedURL,
      oracleContractAddress,
      assetNames,
      keyStore,
      signer,
      tezosNodeURL,
      normalizerContractAddress,
      enableZeroFees,
    )
  }
}

/**
 * Update the Oracle from a URL exactly once.
 *
 * @param logLevel The level at which to log output.
 * @param oracleFeedURL A URL which will serve the Oracle's data feed.
 * @param oracleContractAddress The address of the oracle contract.
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @param posterPrivateKey The base58check encoded private key of the poster. This account will pay operation fees.
 * @param updateIntervalSeconds The number of seconds between each update, or undefined if the update should only run once.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 * @param normalizerContractAddress If set, updates are forwarded to a normalizer contract. Defaults to undefined.
 * @param enableZeroFees If `true`, the operation will be sent with zero-fees. Default is `false`.
 * @returns The operation hash.
 */
export async function updateOracleFromFeedOnce(
  logLevel: LogLevel,
  oracleFeedURL: string,
  oracleContractAddress: string,
  assetNames: Array<string>,
  keyStore: KeyStore,
  signer: Signer,
  tezosNodeURL: string,
  normalizerContractAddress: string | undefined = undefined,
  enableZeroFees = false,
): Promise<string> {
  try {
    await Utils.revealAccountIfNeeded(tezosNodeURL, keyStore, signer)

    Utils.print('Updating oracle located at: ' + oracleContractAddress)
    if (logLevel == LogLevel.Debug) {
      Utils.print(
        'Using assets: ' +
        assetNames.reduce((previousValue, assetName) => {
          return previousValue + assetName + ', '
        }, ''),
      )
    }
    Utils.print('')

    const counter = await TezosNodeReader.getCounterForAccount(
      tezosNodeURL,
      keyStore.publicKeyHash,
    )
    const operations: Array<Transaction> = []
    const operation = await makeUpdateOperationFromFeed(
      logLevel,
      oracleFeedURL,
      assetNames,
      keyStore,
      oracleContractAddress,
      counter + 1,
    )
    operations.push(operation)

    // Push an operation to the normalizer if an address was provided.
    if (normalizerContractAddress !== undefined) {
      const normalizerPushOperation = constructPushOperation(
        logLevel,
        keyStore,
        counter + 2,
        oracleContractAddress,
        normalizerContractAddress,
      )
      operations.push(normalizerPushOperation)
    }

    const operationFeeEstimator = new OperationFeeEstimator(
      tezosNodeURL,
      enableZeroFees,
    )
    const operationsWithFees = await operationFeeEstimator.estimateAndApplyFees(
      operations,
    )

    const nodeResult = await TezosNodeWriter.sendOperation(
      tezosNodeURL,
      operationsWithFees,
      signer,
    )

    const hash = nodeResult.operationGroupID.replace(/"/g, '')
    Utils.print('Update sent with hash: ' + hash)
    return hash
  } catch (error: any) {
    Utils.print('Error occurred while trying to update.')
    if (logLevel == LogLevel.Debug) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Utils.print(error.message)
    }
    Utils.print('')
    return ''
  }
}

/**
 * Make an update operation from Coinbase.
 *
 * @param logLevel The log level to use.
 * @param apiKeyID The ID of the Coinbase Pro API key to use.
 * @param apiSecret The secret for the Coinbase Pro API key.
 * @param apiPassphrase The passphrase for the Coinbase API key.
 * @param assetNames The assets to update.
 * @param keystore The keystore to use for the update operation.
 * @param tezosNodeURL The tezos node url to use.
 * @param oracleContractAddress The contract address to use.
 * @param counter The counter to use.
 */
async function makeUpdateOperationFromCoinbase(
  logLevel: LogLevel,
  apiKeyID: string,
  apiSecret: string,
  apiPassphrase: string,
  assetNames: Array<string>,
  keystore: KeyStore,
  oracleContractAddress: string,
  counter: number,
): Promise<Transaction> {
  // Retrieve elements from the oracle data.
  const oracleData = await retrieveOracleDataFromCoinbase(
    apiKeyID,
    apiSecret,
    apiPassphrase,
  )
  if (logLevel == LogLevel.Debug) {
    Utils.print('Received oracle data: ')
    Utils.print(oracleData)
    Utils.print('')
  }

  // Iterate through keys and create Elts.
  const elements = assetNames.map((assetName) => {
    const element = listElementForAsset(oracleData, assetName)
    if (!element) {
      Utils.print('Unable to locate data for ' + assetName + ' in Oracle data')
      Utils.print('Aborting.')
      process.exit(1)
    }
    return element
  })

  // Make the update parameter.
  const elementString = elements
    .reduce((previousValue, element) => {
      return previousValue + element + ';'
    }, '')
    .replace(/'/g, '"')
  const parameter = `{${elementString}}`
  if (logLevel == LogLevel.Debug) {
    Utils.print('Made parameter: ')
    Utils.print(parameter)
    Utils.print('')
  }

  const entrypoint = 'update'
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

/**
 * Make an update operation from a feed.
 *
 * @param logLevel The log level to use.
 * @param oracleFeedURL A URL which will serve the Oracle's data feed.
 * @param assetNames The assets to update.
 * @param keystore The keystore to use for the update operation.
 * @param tezosNodeURL The tezos node url to use.
 * @param oracleContractAddress The contract address to use.
 * @param counter The counter to use.
 */
async function makeUpdateOperationFromFeed(
  logLevel: LogLevel,
  oracleFeedURL: string,
  assetNames: Array<string>,
  keystore: KeyStore,
  oracleContractAddress: string,
  counter: number,
): Promise<Transaction> {
  // Retrieve elements from the oracle data.
  const oracleData = await retrieveOracleDataFromFeed(oracleFeedURL)
  if (logLevel == LogLevel.Debug) {
    Utils.print('Received oracle data: ')
    Utils.print(oracleData)
    Utils.print('')
  }

  // Iterate through keys and create Elts.
  const elements = assetNames.map((assetName) => {
    const element = listElementForAsset(oracleData, assetName)
    if (!element) {
      Utils.print('Unable to locate data for ' + assetName + ' in Oracle data')
      Utils.print('Aborting.')
      process.exit(1)
    }
    return element
  })

  // Make the update parameter.
  const elementString = elements
    .reduce((previousValue, element) => {
      return previousValue + element + ';'
    }, '')
    .replace(/'/g, '"')
  const parameter = `{${elementString}}`
  if (logLevel == LogLevel.Debug) {
    Utils.print('Made parameter: ')
    Utils.print(parameter)
    Utils.print('')
  }

  const entrypoint = 'update'
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

/**
 * Retrieve oracle data from an oracle feed.
 *
 * @param oracleFeedURL The URL for the Oracle data feed.
 * @return The oracle data.
 */
async function retrieveOracleDataFromFeed(oracleFeedURL: string): Promise<any> {
  const oracleDataRaw = await WebRequest.get(oracleFeedURL, {
    headers: {
      'User-Agent': 'harbinger',
      accept: 'json',
    },
  })

  if (oracleDataRaw.statusCode != 200) {
    throw new Error(
      `Failed to retrieve oracle data!\n${oracleDataRaw.statusCode}: ${oracleDataRaw.content}`,
    )
  }
  const oracleData = JSON.parse(oracleDataRaw.content)
  return parseRawOracleData(oracleData)
}

/**
 * Retrieve oracle data from Coinbase Pro.
 *
 * @param apiKeyID The ID of the Coinbase Pro API key to use.
 * @param apiSecret The secret for the Coinbase Pro API key.
 * @param apiPassphrase The passphrase for the Coinbase API key.
 * @return The oracle data.
 */
async function retrieveOracleDataFromCoinbase(
  apiKeyID: string,
  apiSecret: string,
  apiPassphrase: string,
): Promise<any> {
  const apiURL = 'https://api.pro.coinbase.com'
  const requestPath = '/oracle/xtz'
  const timestamp = Date.now() / 1000
  const method = 'GET'
  const what = `${timestamp}${method}${requestPath}`
  const secretKey = Buffer.from(apiSecret, 'base64')
  const hmac = crypto.createHmac('sha256', secretKey)
  const signature = hmac.update(what).digest('base64')

  const oracleURL = apiURL + requestPath
  const oracleDataRaw = await WebRequest.get(oracleURL, {
    headers: {
      'User-Agent': 'harbinger',
      'CB-ACCESS-KEY': apiKeyID,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
      'CB-ACCESS-PASSPHRASE': apiPassphrase,
      accept: 'json',
    },
  })

  if (oracleDataRaw.statusCode != 200) {
    throw new Error(
      `Failed to retrieve oracle data!\n${oracleDataRaw.statusCode}: ${oracleDataRaw.content}`,
    )
  }
  const oracleData = JSON.parse(oracleDataRaw.content)
  return parseRawOracleData(oracleData)
}

/**
 * Parse a raw Oracle feed into a JSON object.
 *
 * @param oracleData The data returned from the Oracle feed.
 * @returns The feed data as a JSON object.
 */
function parseRawOracleData(oracleData: any): any {
  const result = {
    messages: oracleData.messages.map((message: string) => {
      // Parse and normalize the Michelson.
      const parsed = TezosLanguageUtil.hexToMichelson(message.slice(2))
      const normalized = TezosLanguageUtil.normalizeMichelsonWhiteSpace(
        parsed.code,
      )

      return normalized
    }),
    signatures: oracleData.signatures,
  }
  return result
}

/**
 * Extract a properly formatted Elt parameter for a given asset from some oracle data.
 *
 * @param oracleData The oracle data to extract from.
 * @param assetName The name of the asset to extract.
 */
function listElementForAsset(
  oracleData: OracleData,
  assetName: string,
): string {
  for (let i = 0; i < oracleData.messages.length; i++) {
    const message = oracleData.messages[i]
    if (message.includes(assetName)) {
      const signature = oracleData.signatures[i]

      // The message format returned from Coinbase's API is:
      // (Pair "BTC-USD" (Pair 1594499220 (Pair 1594559220 (Pair 9208860000 (Pair 9210510000 (Pair 9208850000 (Pair 9210510000 596189)))))))
      //
      // Whereas the contract wants an input parameter of:
      // Elt "BTC-USD" (Pair 1594499220 (Pair 1594559220 (Pair 9208860000 (Pair 9210510000 (Pair 9208850000 (Pair 9210510000 596189))))))
      //
      // Reformat the message returned from Coinbase by slicing off the asset pair and 1st trailing paren,
      // then reformat into an Elt keyed with the assetName.
      const startSlice = `(Pair "${assetName}" `
      const messageWithoutAssetName = message.slice(
        startSlice.length,
        message.length - 1,
      )
      const reformatted = `Elt '${assetName}'(Pair '${signature}' ${messageWithoutAssetName})`
      return reformatted
    }
  }
  throw new Error(
    `Could not locate ${assetName} in ${JSON.stringify(oracleData.messages)}`,
  )
}
