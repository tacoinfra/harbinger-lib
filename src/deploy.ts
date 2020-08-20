import Utils from './utils'
import { LogLevel } from './common'
import {
  TezosNodeWriter,
  TezosNodeReader,
  TezosParameterFormat,
} from 'conseiljs'
import fs = require('fs')
import Constants from './constants'
import OperationFeeEstimator from './operation-fee-estimator'

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
    Pair 
        {
            ${elementsString}
        }
        (Some "${signerPublicKey}")
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
  const assetNameParam = assetNames.reduce(
    (previous, current) => {
      return previous + `"${current}"; `
     },
    ''
  )

  const assetValuesParam = assetNames.reduce(
    (previous, current) => {
      return previous + `Elt "${current}" (Pair (Pair 0 "0") (Pair (Pair (Pair 0 -1) (Pair {Elt 0 0} 0)) (Pair (Pair 0 -1) (Pair {Elt 0 0} 0))));`
    },
    ''
  )

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
    const storage = makeOracleStorage(logLevel, assetNames, signerPublicKey)
    const contract = readContract(ORACLE_CONTRACT_FILE)

    const addresses = await deploy(
      logLevel,
      deployerPrivateKey,
      [contract],
      [storage],
      tezosNodeURL,
    )
    Utils.print('New Contract Address: ' + addresses[0])
  } catch (error) {
    Utils.print('Error deploying contract')
    if (logLevel == LogLevel.Debug) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Utils.print(error.message)
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

    // Prepare storage parameters.
    const storage = makeNormalizerStorage(
      assetNames,
      numDataPoints,
      oracleContractAddress,
    )
    const contract = readContract(NORMALIZER_CONTRACT_FILE)

    const addresses = await deploy(
      logLevel,
      deployerPrivateKey,
      [contract],
      [storage],
      tezosNodeURL,
    )
    Utils.print('New Contract Address: ' + addresses[0])
  } catch (error) {
    Utils.print('Error deploying contract')
    if (logLevel == LogLevel.Debug) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Utils.print(error.message)
    }
    Utils.print('')
  }
}

/**
 * Deploy one or more contracts.
 *
 * Note: The lengths of the contracts and storages arrays must be the same. This precondition is not checked.
 *
 * @param logLevel The level at which to log output.
 * @param deployerPrivateKey The base58check private key of the deployer, prefixed with 'edsk'. This account will pay origination fees.
 * @param contracts An array of contracts to deploy. Parrallel sorted to the storages parameter.
 * @param storages An array of storages to deploy. Parrallel sorted to the contracts parameter.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 * @returns An array of addresses for the deployed contracts.
 */
async function deploy(
  logLevel: LogLevel,
  deployerPrivateKey: string,
  contracts: Array<string>,
  storages: Array<string>,
  tezosNodeURL: string,
): Promise<Array<string>> {
  const keystore = await Utils.keyStoreFromPrivateKey(deployerPrivateKey)
  const signer = await Utils.signerFromKeyStore(keystore)
  if (logLevel == LogLevel.Debug) {
    Utils.print('Deploying from account: ' + keystore.publicKeyHash)
    Utils.print('')
  }

  await Utils.revealAccountIfNeeded(tezosNodeURL, keystore, signer)

  const operations = []
  let counter = await TezosNodeReader.getCounterForAccount(
    tezosNodeURL,
    keystore.publicKeyHash,
  )
  for (let i = 0; i < contracts.length; i++) {
    const contract = contracts[i]
    const storage = storages[i]
    counter++

    const operation = TezosNodeWriter.constructContractOriginationOperation(
      keystore,
      0,
      undefined,
      0,
      Constants.storageLimit,
      Constants.gasLimit,
      contract,
      storage,
      TezosParameterFormat.Michelson,
      counter,
    )
    operations.push(operation)
  }
  const operationFeeEstimator = new OperationFeeEstimator(tezosNodeURL)
  const operationsWithFees = await operationFeeEstimator.estimateAndApplyFees(
    operations,
  )

  const nodeResult = await TezosNodeWriter.sendOperation(
    tezosNodeURL,
    operationsWithFees,
    signer,
  )
  const operationHash = nodeResult.operationGroupID
    .replace(/"/g, '')
    .replace(/\n/, '')

  Utils.print('Deployed in operation hash: ' + operationHash)

  const contractAddresses = []
  for (let i = 0; i < contracts.length; i++) {
    contractAddresses.push(Utils.calculateContractAddress(operationHash, i))
  }
  return contractAddresses
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
