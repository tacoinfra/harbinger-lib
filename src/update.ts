/** Taquito types storage as any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access  */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { LogLevel } from './common'
import Utils from './utils'
import * as WebRequest from 'web-request'
import { constructPushOperation } from './push'
import {
  ContractMethod,
  TezosToolkit,
  Wallet,
  MichelsonMap,
} from '@taquito/taquito'
import crypto = require('crypto')
import { unpackData, Parser } from '@taquito/michel-codec'

/**
 * Data returned from an Oracle.
 */
interface OracleData {
  // Michelson formatted messages
  //
  // Example message:
  // (Pair "BTC-USD" (Pair 1594499220 (Pair 1594559220 (Pair 9208860000 (Pair 9210510000 (Pair 9208850000 (Pair 9210510000 596189)))))))
  messages: Array<object> // Record<string, Array<string>>>

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
): Promise<void> {
  if (logLevel == LogLevel.Debug) {
    Utils.print('Using node located at: ' + tezosNodeURL)
    Utils.print('')
  }

  // Generate a configured toolkit
  const tezos = await Utils.tezosToolkitFromPrivateKey(
    tezosNodeURL,
    posterPrivateKey,
  )
  const publicKeyHash = await tezos.signer.publicKeyHash()
  if (logLevel == LogLevel.Debug) {
    Utils.print(`Updating from account: ${publicKeyHash}`)
    Utils.print('')
  }

  // Loop updates if needed.
  if (updateIntervalSeconds) {
    // Loop indefinitely, updating the oracle and then sleeping for the update interval.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await updateOracleFromCoinbaseOnce(
        logLevel,
        tezos,
        apiKeyID,
        apiSecret,
        apiPassphrase,
        oracleContractAddress,
        assetNames,
        normalizerContractAddress,
      )

      Utils.print(
        `Waiting ${updateIntervalSeconds} seconds to do next update. (Customize with --update-interval)`,
      )
      await Utils.sleep(updateIntervalSeconds)
    }
  } else {
    await updateOracleFromCoinbaseOnce(
      logLevel,
      tezos,
      apiKeyID,
      apiSecret,
      apiPassphrase,
      oracleContractAddress,
      assetNames,
      normalizerContractAddress,
    )
  }
}

/**
 * Update the oracle service from Coinbase exactly once.
 *
 * @param logLevel The level at which to log output.
 * @param tezos A TezosToolkit configured with a signer.
 * @param apiKeyID The ID of the Coinbase Pro API key to use.
 * @param apiSecret The secret for the Coinbase Pro API key.
 * @param apiPassphrase The passphrase for the Coinbase API key.
 * @param oracleContractAddress The address of the oracle contract.
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @param updateIntervalSeconds The number of seconds between each update, or undefined if the update should only run once.
 * @param normalizerContractAddress If set, updates are forwarded to a normalizer contract. Defaults to undefined.
 * @returns The operation hash.
 */
export async function updateOracleFromCoinbaseOnce(
  logLevel: LogLevel,
  tezos: TezosToolkit,
  apiKeyID: string,
  apiSecret: string,
  apiPassphrase: string,
  oracleContractAddress: string,
  assetNames: Array<string>,
  normalizerContractAddress: string | undefined = undefined,
): Promise<string> {
  try {
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

    // Construct a batch containing the update operation.
    const batch = tezos.wallet.batch()
    const updateOperation = await makeUpdateOperationFromCoinbase(
      logLevel,
      tezos,
      apiKeyID,
      apiSecret,
      apiPassphrase,
      assetNames,
      oracleContractAddress,
    )
    batch.withContractCall(updateOperation)

    // Add a push operation to the batch if a normalizer address was provided.
    if (normalizerContractAddress !== undefined) {
      const normalizerPushOperation = await constructPushOperation(
        tezos,
        oracleContractAddress,
        normalizerContractAddress,
      )
      batch.withContractCall(normalizerPushOperation)
    }

    // Send batch
    const result = await batch.send()
    const hash = result.opHash
    Utils.print(`Update sent with hash: ${hash}`)
    return hash
  } catch (error: any) {
    Utils.print('Error occurred while trying to update.')
    if (logLevel == LogLevel.Debug) {
      Utils.print(error)
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
): Promise<void> {
  if (logLevel == LogLevel.Debug) {
    Utils.print('Using node located at: ' + tezosNodeURL)
    Utils.print('')
  }

  // Generate a configured toolkit
  const tezos = await Utils.tezosToolkitFromPrivateKey(
    tezosNodeURL,
    posterPrivateKey,
  )
  const publicKeyHash = await tezos.signer.publicKeyHash()
  if (logLevel == LogLevel.Debug) {
    Utils.print(`Updating from account: ${publicKeyHash}`)
    Utils.print('')
  }

  // Loop updates if needed.
  if (updateIntervalSeconds) {
    // Loop indefinitely, updating the oracle and then sleeping for the update interval.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await updateOracleFromFeedOnce(
        logLevel,
        tezos,
        oracleFeedURL,
        oracleContractAddress,
        assetNames,
        normalizerContractAddress,
      )

      Utils.print(
        `Waiting ${updateIntervalSeconds} seconds to do next update. (Customize with --update-interval)`,
      )
      await Utils.sleep(updateIntervalSeconds)
    }
  } else {
    await updateOracleFromFeedOnce(
      logLevel,
      tezos,
      oracleFeedURL,
      oracleContractAddress,
      assetNames,
      normalizerContractAddress,
    )
  }
}

/**
 * Update the Oracle from a URL exactly once.
 *
 * @param logLevel The level at which to log output.
 * @param tezos A TezosToolkit configured with a signer.
 * @param oracleFeedURL A URL which will serve the Oracle's data feed.
 * @param oracleContractAddress The address of the oracle contract.
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @param normalizerContractAddress If set, updates are forwarded to a normalizer contract. Defaults to undefined.
 * @returns The operation hash.
 */
