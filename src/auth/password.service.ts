import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Hashes and checks passwords with argon2id. */
@Injectable()
export class PasswordService {
  /** Returns the argon2id hash of a password. */
  hash(password: string): Promise<string> {
    return hash(password);
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
