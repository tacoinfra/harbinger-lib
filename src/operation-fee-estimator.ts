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
    console.log("Transactions " + JSON.stringify(transactions))

    // Set a zero fee on each transaction.
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]

      // Start with a zero fee.
      transaction.fee = '0'
    }
    console.log("Transactions " + JSON.stringify(transactions))

    // Estimate each operation while keeping track of totals.
    var totalGasUsed = 0
    var totalStorageUsed = 0
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]
      console.log("Estimating transaction " + i)
      console.log("Transactions " + JSON.stringify(transactions))
      console.log("Transcation: " + JSON.stringify(transaction))


      // Estimate resources used in prior transactions.
      let priorConsumedResources = {
        gas: 0,
        storageCost: 0
      }
      if (i !== 0) {
        const priorTransactions = transactions.slice(0, i)
        priorConsumedResources = await TezosNodeWriter.estimateOperation(
          this.tezosNodeUrl,
          'main',
          ...priorTransactions,
        )
      }
      console.log("Previous estimates")
      console.log("Gas: " + priorConsumedResources.gas)
      console.log("Storage: " + priorConsumedResources.storageCost)

      // Estimate resources for everything up to the current transaction.
      const currentTransactions = transactions.slice(0, i+1)
      const currentConsumedResources = await TezosNodeWriter.estimateOperation(
        this.tezosNodeUrl,
        'main',
        ...currentTransactions,
      )
      console.log("Current estimates")
      console.log("Gas: " + currentConsumedResources.gas)
      console.log("Storage: " + currentConsumedResources.storageCost)
      console.log("")


      // Estimate a delta.
      const gasLimitDelta = currentConsumedResources.gas - priorConsumedResources.gas
      const storageLimitDelta = currentConsumedResources.storageCost - priorConsumedResources.storageCost
      console.log("Delta estimates")
      console.log("Gas: " + gasLimitDelta)
      console.log("Storage: " + storageLimitDelta)
      console.log("")

      // Apply safety margins.
      const gasWithSafetyMargin =
        gasLimitDelta + Constants.gasSafetyMargin
      let storageWithSafetyMargin =
         storageLimitDelta + Constants.storageSafetyMargin
         console.log("Safety Margin estimates")
         console.log("Gas: " + gasLimitDelta)
         console.log("Storage: " + storageWithSafetyMargin)
         console.log("")


      // Origination operations require an additional storage burn.
      if (transaction.kind === 'origination') {
        console.log("Burning")
        storageWithSafetyMargin += Constants.originationBurnCost
      }
      
      // Apply gas and storage to the operation, causing a mutation.
      transaction.storage_limit = `${storageWithSafetyMargin}`
      transaction.gas_limit = `${gasWithSafetyMargin}`

      totalGasUsed += gasWithSafetyMargin
      totalStorageUsed += storageWithSafetyMargin
    }

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
