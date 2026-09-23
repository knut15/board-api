# server/src/store/users.ts

> 커리큘럼 3.4 · 4.5 · 6.1 · 짝: `server/src/store/users.ts`

## 무엇을 하는 파일인가

유저를 넣고 꺼내는 곳이다. 밖으로 내보내는 것은 `create` · `findById` · `findByEmail` 세 함수뿐이고
그 안은 PostgreSQL 이다. `User` 타입은 `docs/01-domain.md` 1.3 의 `users` 표를 옮긴 것이고, 그 표가
`prisma/schema.prisma` 의 `model User` 가 되고 다시 `users` 테이블이 됐다. 세 함수의 이름은 3단계와
한 글자도 다르지 않다 — 바뀐 것은 몸통과 반환형, 그리고 필드 하나다.

## 코드를 따라 읽기

### 저장하는 것은 해시다

```ts
export type User = {
  id: string;
  email: string;
  // 이름이 내용과 맞아야 한다 — 다음 사람이 평문인 줄 알고 비교하지 않게.
  passwordHash: string;
  nickname: string;
  createdAt: Date;
};

export function create(input: { email: string; passwordHash: string; nickname: string }): Promise<User> {
  return prisma.user.create({ data: input });
}
```

**이 파일은 해시를 만들지 않는다.** `hashPassword` 는 `server/src/auth/password.ts` 에 있고 라우터가
부른다. 저장소는 받은 값을 넣을 뿐이라 평문이 여기까지 내려올 길이 없고, 인자 이름이 `passwordHash`
인 것이 그 사실을 타입으로 못 박는다 — `password` 를 넘기면 컴파일이 막힌다. `async` / `await` 가
없는 것은 `prisma.user.create` 가 이미 `Promise` 를 돌려주고 반환 전에 손볼 것이 없어서다. id 와
`createdAt` 도 코드가 만들지 않는다 — `@default(uuid())`·`@default(now())` 를 보고 Prisma 가 채운다.

### `findByEmail` 이 인덱스를 탄다

```ts
export function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}
```

3단계에서 이 함수는 `Map` 의 값을 끝까지 훑는 `for` 문이었다. 유저가 1만 명이면 최대 1만 번 비교했다.
지금은 첫 마이그레이션이 만든 유니크 인덱스(`users_email_key`)를 탄다. `findUnique` 를 쓸 수 있는
근거도 이 인덱스다 — Prisma 는 유일성이 보장된 컬럼에만 열어 주므로 `@unique` 가 없으면 막힌다.

### UNIQUE 를 왜 DB 에 걸었나

`routes/auth.ts` 는 가입 때 `findByEmail` 로 먼저 찾아보고 있으면 `409` 를 준다. 검사가 이미 있는데
제약을 또 거는 이유는 **애플리케이션 검사가 두 요청이 동시에 들어오면 둘 다 통과하기 때문이다.**
A 와 B 가 나란히 "없음" 을 받고 둘 다 `INSERT` 하면 같은 이메일이 두 건 생기고, 동시 요청에서만
나므로 재현도 어렵다. **제약은 DB 가 걸어야 확실하다.** 그래도 `409` 검사는 필요하다 — 제약은 막아
줄 뿐 좋은 에러 메시지를 주지 않는다. 평소 경로는 `409` + `EMAIL_ALREADY_EXISTS` 를 주고, 드문 동시
요청은 제약이 받는다.

## 왜 이렇게 했는가

1. **컬럼 이름을 내용에 맞췄다.** `docs/01-domain.md` 1.3 의 표는 처음부터 `passwordHash` 였는데
   4단계까지 컬럼은 `password` 였다. 이름과 내용이 어긋나 있으면 다음 사람이 평문인 줄 알고 `!==` 로
   비교한다.
2. **`authorId` 외래키를 `Restrict` 로 뒀다.** 유저를 지우는 엔드포인트가 없어 `Cascade` 를 고를
   근거가 없다. 글이 1건 남은 유저를 지우면 DB 가 `posts_authorId_fkey` 위반으로 막아 고아 글이
   생기지 않는다. 지우려면 글을 먼저 정리하라는 것이 이 설정의 뜻이다.
3. **`update` 와 `remove` 를 만들지 않았다.** 부르는 곳이 없는 함수는 지금 필요 없다.

## 6단계에서 무엇이 바뀌었나

