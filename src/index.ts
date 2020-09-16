import fetch from 'node-fetch'
import { getLogger, LogLevelDesc } from 'loglevel'
import { registerFetch, registerLogger } from 'conseiljs'

/**
 * Initialize the oracle library by providing implementations for Conseil.
 *
 * TODO(keefertaylor): Investigate if these implementations can be provided by a a client library.
 *
 * @param conseilLogLevel The log level to use for Conseil.
 */
export function initOracleLib(conseilLogLevel: LogLevelDesc = 'error'): void {
  const logger = getLogger('conseiljs')
  logger.setLevel(conseilLogLevel, false)

  registerLogger(logger)
  registerFetch(fetch)
}

export {
  default as updateOracleFromCoinbase,
  updateOracleFromCoinbaseOnce,
  updateOracleFromFeed,
  updateOracleFromFeedOnce,
} from './update'
export { deployNormalizer, deployOracle } from './deploy'
export { default as pushOracleData } from './push'
export { LogLevel } from './common'
export { default as get } from './get'
export { default as Utils } from './utils'
export { default as ASN1 } from './asn1'
export { default as revokeOracle } from './revoke'
export { default as Prefixes } from './prefixes'
export { default as Constants } from './constants'
export { default as OperationFeeEstimator } from './operation-fee-estimator'
