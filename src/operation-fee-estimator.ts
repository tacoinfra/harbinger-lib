import Constants from './constants'
import {
  TezosNodeReader,
  TezosNodeWriter,
  StackableOperation,
  TezosBlock,
} from 'conseiljs'

/**
 * Applies fee estimations to operations in Tezos.
 */
export default class OperationFeeEstimator {
  /**
   * @param tezosNodeUrl The Tezos node to hit with RPCs.
   */
  public constructor(private readonly tezosNodeUrl: string) {}

  /**
   * Set a fee and gas/storage limits on a group of operations.
   *
   * @warning This method mutates the values of the inputs.
   *
   * @param transactions An array of transactions to process.
   * @returns An array of modified operations.
   */
  public async estimateAndApplyFees(
    transactions: Array<StackableOperation>,
  ): Promise<Array<StackableOperation>> {
    // Set a zero fee on each transaction.
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]

      // Start with a zero fee.
      transaction.fee = '0'
    }

    // Estimate resource limits for all transactions..
    const consumedResources = await TezosNodeWriter.estimateOperation(
      this.tezosNodeUrl,
      'main',
      ...transactions,
    )

    // Apply safety margins.
    const gasWithSafetyMargin =
      consumedResources.gas + Constants.gasSafetyMargin
    let storageWithSafetyMargin =
      consumedResources.storageCost + Constants.storageSafetyMargin

    // Origination operations require an additional storage burn.
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]
      if (transaction.kind === 'origination') {
        storageWithSafetyMargin += Constants.originationBurnCost
      }
    }

    // Apply storage and gas limits to the first transaction, which will set them for the group.
    transactions[0].storage_limit = `${storageWithSafetyMargin}`
    transactions[0].gas_limit = `${gasWithSafetyMargin}`

    // Grab the block head so we have constant sizes.
    const blockHead = await TezosNodeReader.getBlockAtOffset(
      this.tezosNodeUrl,
      0,
    )

    // Loop until the operations have a high enough fee to cover their minimum.
    let requiredFee = this.calculateRequiredFee(transactions, blockHead)
    let currentFee = this.calculateCurrentFees(transactions)
    while (currentFee < requiredFee) {
      // Adjust fees on the first operation.
      // Operation group fees are additive, so the first operation can handle fees for the entire operation
      // group if needed.
      transactions[0].fee = `${requiredFee}`

      // Recalculate required and current fees.
      // Required fee may change because the new fee applied above may have increased the operation
      // size.
      requiredFee = this.calculateRequiredFee(transactions, blockHead)
      currentFee = this.calculateCurrentFees(transactions)
    }

    return transactions
  }

  /**
   * Calculate the current fee for a set of transactions.
   *
   * @param transactions The input transactions to process.
   * @returns The current fee in nanotez.
   */
  private calculateCurrentFees(
    transactions: Array<StackableOperation>,
  ): number {
    return transactions.reduce((accumulated, next) => {
      return accumulated + parseInt(next.fee)
    }, 0)
  }

  /**
   * Calculate the required fee for a set of transactions.
   *
   * @param transactions The input transactions.
   * @param block The block to apply the transaction on.
   * @returns The required fee in nanotez.
   */
  private calculateRequiredFee(
    transactions: Array<StackableOperation>,
    block: TezosBlock,
  ): number {
    const requiredGasFeeNanotez = this.calculateGasFees(transactions)

    const operationSize = this.calculateSerializedByteLength(
      transactions,
      block,
    )
    const storageFeeNanotez = Constants.feePerByteNanotez * operationSize

    const requiredFeeNanotez =
      Constants.minimumFeeNanotez + requiredGasFeeNanotez + storageFeeNanotez
    const requiredFeeMutez = Math.ceil(
      requiredFeeNanotez / Constants.nanotezPerMutez,
    )

    return requiredFeeMutez
  }

  /**
   * Calculate the required gas fees for a set of transactions.
   *
   * @param transactions An array of transactions to calculate the gas fees for.
   * @return The required fee for gas in nanotez.
   */
  private calculateGasFees(transactions: Array<StackableOperation>): number {
    return transactions.reduce((accumulated, next) => {
      return (
        accumulated + parseInt(next.gas_limit) * Constants.feePerGasUnitNanotez
      )
    }, 0)
  }

  /**
   * Calculate the size in bytes of the serialized transactions inputs and a signature.
   *
   * @param transactions An array of transactions to calculate the size of.
   * @param block The block to apply the transaction on.
   * @returns The size of the serialized transactions and required signature in bytes.
   */
  private calculateSerializedByteLength(
    transactions: Array<StackableOperation>,
    block: TezosBlock,
  ): number {
    const forgedOperationGroup = TezosNodeWriter.forgeOperations(
      block.hash,
      transactions,
    )
    const size = forgedOperationGroup.length / 2 + Constants.signatureSizeBytes

    return size
  }
}