| | 5단계까지 | 6단계 |
|---|---|---|
| 필드 이름 | `password` | `passwordHash` |
| 들어 있는 값 | 평문 | argon2 해시 |
| `create` 의 인자 | `{ email, password, nickname }` | `{ email, passwordHash, nickname }` |
| 함수 개수 · 이름 | `create`·`findById`·`findByEmail` | 그대로 |

**"아직 평문이다" 라는 서술은 이제 맞지 않는다.** 실제로 재 봤다. `passwordHash` 에 든 값은
`$argon2id$v=19$m=65536,p=4,t=3$…` 모양의 97자이고 두 계정의 해시가 서로 달랐다(salt). DB 의
`passwordHash` 에서 평문 `password123` 은 0건이다.

### rename 마이그레이션을 손으로 쓴 이유

`schema.prisma` 의 필드 이름만 바꾸고 마이그레이션을 자동 생성하면 Prisma 는 `DROP COLUMN "password"`
+ `ADD COLUMN "passwordHash"` 를 만든다. **들어 있던 값이 사라진다.** Prisma 는 "이름이 같은 컬럼" 만
보므로 이름을 바꾼 것인지 지우고 더한 것인지 구분하지 못한다. 하려는 일은 이름만 바꾸는 것이라 한
문장이면 되고 기존 행도 그대로 남는다. 그래서 `20260922143836_rename_password_to_hash/` 의 SQL 을
손으로 썼다. **마이그레이션 SQL 을 읽어야 하는 이유가 이것이다** — 자동 생성은 의도를 모른다.

```sql
ALTER TABLE "users" RENAME COLUMN "password" TO "passwordHash";
```

다만 이 시점의 값은 여전히 평문이다. 평문을 해시로 바꾸는 것은 SQL 이 할 수 없다 — argon2 는 DB 안에
없다. 이 프로젝트는 학습용 데이터라 계정을 다시 만들었고, 실제 서비스라면 "다음 로그인 때 해시로
교체" 같은 이행 기간을 둔다.

## 직접 해 볼 것

1. `PRISMA_LOG=query pnpm dev` 로 띄우고 로그인한다. `findByEmail` 의 SQL 이 `WHERE email = $1
   LIMIT 1` 모양인지 확인한다 — 3단계의 `for` 문이 어디로 갔는지 보는 것이다.
2. `pnpm db:psql` 에서 `SELECT email, "passwordHash" FROM users;` 를 실행한다. 같은 비밀번호로 만든
   두 계정의 해시가 서로 다른 것을 확인한다. salt 가 하는 일이 눈에 보이는 자리다.
3. 같은 이메일로 `INSERT` 를 두 번 실행한다. 두 번째가 `users_email_key` 위반으로 막힌다.
4. `create` 의 인자 이름을 `password` 로 바꿔 본다. 라우터가 타입 에러를 낸다. 되돌린다.
5. 글을 쓴 유저를 `db:psql` 에서 `DELETE` 해 `posts_authorId_fkey` 에러를 직접 받는다.

## 3단계에서 무엇이 바뀌었나

| | 3단계 | 4단계 |
|---|---|---|
| 저장 | 모듈 안의 `Map<string, User>` | `users` 테이블 |
| id · `createdAt` 생성 | `crypto.randomUUID()` · `new Date()` | `@default(uuid())` · `@default(now())` |
| `findByEmail` | `Map` 전체를 훑는 `for` 문 | `users_email_key` 유니크 인덱스 조회 |
| 이메일 중복 | 라우터의 `409` 검사만 | `409` 검사 + DB 의 UNIQUE 제약 |
| 반환형 | `User` · `User \| undefined` | `Promise<User>` · `Promise<User \| null>` |
| 수명 | 프로세스가 죽으면 사라짐 | 남는다 |
| 못 찾았을 때 | `undefined` | `null` (부르는 쪽이 `if (!user)` 라 고칠 곳은 없었다) |

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 5.7 | **끝났다.** UNIQUE 제약 위반을 에러 핸들러가 `409` 로 번역한다 |
| 6.1 | **끝났다.** `password` 가 argon2 해시가 되고 컬럼이 `passwordHash` 로 rename 됐다 |
| 6.4 | **끝났다.** 로그인이 JWT 를 발급하고 `currentUser` 가 그것을 검증한다. **이 파일은 그대로였다** — 저장과 상관이 없기 때문이다 |
