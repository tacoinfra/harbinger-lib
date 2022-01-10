/** Taquito types storage as any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access  */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { LogLevel } from './common'
import Utils from './utils'
import { TezosToolkit } from '@taquito/taquito'

/**
 * Get a value from the oracle and print it.
 *
 * @param tezosNodeURL The Tezos node URL to use.
 * @param oracleContractAddress The address of the oracle contract.
 * @param assetCode The asset code to retrieve.
 * @param logLevel The level of logging to use.
 */
export default async function get(
  tezosNodeURL: string,
  oracleContractAddress: string,
  assetCode: string,
  logLevel: LogLevel,
): Promise<void> {
  Utils.print('Fetching data...')
  Utils.print('')

  if (logLevel === LogLevel.Debug) {
    Utils.print('Using Node: ' + tezosNodeURL)
    Utils.print('Using Oracle Contract ' + oracleContractAddress)
    Utils.print('Fetching Asset Code: ' + assetCode)
    Utils.print('')
  }

  // Fetch storage to get the BigMap index.
  const tezos = new TezosToolkit(tezosNodeURL)
  const contract = await tezos.contract.at(oracleContractAddress)
  const storage: any = await contract.storage()
  const value = await storage.oracleData.get(assetCode)
  if (logLevel == LogLevel.Debug) {
    Utils.print('Retrieved value from big map: ' + JSON.stringify(value))
    Utils.print('')
  }

  Utils.print(`Oracle Data for Asset: ${assetCode}`)
  Utils.print(`Period Start: ${value[0]}`)
  Utils.print(`Period End: ${value[1]}`)

  Utils.print(`Open: ${normalizeDataPoint(Number(value[2]))}`)
  Utils.print(`High: ${normalizeDataPoint(Number(value[3]))}`)
  Utils.print(`Low: ${normalizeDataPoint(Number(value[4]))}`)
  Utils.print(`Close: ${normalizeDataPoint(Number(value[5]))}`)
  Utils.print(`Volume: ${normalizeDataPoint(Number(value[6]))}`)

  Utils.print('')
}

/**
 * Normalize the given natural number to a base 10 decimal.
 * @param input The given input to scale.
 */
function normalizeDataPoint(input: number): number {
  // All oracle values are scaled to 10^6.
  const scale = Math.pow(10, 6)
  return input / scale
}
