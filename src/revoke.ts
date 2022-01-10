/** Taquito types storage as any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access  */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { LogLevel } from './common'
import Utils from './utils'

/**
 * Revoke an Oracle contract.
 *
 * @param logLevel The level at which to log output.
 * @param signedRevokeCommand A signature which revokes the Oracle.
 * @param oracleContractAddress The address of the oracle contract.
 * @param revokerPrivateKey The base58check private key of the account which will revoke the oracle, prefixed with 'edsk'. This account will pay transaction fees.
 * @param tezosNodeURL A URL of a Tezos node that the operation will be broadcast to.
 */
export default async function revokeOracle(
  logLevel: LogLevel,
  signedRevokeCommand: string,
  oracleContractAddress: string,
  revokerPrivateKey: string,
  tezosNodeURL: string,
): Promise<void> {
  if (logLevel == LogLevel.Debug) {
    Utils.print('Using node located at: ' + tezosNodeURL)
    Utils.print('')
  }

  try {
    Utils.print('Revoking oracle contract: ' + oracleContractAddress)

    // Generate a configured toolkit
    const tezos = await Utils.tezosToolkitFromPrivateKey(
      tezosNodeURL,
      revokerPrivateKey,
    )
    const publicKeyHash = await tezos.signer.publicKeyHash()
    if (logLevel == LogLevel.Debug) {
      Utils.print(`Revoking from account: ${publicKeyHash}`)
      Utils.print('')
    }

    // Make the update parameter.
    const parameter = `"${signedRevokeCommand}"`
    if (logLevel == LogLevel.Debug) {
      Utils.print('Made parameter: ')
      Utils.print(parameter)
      Utils.print('')
    }

    // Construct an operation.
    const contract = await tezos.contract.at(oracleContractAddress)
    const operation = contract.methods['revoke'](parameter)

    // Send operation
    const result = await operation.send()
    Utils.print(`Revoked with operation hash: ${result.hash}`)
  } catch (error: any) {
    Utils.print('Error occurred while trying to revoke.')
    if (logLevel == LogLevel.Debug) {
      Utils.print(error)
    }
    Utils.print('')
  }
}
