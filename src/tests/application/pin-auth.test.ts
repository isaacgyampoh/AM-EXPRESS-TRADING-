import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginWithPin, ChangeOwnPin } from "@/application/use-cases/pin-auth";
import { ValidationError } from "@/domain/errors/domain-error";
import type { PinAuthRepository, PinCredential } from "@/domain/repositories/pin-auth-repository";
import { aStaff } from "../support/builders";
import bcrypt from "bcryptjs";

/**
 * Fake PIN auth repository for unit tests.
 *
 * The bcrypt comparisons run in the real bcryptjs library (cost 4 for speed).
 * Everything else is in-memory.
 */
class FakePinAuthRepository implements PinAuthRepository {
  credentials: PinCredential[] = [];
  attempts: { ip: string; staffId: string | null; succeeded: boolean }[] = [];
  sessionEstablished: string[] = [];
  pinHashes: Map<string, string> = new Map();

  async listActiveCredentials(): Promise<PinCredential[]> {
    return this.credentials;
  }

  async recordAttempt(ip: string, staffId: string | null, succeeded: boolean): Promise<void> {
    this.attempts.push({ ip, staffId, succeeded });
  }

  /** Mirrors the production rule: only failures after the last success count. */
  async failedAttemptsSinceLastSuccess(ip: string): Promise<number> {
    const forIp = this.attempts.filter((a) => a.ip === ip);
    const lastSuccess = forIp.findLastIndex((a) => a.succeeded);
    return forIp.slice(lastSuccess + 1).filter((a) => !a.succeeded).length;
  }

  async establishSession(staffId: string, email: string): Promise<void> {
    void staffId; // production uses it to look up the auth secret
    this.sessionEstablished.push(email);
  }

  async updatePinHash(staffId: string, newPinHash: string): Promise<void> {
    this.pinHashes.set(staffId, newPinHash);
  }
}

const IP = "127.0.0.1";

async function makeCredential(
  staffId: string,
  email: string,
  pin: string,
): Promise<PinCredential> {
  // Cost 4 for fast unit tests.
  const pinHash = await bcrypt.hash(pin, 4);
  return { staffId, email, pinHash, isActive: true };
}