export async function updateOracleFromFeedOnce(
  logLevel: LogLevel,
  tezos: TezosToolkit,
  oracleFeedURL: string,
  oracleContractAddress: string,
  assetNames: Array<string>,
  normalizerContractAddress: string | undefined = undefined,
): Promise<string> {
  try {
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

    // Construct a batch containing the update operation.
    const batch = tezos.wallet.batch()
    const updateOperation = await makeUpdateOperationFromFeed(
      logLevel,
      tezos,
      oracleFeedURL,
      assetNames,
      oracleContractAddress,
    )
    batch.withContractCall(updateOperation)

    // Add a push operation to the batch if a normalizer address was provided.
    if (normalizerContractAddress !== undefined) {
      const normalizerPushOperation = await constructPushOperation(
        tezos,
        oracleContractAddress,
        normalizerContractAddress,
      )
      batch.withContractCall(normalizerPushOperation)
    }

    // Send batch
    const result = await batch.send()
    const hash = result.opHash
    Utils.print(`Update sent with hash: ${hash}`)
    return hash
  } catch (error: any) {
    Utils.print('Error occurred while trying to update.')
    if (logLevel == LogLevel.Debug) {
      Utils.print(error)
    }
    Utils.print('')
    return ''
  }
}

/**
 * Make an update operation from Coinbase.
 *
 * @param logLevel The log level to use.
 * @param tezos A TezosToolkit configured with a signer.
 * @param apiKeyID The ID of the Coinbase Pro API key to use.
 * @param apiSecret The secret for the Coinbase Pro API key.
 * @param apiPassphrase The passphrase for the Coinbase API key.
 * @param assetNames The assets to update.
 * @param oracleContractAddress The contract address to use.
 */
async function makeUpdateOperationFromCoinbase(
  logLevel: LogLevel,
  tezos: TezosToolkit,
  apiKeyID: string,
  apiSecret: string,
  apiPassphrase: string,
  assetNames: Array<string>,
  oracleContractAddress: string,
): Promise<ContractMethod<Wallet>> {
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
  const parameter = assetNames.reduce((map, assetName) => {
    map.set(assetName, listElementForAsset(oracleData, assetName))
    return map
  }, new MichelsonMap())

  // const elements = assetNames.map((assetName) => {
  //   const element = listElementForAsset(oracleData, assetName)
  //   if (!element) {
  //     Utils.print('Unable to locate data for ' + assetName + ' in Oracle data')
  //     Utils.print('Aborting.')
  //     process.exit(1)
  //   }
  //   return element
  // })

  // Construct an update operation
  const contract = await tezos.wallet.at(oracleContractAddress)
  return contract.methods['update'](parameter)
}

/**
 * Make an update operation from a feed.
 *
 * @param logLevel The log level to use.
 * @param tezos A TezosToolkit configured with a signer.
 * @param oracleFeedURL A URL which will serve the Oracle's data feed.
 * @param assetNames The assets to update.
 * @param oracleContractAddress The contract address to use.
 */
async function makeUpdateOperationFromFeed(
  logLevel: LogLevel,
  tezos: TezosToolkit,
  oracleFeedURL: string,
  assetNames: Array<string>,
  oracleContractAddress: string,
): Promise<ContractMethod<Wallet>> {
  // Retrieve elements from the oracle data.
  const oracleData = await retrieveOracleDataFromFeed(oracleFeedURL)
  if (logLevel == LogLevel.Debug) {
    Utils.print('Received oracle data: ')
    Utils.print(oracleData)
    Utils.print('')
  }

  // Make the update parameter.
  // Iterate through keys and create Elts.
  const parameter = assetNames.reduce((map, assetName) => {
    map.set(assetName, listElementForAsset(oracleData, assetName))
    return map
  }, new MichelsonMap())

  // Construct an update operation
  const contract = await tezos.wallet.at(oracleContractAddress)
  return contract.methods['update'](parameter)
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
      const bytes = Utils.hexToBytes(message)
      const parsed = unpackData(bytes)
      return parsed
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
): Array<any> {
  const parser = new Parser()

  // Iterate through all messages looking for asset
  for (let i = 0; i < oracleData.messages.length; i++) {
    // Check if the asset is the one we're looking for.
    const message = parser.parseJSON(oracleData.messages[i])
    if (JSON.stringify(message).includes(assetName)) {
      // Extract signature and message from parallel sorted arrays.
      const signature = oracleData.signatures[i]
      const message = oracleData.messages[i]
      const parameter = [
        signature,
        getValue(message, 1, 'int'),
        getValue(message, 2, 'int'),
        getValue(message, 3, 'int'),
        getValue(message, 4, 'int'),
        getValue(message, 5, 'int'),
        getValue(message, 6, 'int'),
        getValue(message, 6, 'int', true),
      ]
      return parameter
    }
  }
  throw new Error(
    `Could not locate ${assetName} in ${JSON.stringify(oracleData.messages)}`,
  )
}

/**
 * Helper function to retrieve an argument from a set of nested pairs.
 *
 * @param input The input object, as a JSON Micheline.
 * @param depth The 0-indexed depth of the value to retrieve.
 * @param key The type of the value in the pair (ex. "string", "int")
 * @param secondInPair The value is the second in the pair.
 */
function getValue(
  input: any,
  depth: number,
  key: string,
  secondInPair = false,
): string {
  if (depth == 0) {
    const index = secondInPair ? 1 : 0
    return input['args'][index][key]
  }

  const nested = input['args'][1]
  return getValue(nested, depth - 1, key, secondInPair)
}
