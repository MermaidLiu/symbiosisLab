import { createHash, randomInt } from "crypto";
import { getStore, mutateStore, uid } from "@/server/store";

export interface SmsCodeRecord {
  id: string;
  phone: string;
  codeHash: string;
  purpose: "login";
  expiresAt: string;
  createdAt: string;
  attempts: number;
}

function hashCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export function normalizePhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  if (digits.length === 13 && digits.startsWith("86")) return digits.slice(2);
  return digits;
}

export function isValidCnMobile(phone: string): boolean {
  return /^1\d{10}$/.test(phone);
}

/** 开发/演示：未配置真实短信时使用固定码或环境变量 */
export function getDevSmsCode(): string {
  return process.env.SMS_DEV_CODE?.trim() || "888888";
}

export function isSmsMockMode(): boolean {
  if (process.env.SMS_MOCK === "0") return false;
  if (process.env.SMS_MOCK === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export async function createAndSendSmsCode(phone: string): Promise<{ ok: true; mockCode?: string } | { ok: false; error: string }> {
  const p = normalizePhone(phone);
  if (!isValidCnMobile(p)) return { ok: false, error: "invalid_phone" };

  const store = getStore();
  const recent = (store.smsCodes ?? []).find(
    (c) => c.phone === p && Date.now() - new Date(c.createdAt).getTime() < 55_000
  );
  if (recent) return { ok: false, error: "sms_too_frequent" };

  const code = isSmsMockMode() ? getDevSmsCode() : String(randomInt(100000, 999999));
  const now = new Date();
  const record: SmsCodeRecord = {
    id: uid("sms"),
    phone: p,
    codeHash: hashCode(p, code),
    purpose: "login",
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    createdAt: now.toISOString(),
    attempts: 0,
  };

  await mutateStore((s) => {
    s.smsCodes = [record, ...(s.smsCodes ?? []).filter((c) => c.phone !== p)].slice(0, 200);
  });

  // 生产环境在此对接短信网关；演示模式仅返回/打印验证码
  if (isSmsMockMode()) {
    console.info(`[SMS mock] ${p} code=${code}`);
    return { ok: true, mockCode: code };
  }

  // TODO: integrate real SMS provider (Tencent / Aliyun)
  console.info(`[SMS] would send code to ${p}`);
  return { ok: true };
}

export async function verifySmsCode(
  phone: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = normalizePhone(phone);
  const c = String(code ?? "").trim();
  if (!isValidCnMobile(p) || !/^\d{4,8}$/.test(c)) {
    return { ok: false, error: "invalid_code" };
  }

  // Mock shortcut
  if (isSmsMockMode() && c === getDevSmsCode()) {
    await mutateStore((s) => {
      s.smsCodes = (s.smsCodes ?? []).filter((x) => x.phone !== p);
    });
    return { ok: true };
  }

  let error: string | null = null;
  await mutateStore((s) => {
    const list = s.smsCodes ?? [];
    const idx = list.findIndex((x) => x.phone === p);
    if (idx < 0) {
      error = "invalid_code";
      return;
    }
    const rec = list[idx];
    if (new Date(rec.expiresAt) < new Date()) {
      s.smsCodes = list.filter((_, i) => i !== idx);
      error = "code_expired";
      return;
    }
    rec.attempts += 1;
    if (rec.attempts > 8) {
      s.smsCodes = list.filter((_, i) => i !== idx);
      error = "code_locked";
      return;
    }
    if (rec.codeHash !== hashCode(p, c)) {
      error = "invalid_code";
      return;
    }
    s.smsCodes = list.filter((_, i) => i !== idx);
  });

  if (error) return { ok: false, error };
  return { ok: true };
}
