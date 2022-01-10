/** Some dependencies are JS only and are untyped. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import secp256k1 from 'secp256k1'
import ASN1 from './asn1'
import Prefixes from './prefixes'
import { TezosToolkit } from '@taquito/taquito'
import { InMemorySigner } from '@taquito/signer'

// Following libraries do not include .d.ts files.
/* eslint-disable @typescript-eslint/no-var-requires */
const base58Check = require('bs58check')
const blakejs = require('blakejs')
/* eslint-enable @typescript-eslint/no-var-requires */

/** Common utility functions */
const utils = {
  /**
   * Compress an EDCSA public key.
   * See: https://bitcointalk.org/index.php?topic=644919.0
   */
  compressKey(uncompressed: Uint8Array): Uint8Array {
    const uncompressedKeySize = 65

    if (uncompressed.length !== uncompressedKeySize) {
      throw new Error('Invalid length for uncompressed key')
    }
    const firstByte = uncompressed[0]
    if (firstByte !== 4) {
      throw new Error('Invalid compression byte')
    }

    // Assign a magic byte based on the parity of y coordinate.
    const lastByte = uncompressed[64]
    const magicByte = lastByte % 2 === 0 ? 2 : 3

    // X Coordinates are the first 32 bytes after the magic prefix byte.
    const xBytes = uncompressed.slice(1, 33)

    // Compressed key is 1 byte indicating parity of y and full x.
    return this.mergeBytes(new Uint8Array([magicByte]), xBytes)
  },

  /**
   * Sleep the program for the given number of seconds.
   *
   * @param seconds The number of seconds to sleep for.
   */
  async sleep(seconds: number): Promise<void> {
    const milliseconds = seconds * 1000
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
  },

  /**
   * Print the given message to stdout.
   *
   * @param message The message to print.
   */
  print(message: string): void {
    console.log(message)
  },

  /**
   * Reveal an account if required.
   *
   * @param tezos A TezosToolkit that is configured with a signer that will reveal itself if needed.
   */
  async revealAccountIfNeeded(tezos: TezosToolkit): Promise<void> {
    const signer = tezos.signer
    const publicKeyHash = await signer.publicKeyHash()
    const isAlreadyRevealed = await tezos.rpc.getManagerKey(publicKeyHash)
    if (isAlreadyRevealed) {
      return
    }

    this.print(
      `Account ${publicKeyHash} is not revealed. Sending a one time operation to reveal the account.`,
    )
    const result = await tezos.contract.reveal({})
    this.print(`Reveal sent with hash: ${result.hash}`)
    this.print(`Waiting for operation to be included...`)
    await result.confirmation(2)
    this.print(`All done!`)
    this.print(``)
  },

  /**
   * Create a TezosToolkit, configured with a signer.
   *
   * Creating an instance will reveal the account if needed.
   *
   * @param tezosNodeURL The URL of the TezosNode to use.
   * @param privateKey A base58check encoded private key, beginning with 'edsk'.
   * @returns A `Keystore` representing the private key.
   */
  async tezosToolkitFromPrivateKey(
    tezosNodeURL: string,
    privateKey: string,
  ): Promise<TezosToolkit> {
    // Set up a toolkit
    const tezos = new TezosToolkit(tezosNodeURL)

    // Configure a signer.
    const signer = new InMemorySigner(privateKey)
    tezos.setProvider({ signer })

    // Reveal the account if required
    await this.revealAccountIfNeeded(tezos)

    return tezos
  },

  /**
   * Calculate the address of a contract that was originated.
   *
   * @param operationHash The operation group hash.
   * @param index The index of the origination operation in the operation group.
   */
  calculateContractAddress(operationHash: string, index: number): string {
    // Decode and slice two byte prefix off operation hash.
    const decoded = this.base58CheckDecode(operationHash).slice(2)

    // Merge the decoded buffer with the operation prefix.
    let decodedAndOperationPrefix = []
    for (let i = 0; i < decoded.length; i++) {
      decodedAndOperationPrefix.push(decoded[i])
    }
    decodedAndOperationPrefix = decodedAndOperationPrefix.concat([
      (index & 0xff000000) >> 24,
      (index & 0x00ff0000) >> 16,
      (index & 0x0000ff00) >> 8,
      index & 0x000000ff,
    ])

    const hash = this.blake2b(new Uint8Array(decodedAndOperationPrefix), 20)
    return this.base58CheckEncode(hash, Prefixes.smartContractAddress)
  },

  /**
   * Decode the given base58check input.
   *
   * @param input A base58check encoded string.
   * @returns The underlying bytes.
   */
  base58CheckDecode(input: string): Uint8Array {
    return base58Check.decode(input)
  },

  /**
   * Scale the given input value from a decimal to the whole number at the given scale.
   *
   * For instance, a value of $3.18 USD could be expressed as natural number 318 with value = 3.18 and scale = 2.
   *
   * Note that any remaining decimal value is dropped. For instance, value = 3.185 with scale = 2 will resolve to 318.
   *
   * @param value The input value
   * @param scale The scale of the input value.
   * @returns An integer value representing the given value at the given scale.
   */
  scale(value: number, scale: number): number {
    return parseInt(`${value * 10 ** scale}`)
  },

  /**
   * Calculate the blake2b hash of the the given bytes.
   *
   * @param input The bytes to hash.
   * @param length The length of the output.
   * @returns The resulting hash.
   */
  blake2b(input: Uint8Array, length: number): Uint8Array {
    return blakejs.blake2b(input, null, length)
  },

  /**
   * Normalize a signature to lower-s-form notation.
   *
   * @param signature The signature to normalize
   * @returns The normalized signature.
   */
  normalizeSignature(signature: Uint8Array): Uint8Array {
    return secp256k1.signatureNormalize(signature)
  },

  /**
   * Convert a DER encoded signature to the corresponding raw form.
   *
   * @param derSignature Bytes representing a DER encoded signature
   * @returns Bytes representing a raw signature.
   */
  derSignatureToRaw(derSignature: Uint8Array): Uint8Array {
    const decodedSignature = ASN1.decode(derSignature)
    const rHex: string = decodedSignature.sub[0].toHexStringContent()
    const sHex: string = decodedSignature.sub[1].toHexStringContent()
    return this.hexToBytes(rHex + sHex)
  },

  /**
   * Base58Check encode the given bytes with the given prefix.
   *
   * @param bytes The bytes to encode.
   * @param prefix A prefix to prepend to the bytes.
   * @return A base58check encoded string.
   */
  base58CheckEncode(bytes: Uint8Array, prefix: Uint8Array): string {
    const prefixedBytes = this.mergeBytes(prefix, bytes)
    return base58Check.encode(prefixedBytes)
  },

  /**
   * Merge the given bytes.
   */
  mergeBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const merged = new Uint8Array(a.length + b.length)
    merged.set(a)
    merged.set(b, a.length)

    return merged
  },

  /**
   * Check if the given string is valid hex.
   *
   * @param input The input to check.
   * @returns true if the input is valid hex, otherwise false.
   */
  isHex(input: string): boolean {
    const hexRegEx = /([0-9]|[a-f])/gim
    return (input.match(hexRegEx) || []).length === input.length
  },

  /**
   * Convert the given hex string to bytes.
   */
  hexToBytes(hex: string): Uint8Array {
    if (!this.isHex(hex)) {
      throw new Error(`Invalid hex${hex}`)
    }

    return Uint8Array.from(Buffer.from(hex, 'hex'))
  },

  /**
   * Convert the given bytes to hex.
   */
  bytesToHex(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('hex')
  },
}

export default utils
