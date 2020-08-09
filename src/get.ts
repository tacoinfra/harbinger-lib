import { LogLevel } from "./common"
import Utils from './utils'
import { TezosNodeReader, TezosMessageUtils, TezosParameterFormat } from 'conseiljs';

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
    logLevel: LogLevel
): Promise<void> {
    Utils.print("Fetching data...")
    Utils.print("")

    if (logLevel === LogLevel.Debug) {
        Utils.print("Using Node: " + tezosNodeURL)
        Utils.print("Using Oracle Contract " + oracleContractAddress)
        Utils.print("Fetching Asset Code: " + assetCode)
        Utils.print("")
    }

    // Fetch storage to get the BigMap index.
    const storage = await TezosNodeReader.getContractStorage(tezosNodeURL, oracleContractAddress, undefined, undefined)
    const bigMapIndex = storage["args"][0]["int"]
    if (logLevel == LogLevel.Debug) {
        Utils.print("Got storage: " + JSON.stringify(storage))
        Utils.print("Got big map index " + bigMapIndex)
        Utils.print("")
    }

    // Pack Key
    const packedBytes = TezosMessageUtils.writePackedData(assetCode, "string", TezosParameterFormat.Michelson)
    const packedHex = TezosMessageUtils.encodeBigMapKey(Buffer.from(packedBytes, 'hex'))
    if (logLevel == LogLevel.Debug) {
        Utils.print("Packed big map key to " + packedHex)
        Utils.print("")
    }

    // Get big map value.
    const value = await TezosNodeReader.getValueForBigMapKey(tezosNodeURL, bigMapIndex, packedHex, undefined, 'main')
    if (logLevel == LogLevel.Debug) {
        Utils.print("Retrieved value from big map: " + JSON.stringify(value))
        Utils.print("")
    }

    // Print values.
    Utils.print("Oracle Data for Asset: " + assetCode)
    Utils.print("Period Start: " + getValue(value, 0, "string"))
    Utils.print("Period End: " + getValue(value, 1, "string"))

    Utils.print("Open: " + normalizeDataPoint(Number(getValue(value, 2, "int"))))
    Utils.print("High: " + normalizeDataPoint(Number(getValue(value, 3, "int"))))
    Utils.print("Low: " + normalizeDataPoint(Number(getValue(value, 4, "int"))))
    Utils.print("Close: " + normalizeDataPoint(Number(getValue(value, 5, "int"))))

    // Volume isn't nested in pairs so the helper can't be used.
    const rawValue = value["args"][1]["args"][1]["args"][1]["args"][1]["args"][1]["args"][1]["int"]
    Utils.print("Volume: " + normalizeDataPoint(Number(rawValue)))

    Utils.print("")
}

/**
 * Helper function to retrieve an argument from a set of nested pairs.
 * 
 * @param input The input object, as a JSON Micheline.
 * @param depth The 0-indexed depth of the value to retrieve.
 * @param key The type of the value in the pair (ex. "string", "int")
 */
function getValue(input: any, depth: number, key: string): any {
    if (depth == 0) {
        return input["args"][0][key]
    }

    const nested = input["args"][1]
    return getValue(nested, depth - 1, key)
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