import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Hashes and checks passwords with argon2id. */
@Injectable()
export class PasswordService {
  /** Hash checked when the email is unknown, so unknown and wrong-password logins take equally long. */
  private readonly dummyHash = hash('timing-equaliser');

  /** Returns the argon2id hash of a password. */
  hash(password: string): Promise<string> {
    return hash(password);
  }

  /** Spends the same time as a real check; always false. */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(await this.dummyHash, password);
    return false;
  }

  /** Checks a password against a stored hash; a malformed hash counts as a mismatch. */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
