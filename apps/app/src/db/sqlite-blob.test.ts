import { describe, it, expect } from "vitest";
import { createDb, exportDb, importDb } from "./sqlite-blob";
import { encryptVault, decryptVault, KDF_FLOOR, type KdfParams } from "@/crypto/envelope";

const KDF: KdfParams = {
  algo: "argon2id",
  opslimit: KDF_FLOOR.opslimit,
  memlimit: KDF_FLOOR.memlimit,
};
const PASS = "spike-node-passphrase-7720";

describe("storage pipeline: SQLite ⇄ encrypted vault", () => {
  it("create → insert → export → encrypt → decrypt → re-import → query matches", async () => {
    // 1. in-memory SQLite, a couple of rows resembling real case data
    const db = await createDb();
    db.exec(
      "CREATE TABLE cases(id INTEGER PRIMARY KEY, fir TEXT, uapa INTEGER, first_remand TEXT, chargesheet_due TEXT)",
    );
    db.exec({
      sql: "INSERT INTO cases(fir, uapa, first_remand, chargesheet_due) VALUES (?,?,?,?)",
      bind: ["112/2025", 1, "2025-05-01", "2025-07-30"],
    });
    db.exec({
      sql: "INSERT INTO cases(fir, uapa, first_remand, chargesheet_due) VALUES (?,?,?,?)",
      bind: ["55/2025", 0, "2025-06-10", "2025-08-09"],
    });
    const original = db.selectObjects("SELECT fir, uapa, first_remand, chargesheet_due FROM cases ORDER BY id");

    // 2. serialize whole DB → encrypt the blob
    const dbBytes = await exportDb(db);
    db.close();
    expect(dbBytes.length).toBeGreaterThan(0);
    const vault = await encryptVault(PASS, dbBytes, KDF);

    // 3. decrypt → re-import into a fresh DB → query
    const restoredBytes = await decryptVault(PASS, vault);
    const db2 = await importDb(restoredBytes);
    const recovered = db2.selectObjects("SELECT fir, uapa, first_remand, chargesheet_due FROM cases ORDER BY id");
    db2.close();

    expect(recovered).toEqual(original);
    expect(recovered).toHaveLength(2);
    expect(recovered[0]).toMatchObject({ fir: "112/2025", uapa: 1, first_remand: "2025-05-01" });
  });

  it("a tampered vault does not yield a usable DB", async () => {
    const db = await createDb();
    db.exec("CREATE TABLE t(x TEXT)");
    db.exec({ sql: "INSERT INTO t(x) VALUES (?)", bind: ["secret"] });
    const bytes = await exportDb(db);
    db.close();

    const vault = await encryptVault(PASS, bytes, KDF);
    const file = JSON.parse(new TextDecoder().decode(vault));
    file.payload = file.payload.slice(0, 20) + (file.payload[20] === "A" ? "B" : "A") + file.payload.slice(21);
    const tampered = new TextEncoder().encode(JSON.stringify(file));

    await expect(decryptVault(PASS, tampered)).rejects.toThrow();
  });
});