describe("LoginWithPin", () => {
  let repo: FakePinAuthRepository;
  let useCase: LoginWithPin;

  beforeEach(() => {
    repo = new FakePinAuthRepository();
    useCase = new LoginWithPin(repo);
  });

  it("establishes a session for a valid PIN", async () => {
    repo.credentials = [await makeCredential("s-1", "a@pos.internal", "1234")];

    await expect(useCase.execute(IP, { pin: "1234" })).resolves.toBeUndefined();

    expect(repo.sessionEstablished).toContain("a@pos.internal");
    expect(repo.attempts).toHaveLength(1);
    expect(repo.attempts[0].succeeded).toBe(true);
    expect(repo.attempts[0].staffId).toBe("s-1");
  });

  it("rejects a wrong PIN with a generic error", async () => {
    repo.credentials = [await makeCredential("s-1", "a@pos.internal", "1234")];

    await expect(useCase.execute(IP, { pin: "9999" })).rejects.toThrow(ValidationError);

    expect(repo.sessionEstablished).toHaveLength(0);
    expect(repo.attempts[0].succeeded).toBe(false);
    expect(repo.attempts[0].staffId).toBeNull();
  });

  it("matches the correct user when multiple staff exist", async () => {
    repo.credentials = [
      await makeCredential("s-1", "admin@pos.internal", "1111"),
      await makeCredential("s-2", "cashier@pos.internal", "2222"),
    ];

    await useCase.execute(IP, { pin: "2222" });

    expect(repo.sessionEstablished).toContain("cashier@pos.internal");
    expect(repo.sessionEstablished).not.toContain("admin@pos.internal");
  });

  it("rejects a PIN in the wrong format without checking hashes", async () => {
    const compareSpy = vi.spyOn(bcrypt, "compare");
    repo.credentials = [await makeCredential("s-1", "a@pos.internal", "1234")];

    await expect(useCase.execute(IP, { pin: "abc" })).rejects.toThrow(ValidationError);
    // Should not reach bcrypt at all for malformed input.
    expect(compareSpy).not.toHaveBeenCalled();
  });

  it("blocks login after too many failed attempts from the same IP", async () => {
    repo.credentials = [await makeCredential("s-1", "a@pos.internal", "1234")];
    // Simulate 10 prior failures.
    for (let i = 0; i < 10; i++) {
      repo.attempts.push({ ip: IP, staffId: null, succeeded: false });
    }

    await expect(useCase.execute(IP, { pin: "1234" })).rejects.toThrow(
      "Too many failed attempts",
    );
    // Session must NOT be established despite a valid PIN.
    expect(repo.sessionEstablished).toHaveLength(0);
  });

  it("still allows a different IP after one IP is blocked", async () => {
    repo.credentials = [await makeCredential("s-1", "a@pos.internal", "1234")];
    for (let i = 0; i < 10; i++) {
      repo.attempts.push({ ip: "10.0.0.1", staffId: null, succeeded: false });
    }

    // Different IP should succeed.
    await expect(useCase.execute("10.0.0.2", { pin: "1234" })).resolves.toBeUndefined();
    expect(repo.sessionEstablished).toHaveLength(1);
  });

  it("clears the lockout counter once someone signs in successfully", async () => {
    // A shop is one public IP. Nine fumbled attempts followed by a real
    // sign-in must not leave the next cashier one mistake from a locked till.
    repo.credentials = [await makeCredential("s-1", "a@pos.internal", "1234")];
    for (let i = 0; i < 9; i++) {
      repo.attempts.push({ ip: IP, staffId: null, succeeded: false });
    }
    repo.attempts.push({ ip: IP, staffId: "s-1", succeeded: true });

    // Five more failures: over the old threshold of 10 in the window, but only
    // five since the last success.
    for (let i = 0; i < 5; i++) {
      repo.attempts.push({ ip: IP, staffId: null, succeeded: false });
    }

    await expect(useCase.execute(IP, { pin: "1234" })).resolves.toBeUndefined();
    expect(repo.sessionEstablished).toContain("a@pos.internal");
  });

  it("still locks out sustained failures with no success between them", async () => {
    repo.credentials = [await makeCredential("s-1", "a@pos.internal", "1234")];
    repo.attempts.push({ ip: IP, staffId: "s-1", succeeded: true });
    for (let i = 0; i < 10; i++) {
      repo.attempts.push({ ip: IP, staffId: null, succeeded: false });
    }

    await expect(useCase.execute(IP, { pin: "1234" })).rejects.toThrow(
      "Too many failed attempts",
    );
    expect(repo.sessionEstablished).toHaveLength(0);
  });

  it("skips credentials without a stored PIN hash", async () => {
    repo.credentials = [
      { staffId: "s-1", email: "nohash@pos.internal", pinHash: null, isActive: true },
    ];

    await expect(useCase.execute(IP, { pin: "1234" })).rejects.toThrow(ValidationError);
    expect(repo.sessionEstablished).toHaveLength(0);
  });
});

describe("ChangeOwnPin", () => {
  let repo: FakePinAuthRepository;
  let useCase: ChangeOwnPin;

  const actor = aStaff({ role: "cashier" });

  beforeEach(async () => {
    repo = new FakePinAuthRepository();
    useCase = new ChangeOwnPin(repo);
    // Seed the actor's credential.
    repo.credentials = [
      await makeCredential(actor.id, "cashier@pos.internal", "1234"),
    ];
  });

  it("updates the hash when the current PIN is correct", async () => {
    await useCase.execute(actor, IP, {
      currentPin: "1234",
      newPin: "5678",
      confirmPin: "5678",
    });

    const newHash = repo.pinHashes.get(actor.id);
    expect(newHash).toBeDefined();
    expect(await bcrypt.compare("5678", newHash!)).toBe(true);
  });

  it("rejects an incorrect current PIN", async () => {
    await expect(
      useCase.execute(actor, IP, {
        currentPin: "9999",
        newPin: "5678",
        confirmPin: "5678",
      }),
    ).rejects.toThrow(ValidationError);

    expect(repo.pinHashes.has(actor.id)).toBe(false);
  });

  it("rejects mismatched new PIN and confirm PIN", async () => {
    await expect(
      useCase.execute(actor, IP, {
        currentPin: "1234",
        newPin: "5678",
        confirmPin: "8765",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a new PIN that is the same as the current one", async () => {
    await expect(
      useCase.execute(actor, IP, {
        currentPin: "1234",
        newPin: "1234",
        confirmPin: "1234",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("blocks change after too many failed attempts", async () => {
    for (let i = 0; i < 10; i++) {
      repo.attempts.push({ ip: IP, staffId: actor.id, succeeded: false });
    }

    await expect(
      useCase.execute(actor, IP, {
        currentPin: "1234",
        newPin: "5678",
        confirmPin: "5678",
      }),
    ).rejects.toThrow("Too many failed attempts");
  });
});
