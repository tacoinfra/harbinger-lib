import Utils from './utils'
import { LogLevel } from './common'
import fs = require('fs')
import { OriginationOperation, TezosToolkit } from '@taquito/taquito'
import { InMemorySigner } from '@taquito/signer'

/** Filenames for contracts. */
const NORMALIZER_CONTRACT_FILE = __dirname + '/normalizer.tz'
const ORACLE_CONTRACT_FILE = __dirname + '/oracle.tz'

/**
 * Read a given .tz contract file.
 *
 * @param filename The filename to read.
 * @returns The contract as a string.
 */
function readContract(filename: string) {
  const contractFile = filename
  const contract = fs.readFileSync(contractFile).toString('latin1')
  return contract
}

/**
 * Make a storage parameter for an oracle.
 *
 * @param logLevel The level at which to log output.
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @param signerPublicKey The public key of the entity which will sign data for the oracle.
 * @returns The storage for a new oracle as a string.
 */
function makeOracleStorage(
  logLevel: LogLevel,
  assetNames: Array<string>,
  signerPublicKey: string,
): string {
  if (logLevel == LogLevel.Debug) {
    Utils.print(
      'Using assets: ' +
        assetNames.reduce((previousValue, assetName) => {
          return previousValue + assetName + ', '
        }, ''),
    )
  }
  Utils.print('')

  const elementsString = elementsStringFromAssetName(assetNames)
  const storage = `
    (Pair 
        {
            ${elementsString}
        }
        (Some "${signerPublicKey}"))
`
  return storage
}

/**
 * Make a storage parameter for a Normalizer contract.
 *
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @param numDataPoints The number of data points to normalize over.
 * @param oracleContractAddress The KT1 address of the Oracle contract.
 */
function makeNormalizerStorage(
  assetNames: Array<string>,
  numDataPoints: number,
  oracleContractAddress: string,
) {
  const assetNameParam = assetNames.reduce((previous, current) => {
    return previous + `"${current}"; `
  }, '')

  const assetValuesParam = assetNames.reduce((previous, current) => {
    return (
      previous +
      `Elt "${current}" (Pair (Pair 0 "0") (Pair (Pair (Pair 0 -1) (Pair {Elt 0 0} 0)) (Pair (Pair 0 -1) (Pair {Elt 0 0} 0))));`
    )
  }, '')

  return `(Pair (Pair {${assetNameParam}} {${assetValuesParam}}) (Pair ${numDataPoints} "${oracleContractAddress}"))`
}

/**
 * Deploy an Oracle contract.
 *
 * @param logLevel The level at which to log output.
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @param signerPublicKey The public key of the entity which will sign data for the oracle.
 * @param deployerPrivateKey The base58check private key of the deployer, prefixed with 'edsk'. This account will pay origination fees.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 */
export async function deployOracle(
  logLevel: LogLevel,
  assetNames: Array<string>,
  signerPublicKey: string,
  deployerPrivateKey: string,
  tezosNodeURL: string,
): Promise<void> {
  if (logLevel == LogLevel.Debug) {
    Utils.print('Using node located at: ' + tezosNodeURL)
    Utils.print('')
  }

  try {
    Utils.print('Deploying an oracle contract.')

    // Configure a Taquito instance
    const signer = await InMemorySigner.fromSecretKey(deployerPrivateKey)
    const tezos = new TezosToolkit(tezosNodeURL)
    tezos.setProvider({ signer })

    const storage = makeOracleStorage(logLevel, assetNames, signerPublicKey)
    const contract = readContract(ORACLE_CONTRACT_FILE)

    const deployResult: OriginationOperation = await tezos.contract.originate({
      code: contract,
      init: storage,
    })
    Utils.print(`New Contract Address: ${deployResult.contractAddress!}`)
  } catch (error: any) {
    Utils.print('Error deploying contract')
    if (logLevel == LogLevel.Debug) {
      Utils.print(error)
    }
    Utils.print('')

    // Re-throw error.
    throw error
  }
}

/**
 * Deploy a Normalizer contract.
 *
 * @param logLevel The level at which to log output.
 * @param deployerPrivateKey The base58check private key of the deployer, prefixed with 'edsk'. This account will pay origination fees.
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @param numDataPoints The number of data points to normalize over.
 * @param oracleContractAddress The KT1 address of the Oracle contract.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 */
export async function deployNormalizer(
  logLevel: LogLevel,
  deployerPrivateKey: string,
  assetNames: Array<string>,
  numDataPoints: number,
  oracleContractAddress: string,
  tezosNodeURL: string,
): Promise<void> {
  if (logLevel == LogLevel.Debug) {
    Utils.print('Using node located at: ' + tezosNodeURL)
    Utils.print('')
  }

  try {
    Utils.print('Deploying a normalizer contract.')
    Utils.print('')

    // Configure a Taquito instance
    const signer = await InMemorySigner.fromSecretKey(deployerPrivateKey)
    const tezos = new TezosToolkit(tezosNodeURL)
    tezos.setProvider({ signer })

    // Prepare storage parameters.
    const storage = makeNormalizerStorage(
      assetNames,
      numDataPoints,
      oracleContractAddress,
    )
    const contract = readContract(NORMALIZER_CONTRACT_FILE)

    const deployResult: OriginationOperation = await tezos.contract.originate({
      code: contract,
      init: storage,
    })
    Utils.print(`New Contract Address: ${deployResult.contractAddress!}`)
  } catch (error: any) {
    Utils.print('Error deploying contract')
    if (logLevel == LogLevel.Debug) {
      Utils.print(error)
    }
    Utils.print('')
  }
}

/**
 * Create a single string of Michelson listing all assets with 0'ed values.
 *
 * @param assetNames An array of asset names to include in the oracle. The asset names must be in alphabetical order.
 * @return A michelson string of elements.
 */
function elementsStringFromAssetName(assetNames: Array<string>): string {
  // Map each element to an `Elt` parameter.
  const elements = assetNames.map((assetName) => {
    return `Elt "${assetName}" (Pair 0 (Pair 0 (Pair 0 (Pair 0 (Pair 0 (Pair 0 0))))));`
  })

  // Reduce to a single string.
  const elementsString = elements.reduce(
    (previousValue: string, currentValue: string) => {
      return previousValue + '\n' + currentValue
    },
    '',
  )

  return elementsString.trim()
}
