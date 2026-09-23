import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

// 레이어 경계를 ESLint 로 강제한다. 규칙의 근거는 docs/04-web-architecture.md 다.
// 어기는 코드가 나오면 규칙을 끄지 말고 그 문서를 고친다.
const layerBoundaries = {
  files: ["src/domain/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/application/*", "@/infrastructure/*", "@/presentation/*", "@/app/*", "@/composition/*"],
            message: "domain 은 아무 레이어도 import 하지 않는다. 순수해야 브라우저와 BFF 양쪽에서 돈다.",
          },
          { group: ["react", "react-*", "next", "next/*", "graphql", "graphql-*", "@tanstack/*"],
            message: "domain 은 외부 패키지를 쓰지 않는다." },
        ],
      },
    ],
  },
};

const applicationBoundaries = {
  files: ["src/application/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          { group: ["@/infrastructure/*", "@/presentation/*", "@/app/*", "@/composition/*"],
            message: "application 은 domain 만 안다. 전송 수단과 화면을 모르게 유지한다." },
          { group: ["react", "react-*", "next", "next/*"],
            message: "유스케이스는 화면 없이도 돌아야 한다." },
        ],
      },
    ],
  },
};

const presentationBoundaries = {
  files: ["src/presentation/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          { group: ["@/infrastructure/*"],
            message: "컴포넌트는 infrastructure 를 직접 부르지 않는다. composition/container 를 거친다." },
        ],
      },
    ],
  },
};

const infrastructureBoundaries = {
  files: ["src/infrastructure/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          { group: ["@/presentation/*", "@/app/*"],
            message: "어댑터는 화면을 알 이유가 없다." },
        ],
      },
    ],
  },
};

const config = [
  ...coreWebVitals,
  ...typescriptConfig,
  layerBoundaries,
  applicationBoundaries,
  presentationBoundaries,
  infrastructureBoundaries,
];

export default config;
