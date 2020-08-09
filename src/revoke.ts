import { LogLevel } from './common'
import Utils from './utils'
import { TezosNodeReader, TezosNodeWriter, TezosParameterFormat } from 'conseiljs';
import Constants from './constants'
import OperationFeeEstimator from './operation-fee-estimator';

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
) {
    try {
        Utils.print("Revoking oracle contract: " + oracleContractAddress)

        // Generate a keystore.
        const keystore = await Utils.keyStoreFromPrivateKey(revokerPrivateKey)
        const signer = await Utils.signerFromKeyStore(keystore)
        if (logLevel == LogLevel.Debug) {
            Utils.print("Revoking from account: " + keystore.publicKeyHash)
            Utils.print("")
        }

        // Make the update parameter.
        const parameter = `"${signedRevokeCommand}"`
        if (logLevel == LogLevel.Debug) {
            Utils.print("Made parameter: ")
            Utils.print(parameter)
            Utils.print("")
        }

        const counter = await TezosNodeReader.getCounterForAccount(tezosNodeURL, keystore.publicKeyHash);
        const entrypoint = 'revoke'
        const operation = TezosNodeWriter.constructContractInvocationOperation(
            keystore.publicKeyHash,
            counter,
            oracleContractAddress,
            0,
            0,
            Constants.storageLimit,
            Constants.gasLimit,
            entrypoint,
            parameter,
            TezosParameterFormat.Michelson
        )

        const operationFeeEstimator = new OperationFeeEstimator(tezosNodeURL)
        const operationsWithFees = await operationFeeEstimator.estimateAndApplyFees([operation])
        const nodeResult = await TezosNodeWriter.sendOperation(tezosNodeURL, operationsWithFees, signer)

        Utils.print("Revoked with operation hash: " + nodeResult.operationGroupID.replace(/"/g, ""))
    } catch (error) {
        Utils.print("Error occurred while trying to revoke.")
        if (logLevel == LogLevel.Debug) {
            Utils.print(error.message)
        }
        Utils.print("")
    }

}