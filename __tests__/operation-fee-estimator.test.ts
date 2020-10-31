import OperationFeeEstimator from '../src/operation-fee-estimator'
import {
  TezosNodeReader,
  StackableOperation,
  registerFetch,
  registerLogger,
} from 'conseiljs'
import fetch from 'node-fetch'
import { getLogger } from 'loglevel'
import CONSTANTS from '../src/constants'

/**
 * Tests for operation fee estimation.
 *
 * These tests rely on an external node to perform estimation and are not hermetic.
 */

/** The node to connect to */
const tezosNodeUrl = 'https://rpczero.tzbeta.net'

/** The account which will send operations. */
const sourceAccount = 'tz1LpmZmB1yJJBcCrBDLSAStmmugGDEghdVv'

/**
 * Apply configuration for ConseilJS
 */
const logger = getLogger('conseiljs')
registerLogger(logger)
registerFetch(fetch)

test('Estimates fees', async function () {
  // GIVEN an operation fee estimator and two transaction operations.
  const estimator = new OperationFeeEstimator(tezosNodeUrl)

  const counter = await TezosNodeReader.getCounterForAccount(
    tezosNodeUrl,
    sourceAccount,
  )
  const transactionOperation1 = makeTransactionOperation(counter + 1)
  const transactionOperation2 = makeTransactionOperation(counter + 2)
  const transactions = [transactionOperation1, transactionOperation2]

  // WHEN fees are estimated.
  const estimatedTransactions = await estimator.estimateAndApplyFees(
    transactions,
  )

  // THEN each operation has a gas and storage limit set.
  for (let i = 0; i < estimatedTransactions.length; i++) {
    const estimatedTranscation = estimatedTransactions[i]

    expect(parseInt(estimatedTranscation.gas_limit)).toBeGreaterThan(0)
    expect(parseInt(estimatedTranscation.storage_limit)).toBeGreaterThan(0)
  }

  // AND the first operation has a fee set
  expect(parseInt(estimatedTransactions[0].fee)).toBeGreaterThan(0)

  // AND subsequent operations do not.
  for (let i = 1; i < estimatedTransactions.length; i++) {
    const estimatedTranscation = estimatedTransactions[i]

    expect(parseInt(estimatedTranscation.fee)).toEqual(0)
  }
})

test('Applies zero fees correctly', async function () {
  // GIVEN an operation fee estimator set to apply zero fees and two transaction operations.
  const estimator = new OperationFeeEstimator(tezosNodeUrl, true)

  const counter = await TezosNodeReader.getCounterForAccount(
    tezosNodeUrl,
    sourceAccount,
  )
  const transactionOperation1 = makeTransactionOperation(counter + 1)
  const transactionOperation2 = makeTransactionOperation(counter + 2)
  const transactions = [transactionOperation1, transactionOperation2]

  // WHEN fees are estimated.
  const estimatedTransactions = await estimator.estimateAndApplyFees(
    transactions,
  )

  // THEN each operation has a gas and storage limit set AND a fee set to zero.
  for (let i = 0; i < estimatedTransactions.length; i++) {
    const estimatedTranscation = estimatedTransactions[i]

    expect(parseInt(estimatedTranscation.gas_limit)).toBeGreaterThan(0)
    expect(parseInt(estimatedTranscation.storage_limit)).toBeGreaterThan(0)
    expect(parseInt(estimatedTranscation.fee)).toEqual(0)
  }
})

function makeTransactionOperation(counter: number): StackableOperation {
  return {
    destination: 'tz1RomaiWJV3NFDZWTMVR2aEeHknsn3iF5Gi',
    amount: '1',
    storage_limit: `${CONSTANTS.storageLimit}`,
    gas_limit: `${CONSTANTS.gasLimit}`,
    counter: counter.toString(),
    fee: '0',
    source: sourceAccount,
    kind: 'transaction',
  }
}
