// 문서: docs/code/routes-auth.md · 커리큘럼 3.5 · 5.2 · 6.1 · 6.2 · 6.3 · 6.7
//
// 가입 · 로그인 · 토큰 재발급 · 내 정보.
// 엔드포인트 1·2·3번과 6.7 에서 늘어난 12번(docs/02-api.md 2.2).

import { Router } from "express";
import * as users from "../store/users.js";
import { requireAuth } from "../middleware/currentUser.js";
import { validate, validBody } from "../middleware/validate.js";
import { LoginBody, SignupBody } from "../schemas/index.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../auth/tokens.js";
import { AppError, ConflictError, UnauthenticatedError } from "../errors.js";
import { userView } from "../views.js";

export const authRouter = Router();

// 1. POST /auth/signup → 201
authRouter.post("/signup", validate({ body: SignupBody }), async (req, res) => {
  const { email, password, nickname } = validBody<SignupBody>(req);

  if (await users.findByEmail(email)) {
    throw new ConflictError("EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다.");
  }

  // 평문은 여기서 끝이다. 아래로 내려가지 않고, 로그에도 DB 에도 남지 않는다.
  const passwordHash = await hashPassword(password);
  const user = await users.create({ email, passwordHash, nickname });

  res.status(201).json(await userView(user.id));
});

// 2. POST /auth/login → 200
authRouter.post("/login", validate({ body: LoginBody }), async (req, res) => {
  const { email, password } = validBody<LoginBody>(req);
  const user = await users.findByEmail(email);

  // 없는 이메일과 틀린 비밀번호를 구분하지 않는다(6.2).
  // 구분하면 "그 이메일은 가입돼 있다" 가 새어 나가고, 그것만으로 계정 목록을 만들 수 있다.
  //
  // 없는 이메일일 때 해시 검증을 건너뛰면 응답이 눈에 띄게 빨라져서
  // 시간 차이만으로도 가입 여부가 드러난다. 그것까지 막으려면 더미 해시를 한 번 돌린다.
  const ok = user
    ? await verifyPassword(user.passwordHash, password)
    : await verifyPassword("$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA", password);

  if (!user || !ok) {
    throw new AppError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 맞지 않습니다.");
  }

  await issueTokens(res, user.id);
  res.json({ token: await signAccessToken(user.id), user: await userView(user.id) });
});

// 12. POST /auth/refresh → 200 (6.7 에서 늘어난 엔드포인트)
authRouter.post("/refresh", async (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (!token) throw new UnauthenticatedError("리프레시 토큰이 없습니다.");

  const userId = await verifyToken(token, "refresh");

  // 토큰은 멀쩡한데 계정이 사라졌을 수 있다. 서명만 믿지 않고 한 번 확인한다.
  const user = await users.findById(userId);
  if (!user) throw new UnauthenticatedError("계정을 찾을 수 없습니다.");

  // 쓸 때마다 새 리프레시 토큰으로 갈아 끼운다(rotation).
  // 옛 토큰이 새어 나가도 유효 기간이 그만큼 짧아진다.
  await issueTokens(res, user.id);
  res.json({ token: await signAccessToken(user.id), user: await userView(user.id) });
});

// 3. GET /me → 200
export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res) => {
  const me = await userView(req.user!.id);
  if (!me) throw new UnauthenticatedError("계정을 찾을 수 없습니다. 다시 로그인해 주세요.");
  res.json(me);
});

async function issueTokens(res: import("express").Response, userId: string) {
  res.cookie(REFRESH_COOKIE, await signRefreshToken(userId), refreshCookieOptions);
}
