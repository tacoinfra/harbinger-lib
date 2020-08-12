import { Signer, SignerCurve } from 'conseiljs'
import { KMS } from 'aws-sdk'
import Utils from './utils'

// AWS KMS Signing Algorithm.
const SIGNING_ALGORITHM = 'ECDSA_SHA_256'

// Length of hash for signing in Tezos.
const DIGEST_LENGTH = 32

/**
 * Signs keys using a key in AWS KMS.
 */
export default class AwsKmsSigner implements Signer {
  private readonly kms: KMS
  private readonly kmsKeyId: string

  /**
   * Create a new `Signer` which wraps an AWS KMS key.
   *
   * @param kmsKeyId The Key ID in KMS.
   * @param region The AWS region the KMS Key resides in.
   */
  public constructor(kmsKeyId: string, region: string) {
    this.kms = new KMS({
      region,
    })
    this.kmsKeyId = kmsKeyId
  }

  public getSignerCurve(): SignerCurve {
    return SignerCurve.SECP256K1
  }

  public async signOperation(bytes: Buffer): Promise<Buffer> {
    const digest = Utils.blake2b(bytes, DIGEST_LENGTH)

    const params = {
      KeyId: this.kmsKeyId,
      Message: digest,
      SigningAlgorithm: SIGNING_ALGORITHM,
      MessageType: 'DIGEST',
    }

    const { Signature: derSignature } = await this.kms.sign(params).promise()
    if (!(derSignature instanceof Uint8Array)) {
      throw new Error(
        `Unexpected response from KMS. Expected Uint8Array but got ${
          derSignature?.toString() || 'undefined'
        }`,
      )
    }

    const rawSignature = Utils.derSignatureToRaw(derSignature)
    const normalizedSignature = Utils.normalizeSignature(rawSignature)
    return Buffer.from(normalizedSignature)
  }

  public signText(_message: string): Promise<string> {
    throw new Error('Unsupported: Cannot use `signText` in AwsKmsSigner')
  }

  public signTextHash(_message: string): Promise<string> {
    throw new Error('Unsupported: Cannot use `signTextHash` in AwsKmsSigner')
  }
}
